# Page Record → Schema → Backtest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an MVP loop: Chrome extension records a composePool session package → local Agent writes `page.schema.json` from package + code + spec → schema-player renders with Jd + network mock → Playwright backtest enforces screenshot + DOM + API gates.

**Architecture:** Four deliverables share typed packages at the sokai root. `packages/page-schema` and `packages/recording-pack` define contracts. A hand-authored `fixtures/compose-pool/sample-v1` unblocks player/backtest before the extension exists. Extension only exports data; Agent skill documents how to generate schema. Backtest CLI starts schema-player, drives keyframes, fails closed on any gate.

**Tech Stack:** pnpm workspace, TypeScript, Vitest, Vue 3 + Vite, `@jd/jdesign-vue@2.1.0-djwebui.31` + `@jd/jdesign-vue-pro@2.1.0`, Chrome MV3 extension, Playwright, `pixelmatch` + `pngjs`, Ajv (JSON Schema draft-2020-12).

**Spec:** `docs/superpowers/specs/2026-09-04-page-record-schema-backtest-design.md`

## Global Constraints

- Extension must not call LLMs or write `page.schema.json`.
- `page.schema.json` lives **inside** the session folder (`fixtures/compose-pool/<sessionId>/page.schema.json`).
- `clips/` never affect backtest pass/fail.
- Undeclared network requests during backtest fail (no silent passthrough).
- MVP page layout whitelist: `list-page` only; section types: `pageHeader` | `searchForm` | `table` | `pagination` | `dialog`.
- Declarative actions only: `search` | `reset` | `pageChange` | `openDialog` | `exportUrl`.
- Pilot `pageId`: `marketing.coupon.composePool.list`.
- Screenshot gate: `pixelmatch` with `threshold: 0.1`; fail if `diffPixels / totalPixels > 0.02` (2%), after applying `mask` rectangles from the frame.
- Schema-player is `apps/schema-player` at sokai root (copy/link yy-modules `.npmrc` for private `@jd/*` if install fails).
- Large `clips/**` are gitignored; keyframe PNGs, JSON artifacts, and schema are committed for `sample-v1`.

---

## File structure (locked)

| Path | Responsibility |
|------|----------------|
| `pnpm-workspace.yaml` / root `package.json` | Workspace + scripts `backtest`, `dev:schema-player` |
| `packages/page-schema/` | JSON Schema + `validatePageSchema()` + Agent-facing `SPEC.md` |
| `packages/recording-pack/` | Manifest/assert/contract types + `validateRecordingPack()` + `normalizeUrl()` |
| `fixtures/compose-pool/sample-v1/` | Hand-authored recording + schema for offline E2E |
| `apps/schema-player/` | Vite Vue app: load fixture, mock XHR/fetch, render list-page |
| `tools/page-backtest/` | Playwright CLI: three gates + report |
| `tools/page-recorder-ext/` | MV3 extension: record + zip/download pack |
| `.claude/skills/page-schema-from-recording/SKILL.md` | Local Agent workflow |
| `.gitignore` | Ignore `fixtures/**/clips/**`, backtest diff artifacts |

---

### Task 1: Bootstrap pnpm workspace

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `.gitignore` (append if exists)
- Modify: none

**Interfaces:**
- Consumes: none
- Produces: workspace that can add `packages/*`, `apps/*`, `tools/*`

- [ ] **Step 1: Create workspace files**

`pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "apps/*"
  - "tools/*"
```

Root `package.json`:

```json
{
  "name": "sokai",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev:schema-player": "pnpm --filter schema-player dev",
    "backtest": "pnpm --filter page-backtest start",
    "test": "pnpm -r --if-present test"
  }
}
```

Append to `.gitignore`:

```gitignore
node_modules
dist
*.local
fixtures/**/clips/**
tools/page-backtest/artifacts/
```

- [ ] **Step 2: Verify workspace resolves**

Run: `pnpm install`
Expected: lockfile created; empty package globs may warn until Task 2 adds packages — continue immediately if needed.

- [ ] **Step 3: Commit**

```bash
git add pnpm-workspace.yaml package.json .gitignore pnpm-lock.yaml
git commit -m "chore: bootstrap pnpm workspace for record/schema/backtest tools"
```

---

### Task 2: `packages/page-schema` — JSON Schema + validator

**Files:**
- Create: `packages/page-schema/package.json`
- Create: `packages/page-schema/tsconfig.json`
- Create: `packages/page-schema/src/page.schema.json`
- Create: `packages/page-schema/src/validate.ts`
- Create: `packages/page-schema/src/index.ts`
- Create: `packages/page-schema/SPEC.md`
- Create: `packages/page-schema/tests/validate.test.ts`
- Create: `packages/page-schema/vitest.config.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `validatePageSchema(data: unknown): { ok: true; data: PageSchema } | { ok: false; errors: string[] }`
  - Type `PageSchema`
  - JSON Schema at `src/page.schema.json`

- [ ] **Step 1: Write failing test**

`packages/page-schema/package.json`:

```json
{
  "name": "@sokai/page-schema",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./page.schema.json": "./src/page.schema.json"
  },
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "ajv": "^8.17.1",
    "ajv-formats": "^3.0.1"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "vitest": "^2.1.8"
  }
}
```

`packages/page-schema/tests/validate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { validatePageSchema } from "../src/index.js";

const minimalValid = {
  schemaVersion: "1",
  pageId: "marketing.coupon.composePool.list",
  title: "合成池管理",
  layout: "list-page",
  dataSources: [
    {
      id: "poolList",
      method: "POST",
      urlPattern: "**/combinatePool/page**",
      listPath: "result.resultList",
      totalPath: "result.totalCount",
    },
  ],
  sections: [
    { type: "pageHeader", title: "合成池管理" },
    {
      type: "searchForm",
      fields: [
        {
          field: "combinateMsPoolId",
          label: "合成品池 ID",
          control: "input",
          defaultValue: "",
        },
      ],
      actions: ["search", "reset"],
    },
    {
      type: "table",
      dataSourceId: "poolList",
      rowKey: "rowKey",
      emptyText: "暂无合成品池数据",
      mergeBy: "combinateMsPoolId",
      columns: [
        { label: "品池 ID", prop: "combinateMsPoolId" },
        { label: "策略 ID", prop: "strategyId" },
      ],
      rowActions: [
        { type: "exportUrl", label: "导出", urlProp: "blacklistOrgUrl" },
        { type: "openDialog", label: "更新", dialogId: "blacklistUpload" },
      ],
    },
    {
      type: "pagination",
      pageSizes: [20, 50, 100],
      layout: "sizes, prev, pager, next, total",
    },
    {
      type: "dialog",
      id: "blacklistUpload",
      title: "更新黑名单",
      fields: [{ field: "file", label: "文件", control: "upload" }],
    },
  ],
};

describe("validatePageSchema", () => {
  it("accepts a minimal composePool list schema", () => {
    const result = validatePageSchema(minimalValid);
    expect(result.ok).toBe(true);
  });

  it("rejects unknown section types", () => {
    const result = validatePageSchema({
      ...minimalValid,
      sections: [{ type: "wizard", steps: [] }],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects missing pageId", () => {
    const { pageId: _omit, ...rest } = minimalValid;
    const result = validatePageSchema(rest);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm install && pnpm --filter @sokai/page-schema test`
Expected: FAIL (`validatePageSchema` missing)

- [ ] **Step 3: Implement JSON Schema + validator**

`packages/page-schema/src/page.schema.json` — draft-2020-12 enforcing:

- required: `schemaVersion` (`"1"`), `pageId`, `title`, `layout` (`"list-page"`), `dataSources`, `sections`
- `dataSources` items: `id`, `method` (GET|POST|PUT|DELETE), `urlPattern`, optional `listPath`, `totalPath`
- `sections` as `oneOf` by `type` for the five whitelist types
- action enums per Global Constraints

`packages/page-schema/src/validate.ts`:

```ts
import AjvModule from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const schema = JSON.parse(
  readFileSync(join(__dirname, "page.schema.json"), "utf8"),
);

const Ajv = (AjvModule as unknown as { default?: typeof AjvModule }).default ?? AjvModule;
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

export type PageSchema = {
  schemaVersion: "1";
  pageId: string;
  title: string;
  layout: "list-page";
  dataSources: Array<{
    id: string;
    method: "GET" | "POST" | "PUT" | "DELETE";
    urlPattern: string;
    listPath?: string;
    totalPath?: string;
  }>;
  sections: unknown[];
};

export function validatePageSchema(
  data: unknown,
): { ok: true; data: PageSchema } | { ok: false; errors: string[] } {
  if (validate(data)) {
    return { ok: true, data: data as PageSchema };
  }
  const errors = (validate.errors ?? []).map(
    (e) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`,
  );
  return { ok: false, errors };
}
```

`packages/page-schema/src/index.ts`:

```ts
export { validatePageSchema, type PageSchema } from "./validate.js";
```

Also add `SPEC.md` (Agent-facing whitelist + composePool example) and `vitest.config.ts` / `tsconfig.json` with `strict`, `moduleResolution: Bundler`, `resolveJsonModule`.

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @sokai/page-schema test`
Expected: 3 passed

- [ ] **Step 5: Commit**

```bash
git add packages/page-schema
git commit -m "feat(page-schema): add list-page JSON Schema and validator"
```

---

### Task 3: `packages/recording-pack` — pack types + validators

**Files:**
- Create: `packages/recording-pack/package.json`
- Create: `packages/recording-pack/src/types.ts`
- Create: `packages/recording-pack/src/normalizeUrl.ts`
- Create: `packages/recording-pack/src/validatePack.ts`
- Create: `packages/recording-pack/src/index.ts`
- Create: `packages/recording-pack/tests/normalizeUrl.test.ts`
- Create: `packages/recording-pack/tests/validatePack.test.ts`
- Create: `packages/recording-pack/vitest.config.ts`

**Interfaces:**
- Consumes: none
- Produces:
  - `normalizeUrl(url: string): string` — drop hash; strip query keys `token`,`ticket`,`sso`,`Authorization` (case-insensitive); sort remaining query keys
  - `validateRecordingPack(rootDir: string): Promise<{ ok: true } | { ok: false; errors: string[] }>`
  - Types: `RecordingManifest`, `DomAssert`, `NetworkContract`, `NetworkEntry`

- [ ] **Step 1: Write failing tests**

```ts
// tests/normalizeUrl.test.ts
import { describe, expect, it } from "vitest";
import { normalizeUrl } from "../src/normalizeUrl.js";

describe("normalizeUrl", () => {
  it("strips hash, auth query keys, and sorts query", () => {
    expect(
      normalizeUrl("https://x.test/api?b=2&token=secret&a=1#frag"),
    ).toBe("https://x.test/api?a=1&b=2");
  });
});
```

```ts
// tests/validatePack.test.ts
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { validateRecordingPack } from "../src/validatePack.js";

const tmp = join(process.cwd(), ".tmp-pack");

describe("validateRecordingPack", () => {
  beforeEach(() => {
    rmSync(tmp, { recursive: true, force: true });
    mkdirSync(join(tmp, "frames"), { recursive: true });
    writeFileSync(join(tmp, "frames", "001.png"), "fake");
    writeFileSync(
      join(tmp, "manifest.json"),
      JSON.stringify({
        pageId: "marketing.coupon.composePool.list",
        url: "http://localhost:5173/",
        viewport: { width: 1280, height: 720 },
        userAgent: "vitest",
        recordedAt: "2026-09-04T00:00:00.000Z",
        scenario: "load",
        frames: [
          {
            id: "001",
            ts: 0,
            path: "frames/001.png",
            label: "idle",
            networkRefs: [],
          },
        ],
        clips: [],
        redaction: ["token"],
      }),
    );
    mkdirSync(join(tmp, "dom"), { recursive: true });
    writeFileSync(join(tmp, "dom", "asserts.json"), "[]");
    mkdirSync(join(tmp, "network"), { recursive: true });
    writeFileSync(join(tmp, "network", "contracts.json"), "[]");
    writeFileSync(join(tmp, "network", "entries.jsonl"), "");
    mkdirSync(join(tmp, "events"), { recursive: true });
    writeFileSync(join(tmp, "events", "user.jsonl"), "");
  });
  afterEach(() => rmSync(tmp, { recursive: true, force: true }));

  it("accepts a minimal pack", async () => {
    const result = await validateRecordingPack(tmp);
    expect(result.ok).toBe(true);
  });

  it("fails when frame file missing", async () => {
    writeFileSync(
      join(tmp, "manifest.json"),
      JSON.stringify({
        pageId: "marketing.coupon.composePool.list",
        url: "http://localhost/",
        viewport: { width: 1, height: 1 },
        userAgent: "x",
        recordedAt: "2026-09-04T00:00:00.000Z",
        scenario: "load",
        frames: [
          {
            id: "x",
            ts: 0,
            path: "frames/missing.png",
            label: "x",
            networkRefs: [],
          },
        ],
        clips: [],
        redaction: [],
      }),
    );
    const result = await validateRecordingPack(tmp);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter @sokai/recording-pack test`

- [ ] **Step 3: Implement**

`normalizeUrl.ts` — `URL` API; clear hash; delete auth query keys; sort params; return `origin + pathname + search`.

`types.ts` — interfaces matching the design-spec manifest.

`validatePack.ts` — require manifest fields; `access` each frame path; require `dom/asserts.json` and `network/contracts.json` parse as JSON arrays.

Package name `@sokai/recording-pack`, same vitest setup as Task 2.

- [ ] **Step 4: Run tests — expect PASS**

Run: `pnpm --filter @sokai/recording-pack test`

- [ ] **Step 5: Commit**

```bash
git add packages/recording-pack
git commit -m "feat(recording-pack): add URL normalize and pack validator"
```

---

### Task 4: Hand-authored `sample-v1` fixture + schema

**Files:**
- Create: `fixtures/compose-pool/sample-v1/manifest.json`
- Create: `fixtures/compose-pool/sample-v1/dom/asserts.json`
- Create: `fixtures/compose-pool/sample-v1/dom/timeline.jsonl`
- Create: `fixtures/compose-pool/sample-v1/network/contracts.json`
- Create: `fixtures/compose-pool/sample-v1/network/entries.jsonl`
- Create: `fixtures/compose-pool/sample-v1/events/user.jsonl`
- Create: `fixtures/compose-pool/sample-v1/page.schema.json`
- Create: `fixtures/compose-pool/sample-v1/frames/001-idle.png`
- Create: `fixtures/compose-pool/sample-v1/NOTES.md`
- Create: `packages/page-schema/tests/sampleFixtureSchema.test.ts`
- Create: `packages/recording-pack/tests/samplePack.test.ts`

**Interfaces:**
- Consumes: `validateRecordingPack`, `validatePageSchema`
- Produces: pack + schema both validators accept; network entry shaped like `queryCombinatePoolPage` (`code`, `result.resultList`, `result.totalCount`)

- [ ] **Step 1: Write failing smoke tests**

`packages/recording-pack/tests/samplePack.test.ts` — `validateRecordingPack` on `join(repoRoot, "fixtures/compose-pool/sample-v1")` (resolve via `fileURLToPath` + walk up to sokai root).

`packages/page-schema/tests/sampleFixtureSchema.test.ts` — read `page.schema.json` and `validatePageSchema`.

- [ ] **Step 2: Run — expect FAIL (missing fixture)**

- [ ] **Step 3: Author fixture**

`network/entries.jsonl` (one line):

```json
{"id":"n1","ts":10,"method":"POST","url":"https://example.invalid/api/combinatePool/page","status":200,"requestBody":{"pageNo":1,"pageSize":20},"responseBody":{"code":0,"result":{"resultList":[{"combinateMsPoolId":"P1","blacklistOrgUrl":"https://example.invalid/bl.xlsx","strategyList":[{"strategyId":"S1","strategyName":"策略A","couponScopeStr":"全部","createPin":"tester"}]}],"totalCount":1}}}
```

`network/contracts.json`:

```json
[
  {
    "id": "poolList",
    "method": "POST",
    "urlPattern": "**/combinatePool/page**",
    "status": 200,
    "requestKeys": ["pageNo", "pageSize"],
    "responseKeys": ["code", "result.resultList", "result.totalCount"]
  }
]
```

`dom/asserts.json`:

```json
[
  { "frameId": "001", "role": "heading", "name": "合成池管理" },
  { "frameId": "001", "text": "品池 ID" },
  { "frameId": "001", "text": "策略 ID" },
  { "frameId": "001", "text": "更新" }
]
```

`manifest.json` — frame `001` → `frames/001-idle.png`, `networkRefs: ["n1"]`, `pageId` per Global Constraints.

Create PNG:

```bash
node -e "const fs=require('fs');fs.mkdirSync('fixtures/compose-pool/sample-v1/frames',{recursive:true});fs.writeFileSync('fixtures/compose-pool/sample-v1/frames/001-idle.png',Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64'))"
```

`page.schema.json` — same shape as Task 2 `minimalValid`.

`events/user.jsonl`: `{"ts":0,"type":"load"}`

`NOTES.md`: hand fixture for offline player/backtest; replace with extension export later.

- [ ] **Step 4: Run smoke tests — PASS**

- [ ] **Step 5: Commit**

```bash
git add fixtures/compose-pool/sample-v1 packages/page-schema/tests packages/recording-pack/tests
git commit -m "test: add compose-pool sample-v1 recording fixture and schema"
```

---

### Task 5: Schema player — mock + list-page render

**Files:**
- Create: `apps/schema-player/package.json`
- Create: `apps/schema-player/vite.config.ts`
- Create: `apps/schema-player/index.html`
- Create: `apps/schema-player/src/main.ts`
- Create: `apps/schema-player/src/App.vue`
- Create: `apps/schema-player/src/loadFixture.ts`
- Create: `apps/schema-player/src/mockNetwork.ts`
- Create: `apps/schema-player/src/render/ListPageView.vue`
- Create: `apps/schema-player/src/env.d.ts`
- Create: `apps/schema-player/tests/mockNetwork.test.ts`

**Interfaces:**
- Consumes: `validatePageSchema`, fixture entries + schema
- Produces:
  - `installMockNetwork(entries: NetworkEntry[]): () => void` — patches `fetch` + `XMLHttpRequest`; unmatched → throw `Error("UNMOCKED_REQUEST ...")`; append `{method,url,status}` to `globalThis.__SCHEMA_PLAYER_REQUEST_LOG__`
  - Dev server `http://127.0.0.1:5179/?fixture=compose-pool/sample-v1`
  - Vite middleware `/fixtures/*` → repo `fixtures/`

- [ ] **Step 1: Write failing mock test**

```ts
import { describe, expect, it, afterEach } from "vitest";
import { installMockNetwork } from "../src/mockNetwork";

describe("installMockNetwork", () => {
  let restore: (() => void) | undefined;
  afterEach(() => restore?.());

  it("returns recorded JSON for matching POST", async () => {
    restore = installMockNetwork([
      {
        id: "n1",
        ts: 0,
        method: "POST",
        url: "https://example.invalid/api/combinatePool/page",
        status: 200,
        requestBody: {},
        responseBody: { code: 0 },
      },
    ]);
    const res = await fetch("https://example.invalid/api/combinatePool/page", {
      method: "POST",
      body: "{}",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ code: 0 });
  });

  it("throws on unmatched request", async () => {
    restore = installMockNetwork([]);
    await expect(fetch("https://example.invalid/nope")).rejects.toThrow(
      /UNMOCKED_REQUEST/,
    );
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement mock + Vue app**

`package.json` name `schema-player`. Dependencies: `vue`, `vite`, `@vitejs/plugin-vue`, `@jd/jdesign-vue@2.1.0-djwebui.31`, `@jd/jdesign-vue-pro@2.1.0`, workspace `@sokai/page-schema`, `@sokai/recording-pack`. If private registry fails, copy `apps/yy-modules/.npmrc` to repo root.

`ListPageView.vue`:

1. Validate schema; surface errors
2. Install mock from fixture entries
3. Render header / search / table / pagination / dialog stub
4. Expand `strategyList` into rows (same idea as `useComposePoolListPage`)
5. Root `data-testid="schema-player-root"`

Vite middleware serves `/fixtures/...` from `../../fixtures` with path containment check. Port `5179`, `strictPort: true`.

- [ ] **Step 4: Unit tests PASS; manual smoke**

Run: `pnpm --filter schema-player test`  
Run: `pnpm dev:schema-player` → `http://127.0.0.1:5179/?fixture=compose-pool/sample-v1`  
Expected: title 合成池管理; table shows P1 / S1

- [ ] **Step 5: Commit**

```bash
git add apps/schema-player
git commit -m "feat(schema-player): render list-page schema with network mock"
```

---

### Task 6: Backtest CLI — schema validation + API + DOM gates

**Files:**
- Create: `tools/page-backtest/package.json`
- Create: `tools/page-backtest/src/cli.ts`
- Create: `tools/page-backtest/src/runBacktest.ts`
- Create: `tools/page-backtest/src/gates/apiContract.ts`
- Create: `tools/page-backtest/src/gates/domAssert.ts`
- Create: `tools/page-backtest/src/report.ts`
- Create: `tools/page-backtest/tests/apiContract.test.ts`
- Create: `tools/page-backtest/tests/domAssert.test.ts`

**Interfaces:**
- Consumes: fixture dir; schema-player on `:5179`; `__SCHEMA_PLAYER_REQUEST_LOG__`
- Produces:
  - `pnpm backtest --fixture fixtures/compose-pool/sample-v1`
  - `runBacktest({ fixtureDir, baseUrl }): Promise<BacktestReport>`
  - `BacktestReport`: `{ ok: boolean; frames: FrameResult[]; errors: string[] }`
  - Exit `1` if `!ok`

- [ ] **Step 1: Failing unit tests for gates**

`apiContract.test.ts`: fail on observed request with no matching contract; fail when `responseKeys` dot-paths missing.

`domAssert.test.ts`: `evaluateDomAsserts(asserts, haystackTexts: string[]): string[]` returns error strings for missing texts (unit-level); Playwright uses role/text in Step 3.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement CLI**

1. Parse `--fixture`
2. `validateRecordingPack` + `validatePageSchema` — abort on failure
3. Spawn schema-player vite on `127.0.0.1:5179`; wait until HTTP 200
4. Playwright: goto `?fixture=...`
5. Read request log via `page.evaluate(() => globalThis.__SCHEMA_PLAYER_REQUEST_LOG__)`
6. Per frame: DOM asserts (`getByRole` / `getByText`); API gate vs `contracts.json`
7. Write `tools/page-backtest/artifacts/<sessionId>/backtest-report.json`
8. Kill vite; exit code from `ok`

Root script: `"backtest": "pnpm --filter page-backtest start --"`

- [ ] **Step 4: Run API+DOM backtest on sample-v1 — PASS**

Run: `pnpm backtest --fixture fixtures/compose-pool/sample-v1`  
Expected: exit 0 (screenshot gate not yet wired — omit or mark `skipped` in report)

- [ ] **Step 5: Commit**

```bash
git add tools/page-backtest apps/schema-player package.json
git commit -m "feat(page-backtest): enforce API contract and DOM assert gates"
```

---

### Task 7: Backtest — screenshot gate

**Files:**
- Create: `tools/page-backtest/src/gates/screenshotDiff.ts`
- Create: `tools/page-backtest/tests/screenshotDiff.test.ts`
- Modify: `tools/page-backtest/src/runBacktest.ts`
- Modify: `fixtures/compose-pool/sample-v1/frames/001-idle.png` (refresh baseline)
- Modify: `fixtures/compose-pool/sample-v1/NOTES.md`

**Interfaces:**
- Consumes: baseline PNG, actual PNG, optional `mask: {x,y,width,height}[]`
- Produces: `diffScreenshots(...): { ok: boolean; diffPixels: number; ratio: number; diffPng?: Buffer }` with `threshold: 0.1`, `maxDiffRatio: 0.02`

- [ ] **Step 1: Failing test**

Identical 10×10 PNGs → `ok: true`. Heavily mutated copy → `ok: false` with `diffPng`.

- [ ] **Step 2: Implement with `pngjs` + `pixelmatch`**

Paint mask rects black on both images before compare.

- [ ] **Step 3: Wire into runBacktest**

Screenshot `[data-testid=schema-player-root]`; compare to frame path; on failure write `artifacts/<id>/diff.png` and `actual.png`.

- [ ] **Step 4: Refresh sample baseline**

Run backtest once, copy artifact actual PNG over `001-idle.png`, re-run until exit 0. Note capture source in `NOTES.md`.

- [ ] **Step 5: Commit**

```bash
git add tools/page-backtest fixtures/compose-pool/sample-v1
git commit -m "feat(page-backtest): add screenshot diff hard gate"
```

---

### Task 8: Chrome MV3 recorder extension

**Files:**
- Create: `tools/page-recorder-ext/manifest.json`
- Create: `tools/page-recorder-ext/package.json`
- Create: `tools/page-recorder-ext/src/background.ts`
- Create: `tools/page-recorder-ext/src/content/inject.ts`
- Create: `tools/page-recorder-ext/src/content/networkHook.ts`
- Create: `tools/page-recorder-ext/src/content/domSummary.ts`
- Create: `tools/page-recorder-ext/src/popup/popup.html`
- Create: `tools/page-recorder-ext/src/popup/popup.ts`
- Create: `tools/page-recorder-ext/src/redact.ts`
- Create: `tools/page-recorder-ext/src/exportZip.ts`
- Create: `tools/page-recorder-ext/README.md`
- Create: `tools/page-recorder-ext/tests/redact.test.ts`

**Interfaces:**
- Consumes: redaction + URL normalize (bundle `@sokai/recording-pack` or vendor `normalizeUrl`)
- Produces: downloaded zip matching Task 3 layout **without** `page.schema.json`
- Popup: Start / Mark keyframe / Stop+Export
- Redact keys: `token`, `ticket`, `sso`, `cookie`, `authorization` (case-insensitive)

- [ ] **Step 1: Redaction unit test**

```ts
import { describe, expect, it } from "vitest";
import { redactDeep } from "../src/redact.js";

it("redacts token fields", () => {
  expect(redactDeep({ token: "abc", nested: { ticket: "t" } })).toEqual({
    token: "[REDACTED]",
    nested: { ticket: "[REDACTED]" },
  });
});
```

- [ ] **Step 2: Implement extension**

MV3 `manifest.json` with `storage`, `activeTab`, `scripting`, `downloads`; host permissions `http://localhost/*`, `http://127.0.0.1/*`, `https://*/*` (narrow later).

Content script at `document_start`: hook fetch/XHR; log clicks/inputs; on `MARK_FRAME` send DOM summary; background `captureVisibleTab` for PNG.

Export via `fflate` zip + `chrome.downloads.download`.

Optional 3s MediaRecorder clip — skip if blocked; document as optional. **Never call LLM.**

- [ ] **Step 3: Manual verify**

Load unpacked dist → record any localhost page → unzip → `validateRecordingPack` → `{ ok: true }`

- [ ] **Step 4: Commit**

```bash
git add tools/page-recorder-ext
git commit -m "feat(page-recorder-ext): MV3 recorder exporting recording packs"
```

---

### Task 9: Local Agent skill for schema generation

**Files:**
- Create: `.claude/skills/page-schema-from-recording/SKILL.md`
- Create: `.claude/skills/page-schema-from-recording/examples/compose-pool-notes.md`

**Interfaces:**
- Consumes: recording pack path + `packages/page-schema/SPEC.md`
- Produces: instructions to write `page.schema.json` + optional `NOTES.md` into the session folder

- [ ] **Step 1: Write SKILL.md**

Steps must include: read pack artifacts; read composePool source under yy-modules; read SPEC.md; emit whitelist-only schema; validate with `@sokai/page-schema`; tell user to run backtest. Do not modify extension or marketing business source unless user asks.

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/page-schema-from-recording
git commit -m "docs(skill): add page-schema-from-recording agent workflow"
```

---

### Task 10: Operator docs + final E2E check

**Files:**
- Create: `docs/page-record-loop.md`
- Modify: `README.md` (link to the doc)
- Modify: root `package.json` if scripts missing

**Interfaces:**
- Produces: operator checklist extension → Agent skill → player → backtest

- [ ] **Step 1: Write `docs/page-record-loop.md`**

```bash
# 1. Load extension from tools/page-recorder-ext/dist
# 2. Record composePool → unzip into fixtures/compose-pool/<sessionId>
# 3. In Cursor: skill page-schema-from-recording on that folder
# 4. pnpm dev:schema-player   # optional
# 5. pnpm backtest --fixture fixtures/compose-pool/<sessionId>
```

- [ ] **Step 2: Full verification**

Run: `pnpm test && pnpm backtest --fixture fixtures/compose-pool/sample-v1`  
Expected: tests pass; backtest exit 0

- [ ] **Step 3: Commit**

```bash
git add docs/page-record-loop.md README.md package.json
git commit -m "docs: add page record/schema/backtest operator loop"
```

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Extension record-only, no LLM | Task 8 |
| Agent generates schema from pack + code + spec | Task 9 |
| Recording pack layout | Tasks 3–4, 8 |
| Page schema list-page whitelist | Task 2 |
| Schema player + Jd + mock | Task 5 |
| Three hard gates | Tasks 6–7 |
| clips review-only | Tasks 7–8 |
| sample pilot composePool | Task 4 |
| Fail closed validation / unmocked requests | Tasks 2–3, 5–6 |
| `page.schema.json` inside session | Tasks 4, 9 |
| Operator loop | Task 10 |

Screenshot thresholds, player port, and schema path are locked in Global Constraints (no TBD).

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-04-page-record-schema-backtest.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  

**2. Inline Execution** — execute in this session with executing-plans and checkpoints  

Which approach?
