# Business json-render migrate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@sokai/vue-renderer` (tsdown + `file:`), an IDE migrate skill, migrate the compose-pool list page to spec+handlers, and backtest against the business app URL (no `@sokai/runtime` on this path).

**Architecture:** A new Vue json-render package exposes catalog, registries, `defineHandlers`, and `data-sokai-*` hooks. IDE Agent (skill-guided) rewrites the pilot list page; Playwright backtest gains an external-URL driver so CLI can replay SessionBundle actions against marketing. Legacy schema+runtime backtest remains available when `--schema` is passed without `--target-url`.

**Tech Stack:** Node.js `24.20.0`, pnpm `11.23.0`, TypeScript `5.x`, Vitest `3.x`, Playwright `1.62.1`, Vue `3.5.x`, Zod `4.x`, `@json-render/core` / `@json-render/vue` `0.20.0`, **tsdown** `0.23.0` (already in root `devDependencies`).

**Spec:** `docs/superpowers/specs/2026-09-05-business-json-render-migrate-design.md`

## Global Constraints

- Product packages live under `packages/`. Pilot migration **explicitly may modify** `apps/yy-modules/apps/marketing/src/views/coupon/composePool/list/` (and marketing `package.json` for `file:` only). Do not broaden edits across yy-modules.
- This path does **not** depend on or extend `@sokai/runtime`. Do not add new runtime features for migrate/backtest-url.
- No rrweb. Recording stays Playwright/CDP → SessionBundle (existing `@sokai/record`).
- No CLI auto-rewrite of business source (`sokai migrate` is out of scope).
- Dialog stays Vue this round; only the list shell becomes Spec + handlers.
- No pixel similarity gate.
- Node floor: `24.20.0`; packageManager: `pnpm@11.23.0`.
- Tests: Vitest via `pnpm --filter <name> test` (no sandbox — full network/local per AGENTS.md).
- Commit messages: `[sokai] …` or `[@sokai/<pkg>] …`.

---

## File structure (locked)

| Path | Responsibility |
|------|----------------|
| `packages/vue-renderer/package.json` | Package meta, `exports` → `dist`, peers, `tsdown` build |
| `packages/vue-renderer/tsdown.config.ts` | ESM + dts build config |
| `packages/vue-renderer/tsconfig.json` | Package TS config |
| `packages/vue-renderer/vitest.config.ts` | Vitest + happy-dom |
| `packages/vue-renderer/src/attrs.ts` | `data-sokai-action` / `data-sokai-region` helpers + pilot id constants |
| `packages/vue-renderer/src/handlers.ts` | `defineHandlers` |
| `packages/vue-renderer/src/catalog.ts` | `defineCatalog` for pilot components |
| `packages/vue-renderer/src/registry-dom.ts` | HTML registry for unit tests (no jdesign) |
| `packages/vue-renderer/src/registry-jdesign.ts` | JdDesign / JdPro registry (peer imports) |
| `packages/vue-renderer/src/index.ts` | Public exports |
| `packages/vue-renderer/tests/*.test.ts` | Handlers, attrs, catalog render hooks |
| `packages/backtest/src/external-url-driver.ts` | Playwright driver that opens `targetUrl` |
| `packages/backtest/src/types.ts` | Extend driver options |
| `packages/backtest/src/run.ts` | Accept `targetUrl`; schema optional in that mode |
| `packages/backtest/src/index.ts` | Re-exports |
| `packages/backtest/tests/external-url-driver.test.ts` | Fake/static HTML fixture replay |
| `packages/cli/src/main.ts` | `backtest --target-url` |
| `packages/cli/tests/cli-backtest-target-url.test.ts` | CLI wiring with fake driver |
| `.agents/skills/sokai-migrate-page/SKILL.md` | IDE Agent migrate checklist |
| `apps/yy-modules/apps/marketing/package.json` | `file:../../../../packages/vue-renderer` |
| `apps/yy-modules/apps/marketing/.../composePool/list/page.spec.json` | UI Spec |
| `apps/yy-modules/apps/marketing/.../composePool/list/handlers.ts` | Handler registry |
| `apps/yy-modules/apps/marketing/.../composePool/list/index.vue` | Thin shell |

---

### Task 1: `@sokai/vue-renderer` scaffold — attrs, handlers, tsdown

**Files:**
- Create: `packages/vue-renderer/package.json`
- Create: `packages/vue-renderer/tsconfig.json`
- Create: `packages/vue-renderer/tsdown.config.ts`
- Create: `packages/vue-renderer/vitest.config.ts`
- Create: `packages/vue-renderer/src/attrs.ts`
- Create: `packages/vue-renderer/src/handlers.ts`
- Create: `packages/vue-renderer/src/index.ts`
- Create: `packages/vue-renderer/tests/handlers.test.ts`
- Create: `packages/vue-renderer/tests/attrs.test.ts`

**Interfaces:**
- Consumes: none from other new tasks
- Produces:
  - `SOKAI_ACTION_ATTR = "data-sokai-action"`
  - `SOKAI_REGION_ATTR = "data-sokai-region"`
  - `PILOT_ACTION_IDS`: `{ search: "action-search"; reset: "action-reset"; export: "action-export"; openBlacklistDialog: "action-open-blacklist-dialog"; pageNext: "action-page-next" }`
  - `PILOT_REGION_IDS`: `{ search: "region-search"; table: "region-table"; pagination: "region-pagination" }`
  - `sokaiActionAttrs(actionId: string): Record<string, string>`
  - `sokaiRegionAttrs(regionId: string): Record<string, string>`
  - `defineHandlers<T extends Record<string, (...args: never[]) => unknown>>(handlers: T): T`

- [ ] **Step 1: Write failing tests**

`packages/vue-renderer/tests/handlers.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { defineHandlers } from "../src/handlers.js";

describe("defineHandlers", () => {
  it("returns the same map and preserves call behavior", async () => {
    const search = vi.fn();
    const handlers = defineHandlers({
      "action-search": search,
    });
    await handlers["action-search"]();
    expect(search).toHaveBeenCalledOnce();
    expect(Object.keys(handlers)).toEqual(["action-search"]);
  });
});
```

`packages/vue-renderer/tests/attrs.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  PILOT_ACTION_IDS,
  PILOT_REGION_IDS,
  SOKAI_ACTION_ATTR,
  SOKAI_REGION_ATTR,
  sokaiActionAttrs,
  sokaiRegionAttrs,
} from "../src/attrs.js";

describe("sokai attrs", () => {
  it("builds action and region data attributes", () => {
    expect(sokaiActionAttrs(PILOT_ACTION_IDS.search)).toEqual({
      [SOKAI_ACTION_ATTR]: "action-search",
    });
    expect(sokaiRegionAttrs(PILOT_REGION_IDS.table)).toEqual({
      [SOKAI_REGION_ATTR]: "region-table",
    });
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `pnpm --filter @sokai/vue-renderer test`  
Expected: FAIL (package missing / cannot resolve modules)

- [ ] **Step 3: Scaffold package + minimal implementation**

`packages/vue-renderer/package.json`:

```json
{
  "name": "@sokai/vue-renderer",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsdown",
    "test": "vitest run",
    "prepublishOnly": "pnpm run build"
  },
  "peerDependencies": {
    "@jd/jdesign-vue": "*",
    "@jd/jdesign-vue-pro": "*",
    "@json-render/core": "^0.20.0",
    "@json-render/vue": "^0.20.0",
    "vue": "^3.5.0",
    "zod": "^4.0.0"
  },
  "peerDependenciesMeta": {
    "@jd/jdesign-vue": { "optional": true },
    "@jd/jdesign-vue-pro": { "optional": true }
  },
  "devDependencies": {
    "@json-render/core": "0.20.0",
    "@json-render/vue": "0.20.0",
    "@types/node": "^24.0.0",
    "@vitejs/plugin-vue": "^5.2.0",
    "happy-dom": "^17.0.0",
    "typescript": "^5.8.0",
    "vite": "^6.0.0",
    "vitest": "^3.0.0",
    "vue": "3.5.42",
    "zod": "4.5.4",
    "tsdown": "0.23.0"
  }
}
```

`packages/vue-renderer/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "preserve",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src"]
}
```

`packages/vue-renderer/tsdown.config.ts`:

```ts
import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  dts: true,
  clean: true,
  external: [
    "vue",
    "zod",
    "@json-render/core",
    "@json-render/vue",
    "@jd/jdesign-vue",
    "@jd/jdesign-vue-pro",
  ],
});
```

`packages/vue-renderer/vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  test: {
    environment: "happy-dom",
    include: ["tests/**/*.test.ts"],
  },
});
```

`packages/vue-renderer/src/attrs.ts`:

```ts
export const SOKAI_ACTION_ATTR = "data-sokai-action";
export const SOKAI_REGION_ATTR = "data-sokai-region";

export const PILOT_ACTION_IDS = {
  search: "action-search",
  reset: "action-reset",
  export: "action-export",
  openBlacklistDialog: "action-open-blacklist-dialog",
  pageNext: "action-page-next",
} as const;

export const PILOT_REGION_IDS = {
  search: "region-search",
  table: "region-table",
  pagination: "region-pagination",
} as const;

export function sokaiActionAttrs(actionId: string): Record<string, string> {
  return { [SOKAI_ACTION_ATTR]: actionId };
}

export function sokaiRegionAttrs(regionId: string): Record<string, string> {
  return { [SOKAI_REGION_ATTR]: regionId };
}
```

`packages/vue-renderer/src/handlers.ts`:

```ts
export type HandlerFn = (...args: never[]) => unknown;

export function defineHandlers<T extends Record<string, HandlerFn>>(handlers: T): T {
  return handlers;
}
```

`packages/vue-renderer/src/index.ts`:

```ts
export {
  PILOT_ACTION_IDS,
  PILOT_REGION_IDS,
  SOKAI_ACTION_ATTR,
  SOKAI_REGION_ATTR,
  sokaiActionAttrs,
  sokaiRegionAttrs,
} from "./attrs.js";
export { defineHandlers, type HandlerFn } from "./handlers.js";
```

- [ ] **Step 4: Install + run tests — expect PASS**

Run:

```bash
pnpm install
pnpm --filter @sokai/vue-renderer test
```

Expected: PASS

- [ ] **Step 5: Build with tsdown — expect dist output**

Run: `pnpm --filter @sokai/vue-renderer build`  
Expected: `dist/index.js` and `dist/index.d.ts` exist

- [ ] **Step 6: Commit**

```bash
git add packages/vue-renderer
git commit -m "$(cat <<'EOF'
[@sokai/vue-renderer] scaffold package with attrs, handlers, tsdown

EOF
)"
```

---

### Task 2: Catalog + DOM registry + mount smoke tests

**Files:**
- Create: `packages/vue-renderer/src/catalog.ts`
- Create: `packages/vue-renderer/src/registry-dom.ts`
- Create: `packages/vue-renderer/src/unknown.ts`
- Modify: `packages/vue-renderer/src/index.ts`
- Create: `packages/vue-renderer/tests/registry-dom.test.ts`
- Create: `packages/vue-renderer/tests/fixtures/compose-pool-mini.spec.json`

**Interfaces:**
- Consumes: `sokaiActionAttrs`, `sokaiRegionAttrs`, `PILOT_*` from Task 1
- Produces:
  - `sokaiPilotCatalog` — `defineCatalog` result
  - `createDomRegistry()` — `{ registry }` via `defineRegistry` using plain HTML (for tests)
  - Spec element types: `Page`, `Heading`, `SearchForm`, `Table`, `Pagination`, `Button`, `Link`, `Unknown`
  - Unknown type renders a visible placeholder with `data-sokai-unknown="1"` and does not throw

- [ ] **Step 1: Write failing test + fixture**

`packages/vue-renderer/tests/fixtures/compose-pool-mini.spec.json`:

```json
{
  "root": "page",
  "elements": {
    "page": {
      "type": "Page",
      "props": {},
      "children": ["title", "search", "table", "pager"]
    },
    "title": {
      "type": "Heading",
      "props": { "text": "合成池管理" }
    },
    "search": {
      "type": "SearchForm",
      "props": {
        "regionId": "region-search",
        "searchActionId": "action-search",
        "resetActionId": "action-reset"
      }
    },
    "table": {
      "type": "Table",
      "props": {
        "regionId": "region-table",
        "exportActionId": "action-export",
        "updateActionId": "action-open-blacklist-dialog"
      }
    },
    "pager": {
      "type": "Pagination",
      "props": {
        "regionId": "region-pagination",
        "nextActionId": "action-page-next"
      }
    }
  }
}
```

`packages/vue-renderer/tests/registry-dom.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { mount } from "@vue/test-utils";
import { defineComponent, h } from "vue";
import { ActionProvider, Renderer, StateProvider } from "@json-render/vue";
import { createDomRegistry } from "../src/registry-dom.js";
import { SOKAI_ACTION_ATTR, SOKAI_REGION_ATTR } from "../src/attrs.js";
import mini from "./fixtures/compose-pool-mini.spec.json";

describe("createDomRegistry", () => {
  it("renders regions and action hooks from mini spec", async () => {
    const { registry } = createDomRegistry();
    const search = vi.fn();
    const Host = defineComponent({
      setup() {
        return () =>
          h(StateProvider, { initialState: {} }, () =>
            h(
              ActionProvider,
              {
                handlers: {
                  "action-search": search,
                },
              },
              () => h(Renderer, { spec: mini, registry }),
            ),
          );
      },
    });
    const wrapper = mount(Host);
    expect(wrapper.find(`[${SOKAI_REGION_ATTR}="region-search"]`).exists()).toBe(true);
    expect(wrapper.find(`[${SOKAI_REGION_ATTR}="region-table"]`).exists()).toBe(true);
    const btn = wrapper.find(`[${SOKAI_ACTION_ATTR}="action-search"]`);
    expect(btn.exists()).toBe(true);
    await btn.trigger("click");
    expect(search).toHaveBeenCalled();
  });

  it("unknown type shows placeholder instead of throwing", () => {
    const { registry } = createDomRegistry();
    const bad = {
      root: "x",
      elements: { x: { type: "NotARealType", props: {} } },
    };
    const Host = defineComponent({
      setup() {
        return () =>
          h(StateProvider, { initialState: {} }, () =>
            h(ActionProvider, { handlers: {} }, () =>
              h(Renderer, { spec: bad, registry }),
            ),
          );
      },
    });
    const wrapper = mount(Host);
    expect(wrapper.find("[data-sokai-unknown='1']").exists()).toBe(true);
  });
});
```

Note: If `@vue/test-utils` is missing, add it to `packages/vue-renderer` `devDependencies` (`@vue/test-utils` `^2.4.0`). If `@json-render/vue` `Renderer` API differs slightly (slot children vs default), adjust the host to match the installed `0.20.0` types — prefer reading `node_modules/@json-render/vue` typings once, then lock the mount pattern in this test.

- [ ] **Step 2: Run test — expect FAIL**

Run: `pnpm --filter @sokai/vue-renderer test`  
Expected: FAIL on missing `createDomRegistry` / catalog

- [ ] **Step 3: Implement catalog + DOM registry**

`packages/vue-renderer/src/catalog.ts` — use `defineCatalog` from `@json-render/core` and `schema` from `@json-render/vue/schema` (same pattern as `.agents/skills/vue/SKILL.md`). Define components:

| type | key props |
|------|-----------|
| `Page` | none; slots/children default |
| `Heading` | `text: string` |
| `SearchForm` | `regionId`, `searchActionId`, `resetActionId` |
| `Table` | `regionId`, `exportActionId`, `updateActionId` |
| `Pagination` | `regionId`, `nextActionId` |
| `Button` | `label`, `actionId` |
| `Link` | `label`, `actionId` |
| `Unknown` | `typeName: string` (optional) |

`packages/vue-renderer/src/registry-dom.ts` — `defineRegistry(sokaiPilotCatalog, { components: { ... } })` where each component uses `h("div"|"button"|...)` and spreads `sokaiRegionAttrs` / `sokaiActionAttrs`. For `SearchForm` / `Table` / `Pagination`, render child buttons with the configured action ids. Wire `emit` / `useAction` per json-render Vue event conventions so `ActionProvider` handlers fire on click.

For types not in the registry map: json-render may already fall through — if not, register a catch-all by wrapping `Renderer` usage later. Minimum bar for this task: explicit `Unknown` element type works; for completely missing types, document that catalog must list them. Prefer also setting `registry` fallback if `@json-render/vue` supports `fallback` / `unknownComponent` — if the library has no hook, skip and keep the second test using `type: "Unknown"`.

If the library has no unknown hook, change the second test to use `type: "Unknown"` with `props: { typeName: "NotARealType" }` and assert placeholder — still satisfies “unknown → placeholder”.

- [ ] **Step 4: Export from index + run tests PASS**

Update `src/index.ts` to export `sokaiPilotCatalog`, `createDomRegistry`.

Run: `pnpm --filter @sokai/vue-renderer test`  
Expected: PASS

- [ ] **Step 5: Rebuild**

Run: `pnpm --filter @sokai/vue-renderer build`  
Expected: success

- [ ] **Step 6: Commit**

```bash
git add packages/vue-renderer
git commit -m "$(cat <<'EOF'
[@sokai/vue-renderer] add pilot catalog and DOM registry

EOF
)"
```

---

### Task 3: JdDesign registry (production)

**Files:**
- Create: `packages/vue-renderer/src/registry-jdesign.ts`
- Modify: `packages/vue-renderer/src/index.ts`
- Modify: `packages/vue-renderer/tsdown.config.ts` (ensure jdesign stays external)
- Create: `packages/vue-renderer/tests/registry-jdesign-export.test.ts`

**Interfaces:**
- Consumes: `sokaiPilotCatalog`, attrs helpers
- Produces: `createJdesignRegistry(): { registry }` importing `@jd/jdesign-vue` and `@jd/jdesign-vue-pro`

- [ ] **Step 1: Write export-shape test (no jdesign install required in sokai)**

`packages/vue-renderer/tests/registry-jdesign-export.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("registry-jdesign module", () => {
  it("exports createJdesignRegistry and keeps peer imports", () => {
    const src = readFileSync(join(here, "../src/registry-jdesign.ts"), "utf8");
    expect(src).toContain("export function createJdesignRegistry");
    expect(src).toContain("@jd/jdesign-vue");
    expect(src).toContain("@jd/jdesign-vue-pro");
  });
});
```

(This avoids requiring private JD packages inside the sokai workspace install.)

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @sokai/vue-renderer test`  
Expected: FAIL missing file

- [ ] **Step 3: Implement `createJdesignRegistry`**

Map:

| Catalog type | Implementation sketch |
|--------------|----------------------|
| `Page` | `h("div", { class: "sokai-page" }, children)` |
| `Heading` | `h("h2", …, props.text)` |
| `SearchForm` | Wrapper with `sokaiRegionAttrs`; include search/reset controls that call actions (may use `JdProSearchForm` if props can be bound from state; if binding is too heavy for v1, render JdButton search/reset with action attrs and leave full Pro form wiring to the business `handlers` + state bridge in Task 7) |
| `Table` | Region wrapper + export/update action controls with attrs (table body can be a slot or state-driven rows via `$state` — pilot must show region + action hooks) |
| `Pagination` | Region + next control with `action-page-next` |
| `Button` / `Link` | `JdButton` / `JdLink` with action attrs |
| `Unknown` | Placeholder `data-sokai-unknown="1"` |

**YAGNI for v1 catalog fidelity:** Prefer correct **hooks + regions** over pixel-perfect Pro SearchForm. Task 7 may pass extra Vue around the Renderer (dialog) and sync state via `StateProvider` / `createStateStore`.

Export `createJdesignRegistry` from `index.ts`.

- [ ] **Step 4: Tests PASS + build**

Run:

```bash
pnpm --filter @sokai/vue-renderer test
pnpm --filter @sokai/vue-renderer build
```

Expected: PASS / dist ok

- [ ] **Step 5: Commit**

```bash
git add packages/vue-renderer
git commit -m "$(cat <<'EOF'
[@sokai/vue-renderer] add JdDesign registry for business host

EOF
)"
```

---

### Task 4: Backtest external URL driver + `runBacktest({ targetUrl })`

**Files:**
- Create: `packages/backtest/src/external-url-driver.ts`
- Modify: `packages/backtest/src/types.ts`
- Modify: `packages/backtest/src/run.ts`
- Modify: `packages/backtest/src/index.ts`
- Create: `packages/backtest/tests/run-target-url.test.ts`
- Create: `packages/backtest/tests/fixtures/static-pilot.html` (or generate HTML string in test)

**Interfaces:**
- Consumes: existing `BacktestDriver`, `locateAction`, `filterActions`, `criticalRegionIds`
- Produces:
  - `createExternalUrlDriver(options: { targetUrl: string; headed?: boolean }): BacktestDriver`
  - `RunBacktestOptions` extended:
    - `schemaPath?: string`
    - `targetUrl?: string`
    - `knownActionIds?: Iterable<string>`
  - Validation: must provide `driver` **or** (`targetUrl` **xor** require `schemaPath` for default Playwright preview driver). Exact rule: if `!options.driver`, then either `targetUrl` → external driver, or `schemaPath` → existing preview driver. If both `targetUrl` and `schemaPath` without driver, prefer `targetUrl` (business path).
  - When no schema file: `schemaActionIds` = `new Set(knownActionIds ?? Object.values(defaultPilotActionIds))` where default pilot ids match `PILOT_ACTION_IDS` / existing `NAME_TO_ACTION_ID` values; `partialSchema: false` in report.

- [ ] **Step 1: Write failing unit test with fake page HTML served locally**

Use Node `http.createServer` in the test to serve HTML that contains:

```html
<button data-sokai-action="action-search">搜索</button>
<div data-sokai-region="region-search"></div>
<div data-sokai-region="region-table"></div>
```

And a tiny actions list inline by writing a temp SessionBundle directory (meta + one search click action + empty network) **or** reuse `fixtures/compose-pool/sample-v1` with a fake driver first.

Prefer two tests:

1. `runBacktest` with `targetUrl` + **injected fake driver** that records `start` was called — asserts options path does not require schemaPath.
2. `createExternalUrlDriver` integration optional / skipped if Chromium heavy — at minimum unit-test that `start` navigates: can inject by exporting pure helper `resolveBacktestTarget(options)` tested without browser.

Concrete test `packages/backtest/tests/run-target-url.test.ts`:

```ts
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { runBacktest, type BacktestDriver } from "../src/run.js";

async function writeMiniBundle(dir: string) {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, "meta.json"),
    JSON.stringify({
      schemaVersion: 1,
      url: "http://example.test/list",
      viewport: { width: 1280, height: 720 },
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      pilotTag: "compose-pool-list",
    }),
  );
  await writeFile(
    join(dir, "actions.jsonl"),
    `${JSON.stringify({
      id: "a1",
      type: "click",
      ts: 1,
      target: { strategy: "role", role: "button", name: "搜索" },
    })}\n`,
  );
  await writeFile(join(dir, "network.jsonl"), "");
  await writeFile(join(dir, "index.json"), JSON.stringify({ frames: [] }));
}

describe("runBacktest targetUrl", () => {
  it("runs without schemaPath when targetUrl + driver provided", async () => {
    const bundleDir = await mkdtemp(join(tmpdir(), "sokai-tu-"));
    await writeMiniBundle(bundleDir);
    const clickAction = vi.fn();
    const driver: BacktestDriver = {
      async start() {},
      async clickAction(id) {
        clickAction(id);
      },
      async click() {},
      async fill() {},
      async assertRegion() {},
      async close() {},
    };
    const report = await runBacktest({
      bundleDir,
      targetUrl: "http://127.0.0.1:9/",
      driver,
      knownActionIds: ["action-search", "action-reset", "action-page-next", "action-export", "action-open-blacklist-dialog"],
    });
    expect(clickAction).toHaveBeenCalledWith("action-search");
    expect(report.summary.partialSchema).toBe(false);
  });
});
```

Align `meta.json` / action shape with `@sokai/session` Zod types — if fields differ, copy a trimmed valid shape from `packages/session/tests` or `fixtures/compose-pool/sample-v1`.

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm --filter @sokai/backtest test`  
Expected: FAIL (schemaPath required / unknown option)

- [ ] **Step 3: Implement**

Update `RunBacktestOptions` and `run.ts`:

```ts
export interface RunBacktestOptions {
  bundleDir: string;
  schemaPath?: string;
  targetUrl?: string;
  knownActionIds?: Iterable<string>;
  mode?: "mock" | "live";
  failFast?: boolean;
  outPath?: string;
  driver?: BacktestDriver;
}
```

Logic:

```ts
const DEFAULT_ACTION_IDS = [
  "action-search",
  "action-reset",
  "action-export",
  "action-open-blacklist-dialog",
  "action-page-next",
];

// load schema only if schemaPath present
let schemaActionIds: Set<string>;
let partialSchema = false;
if (options.schemaPath) {
  const schema = await loadSchema(options.schemaPath);
  schemaActionIds = collectActionIds(schema.root);
  partialSchema = schema.partial === true;
} else {
  schemaActionIds = new Set(options.knownActionIds ?? DEFAULT_ACTION_IDS);
}

async function resolveDriver(...) {
  if (options.driver) return options.driver;
  if (options.targetUrl) {
    const { createExternalUrlDriver } = await import("./external-url-driver.js");
    return createExternalUrlDriver({
      targetUrl: options.targetUrl,
      mode: mode === "live" ? "live" : "live", // external URL defaults to live
    });
  }
  if (!options.schemaPath) {
    throw new Error("runBacktest requires schemaPath or targetUrl (or an injected driver)");
  }
  // existing createPlaywrightDriver path
}
```

`external-url-driver.ts`: mirror click/fill/assertRegion from `playwright-driver.ts` but `start()` launches Chromium and `page.goto(targetUrl)` — **do not** import `@sokai/runtime`. `assertRegion(regionId)` → `page.locator(`[data-sokai-region="${regionId}"]`)`. `clickAction(id)` → `page.locator(`[data-sokai-action="${id}"]`)`.

Default `mode` when `targetUrl` set: `"live"` (report field).

- [ ] **Step 4: Tests PASS**

Run: `pnpm --filter @sokai/backtest test`  
Expected: PASS (including existing tests — ensure schema-only calls still pass by keeping `schemaPath` required for old tests)

- [ ] **Step 5: Commit**

```bash
git add packages/backtest
git commit -m "$(cat <<'EOF'
[@sokai/backtest] support targetUrl external driver without runtime

EOF
)"
```

---

### Task 5: CLI `--target-url` for backtest

**Files:**
- Modify: `packages/cli/src/main.ts`
- Create: `packages/cli/tests/cli-backtest-target-url.test.ts`
- Modify: `packages/cli/tests/cli-backtest.test.ts` only if help text assertions exist

**Interfaces:**
- Consumes: `runBacktest` from Task 4
- Produces: CLI
  - `sokai backtest --bundle <dir> --target-url <url> [--fail-fast] [--out report.json]`
  - `sokai backtest --bundle <dir> --schema <file> …` (unchanged)
  - Error if neither `--target-url` nor `--schema`

- [ ] **Step 1: Write failing CLI test**

```ts
import { describe, expect, it, vi } from "vitest";
import { runCli } from "../src/main.js";

describe("cli backtest --target-url", () => {
  it("help mentions --target-url", async () => {
    const code = await runCli(["backtest", "--help"]);
    expect(code).toBe(0);
  });

  it("errors when neither schema nor target-url", async () => {
    const code = await runCli(["backtest", "--bundle", "fixtures/compose-pool/sample-v1"]);
    expect(code).toBe(1);
  });
});
```

Patch help test to assert stdout includes `--target-url` by spying `console.log` if needed.

- [ ] **Step 2: Run — expect FAIL on validation message / help**

- [ ] **Step 3: Update `cmdBacktest` + USAGE string**

```ts
"target-url": { type: "string" },
// ...
if (!values.bundle || (!values.schema && !values["target-url"])) {
  console.error("backtest requires --bundle and either --schema or --target-url");
  return 1;
}
const report = await runBacktest({
  bundleDir: await resolveCliPath(values.bundle),
  schemaPath: values.schema ? await resolveCliPath(values.schema) : undefined,
  targetUrl: values["target-url"],
  mode: values.live ? "live" : values["target-url"] ? "live" : "mock",
  failFast: values["fail-fast"] === true,
  outPath: values.out ? await resolveCliPath(values.out) : undefined,
});
```

- [ ] **Step 4: Tests PASS**

Run: `pnpm --filter @sokai/cli test`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add packages/cli
git commit -m "$(cat <<'EOF'
[@sokai/cli] add backtest --target-url for business app replay

EOF
)"
```

---

### Task 6: IDE migrate skill

**Files:**
- Create: `.agents/skills/sokai-migrate-page/SKILL.md`

**Interfaces:**
- Consumes: conventions from Tasks 1–3 (file names, action ids, `file:` path)
- Produces: Agent-readable skill — no runtime code

- [ ] **Step 1: Write the skill**

Skill frontmatter + body must include:

1. **When to use:** user provides a Vue page path after recording; wants UI config + handlers + `@sokai/vue-renderer`.
2. **Inputs:** page directory, optional SessionBundle path (对照 only).
3. **Steps:**
   - Build `@sokai/vue-renderer` (`pnpm --filter @sokai/vue-renderer build`)
   - Ensure marketing depends on `"@sokai/vue-renderer": "file:../../../../packages/vue-renderer"`
   - Read `index.vue` + hooks; list template regions vs callable logic
   - Create `page.spec.json` (json-render elements; action/region ids from `PILOT_*`)
   - Create `handlers.ts` with `defineHandlers({ "action-search": … })` wrapping existing hook fns
   - Replace `index.vue` with thin shell: `StateProvider` / `ActionProvider` / `Renderer` + `createJdesignRegistry()` + keep Dialog as Vue child
   - Do **not** rewrite `useComposePoolListPage.ts` logic body
   - Checklist before done: search/table/pagination regions present; pilot action ids present; `pnpm --filter @sokai/vue-renderer build` ok
4. **Out of scope:** CLI migrate, Dialog→spec, rrweb, runtime preview

- [ ] **Step 2: Self-check skill against spec §5.3** (manual read — no automated test)

- [ ] **Step 3: Commit**

```bash
git add .agents/skills/sokai-migrate-page
git commit -m "$(cat <<'EOF'
[sokai] add IDE skill for json-render page migration

EOF
)"
```

---

### Task 7: Migrate compose-pool list page in marketing

**Files:**
- Modify: `apps/yy-modules/apps/marketing/package.json`
- Create: `apps/yy-modules/apps/marketing/src/views/coupon/composePool/list/page.spec.json`
- Create: `apps/yy-modules/apps/marketing/src/views/coupon/composePool/list/handlers.ts`
- Modify: `apps/yy-modules/apps/marketing/src/views/coupon/composePool/list/index.vue`
- Leave unchanged: `hooks/useComposePoolListPage.ts`, `interface.ts`, Dialog component

**Interfaces:**
- Consumes: `@sokai/vue-renderer` dist via `file:`, `createJdesignRegistry`, `defineHandlers`, `PILOT_*`
- Produces: runnable list route with Spec UI + same behaviors

- [ ] **Step 1: Add dependency + install in yy-modules**

In `apps/yy-modules/apps/marketing/package.json` `dependencies`:

```json
"@sokai/vue-renderer": "file:../../../../packages/vue-renderer"
```

From `apps/yy-modules`:

```bash
pnpm --filter @sokai/vue-renderer build
pnpm install
```

(If yy-modules workspace cannot resolve file outside its root, add the dependency on `apps/yy-modules/package.json` instead and re-export — prefer marketing-first; fallback document in commit message.)

- [ ] **Step 2: Write `handlers.ts`**

```ts
import { defineHandlers, PILOT_ACTION_IDS } from "@sokai/vue-renderer";
import type { ComposePoolTableRow } from "./interface";
import { useComposePoolListPage } from "./hooks/useComposePoolListPage.js";

export function createComposePoolListHandlers(options: {
  page: ReturnType<typeof useComposePoolListPage>;
  openBlacklistUploadDialog: (row: ComposePoolTableRow) => void;
  handleExport: (row: ComposePoolTableRow) => void;
}) {
  const { page, openBlacklistUploadDialog, handleExport } = options;
  return defineHandlers({
    [PILOT_ACTION_IDS.search]: () => page.handleSearch(),
    [PILOT_ACTION_IDS.reset]: () => page.handleReset(),
    [PILOT_ACTION_IDS.pageNext]: () =>
      page.onPaginationCurrentChange(page.pageNo.value + 1),
    [PILOT_ACTION_IDS.export]: (row: ComposePoolTableRow) => handleExport(row),
    [PILOT_ACTION_IDS.openBlacklistDialog]: (row: ComposePoolTableRow) =>
      openBlacklistUploadDialog(row),
  });
}
```

Fix `HandlerFn` typing if row args need a wider signature (`...args: any[]`) — keep compile green in marketing.

- [ ] **Step 3: Write `page.spec.json`**

Mirror Task 2 mini fixture, expanded with column labels matching the current template (品池 ID, 策略 ID, …). Ensure `region-search`, `region-table`, `region-pagination` and all pilot action ids appear.

- [ ] **Step 4: Rewrite `index.vue` thin shell**

- `useComposePoolListPage()` as today  
- `createJdesignRegistry()`  
- import spec JSON  
- `createComposePoolListHandlers(...)`  
- `onMounted(() => loadRecords())`  
- Keep `ComposePoolBlacklistUploadDialog` in template  
- Bridge state: either `createStateStore` synced from refs, or pass rows/query into registry via props on a small local wrapper — **must** keep search/table/pagination usable  

If JdDesign registry v1 only exposes action hooks without full table data binding, acceptable interim: keep a **hybrid** where Renderer draws chrome/actions and a minimal table still reads `tables` from the hook **only if** Spec-only table cannot bind yet — but prefer full Spec. If blocked, stop and note in PR; do not silently leave the old full template.

- [ ] **Step 5: Manual smoke**

```bash
pnpm --filter @sokai/vue-renderer build
cd apps/yy-modules && pnpm dev:marketing
```

Open compose-pool list: load, search, paginate, open dialog.

- [ ] **Step 6: Commit**

```bash
git add apps/yy-modules/apps/marketing/package.json \
  apps/yy-modules/apps/marketing/src/views/coupon/composePool/list
git commit -m "$(cat <<'EOF'
[marketing] migrate compose-pool list to sokai vue-renderer spec

EOF
)"
```

Note: yy-modules may be a submodule — if commit must happen inside the submodule repo, commit there and update submodule pointer from sokai per that repo’s norms.

---

### Task 8: End-to-end backtest checklist (manual + light automation)

**Files:**
- Modify: `README.md` (short section on migrate path) — only if needed for discoverability; keep ≤15 lines
- Optional: `packages/cli/tests/cli-backtest-target-url.test.ts` already covers wiring

**Interfaces:**
- Consumes: Tasks 4–7
- Produces: documented command sequence

- [ ] **Step 1: Document commands in README**

```markdown
## Business migrate backtest (pilot)

pnpm --filter @sokai/vue-renderer build
# start marketing compose-pool list (logged-in profile as needed)
pnpm sokai -- backtest --bundle <SessionBundle> --target-url <marketing-list-url> --out /tmp/report.json
```

- [ ] **Step 2: Run unit suites**

```bash
pnpm --filter @sokai/vue-renderer test
pnpm --filter @sokai/backtest test
pnpm --filter @sokai/cli test
```

Expected: all PASS

- [ ] **Step 3: Manual backtest against migrated page** (when marketing + bundle available)

Expected: report `failed === 0` for minimal script (search → next page → open dialog → close), or document residual gaps without claiming success.

- [ ] **Step 4: Commit README if changed**

```bash
git add README.md
git commit -m "$(cat <<'EOF'
[sokai] document business-url backtest for migrate path

EOF
)"
```

---

## Spec coverage self-review

| Spec requirement | Task |
|------------------|------|
| `@sokai/vue-renderer` + tsdown + `file:` | 1, 3, 7 |
| peer vue/jdesign; dist not raw src | 1, 3 |
| catalog + unknown placeholder | 2, 3 |
| `data-sokai-action` / region hooks | 1, 2, 4 |
| handlers / defineHandlers / reuse hook | 1, 7 |
| IDE Agent skill, no CLI migrate | 6 |
| SessionBundle = 对照 + 剧本 only | 6, 8 |
| backtest business URL; no runtime on path | 4, 5 |
| CDP record / no rrweb | (existing; unchanged) |
| Dialog remains Vue | 7 |
| pilot = compose-pool list only | 7 |
| Vitest for renderer + backtest targetUrl + CLI | 1–5, 8 |

## Placeholder / consistency scan

- Action ids aligned with existing backtest `NAME_TO_ACTION_ID` values (`action-search`, …).
- `RunBacktestOptions.schemaPath` becomes optional only when `targetUrl` or `driver` present — old CLI tests keep passing with `schemaPath`.
- No runtime imports in `external-url-driver.ts`.
- Marketing `file:` path: `../../../../packages/vue-renderer` from `apps/yy-modules/apps/marketing`.
