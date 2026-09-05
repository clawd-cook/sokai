# Compose-pool migrate redo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encode inventory gates and D cleanliness into `sokai-migrate-page`, revert `apps/yy-modules` to `origin/master`, then collaboratively re-migrate the compose-pool list page to Spec + thin handlers/registry using only `@sokai/vue-renderer`.

**Architecture:** Parent migrate architecture is unchanged. `@sokai/vue-renderer` re-exports the json-render Vue host primitives so business pages never import `@json-render/vue` directly. The skill becomes a hard gate (inventory → per-file approval). The pilot page is redone after a clean submodule reset.

**Tech Stack:** Node.js `24.20.0`, pnpm `11.23.0`, TypeScript `5.x`, Vitest `3.x`, Vue `3.5.x`, `@json-render/vue` `0.20.0` (peer, consumed only inside `@sokai/vue-renderer`), `@sokai/vue-renderer` via `file:`.

**Spec:** `docs/superpowers/specs/2026-09-05-compose-pool-migrate-redo-design.md` (parent: `docs/superpowers/specs/2026-09-05-business-json-render-migrate-design.md`)

## Global Constraints

- Product code stays under `packages/` except the explicit pilot edits under `apps/yy-modules/apps/marketing/` listed in this plan.
- Do not rewrite `hooks/useComposePoolListPage.ts` or `interface.ts` bodies.
- Dialog stays Vue (`ComposePoolBlacklistUploadDialog`).
- Business page files must not import `@json-render/vue` — only `@sokai/vue-renderer` and `@sokai/vue-renderer/jdesign`.
- Action/region ids must come from `PILOT_ACTION_IDS` / `PILOT_REGION_IDS` — do not invent new ids in the page.
- Bound registry is allowed but must be thin and region-scoped (no second full-page template dump without inventory mapping).
- Collaborative gates: **STOP and wait for explicit user OK** at inventory and after each page artifact (spec §3).
- No sandbox for shell (AGENTS.md). Node `24.20.0`, pnpm `11.23.0`.
- Commit messages: `[sokai] …` or `[@sokai/vue-renderer] …` or `[marketing] …` inside the submodule as appropriate.
- Do not commit unless the user asked in-session; still prepare `git add`/`commit` steps so an executor can run them when approved.

---

## File structure (locked)

| Path | Responsibility |
|------|----------------|
| `packages/vue-renderer/src/vue-host.ts` | Re-export `ActionProvider`, `Renderer`, `StateProvider`, `VisibilityProvider`, `useActions` from `@json-render/vue` |
| `packages/vue-renderer/src/index.ts` | Public barrel includes vue-host exports |
| `packages/vue-renderer/tests/vue-host-exports.test.ts` | Assert host primitives are exported from package entry |
| `.agents/skills/sokai-migrate-page/SKILL.md` | Inventory hard gate, D standards, anti-patterns, fixed import paths, per-file approval |
| `docs/superpowers/specs/2026-09-05-compose-pool-migrate-redo-design.md` | Already written — commit with skill/package if user approves |
| `docs/superpowers/specs/2026-09-05-business-json-render-migrate-design.md` | §10 试点重做约定 — already written |
| `apps/yy-modules` (submodule) | Reset to `origin/master`, then re-apply marketing `file:` + Vite allow + list page artifacts |
| `…/composePool/list/page.spec.json` | Spec only (ids + heading) |
| `…/composePool/list/handlers.ts` | `defineHandlers` wrappers |
| `…/composePool/list/bound-registry.ts` | Thin region binders |
| `…/composePool/list/index.vue` | Thin shell |

---

### Task 1: Re-export json-render Vue host from `@sokai/vue-renderer`

**Files:**
- Create: `packages/vue-renderer/src/vue-host.ts`
- Modify: `packages/vue-renderer/src/index.ts`
- Create: `packages/vue-renderer/tests/vue-host-exports.test.ts`

**Interfaces:**
- Consumes: `@json-render/vue` peer (`ActionProvider`, `Renderer`, `StateProvider`, `VisibilityProvider`, `useActions`)
- Produces: same names re-exported from `@sokai/vue-renderer` main entry

- [ ] **Step 1: Write the failing test**

```typescript
// packages/vue-renderer/tests/vue-host-exports.test.ts
import { describe, expect, it } from "vitest";
import * as pkg from "../src/index.js";

describe("vue-host re-exports", () => {
  it("exposes Renderer host primitives from the package entry", () => {
    expect(typeof pkg.ActionProvider).toBe("object");
    expect(typeof pkg.Renderer).toBe("object");
    expect(typeof pkg.StateProvider).toBe("object");
    expect(typeof pkg.VisibilityProvider).toBe("object");
    expect(typeof pkg.useActions).toBe("function");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @sokai/vue-renderer test -- tests/vue-host-exports.test.ts`

Expected: FAIL (exports missing)

- [ ] **Step 3: Implement re-exports**

```typescript
// packages/vue-renderer/src/vue-host.ts
export {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
  useActions,
} from "@json-render/vue";
```

Add to `packages/vue-renderer/src/index.ts`:

```typescript
export {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
  useActions,
} from "./vue-host.js";
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @sokai/vue-renderer test`

Expected: PASS (including existing registry tests)

- [ ] **Step 5: Build dist**

Run: `pnpm --filter @sokai/vue-renderer build`

Expected: `dist/index.js` / `.d.ts` include the re-exports

- [ ] **Step 6: Commit (only if user approved commits)**

```bash
git add packages/vue-renderer/src/vue-host.ts packages/vue-renderer/src/index.ts packages/vue-renderer/tests/vue-host-exports.test.ts
git commit -m "$(cat <<'EOF'
[@sokai/vue-renderer] re-export json-render Vue host primitives

EOF
)"
```

---

### Task 2: Update `sokai-migrate-page` skill for gates + D standards

**Files:**
- Modify: `.agents/skills/sokai-migrate-page/SKILL.md` (full rewrite of steps / checklist; keep When to use / Out of scope / References)

**Interfaces:**
- Consumes: Task 1 export surface; redo spec §3–§5
- Produces: skill text that executors must follow for Tasks 4–8

- [ ] **Step 1: Replace Prerequisites + Migration steps with gated flow**

Rewrite so the skill contains, in order:

1. **Hard gate — Inventory table** (columns exactly as redo spec §4). Explicit: *Do not write any business page files until the user approves the inventory.*
2. **Default gap ruling for compose-pool:** `onPaginationSizeChange` has no `PILOT_ACTION_IDS` entry → bind `onSizeChange` directly on `JdPagination` inside the bound registry to `page.onPaginationSizeChange` (same as current Pagination binder). Do **not** invent `action-page-size`. Document the gap row as `registry-direct`.
3. **Prerequisites:** build renderer; marketing `file:../../../../packages/vue-renderer`; Vite `fs.allow` includes `path.resolve(__dirname, "../../../../packages")`.
4. **Per-file steps** with *STOP for user approval* after each of: `page.spec.json`, `handlers.ts`, `bound-registry.ts`, `index.vue`.
5. **Import rules:** shell and bound-registry import host/`useActions`/`defineHandlers`/`PILOT_*`/`sokai*Attrs` from `@sokai/vue-renderer`; `createJdesignRegistry` from `@sokai/vue-renderer/jdesign`. **Forbidden:** `from "@json-render/vue"`.
6. **Bound registry rules:** override only `Heading` / `SearchForm` / `Table` / `Pagination`; bind hook refs; stamp `data-sokai-*`; no business API calls inside registry; prefer column config arrays over copy-pasted column blocks; target clearly thinner than a full duplicate of the old template (~keep under ~200 lines for compose-pool).
7. **Thin shell example** must import providers from `@sokai/vue-renderer`, not `@json-render/vue`.

Paste this shell snippet into the skill (replace the old one):

```vue
<script setup lang="ts">
import { onMounted, ref } from "vue";
import {
  ActionProvider,
  Renderer,
  StateProvider,
  VisibilityProvider,
} from "@sokai/vue-renderer";
import ComposePoolBlacklistUploadDialog from "../components/ComposePoolBlacklistUploadDialog.vue";
import { useComposePoolListPage } from "./hooks/useComposePoolListPage.js";
import type { ComposePoolTableRow } from "./interface.js";
import spec from "./page.spec.json";
import { createComposePoolListHandlers } from "./handlers.js";
import { createComposePoolBoundRegistry } from "./bound-registry.js";

const blacklistUploadDialogRef = ref<InstanceType<typeof ComposePoolBlacklistUploadDialog>>();
const selectedPoolId = ref("");
const page = useComposePoolListPage();
const { loadRecords } = page;
const registry = createComposePoolBoundRegistry(page);

function handleExport(row: ComposePoolTableRow): void {
  if (!row.blacklistOrgUrl) return;
  window.open(row.blacklistOrgUrl, "_blank");
}

function openBlacklistUploadDialog(row: ComposePoolTableRow): void {
  selectedPoolId.value = row.combinateMsPoolId;
  blacklistUploadDialogRef.value?.open();
}

const handlers = createComposePoolListHandlers({
  page,
  openBlacklistUploadDialog,
  handleExport,
});

onMounted(() => {
  void loadRecords();
});
</script>

<template>
  <div class="compose-pool-list-page pb-28">
    <StateProvider :initial-state="{}">
      <VisibilityProvider>
        <ActionProvider :handlers="handlers">
          <Renderer :spec="spec" :registry="registry" />
        </ActionProvider>
      </VisibilityProvider>
    </StateProvider>
    <ComposePoolBlacklistUploadDialog
      ref="blacklistUploadDialogRef"
      :combinate-ms-pool-id="selectedPoolId"
      @success="loadRecords"
    />
  </div>
</template>
```

- [ ] **Step 2: Update Checklist before done**

Must include:

- [ ] User approved inventory before any page files were written
- [ ] No `@json-render/vue` imports under the page directory
- [ ] Spec has heading + region/action ids only
- [ ] Handlers are thin `defineHandlers` wrappers
- [ ] Bound registry is region-scoped and not a second unmanaged page
- [ ] `data-sokai-region` / `data-sokai-action` match `PILOT_*`
- [ ] Hook bodies untouched
- [ ] Manual smoke (and optional backtest) per redo spec §7

- [ ] **Step 3: Point References at redo spec**

Add:

- `docs/superpowers/specs/2026-09-05-compose-pool-migrate-redo-design.md`
- Parent migrate design §10 试点重做约定

- [ ] **Step 4: Commit specs + skill (only if user approved commits)**

```bash
git add \
  .agents/skills/sokai-migrate-page/SKILL.md \
  docs/superpowers/specs/2026-09-05-compose-pool-migrate-redo-design.md \
  docs/superpowers/specs/2026-09-05-business-json-render-migrate-design.md \
  docs/superpowers/plans/2026-09-05-compose-pool-migrate-redo.md
git commit -m "$(cat <<'EOF'
[sokai] add compose-pool migrate redo plan and skill gates

EOF
)"
```

---

### Task 3: Revert `apps/yy-modules` to `origin/master`

**Files:**
- Submodule: `apps/yy-modules` (pointer + working tree)

**Interfaces:**
- Consumes: none
- Produces: compose-pool list restored to pre-migrate Vue template; marketing without `@sokai/vue-renderer`

- [ ] **Step 1: Fetch and hard-reset the submodule**

```bash
cd apps/yy-modules
git fetch origin master
git checkout master
git reset --hard origin/master
git status
git log -1 --oneline
```

Expected: `HEAD` matches `origin/master` (e.g. previously `66a00d66…`); `composePool/list/` has only `index.vue`, `hooks/`, `interface.ts` (no `page.spec.json` / `handlers.ts` / `bound-registry.ts`).

- [ ] **Step 2: Confirm parent repo sees submodule drift**

```bash
cd /Users/heyongqi10/Workspace/Github/clawd-cook/sokai
git submodule status apps/yy-modules
git status --short apps/yy-modules
```

Expected: submodule pointer differs from last sokai commit that pinned the migrate tip.

- [ ] **Step 3: STOP — confirm with user that revert looks correct**

Do not proceed to inventory until the user confirms the reset.

- [ ] **Step 4: Commit submodule pointer in sokai (only if user approved commits)**

```bash
git add apps/yy-modules
git commit -m "$(cat <<'EOF'
[sokai] reset yy-modules submodule to origin/master for migrate redo

EOF
)"
```

Note: do **not** force-push yy-modules remote; local reset is enough for the redo.

---

### Task 4: Inventory gate (no file writes)

**Files:**
- Read only: `apps/yy-modules/apps/marketing/src/views/coupon/composePool/list/index.vue`
- Read only: `apps/yy-modules/apps/marketing/src/views/coupon/composePool/list/hooks/useComposePoolListPage.ts`
- Read only: `packages/vue-renderer/src/attrs.ts`

**Interfaces:**
- Consumes: restored source + `PILOT_*`
- Produces: approved inventory table (chat artifact) used by Tasks 5–8

- [ ] **Step 1: Draft inventory in chat (do not write repo files)**

Fill this table (values below are the expected compose-pool draft — adjust only if source differs after reset):

| region / keep-as-Vue | action id | hook / local | data-sokai | 缺口 |
|---|---|---|---|---|
| heading「合成池管理」 | — | — | — | — |
| `region-search` | `action-search` / `action-reset` | `handleSearch` / `handleReset` | region + both actions | — |
| `region-table` | `action-export` / `action-open-blacklist-dialog` | `handleExport` / `openBlacklistUploadDialog` | region + both actions | — |
| `region-pagination` | `action-page-next` | `onPaginationCurrentChange` (+ next button) | region + action | — |
| pagination size | — | `onPaginationSizeChange` | — | **registry-direct** (no pilot action id) |
| keep-as-Vue: `ComposePoolBlacklistUploadDialog` | opened by `action-open-blacklist-dialog` | local `openBlacklistUploadDialog` + `@success="loadRecords"` | — | — |
| mount | — | `loadRecords` via `onMounted` | — | — |

- [ ] **Step 2: STOP — wait for explicit user approval of the inventory**

If the user changes a row, update the table before any write.

---

### Task 5: Wire marketing `file:` dependency + Vite allow

**Files:**
- Modify: `apps/yy-modules/apps/marketing/package.json`
- Modify: `apps/yy-modules/apps/marketing/vite.config.ts` (`server.fs.allow`)
- May update: `apps/yy-modules/pnpm-lock.yaml` via install

**Interfaces:**
- Consumes: built `@sokai/vue-renderer` from Task 1
- Produces: resolvable `@sokai/vue-renderer` inside marketing

- [ ] **Step 1: Ensure renderer is built**

Run: `pnpm --filter @sokai/vue-renderer build`

Expected: `packages/vue-renderer/dist/` present

- [ ] **Step 2: Add dependency**

In `apps/yy-modules/apps/marketing/package.json` `dependencies`:

```json
"@sokai/vue-renderer": "file:../../../../packages/vue-renderer"
```

- [ ] **Step 3: Extend Vite fs.allow**

In `apps/yy-modules/apps/marketing/vite.config.ts`, change:

```ts
fs: { allow: [workspaceRoot] },
```

to:

```ts
fs: {
  allow: [
    workspaceRoot,
    path.resolve(__dirname, "../../../../packages"),
  ],
},
```

(`path` is already imported in that file.)

- [ ] **Step 4: Install inside yy-modules**

```bash
cd apps/yy-modules
pnpm install
```

Expected: marketing resolves `@sokai/vue-renderer` without error.

- [ ] **Step 5: Commit inside yy-modules only after page migrate completes (defer)** — wiring may land in the same marketing commit as Task 8.

---

### Task 6: Write `page.spec.json` (after inventory OK)

**Files:**
- Create: `apps/yy-modules/apps/marketing/src/views/coupon/composePool/list/page.spec.json`

**Interfaces:**
- Consumes: approved inventory; `PILOT_*` string values
- Produces: spec consumed by `Renderer`

- [ ] **Step 1: Create spec file**

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

- [ ] **Step 2: STOP — user reviews `page.spec.json`**

Do not start Task 7 until approved.

---

### Task 7: Write `handlers.ts` (after spec OK)

**Files:**
- Create: `apps/yy-modules/apps/marketing/src/views/coupon/composePool/list/handlers.ts`
- Test (sokai side, optional smoke): none required in yy-modules; verify with TypeScript by importing shapes only if marketing has a check script — otherwise review + later manual smoke

**Interfaces:**
- Consumes: `defineHandlers`, `PILOT_ACTION_IDS` from `@sokai/vue-renderer`; page composable type; local export/dialog helpers
- Produces: `createComposePoolListHandlers(options)`

- [ ] **Step 1: Create handlers**

```typescript
import { defineHandlers, PILOT_ACTION_IDS } from "@sokai/vue-renderer";
import type { ComposePoolTableRow } from "./interface.js";
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

- [ ] **Step 2: STOP — user reviews `handlers.ts`**

---

### Task 8: Thin `bound-registry.ts` + `index.vue` (after handlers OK)

**Files:**
- Create: `apps/yy-modules/apps/marketing/src/views/coupon/composePool/list/bound-registry.ts`
- Modify: `apps/yy-modules/apps/marketing/src/views/coupon/composePool/list/index.vue`

**Interfaces:**
- Consumes: `createJdesignRegistry` from `@sokai/vue-renderer/jdesign`; `useActions`, `sokaiActionAttrs`, `sokaiRegionAttrs` from `@sokai/vue-renderer`; approved inventory
- Produces: `createComposePoolBoundRegistry(page)`; thin shell mounting Renderer + Dialog

- [ ] **Step 1: Implement thin bound registry**

Structure requirements (enforce in review):

1. Import **only** from `@sokai/vue-renderer`, `@sokai/vue-renderer/jdesign`, Vue, JdDesign, and local hook/interface — **zero** `@json-render/vue`.
2. Top-level helpers: `elementProps`, `stringProp`, `executeRowAction` (same signatures as prior pilot).
3. `TABLE_COLUMNS`: data-driven list of `{ label, minWidth?, width?, prop?, fixed?, cell?: (row) => string }` for the five display columns; render loop builds `JdTableColumn` nodes — do not paste five near-identical `h(JdTableColumn, …)` blocks.
4. Components: `Heading`, `SearchForm`, `Table`, `Pagination` only.
5. `Pagination`: bind `onCurrentChange` → `page.onPaginationCurrentChange`; `onSizeChange` → `page.onPaginationSizeChange` (**registry-direct** gap); keep a visible control with `data-sokai-action="action-page-next"` that calls `execute({ action: nextActionId })` for backtest.
6. Soft line budget: prefer **≤ 200 lines** for this file.

Use this skeleton (expand SearchForm / Table bodies to match restored template behavior — rules, customComponents, loading directive, blacklist actions):

```typescript
/* eslint-disable vue/one-component-per-file */
import { defineComponent, h, resolveDirective, withDirectives, type PropType } from "vue";
import { useActions, sokaiActionAttrs, sokaiRegionAttrs } from "@sokai/vue-renderer";
import { createJdesignRegistry } from "@sokai/vue-renderer/jdesign";
import { JdButton, JdLink, JdPagination, JdTable, JdTableColumn } from "@jd/jdesign-vue";
import { JdProSearchForm } from "@jd/jdesign-vue-pro";
import {
  searchFormCustomComponents,
  searchRules,
  useComposePoolListPage,
} from "./hooks/useComposePoolListPage.js";
import type { ComposePoolTableRow } from "./interface.js";

type PageApi = ReturnType<typeof useComposePoolListPage>;
// … prop defs + helpers …

const DISPLAY_COLUMNS: Array<{
  label: string;
  minWidth?: number;
  prop?: keyof ComposePoolTableRow;
  cell?: (row: ComposePoolTableRow) => string;
}> = [
  { label: "品池 ID", prop: "combinateMsPoolId", minWidth: 180 },
  { label: "策略 ID", minWidth: 140, cell: (row) => String(row.strategyId ?? "-") },
  { label: "策略名称", minWidth: 180, cell: (row) => row.strategyName || "-" },
  { label: "合成范围", minWidth: 140, cell: (row) => row.couponScopeStr || "-" },
  { label: "创建人", minWidth: 140, cell: (row) => row.createPin || "-" },
];

export function createComposePoolBoundRegistry(page: PageApi) {
  const { registry } = createJdesignRegistry();
  // Heading / SearchForm / Table (map DISPLAY_COLUMNS + actions column) / Pagination
  return { ...registry, Heading, SearchForm, Table, Pagination };
}
```

- [ ] **Step 2: STOP — user reviews `bound-registry.ts`**

- [ ] **Step 3: Replace `index.vue` with the thin shell from Task 2 skill snippet**

Ensure scoped `.divider` styles still apply via `:deep(.divider)` on the page root if Heading renders the hr inside registry.

- [ ] **Step 4: Grep for forbidden imports**

```bash
rg '@json-render/vue' apps/yy-modules/apps/marketing/src/views/coupon/composePool/list
```

Expected: no matches

- [ ] **Step 5: STOP — user reviews `index.vue`**

- [ ] **Step 6: Commit marketing changes inside yy-modules (only if user approved commits)**

```bash
cd apps/yy-modules
git add apps/marketing/package.json apps/marketing/vite.config.ts apps/marketing/src/views/coupon/composePool/list pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat: [marketing] re-migrate compose-pool list via sokai vue-renderer

EOF
)"
```

Then in sokai parent (if submodule pointer should be recorded):

```bash
cd /Users/heyongqi10/Workspace/Github/clawd-cook/sokai
git add apps/yy-modules
git commit -m "$(cat <<'EOF'
[sokai] point yy-modules at compose-pool migrate redo

EOF
)"
```

---

### Task 9: Verification

**Files:**
- None required; optional SessionBundle path if user provides one

**Interfaces:**
- Consumes: running marketing app + migrated page
- Produces: pass/fail against redo spec §7

- [ ] **Step 1: Typecheck / build marketing if practical**

```bash
cd apps/yy-modules/apps/marketing
pnpm exec vue-tsc --noEmit
```

Expected: PASS (or only pre-existing unrelated errors — do not expand scope)

- [ ] **Step 2: Manual smoke checklist**

Start marketing (`pnpm dev` from marketing or workspace script). On合成池管理:

1. Mount loads records  
2. Search / reset  
3. Page change  
4. Page size change  
5. Export (row with URL)  
6. 更新 opens Dialog; success refreshes  

- [ ] **Step 3: Optional backtest**

If user provides SessionBundle + URL:

```bash
pnpm sokai -- backtest --bundle <SessionBundle> --target-url <list-page-url> --out /tmp/compose-pool-redo-report.json
```

Expected: report steps for enter → search → next → open dialog succeed or document failures without auto-editing Spec.

- [ ] **Step 4: Mark plan complete only after user accepts smoke results**

---

## Spec coverage self-review

| Spec requirement | Task |
|---|---|
| Revert yy-modules to origin/master | Task 3 |
| Inventory hard gate before writes | Task 4 |
| D: boundary / vue-renderer-only / inventory quality | Tasks 1–2, 6–8 |
| Thin bound registry allowed, mega glue forbidden | Task 8 |
| pageSize gap handled without new pilot id | Tasks 2, 4, 8 |
| Per-file user approval | Tasks 4, 6–8 |
| Skill primary; parent spec §10 already added | Task 2 |
| Behavior + structure acceptance; optional backtest | Task 9 |
| No Dialog config / no architecture redraw | Out of scope (honored) |

## Placeholder / consistency scan

- No TBD steps; pageSize ruling fixed as `registry-direct`.
- Import surface consistent: business code → `@sokai/vue-renderer` only after Task 1.
- Handler / spec ids match `PILOT_*` string literals throughout.
