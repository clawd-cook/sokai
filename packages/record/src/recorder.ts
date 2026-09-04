import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type Page, type BrowserContext } from "playwright";
import {
  SESSION_SCHEMA_VERSION,
  assertValidBundleDir,
  redactNetworkEntry,
  writeSessionBundle,
  type ActionEntry,
  type ActionType,
  type BundleIndex,
  type LocatorHint,
  type NetworkEntry,
  type SessionMeta,
} from "@sokai/session";
import { simplifyDom } from "./dom-simplify.js";

const BODY_LIMIT = 200_000;

export interface PageLike {
  on(event: string, handler: (...args: unknown[]) => void): void;
  evaluate(pageFunction: string | (() => unknown)): Promise<unknown>;
  screenshot(options?: { type?: "png" | "jpeg" }): Promise<Buffer>;
  url(): string;
  viewportSize(): { width: number; height: number } | null;
}

export interface RecordOptions {
  url: string;
  outDir: string;
  pilotTag?: string;
  userDataDir?: string;
  /** Default true — headed Chrome for manual operate. Set false for headless. */
  headed?: boolean;
}

export interface RecordingHandle {
  stop(): Promise<string>;
}

export interface RecorderMetaPartial {
  pilotTag?: string;
  url?: string;
  viewport?: { width: number; height: number };
  startedAt?: string;
}

export interface Recorder {
  trackAction(action: ActionEntry): Promise<void>;
  trackNetwork(entry: NetworkEntry): Promise<void>;
  captureKeyframe(id: string): Promise<void>;
  stop(): Promise<string>;
}

export interface TrackPayload {
  type: ActionType;
  role?: string;
  name?: string;
  label?: string;
  value?: string;
  testId?: string;
}

function truncateBody(body: string | undefined): string | undefined {
  if (body === undefined) return undefined;
  if (body.length <= BODY_LIMIT) return body;
  return body.slice(0, BODY_LIMIT) + "\n/* truncated */";
}

function headersToRecord(headers: Record<string, string>): Record<string, string> {
  return { ...headers };
}

function buildLocatorHint(payload: TrackPayload): LocatorHint | undefined {
  if (payload.testId) {
    return { strategy: "testId", testId: payload.testId };
  }
  if (payload.label) {
    return { strategy: "label", label: payload.label };
  }
  if (payload.role) {
    return { strategy: "role", role: payload.role, name: payload.name };
  }
  return undefined;
}

function shouldCaptureKeyframe(action: ActionEntry): boolean {
  if (action.type !== "click") return false;
  const name = action.target && "name" in action.target ? action.target.name : undefined;
  if (!name) return false;
  return name.includes("更新") || name.includes("搜索");
}

const EXTRACT_DOM_SCRIPT = `(() => {
  const ATTR_KEEP = /^(id|name|type|data-testid)$|^aria-/i;
  function walk(el, depth) {
    if (depth <= 0) return { truncated: true };
    const tag = el.tagName.toLowerCase();
    if (tag === "script" || tag === "style" || tag === "noscript") return null;
    const attrs = {};
    for (const a of Array.from(el.attributes)) {
      if (ATTR_KEEP.test(a.name)) attrs[a.name] = a.value;
    }
    const role = el.getAttribute("role") || undefined;
    let name = el.getAttribute("aria-label") || undefined;
    if (!name && el.labels && el.labels[0]) {
      name = (el.labels[0].textContent || "").trim() || undefined;
    }
    if (!name) {
      const text = (el.textContent || "").trim().replace(/\\s+/g, " ");
      if (text) name = text.slice(0, 80);
    }
    const children = [];
    for (const child of Array.from(el.children)) {
      const c = walk(child, depth - 1);
      if (c) children.push(c);
    }
    const node = { tag };
    if (role) node.role = role;
    if (name) node.name = name;
    if (Object.keys(attrs).length) node.attrs = attrs;
    if (children.length) node.children = children;
    return node;
  }
  const root = document.documentElement;
  return {
    role: "document",
    name: document.title || undefined,
    children: root ? [walk(root, 12)].filter(Boolean) : [],
  };
})()`;

const INIT_TRACK_SCRIPT = `(() => {
  if (window.__sokaiTrackInstalled) return;
  window.__sokaiTrackInstalled = true;

  function hintFromEl(el) {
    if (!el || !el.getAttribute) return null;
    const testId = el.getAttribute("data-testid");
    if (testId) return { testId };
    const labelEl = el.labels && el.labels[0];
    const label = labelEl ? (labelEl.textContent || "").trim() : "";
    if (label) return { label };
    const role = el.getAttribute("role")
      || (el.tagName === "BUTTON" || (el.tagName === "INPUT" && el.type === "button") ? "button"
        : el.tagName === "A" ? "link"
        : el.tagName === "INPUT" || el.tagName === "TEXTAREA" ? "textbox"
        : el.tagName === "SELECT" ? "combobox"
        : undefined);
    const name = el.getAttribute("aria-label")
      || el.getAttribute("name")
      || el.getAttribute("placeholder")
      || (el.innerText || el.textContent || "").trim().slice(0, 80)
      || undefined;
    if (role) return { role, name };
    return name ? { role: "generic", name } : null;
  }

  document.addEventListener("click", (e) => {
    const el = e.target;
    if (!el || !window.sokaiTrack) return;
    const hint = hintFromEl(el.closest ? el.closest("button, a, [role], input, select, textarea, [data-testid]") || el : el);
    if (!hint) return;
    window.sokaiTrack({ type: "click", ...hint });
  }, true);

  document.addEventListener("change", (e) => {
    const el = e.target;
    if (!el || !window.sokaiTrack) return;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) {
      return;
    }
    const hint = hintFromEl(el);
    if (!hint) return;
    const type = el instanceof HTMLSelectElement ? "select" : "fill";
    window.sokaiTrack({ type, ...hint, value: el.value });
  }, true);
})()`;

export async function createRecorderForPage(
  page: PageLike,
  outDir: string,
  metaPartial: RecorderMetaPartial = {},
): Promise<Recorder> {
  const startedAt = metaPartial.startedAt ?? new Date().toISOString();
  const actions: ActionEntry[] = [];
  const network: NetworkEntry[] = [];
  const keyframes: { name: string; bytes: Uint8Array }[] = [];
  const domSnapshots: { name: string; json: unknown }[] = [];
  const index: BundleIndex = {
    schemaVersion: SESSION_SCHEMA_VERSION,
    keyframes: [],
  };
  let keyframeSeq = 0;
  let stopped = false;

  const trackAction = async (action: ActionEntry): Promise<void> => {
    actions.push(action);
  };

  const trackNetwork = async (entry: NetworkEntry): Promise<void> => {
    const truncated: NetworkEntry = {
      ...entry,
      requestBody: truncateBody(entry.requestBody),
      responseBody: truncateBody(entry.responseBody),
    };
    network.push(redactNetworkEntry(truncated));
  };

  const captureKeyframe = async (id: string): Promise<void> => {
    const safeId = id.replace(/[^a-zA-Z0-9_-]/g, "_") || `kf-${++keyframeSeq}`;
    const pngName = `${safeId}.png`;
    const domName = `${safeId}.json`;

    const bytes = await page.screenshot({ type: "png" });
    keyframes.push({ name: pngName, bytes: new Uint8Array(bytes) });

    let rawDom: unknown;
    try {
      rawDom = await page.evaluate(EXTRACT_DOM_SCRIPT);
    } catch {
      rawDom = { role: "document", children: [] };
    }
    const simplified = simplifyDom(rawDom);
    domSnapshots.push({ name: domName, json: simplified });

    const lastAction = actions[actions.length - 1];
    index.keyframes.push({
      id: safeId,
      file: `keyframes/${pngName}`,
      domFile: `dom/${domName}`,
      actionFrom: lastAction?.id,
      actionTo: lastAction?.id,
      at: Date.now(),
    });
  };

  const stop = async (): Promise<string> => {
    if (stopped) return outDir;
    stopped = true;

    const viewport = metaPartial.viewport ?? page.viewportSize() ?? { width: 1280, height: 720 };
    const meta: SessionMeta = {
      schemaVersion: SESSION_SCHEMA_VERSION,
      url: metaPartial.url ?? page.url(),
      viewport,
      startedAt,
      endedAt: new Date().toISOString(),
      pilotTag: metaPartial.pilotTag ?? "untagged",
    };

    await writeSessionBundle(outDir, {
      meta,
      actions,
      network,
      index,
      keyframes,
      domSnapshots,
    });
    await assertValidBundleDir(outDir);
    return outDir;
  };

  return { trackAction, trackNetwork, captureKeyframe, stop };
}

async function installPageListeners(page: Page, recorder: Recorder): Promise<void> {
  let actionSeq = 0;
  let networkSeq = 0;

  await page.exposeBinding("sokaiTrack", async (_source, payload: TrackPayload) => {
    const action: ActionEntry = {
      id: `a${++actionSeq}`,
      timestamp: Date.now(),
      type: payload.type,
      target: buildLocatorHint(payload),
      value: payload.value,
    };
    await recorder.trackAction(action);
    if (shouldCaptureKeyframe(action)) {
      await recorder.captureKeyframe(`after-${action.id}`);
    }
  });

  await page.addInitScript(INIT_TRACK_SCRIPT);
  // Ensure current document is instrumented (addInitScript only covers future navigations).
  await page.evaluate(INIT_TRACK_SCRIPT);

  page.on("requestfinished", async (request) => {
    try {
      const response = await request.response();
      if (!response) return;

      let requestBody: string | undefined;
      try {
        requestBody = request.postData() ?? undefined;
      } catch {
        requestBody = undefined;
      }

      let responseBody: string | undefined;
      try {
        responseBody = await response.text();
      } catch {
        responseBody = undefined;
      }

      await recorder.trackNetwork({
        id: `n${++networkSeq}`,
        timestamp: Date.now(),
        method: request.method(),
        url: request.url(),
        status: response.status(),
        requestHeaders: headersToRecord(request.headers()),
        responseHeaders: headersToRecord(response.headers()),
        requestBody,
        responseBody,
      });
    } catch {
      // Single network capture failure must not abort recording.
    }
  });
}

export async function startRecording(options: RecordOptions): Promise<RecordingHandle> {
  const headed = options.headed !== false;
  const userDataDir = options.userDataDir ?? join(tmpdir(), "sokai-chrome-profile");

  const context: BrowserContext = await chromium.launchPersistentContext(userDataDir, {
    headless: !headed,
  });

  const page = context.pages()[0] ?? (await context.newPage());
  const recorder = await createRecorderForPage(page, options.outDir, {
    pilotTag: options.pilotTag ?? "compose-pool-list",
    url: options.url,
  });

  await installPageListeners(page, recorder);
  await page.goto(options.url, { waitUntil: "domcontentloaded" });

  return {
    async stop() {
      const out = await recorder.stop();
      await context.close();
      return out;
    },
  };
}
