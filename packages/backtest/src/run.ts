import { readFile } from "node:fs/promises";
import {
  REPORT_SCHEMA_VERSION,
  parsePageSchema,
  readSessionBundle,
  writeBacktestReport,
  type BacktestReport,
  type PageSchema,
  type StepResult,
} from "@sokai/session";
import { filterActions } from "./filter-actions.js";
import {
  collectActionIds,
  criticalRegionIds,
  locateAction,
} from "./locate.js";
import type { BacktestDriver } from "./types.js";

export const DEFAULT_ACTION_IDS = [
  "action-search",
  "action-reset",
  "action-export",
  "action-open-blacklist-dialog",
  "action-page-next",
] as const;

export interface RunBacktestOptions {
  bundleDir: string;
  schemaPath?: string;
  targetUrl?: string;
  knownActionIds?: Iterable<string>;
  mode?: "mock" | "live";
  failFast?: boolean;
  outPath?: string;
  /** Injected driver for tests; default is Playwright + startPreviewServer. */
  driver?: BacktestDriver;
}

export type BacktestTarget =
  | { kind: "injected" }
  | { kind: "external"; targetUrl: string }
  | { kind: "preview"; schemaPath: string };

/**
 * Pure helper: pick injected driver, live targetUrl, or schema preview.
 * Prefer targetUrl over schemaPath when both are set (business path).
 */
export function resolveBacktestTarget(
  options: Pick<RunBacktestOptions, "driver" | "targetUrl" | "schemaPath">,
): BacktestTarget {
  if (options.driver) return { kind: "injected" };
  if (options.targetUrl) return { kind: "external", targetUrl: options.targetUrl };
  if (options.schemaPath) return { kind: "preview", schemaPath: options.schemaPath };
  throw new Error("runBacktest requires schemaPath or targetUrl (or an injected driver)");
}

interface MockMissLike {
  name: string;
  message: string;
  fingerprint: string;
}

function isMockMiss(err: unknown): err is MockMissLike {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: string }).name === "MockMissError" &&
    typeof (err as { fingerprint?: unknown }).fingerprint === "string"
  );
}

function stepFromError(actionId: string, err: unknown): StepResult {
  if (isMockMiss(err)) {
    return {
      actionId,
      ok: false,
      error: err.message,
      networkMiss: err.fingerprint,
    };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { actionId, ok: false, error: message };
}

async function loadSchema(schemaPath: string): Promise<PageSchema> {
  const raw = await readFile(schemaPath, "utf8");
  return parsePageSchema(JSON.parse(raw));
}

async function resolveDriver(
  options: RunBacktestOptions,
  mode: "mock" | "live",
): Promise<BacktestDriver> {
  const target = resolveBacktestTarget(options);
  if (target.kind === "injected") return options.driver!;
  if (target.kind === "external") {
    const { createExternalUrlDriver } = await import("./external-url-driver.js");
    return createExternalUrlDriver({ targetUrl: target.targetUrl });
  }
  // Dynamic + vite-ignore: unit tests must not load Vue/runtime mount paths.
  const { createPlaywrightDriver } = await import(
    /* @vite-ignore */ "./playwright-driver.js"
  );
  return createPlaywrightDriver({
    schemaPath: target.schemaPath,
    bundleDir: options.bundleDir,
    mode,
  });
}

/**
 * Replay filtered session actions against a schema preview and write a BacktestReport.
 */
export async function runBacktest(options: RunBacktestOptions): Promise<BacktestReport> {
  const mode = options.mode ?? (options.targetUrl ? "live" : "mock");
  const failFast = options.failFast === true;
  const startedAt = new Date().toISOString();

  let schemaActionIds: Set<string>;
  let partialSchema = false;
  let schema: PageSchema | undefined;
  if (options.schemaPath) {
    schema = await loadSchema(options.schemaPath);
    schemaActionIds = collectActionIds(schema.root);
    partialSchema = schema.partial === true;
  } else {
    schemaActionIds = new Set(options.knownActionIds ?? DEFAULT_ACTION_IDS);
  }

  const bundle = await readSessionBundle(options.bundleDir);
  const actions = filterActions(bundle.actions);

  const driver = await resolveDriver(options, mode);
  const steps: StepResult[] = [];

  await driver.start();
  try {
    for (const action of actions) {
      const plan = locateAction(action, schemaActionIds);
      let step: StepResult;

      if (plan.kind === "unlocatable") {
        step = { actionId: action.id, ok: false, error: `unlocatable: ${plan.reason}` };
      } else if (plan.kind === "navigate") {
        step = { actionId: action.id, ok: true };
      } else {
        const mappedId =
          plan.kind === "clickAction"
            ? plan.actionId
            : action.id;
        try {
          if (plan.kind === "clickAction") {
            await driver.clickAction(plan.actionId);
          } else if (plan.kind === "clickHint") {
            if (!driver.click) {
              throw new Error("unlocatable: driver has no click(hint) fallback");
            }
            await driver.click(plan.hint);
          } else if (plan.kind === "fill") {
            await driver.fill(plan.hint, plan.value);
          }
          step = { actionId: mappedId, ok: true };
        } catch (err) {
          step = stepFromError(mappedId, err);
          if (plan.kind === "clickHint" && !step.networkMiss) {
            step = {
              ...step,
              error: step.error?.startsWith("unlocatable")
                ? step.error
                : `unlocatable: fallback click failed: ${step.error ?? "unknown"}`,
            };
          }
        }
      }

      steps.push(step);
      if (!step.ok && failFast) break;
    }

    if (!(failFast && steps.some((s) => !s.ok))) {
      for (const regionId of criticalRegionIds(schema)) {
        try {
          await driver.assertRegion(regionId);
          steps.push({ actionId: `assert:${regionId}`, ok: true });
        } catch (err) {
          const step = stepFromError(`assert:${regionId}`, err);
          steps.push(step);
          if (failFast) break;
        }
      }
    }
  } finally {
    await driver.close();
  }

  const endedAt = new Date().toISOString();
  const passed = steps.filter((s) => s.ok).length;
  const failed = steps.filter((s) => !s.ok).length;

  const report: BacktestReport = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    startedAt,
    endedAt,
    mode,
    steps,
    summary: {
      passed,
      failed,
      partialSchema,
    },
  };

  if (options.outPath) {
    await writeBacktestReport(options.outPath, report);
  }

  return report;
}
