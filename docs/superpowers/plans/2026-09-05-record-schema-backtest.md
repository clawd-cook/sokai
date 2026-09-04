# Record → Schema → Backtest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a CLI-driven loop that records the compose-pool list page into a SessionBundle, builds a PageSchema (rules + injectable LLM), renders it in a Sokai runtime, and backtests key actions under mock network.

**Architecture:** Six packages under `packages/` share typed contracts via `@sokai/session`. Playwright/CDP writes SessionBundles; `@sokai/schema` builds PageSchema; `@sokai/runtime` serves an interactive Vue preview with mock fetch; `@sokai/backtest` replays filtered actions and writes a report. A checked-in desensitized fixture unlocks offline tests without the live marketing page.

**Tech Stack:** Node.js `24.20.0`, pnpm `11.23.0`, TypeScript `5.x`, Vitest `3.x`, Playwright `1.62.1`, Vue `3.5.x`, Zod `4.x`, Vite for runtime preview. Root already has `playwright`, `vue`, `zod`, `ai` — prefer workspace dependencies over re-adding duplicates when practical.

**Spec:** `docs/superpowers/specs/2026-09-05-record-schema-backtest-design.md`

## Global Constraints

- Product code only in `packages/` — never modify `apps/yy-modules` unless the human explicitly asks.
- No Chrome extension, visual editor, chat editor, or Vue codegen in this plan.
- No pixel/screenshot similarity pass/fail gate.
- Default backtest network mode is mock; live is opt-in (`--live`).
- SessionBundles must redact cookie / authorization / token fields before write.
- Node floor: `24.20.0` (`.node-version`); packageManager: `pnpm@11.23.0`.
- Tests: Vitest; run with `pnpm --filter <name> test` (no sandbox — full network/local per AGENTS.md).
- Commit messages: `[sokai] …` or `[@sokai/<pkg>] …`.

---

## File structure (locked)

| Path | Responsibility |
|------|----------------|
| `tsconfig.base.json` | Shared TS compiler options for packages |
| `packages/session/` | SessionBundle + PageSchema + BacktestReport types, IO, redact, validate |
| `packages/record/` | Playwright recorder → SessionBundle on disk |
| `packages/schema/` | Rule skeleton + LLM enrich → PageSchema |
| `packages/runtime/` | Vue preview app + mock dataSources + `data-sokai-action` hooks |
| `packages/backtest/` | Replay actions against runtime, write BacktestReport |
| `packages/cli/` | `sokai record\|schema\|preview\|backtest` |
| `fixtures/compose-pool/sample-v1/` | Desensitized SessionBundle + expected PageSchema for offline tests |
| Root `package.json` scripts | `test`, `sokai` |

---

### Task 1: `@sokai/session` — contracts, redact, read/write

**Files:**
- Create: `tsconfig.base.json`
- Create: `packages/session/package.json`
- Create: `packages/session/tsconfig.json`
- Create: `packages/session/vitest.config.ts`
- Create: `packages/session/src/types.ts`
- Create: `packages/session/src/redact.ts`
- Create: `packages/session/src/bundle.ts`
- Create: `packages/session/src/page-schema.ts`
- Create: `packages/session/src/report.ts`
- Create: `packages/session/src/index.ts`
- Create: `packages/session/tests/bundle.test.ts`
- Create: `packages/session/tests/redact.test.ts`
- Modify: root `package.json` (add `test` script: `pnpm -r --if-present test`)

**Interfaces:**
- Consumes: none
- Produces:
  - `SESSION_SCHEMA_VERSION = 1`, `PAGE_SCHEMA_VERSION = 1`, `REPORT_SCHEMA_VERSION = 1`
  - Types: `SessionMeta`, `NetworkEntry`, `ActionEntry`, `BundleIndex`, `SessionBundlePaths`, `PageSchema`, `SchemaNode`, `DataSource`, `BacktestReport`, `StepResult`
  - `redactHeaders(headers: Record<string, string>): Record<string, string>`
  - `redactNetworkEntry(entry: NetworkEntry): NetworkEntry`
  - `writeSessionBundle(dir: string, bundle: { meta: SessionMeta; actions: ActionEntry[]; network: NetworkEntry[]; index: BundleIndex; keyframes: { name: string; bytes: Uint8Array }[]; domSnapshots: { name: string; json: unknown }[] }): Promise<void>`
  - `readSessionBundle(dir: string): Promise<{ meta: SessionMeta; actions: ActionEntry[]; network: NetworkEntry[]; index: BundleIndex }>`
  - `assertValidBundleDir(dir: string): Promise<void>` — throws if `meta.json` or `actions.jsonl` missing
  - `parsePageSchema(data: unknown): PageSchema` — Zod parse
  - `writePageSchema(path: string, schema: PageSchema): Promise<void>`
  - `writeBacktestReport(path: string, report: BacktestReport): Promise<void>`

- [ ] **Step 1: Add shared tsconfig + package scaffold**

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "declaration": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["node"]
  }
}
```

`packages/session/package.json`:

```json
{
  "name": "@sokai/session",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "4.5.4"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.8.0",
    "vitest": "^3.0.0"
  }
}
```

`packages/session/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src/**/*", "tests/**/*"]
}
```

`packages/session/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { environment: "node" },
});
```

Update root `package.json` scripts:

```json
"scripts": {
  "test": "pnpm -r --if-present test",
  "sokai": "pnpm --filter @sokai/cli start"
}
```

- [ ] **Step 2: Write failing tests**

`packages/session/tests/redact.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { redactHeaders, redactNetworkEntry } from "../src/redact.js";

describe("redact", () => {
  it("strips authorization and cookie headers", () => {
    const out = redactHeaders({
      Authorization: "Bearer secret",
      cookie: "a=1",
      "content-type": "application/json",
    });
    expect(out.Authorization).toBe("[REDACTED]");
    expect(out.cookie).toBe("[REDACTED]");
    expect(out["content-type"]).toBe("application/json");
  });

  it("redacts token-like body fields", () => {
    const entry = redactNetworkEntry({
      id: "1",
      timestamp: 0,
      method: "POST",
      url: "https://example.com/api",
      status: 200,
      requestHeaders: { authorization: "x" },
      responseHeaders: {},
      requestBody: '{"token":"abc"}',
      responseBody: '{"ok":true}',
    });
    expect(entry.requestHeaders.authorization).toBe("[REDACTED]");
    expect(entry.requestBody).toContain("[REDACTED]");
    expect(entry.requestBody).not.toContain("abc");
  });
});
```

`packages/session/tests/bundle.test.ts`:

```ts
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  assertValidBundleDir,
  readSessionBundle,
  writeSessionBundle,
} from "../src/bundle.js";

describe("session bundle IO", () => {
  it("writes and reads meta, actions, network, index", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sokai-bundle-"));
    await writeSessionBundle(dir, {
      meta: {
        schemaVersion: 1,
        url: "https://example.com/compose-pool",
        viewport: { width: 1280, height: 720 },
        startedAt: "2026-09-05T00:00:00.000Z",
        endedAt: "2026-09-05T00:01:00.000Z",
        pilotTag: "compose-pool-list",
      },
      actions: [
        {
          id: "a1",
          timestamp: 10,
          type: "click",
          target: { strategy: "role", role: "button", name: "搜索" },
        },
      ],
      network: [
        {
          id: "n1",
          timestamp: 11,
          method: "POST",
          url: "https://example.com/api/list",
          status: 200,
          requestHeaders: {},
          responseHeaders: { "content-type": "application/json" },
          requestBody: "{}",
          responseBody: '{"list":[]}',
        },
      ],
      index: {
        schemaVersion: 1,
        keyframes: [
          {
            id: "k1",
            file: "keyframes/k1.png",
            domFile: "dom/k1.json",
            actionFrom: "a1",
            actionTo: "a1",
            at: 10,
          },
        ],
      },
      keyframes: [{ name: "k1.png", bytes: new Uint8Array([137, 80, 78, 71]) }],
      domSnapshots: [{ name: "k1.json", json: { role: "document", name: "合成池管理" } }],
    });

    const rawMeta = await readFile(join(dir, "meta.json"), "utf8");
    expect(JSON.parse(rawMeta).pilotTag).toBe("compose-pool-list");

    const loaded = await readSessionBundle(dir);
    expect(loaded.actions).toHaveLength(1);
    expect(loaded.network[0]?.url).toContain("/api/list");
    expect(loaded.index.keyframes[0]?.file).toBe("keyframes/k1.png");

    await assertValidBundleDir(dir);
  });

  it("assertValidBundleDir fails without actions", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sokai-bad-"));
    await writeSessionBundle(dir, {
      meta: {
        schemaVersion: 1,
        url: "https://example.com",
        viewport: { width: 800, height: 600 },
        startedAt: "2026-09-05T00:00:00.000Z",
        endedAt: "2026-09-05T00:00:01.000Z",
        pilotTag: "compose-pool-list",
      },
      actions: [],
      network: [],
      index: { schemaVersion: 1, keyframes: [] },
      keyframes: [],
      domSnapshots: [],
    });
    // delete actions by rewriting empty invalid: assert requires non-empty actions file existence — empty array still has file; use missing file case:
    const { unlink } = await import("node:fs/promises");
    await unlink(join(dir, "actions.jsonl"));
    await expect(assertValidBundleDir(dir)).rejects.toThrow(/actions/i);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `pnpm install && pnpm --filter @sokai/session test`

Expected: FAIL — modules not found / cannot resolve `../src/redact.js`

- [ ] **Step 4: Implement types + redact + bundle IO**

`packages/session/src/types.ts` — define:

```ts
export const SESSION_SCHEMA_VERSION = 1;
export const PAGE_SCHEMA_VERSION = 1;
export const REPORT_SCHEMA_VERSION = 1;

export type LocatorHint =
  | { strategy: "role"; role: string; name?: string }
  | { strategy: "label"; label: string }
  | { strategy: "css"; selector: string }
  | { strategy: "testId"; testId: string };

export type ActionType = "click" | "fill" | "select" | "scroll" | "keydown" | "navigate";

export interface ActionEntry {
  id: string;
  timestamp: number;
  type: ActionType;
  target?: LocatorHint;
  value?: string;
  url?: string;
}

export interface NetworkEntry {
  id: string;
  timestamp: number;
  method: string;
  url: string;
  status: number;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody?: string;
  responseBody?: string;
}

export interface SessionMeta {
  schemaVersion: number;
  url: string;
  viewport: { width: number; height: number };
  startedAt: string;
  endedAt: string;
  pilotTag: string;
}

export interface BundleIndex {
  schemaVersion: number;
  keyframes: Array<{
    id: string;
    file: string;
    domFile: string;
    actionFrom?: string;
    actionTo?: string;
    at: number;
  }>;
}

export type SchemaNodeType =
  | "Page"
  | "Heading"
  | "SearchForm"
  | "Field"
  | "Table"
  | "Pagination"
  | "Dialog"
  | "Button"
  | "Unknown";

export interface SchemaNode {
  id: string;
  type: SchemaNodeType;
  props: Record<string, unknown>;
  children?: SchemaNode[];
  actionId?: string;
  provenance: "rule" | "model";
}

export interface DataSource {
  id: string;
  method: string;
  urlPattern: string;
  networkEntryId?: string;
}

export interface PageSchema {
  schemaVersion: number;
  id: string;
  title: string;
  root: SchemaNode;
  dataSources: DataSource[];
  partial?: boolean;
}

export interface StepResult {
  actionId: string;
  ok: boolean;
  error?: string;
  networkMiss?: string;
}

export interface BacktestReport {
  schemaVersion: number;
  startedAt: string;
  endedAt: string;
  mode: "mock" | "live";
  steps: StepResult[];
  summary: { passed: number; failed: number; partialSchema: boolean };
}
```

Implement `redact.ts`:
- Header keys matching `/^(authorization|cookie|set-cookie)$/i` → `[REDACTED]`
- JSON body string: replace values for keys matching `/token|password|secret|authorization/i` with `[REDACTED]` (parse + stringify; if parse fails, leave body unchanged)

Implement `bundle.ts` using `node:fs/promises`:
- Write `meta.json`, `actions.jsonl` (one JSON per line), `network.jsonl`, `index.json`, `keyframes/`, `dom/`
- `readSessionBundle` parses those files
- `assertValidBundleDir` checks `meta.json` and `actions.jsonl` exist

Implement `page-schema.ts` with Zod object matching `PageSchema` (recursive node via `z.lazy`).

Implement `report.ts` with `writeBacktestReport`.

Export everything from `index.ts`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @sokai/session test`

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add tsconfig.base.json package.json packages/session
git commit -m "$(cat <<'EOF'
[@sokai/session] Add session bundle contracts, redact, and IO

EOF
)"
```

---

### Task 2: `@sokai/record` — Playwright session capture

**Files:**
- Create: `packages/record/package.json`
- Create: `packages/record/tsconfig.json`
- Create: `packages/record/vitest.config.ts`
- Create: `packages/record/src/dom-simplify.ts`
- Create: `packages/record/src/recorder.ts`
- Create: `packages/record/src/index.ts`
- Create: `packages/record/tests/dom-simplify.test.ts`
- Create: `packages/record/tests/recorder.test.ts`

**Interfaces:**
- Consumes: `@sokai/session` write/redact types
- Produces:
  - `simplifyDom(node: unknown, depth?: number): unknown` — strip script, limit depth (default 12), keep `role`, `name`, `tag`, `attrs` subset
  - `startRecording(options: RecordOptions): Promise<RecordingHandle>`
  - `RecordOptions`: `{ url: string; outDir: string; pilotTag?: string; userDataDir?: string; headed?: boolean }`
  - `RecordingHandle`: `{ stop(): Promise<string> }` — returns `outDir`
  - For tests: `createRecorderForPage(page: PageLike, outDir: string, meta partial): Recorder` where `PageLike` is a minimal interface (`on`, `evaluate`, `screenshot`, `url`, `viewportSize`) so unit tests do not launch Chrome

- [ ] **Step 1: Write failing tests**

`packages/record/package.json`:

```json
{
  "name": "@sokai/record",
  "version": "0.1.0",
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "test": "vitest run" },
  "dependencies": {
    "@sokai/session": "workspace:*",
    "playwright": "1.62.1"
  },
  "devDependencies": {
    "@types/node": "^24.0.0",
    "typescript": "^5.8.0",
    "vitest": "^3.0.0"
  }
}
```

`packages/record/tests/dom-simplify.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { simplifyDom } from "../src/dom-simplify.js";

describe("simplifyDom", () => {
  it("drops script nodes and limits depth", () => {
    const input = {
      role: "document",
      name: "合成池管理",
      children: [
        { tag: "script", children: [{ tag: "text", name: "evil" }] },
        {
          role: "form",
          name: "search",
          children: [{ role: "textbox", name: "品池 ID", attrs: { id: "pool" } }],
        },
      ],
    };
    const out = simplifyDom(input, 3) as any;
    expect(JSON.stringify(out)).not.toContain("evil");
    expect(out.children.some((c: any) => c.role === "form")).toBe(true);
  });
});
```

`packages/record/tests/recorder.test.ts`:

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { readSessionBundle } from "@sokai/session";
import { createRecorderForPage } from "../src/recorder.js";

describe("createRecorderForPage", () => {
  it("records click actions and network then writes bundle on stop", async () => {
    const dir = await mkdtemp(join(tmpdir(), "sokai-rec-"));
    const handlers: Record<string, Function[]> = {};
    const page = {
      url: () => "https://example.com/compose-pool",
      viewportSize: () => ({ width: 1280, height: 720 }),
      on: (event: string, fn: Function) => {
        handlers[event] = handlers[event] ?? [];
        handlers[event]!.push(fn);
      },
      evaluate: vi.fn(async () => ({
        role: "document",
        name: "合成池管理",
        children: [{ role: "table", name: "data" }],
      })),
      screenshot: vi.fn(async () => Buffer.from([1, 2, 3])),
    };

    const rec = await createRecorderForPage(page as any, dir, {
      pilotTag: "compose-pool-list",
    });

    // simulate action + response via whatever public test hook recorder exposes
    await rec.trackAction({
      id: "a1",
      timestamp: 1,
      type: "click",
      target: { strategy: "role", role: "button", name: "搜索" },
    });
    await rec.trackNetwork({
      id: "n1",
      timestamp: 2,
      method: "POST",
      url: "https://example.com/api/list",
      status: 200,
      requestHeaders: { authorization: "secret" },
      responseHeaders: {},
      requestBody: "{}",
      responseBody: '{"list":[]}',
    });
    await rec.captureKeyframe("after-search");

    const out = await rec.stop();
    expect(out).toBe(dir);
    const bundle = await readSessionBundle(dir);
    expect(bundle.actions).toHaveLength(1);
    expect(bundle.network[0]?.requestHeaders.authorization).toBe("[REDACTED]");
    expect(bundle.index.keyframes.length).toBeGreaterThanOrEqual(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm install && pnpm --filter @sokai/record test`

Expected: FAIL — missing modules

- [ ] **Step 3: Implement simplify + recorder**

`dom-simplify.ts`: recursive walk; skip `tag === "script"`; at `depth <= 0` return `{ truncated: true }`; keep `role`, `name`, `tag`, `attrs` (only `id`, `name`, `type`, `aria-*`, `data-testid`).

`recorder.ts`:
- `createRecorderForPage` maintains arrays, exposes `trackAction`, `trackNetwork` (always through `redactNetworkEntry`), `captureKeyframe` (screenshot + evaluate DOM + push index entry), `stop` → `writeSessionBundle` + `assertValidBundleDir`
- `startRecording`: `chromium.launchPersistentContext(userDataDir ?? os.tmpdir()/sokai-chrome-profile, { headless: headed === false ? false : false })` — **default headed `true`** for manual operate; navigate to `url`; install page listeners:
  - Prefer Playwright `page.on('requestfinished')` / response body where available
  - Inject a small init script that posts click/fill events to `page.exposeBinding('sokaiTrack', …)` building `LocatorHint` from role/name/label
  - On binding events call `trackAction` + opportunistic `captureKeyframe` after clicks that open dialogs (name includes `更新`) or search
- Return handle whose `stop` closes context after writing bundle

Keep network body truncation: if string length > 200_000, slice and append `\n/* truncated */`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sokai/record test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/record
git commit -m "$(cat <<'EOF'
[@sokai/record] Add Playwright recorder and DOM simplify

EOF
)"
```

---

### Task 3: `@sokai/schema` — rule skeleton + validation

**Files:**
- Create: `packages/schema/package.json`
- Create: `packages/schema/tsconfig.json`
- Create: `packages/schema/vitest.config.ts`
- Create: `packages/schema/src/rules.ts`
- Create: `packages/schema/src/validate-skeleton.ts`
- Create: `packages/schema/src/build.ts`
- Create: `packages/schema/src/llm.ts`
- Create: `packages/schema/src/index.ts`
- Create: `packages/schema/tests/fixtures/compose-pool-dom.json`
- Create: `packages/schema/tests/rules.test.ts`

**Interfaces:**
- Consumes: `@sokai/session` `PageSchema`, `SchemaNode`, `readSessionBundle`
- Produces:
  - `buildSkeletonFromDom(dom: unknown): SchemaNode` — detects Heading/SearchForm/Table/Pagination/Dialog regions
  - `assertSkeletonHasCriticalRegions(root: SchemaNode): void` — throws if missing SearchForm or Table
  - `mapDataSources(network: NetworkEntry[]): DataSource[]` — one entry per unique method+pathname, `urlPattern` as pathname glob
  - `LlmClient` interface: `completeJson(prompt: string): Promise<unknown>`
  - `enrichWithModel(skeleton: PageSchema, ctx: { domText: string; llm: LlmClient }): Promise<PageSchema>` — merges labels/column titles into existing ids only; on failure set `partial: true` and return skeleton unchanged otherwise
  - `buildPageSchemaFromBundle(dir: string, opts?: { llm?: LlmClient }): Promise<PageSchema>`

- [ ] **Step 1: Write fixture + failing test**

`packages/schema/tests/fixtures/compose-pool-dom.json`:

```json
{
  "role": "document",
  "name": "合成池管理",
  "children": [
    { "role": "heading", "name": "合成池管理", "tag": "h2" },
    {
      "role": "form",
      "name": "search",
      "children": [
        { "role": "textbox", "name": "品池 ID", "attrs": { "name": "combinateMsPoolId" } },
        { "role": "button", "name": "搜索" },
        { "role": "button", "name": "重置" }
      ]
    },
    {
      "role": "table",
      "name": "data",
      "children": [
        { "role": "columnheader", "name": "品池 ID" },
        { "role": "columnheader", "name": "策略 ID" },
        { "role": "button", "name": "导出" },
        { "role": "link", "name": "更新" }
      ]
    },
    { "role": "navigation", "name": "pagination", "attrs": { "aria-label": "pagination" } },
    { "role": "dialog", "name": "黑名单更新", "children": [] }
  ]
}
```

`packages/schema/tests/rules.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertSkeletonHasCriticalRegions,
  buildSkeletonFromDom,
  enrichWithModel,
  mapDataSources,
} from "../src/index.js";
import type { LlmClient } from "../src/llm.js";

const here = dirname(fileURLToPath(import.meta.url));

describe("schema rules", () => {
  it("builds compose-pool skeleton with stable region ids", async () => {
    const dom = JSON.parse(
      await readFile(join(here, "fixtures/compose-pool-dom.json"), "utf8"),
    );
    const root = buildSkeletonFromDom(dom);
    assertSkeletonHasCriticalRegions(root);
    const types = collectTypes(root);
    expect(types).toEqual(
      expect.arrayContaining(["Heading", "SearchForm", "Table", "Pagination", "Dialog"]),
    );
    expect(findByType(root, "SearchForm")?.id).toBe("region-search");
    expect(findByType(root, "Table")?.id).toBe("region-table");
  });

  it("fails hard when table missing", () => {
    const root = buildSkeletonFromDom({
      role: "document",
      children: [{ role: "form", name: "search", children: [] }],
    });
    expect(() => assertSkeletonHasCriticalRegions(root)).toThrow(/table/i);
  });

  it("enrichment cannot rename rule ids and marks partial on llm failure", async () => {
    const dom = JSON.parse(
      await readFile(join(here, "fixtures/compose-pool-dom.json"), "utf8"),
    );
    const root = buildSkeletonFromDom(dom);
    const skeleton = {
      schemaVersion: 1,
      id: "marketing.coupon.composePool.list",
      title: "合成池管理",
      root,
      dataSources: mapDataSources([
        {
          id: "n1",
          timestamp: 0,
          method: "POST",
          url: "https://x.com/api/combinatePool/page",
          status: 200,
          requestHeaders: {},
          responseHeaders: {},
          responseBody: "{}",
        },
      ]),
    };
    const badLlm: LlmClient = {
      async completeJson() {
        throw new Error("timeout");
      },
    };
    const partial = await enrichWithModel(skeleton, { domText: "…", llm: badLlm });
    expect(partial.partial).toBe(true);
    expect(findByType(partial.root, "SearchForm")?.id).toBe("region-search");

    const goodLlm: LlmClient = {
      async completeJson() {
        return {
          patches: [
            {
              id: "region-table",
              props: { columns: [{ label: "品池 ID", prop: "combinateMsPoolId" }] },
            },
            { id: "hacked-new-id", props: { title: "nope" } },
          ],
        };
      },
    };
    const enriched = await enrichWithModel(
      { ...skeleton, partial: false },
      { domText: "…", llm: goodLlm },
    );
    expect(findByType(enriched.root, "Table")?.props.columns).toEqual([
      { label: "品池 ID", prop: "combinateMsPoolId" },
    ]);
    expect(findById(enriched.root, "hacked-new-id")).toBeUndefined();
  });
});

function collectTypes(node: any): string[] {
  return [node.type, ...(node.children ?? []).flatMap(collectTypes)];
}
function findByType(node: any, type: string): any {
  if (node.type === type) return node;
  for (const c of node.children ?? []) {
    const f = findByType(c, type);
    if (f) return f;
  }
}
function findById(node: any, id: string): any {
  if (node.id === id) return node;
  for (const c of node.children ?? []) {
    const f = findById(c, id);
    if (f) return f;
  }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm install && pnpm --filter @sokai/schema test`

Expected: FAIL

- [ ] **Step 3: Implement rules + enrich**

Detection heuristics (good enough for fixture + pilot):
- `role===heading` or `tag===h1|h2` → `Heading` id `region-heading`
- `role===form` or name/attrs suggesting search → `SearchForm` id `region-search`; child textboxes → `Field`; buttons 搜索/重置 get `actionId` `action-search` / `action-reset`
- `role===table` → `Table` id `region-table`; button/link named 更新 → `actionId` `action-open-blacklist-dialog`; 导出 → `action-export`
- pagination via `role===navigation` or name/aria containing `pagination` → `Pagination` id `region-pagination` with `actionId` `action-page-next` optional
- `role===dialog` → `Dialog` id `region-dialog-blacklist`

`enrichWithModel`: prompt asks for `{ patches: { id, props }[] }`; apply only when `id` exists in skeleton; never add/remove nodes; wrap LLM errors → `partial: true`.

`buildPageSchemaFromBundle`: read bundle, pick first DOM snapshot JSON, build skeleton, assert critical regions, map data sources, optionally enrich, `parsePageSchema` before return.

Default `LlmClient` can be a no-op that throws (forcing `partial`) unless env `SOKAI_LLM=fake|openai` — for CLI later; tests always inject.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sokai/schema test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/schema
git commit -m "$(cat <<'EOF'
[@sokai/schema] Add DOM rule skeleton and safe LLM enrichment

EOF
)"
```

---

### Task 4: `@sokai/runtime` — Vue preview + mock + action hooks

**Files:**
- Create: `packages/runtime/package.json`
- Create: `packages/runtime/tsconfig.json`
- Create: `packages/runtime/vitest.config.ts`
- Create: `packages/runtime/vite.config.ts`
- Create: `packages/runtime/index.html`
- Create: `packages/runtime/src/mock.ts`
- Create: `packages/runtime/src/mount.ts`
- Create: `packages/runtime/src/components/SchemaRenderer.vue`
- Create: `packages/runtime/src/main.ts`
- Create: `packages/runtime/src/index.ts`
- Create: `packages/runtime/tests/mock.test.ts`
- Create: `packages/runtime/tests/mount.test.ts`

**Interfaces:**
- Consumes: `@sokai/session` `PageSchema`, `NetworkEntry`
- Produces:
  - `installMockFetch(dataSources: DataSource[], network: NetworkEntry[]): () => void` — monkey-patches `globalThis.fetch`; unmatched URL throws `MockMissError` with fingerprint `METHOD path`
  - `mountPreview(el: HTMLElement, schema: PageSchema, opts?: { network?: NetworkEntry[]; mock?: boolean }): { unmount(): void }`
  - Nodes render with `data-sokai-action="<actionId>"` when `actionId` set
  - Region nodes also set `data-sokai-region="<node.id>"` (required by backtest structure checks)
  - `startPreviewServer(options: { schemaPath: string; bundleDir?: string; port?: number; mock?: boolean }): Promise<{ baseUrl: string; close(): Promise<void> }>` — Vite preview or lightweight connect static server loading schema JSON

- [ ] **Step 1: Write failing tests**

Use `vitest` + `happy-dom` (add dep).

`packages/runtime/tests/mock.test.ts`:

```ts
import { describe, expect, it, afterEach } from "vitest";
import { installMockFetch, MockMissError } from "../src/mock.js";

describe("installMockFetch", () => {
  afterEach(() => {
    // ensure restore
  });

  it("returns recorded body for matching dataSource", async () => {
    const restore = installMockFetch(
      [
        {
          id: "poolList",
          method: "POST",
          urlPattern: "**/combinatePool/page**",
          networkEntryId: "n1",
        },
      ],
      [
        {
          id: "n1",
          timestamp: 0,
          method: "POST",
          url: "https://api.example.com/combinatePool/page",
          status: 200,
          requestHeaders: {},
          responseHeaders: { "content-type": "application/json" },
          responseBody: '{"list":[1]}',
        },
      ],
    );
    const res = await fetch("https://api.example.com/combinatePool/page", { method: "POST" });
    expect(await res.text()).toBe('{"list":[1]}');
    restore();
  });

  it("throws MockMissError on undeclared URL", async () => {
    const restore = installMockFetch([], []);
    await expect(fetch("https://api.example.com/other")).rejects.toBeInstanceOf(MockMissError);
    restore();
  });
});
```

`packages/runtime/tests/mount.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { mountPreview } from "../src/mount.js";
import type { PageSchema } from "@sokai/session";

const schema: PageSchema = {
  schemaVersion: 1,
  id: "marketing.coupon.composePool.list",
  title: "合成池管理",
  dataSources: [],
  root: {
    id: "root",
    type: "Page",
    provenance: "rule",
    props: {},
    children: [
      {
        id: "region-search",
        type: "SearchForm",
        provenance: "rule",
        props: { title: "search" },
        children: [
          {
            id: "action-search-btn",
            type: "Button",
            provenance: "rule",
            props: { label: "搜索" },
            actionId: "action-search",
          },
        ],
      },
      {
        id: "region-table",
        type: "Table",
        provenance: "rule",
        props: { columns: [{ label: "品池 ID", prop: "id" }] },
        children: [
          {
            id: "action-update",
            type: "Button",
            provenance: "rule",
            props: { label: "更新" },
            actionId: "action-open-blacklist-dialog",
          },
        ],
      },
    ],
  },
};

describe("mountPreview", () => {
  it("exposes data-sokai-action hooks", () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    const app = mountPreview(el, schema, { mock: false });
    expect(el.querySelector('[data-sokai-action="action-search"]')).toBeTruthy();
    expect(
      el.querySelector('[data-sokai-action="action-open-blacklist-dialog"]'),
    ).toBeTruthy();
    app.unmount();
  });

  it("renders placeholder for Unknown without throwing", () => {
    const el = document.createElement("div");
    const s = structuredClone(schema);
    s.root.children!.push({
      id: "x",
      type: "Unknown",
      provenance: "rule",
      props: { note: "mystery" },
    });
    expect(() => mountPreview(el, s, { mock: false })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm install && pnpm --filter @sokai/runtime test`

Expected: FAIL

- [ ] **Step 3: Implement mock + Vue renderer + mount**

`urlPattern` match: treat `**` as wildcard; compare against full URL.

`SchemaRenderer.vue`: recursive component switch on `type`; visual minimal CSS; Dialog toggled when `action-open-blacklist-dialog` clicked (local ref `dialogOpen`).

`mount.ts`: `createApp` + provide schema; if `mock !== false` and network provided, `installMockFetch`.

`startPreviewServer`: read schema JSON from path; if `bundleDir`, load `network.jsonl`; use `vite`'s `createServer` in middleware mode or `preview` — simplest path: write a tiny `node:http` server that serves `index.html` + inlined schema as `/schema.json`, and use Vite only for build later. For backtest, Playwright can set content via `page.goto(baseUrl)`.

Prefer: Vite dev server programmatically:

```ts
import { createServer } from "vite";
const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { port: options.port ?? 0 },
});
await server.listen();
```

Pass schema path via env `SOKAI_SCHEMA_PATH` read in `main.ts`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sokai/runtime test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/runtime
git commit -m "$(cat <<'EOF'
[@sokai/runtime] Add Vue schema preview, mock fetch, and action hooks

EOF
)"
```

---

### Task 5: `@sokai/backtest` — replay + report

**Files:**
- Create: `packages/backtest/package.json`
- Create: `packages/backtest/tsconfig.json`
- Create: `packages/backtest/vitest.config.ts`
- Create: `packages/backtest/src/filter-actions.ts`
- Create: `packages/backtest/src/locate.ts`
- Create: `packages/backtest/src/run.ts`
- Create: `packages/backtest/src/index.ts`
- Create: `packages/backtest/tests/filter-actions.test.ts`
- Create: `packages/backtest/tests/run.test.ts`

**Interfaces:**
- Consumes: session types, `startPreviewServer`, Playwright
- Produces:
  - `filterActions(actions: ActionEntry[]): ActionEntry[]` — drop `scroll`; drop `keydown` without value; keep click/fill/select/navigate
  - `runBacktest(options: { bundleDir: string; schemaPath: string; mode?: "mock" | "live"; failFast?: boolean; outPath?: string }): Promise<BacktestReport>`
  - Step mapping: if action target name is 搜索 → click `[data-sokai-action="action-search"]`; 更新 → `action-open-blacklist-dialog`; fill → fill nearest field; pagination next → `action-page-next` if present else mark fail with clear error
  - On `MockMissError`, step fails with `networkMiss` fingerprint; continue unless `failFast`
  - After steps, assert critical structure: selectors for search/table exist (`[data-sokai-region="region-search"]` etc.) — renderer must set `data-sokai-region` from node id for region_* ids

- [ ] **Step 1: Write failing tests**

`filter-actions.test.ts` — assert scrolls removed, clicks kept.

`run.test.ts` — use fixture schema + tiny bundle dir created in test temp:
- Write minimal `page.schema.json` matching Task 4 schema (with regions)
- Write minimal session bundle with actions: click 搜索, click 更新
- Call `runBacktest` in mock mode
- Expect `summary.failed === 0` and report file written

Because full Playwright + Vite may be heavy, structure `runBacktest` to accept optional `driver` inject; default uses Playwright. Unit test uses a **fake driver**:

```ts
export interface BacktestDriver {
  start(): Promise<void>;
  clickAction(actionId: string): Promise<void>;
  fill(hint: LocatorHint, value: string): Promise<void>;
  assertRegion(regionId: string): Promise<void>;
  close(): Promise<void>;
}
```

Default `createPlaywrightDriver(...)`. Test supplies fake that records calls and succeeds.

Also one test where fake throws on second click → with `failFast: false` both steps present in report (second fail).

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @sokai/backtest test`

Expected: FAIL

- [ ] **Step 3: Implement filter + run + playwright driver**

Map recorded actions to schema actionIds by target name heuristics (搜索/重置/更新/导出). If no mapping, try CSS from hint; if still fail, step error `unlocatable`.

Write report via `writeBacktestReport`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @sokai/backtest test`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/backtest
git commit -m "$(cat <<'EOF'
[@sokai/backtest] Add action replay, mock-aware driver, and reports

EOF
)"
```

---

### Task 6: Fixture pack + `@sokai/cli`

**Files:**
- Create: `fixtures/compose-pool/sample-v1/meta.json`
- Create: `fixtures/compose-pool/sample-v1/actions.jsonl`
- Create: `fixtures/compose-pool/sample-v1/network.jsonl`
- Create: `fixtures/compose-pool/sample-v1/index.json`
- Create: `fixtures/compose-pool/sample-v1/dom/k1.json` (copy of schema fixture DOM)
- Create: `fixtures/compose-pool/sample-v1/keyframes/k1.png` (1x1 PNG bytes)
- Create: `fixtures/compose-pool/sample-v1/page.schema.json` (optional expected; CLI may regenerate)
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/src/main.ts`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/tests/cli-schema.test.ts`
- Modify: root `package.json` scripts if needed
- Modify: `.gitignore` — ensure `fixtures/**/clips/**` stays ignored; do **not** ignore `sample-v1` JSON/DOM/png

**Interfaces:**
- Consumes: record, schema, runtime, backtest
- Produces CLI:
  - `sokai record --url <url> --out <dir> [--user-data-dir <path>] [--pilot-tag compose-pool-list]`
  - `sokai schema --bundle <dir> --out <file> [--no-llm]`
  - `sokai preview --schema <file> [--bundle <dir>] [--port 5173]`
  - `sokai backtest --bundle <dir> --schema <file> [--live] [--fail-fast] [--out report.json]`

- [ ] **Step 1: Author desensitized fixture**

Minimal actions covering pilot script:

```jsonl
{"id":"a0","timestamp":0,"type":"navigate","url":"https://example.com/compose-pool"}
{"id":"a1","timestamp":1,"type":"fill","target":{"strategy":"label","label":"品池 ID"},"value":"pool-1"}
{"id":"a2","timestamp":2,"type":"click","target":{"strategy":"role","role":"button","name":"搜索"}}
{"id":"a3","timestamp":3,"type":"click","target":{"strategy":"role","role":"button","name":"下一页"}}
{"id":"a4","timestamp":4,"type":"click","target":{"strategy":"role","role":"link","name":"更新"}}
{"id":"a5","timestamp":5,"type":"click","target":{"strategy":"role","role":"button","name":"关闭"}}
```

Network: one POST list response with fake rows (no tokens). `meta.pilotTag`: `compose-pool-list`.

- [ ] **Step 2: Write CLI test — schema from fixture**

```ts
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runCli } from "../src/main.js";
import { parsePageSchema } from "@sokai/session";
import { readFile } from "node:fs/promises";

describe("cli schema", () => {
  it("builds page schema from sample-v1 without LLM", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "sokai-cli-"));
    const out = join(outDir, "page.schema.json");
    const code = await runCli([
      "schema",
      "--bundle",
      "fixtures/compose-pool/sample-v1",
      "--out",
      out,
      "--no-llm",
    ]);
    expect(code).toBe(0);
    const schema = parsePageSchema(JSON.parse(await readFile(out, "utf8")));
    expect(schema.root).toBeTruthy();
  });
});
```

Resolve fixture path relative to repo root (detect via `process.cwd()` or `fileURLToPath` walk).

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm install && pnpm --filter @sokai/cli test`

Expected: FAIL

- [ ] **Step 4: Implement CLI**

Use `node:util parseArgs` (no extra dep) or manual argv:
- `runCli(argv: string[]): Promise<number>` returns exit code
- `bin` in package.json: `./src/main.ts` via `tsx` **or** compile — add `tsx` as cli devDependency and `"start": "tsx src/main.ts"`

Wire:
- record → `startRecording`
- schema → `buildPageSchemaFromBundle` + `writePageSchema` (`--no-llm` passes llm that throws immediately → partial OK, or skip enrich entirely when `--no-llm`)
- preview → `startPreviewServer` then print URL; wait on SIGINT
- backtest → `runBacktest`

- [ ] **Step 5: Integration check (fixture backtest with fake or playwright)**

Add `packages/cli/tests/cli-backtest.test.ts` calling `runCli(['backtest', ...])` against fixture + generated schema; expect exit `0` when using mock driver path. If Playwright server path is flaky in CI, gate with `runBacktest({ driver: fake })` unit already done — CLI test may only assert `schema` + `backtest --help` exit codes. Prefer: generate schema then `runBacktest` API in test (not full browser) for stability; document manual command:

```bash
pnpm sokai -- schema --bundle fixtures/compose-pool/sample-v1 --out /tmp/page.schema.json --no-llm
pnpm sokai -- backtest --bundle fixtures/compose-pool/sample-v1 --schema /tmp/page.schema.json
```

- [ ] **Step 6: Run all package tests**

Run: `pnpm -r --if-present test`

Expected: all PASS

- [ ] **Step 7: Commit**

```bash
git add fixtures/compose-pool/sample-v1 packages/cli package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
[@sokai/cli] Add CLI and compose-pool sample fixture for offline loop

EOF
)"
```

---

### Task 7: README smoke path + AGENTS cross-link

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md` (one line pointing to plan/spec)

**Interfaces:**
- Consumes: CLI commands from Task 6
- Produces: human-readable smoke instructions

- [ ] **Step 1: Write README section**

Replace or expand `README.md` with:

```markdown
# Sokai（溯洄）

录制 → Schema → 回测。规格：`docs/superpowers/specs/2026-09-05-record-schema-backtest-design.md`。

## 开发

\`\`\`bash
pnpm install
pnpm playwright install   # if browsers missing
pnpm -r --if-present test
\`\`\`

## 离线闭环（fixture）

\`\`\`bash
pnpm sokai -- schema --bundle fixtures/compose-pool/sample-v1 --out /tmp/page.schema.json --no-llm
pnpm sokai -- preview --schema /tmp/page.schema.json --bundle fixtures/compose-pool/sample-v1
pnpm sokai -- backtest --bundle fixtures/compose-pool/sample-v1 --schema /tmp/page.schema.json
\`\`\`

## 录制合成池试点

\`\`\`bash
pnpm sokai -- record --url <已登录可打开的合成池列表 URL> --out /tmp/compose-session --user-data-dir ~/Library/Application\\ Support/Google/Chrome
\`\`\`
```

- [ ] **Step 2: Commit**

```bash
git add README.md AGENTS.md
git commit -m "$(cat <<'EOF'
[sokai] Document record/schema/backtest smoke commands

EOF
)"
```

---

## Spec coverage self-check

| Spec requirement | Task |
|------------------|------|
| SessionBundle shape + redact | Task 1 |
| Playwright/CDP record (extension later) | Task 2 |
| Rules + model enrich, model cannot break ids | Task 3 |
| Runtime preview, not yy-modules codegen | Task 4 |
| Mock default, live opt-in, continue-on-fail | Task 5 |
| CLI + fixture E2E | Task 6 |
| Pilot page / minimal script | Tasks 3, 5, 6 |
| Out of scope extension/editor/codegen/pixels | Not scheduled |
| packages/ only | All tasks |

## Placeholder / consistency notes (resolved in plan)

- Chrome profile: `--user-data-dir` on `record` (Task 6).
- LLM: injectable `LlmClient`; `--no-llm` skips enrich (Task 3/6).
- Region hooks: `data-sokai-region` + `data-sokai-action` (Tasks 4–5).
- Types locked in Task 1; later tasks must not rename `pilotTag`, `actionId`, or region ids `region-search` / `region-table`.
