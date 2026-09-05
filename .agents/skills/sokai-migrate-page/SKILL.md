---
name: sokai-migrate-page
description: Migrate a Vue business list page to json-render spec + handlers + @sokai/vue-renderer. Use when the user provides a page path after recording and wants UI config (page.spec.json), action handlers, and a thin index.vue shell — not CLI migrate.
---

# Sokai page migration (IDE Agent)

Migrate a Vue list page from inline template to **Spec + handlers + thin shell**, reusing existing composable logic. Source code is primary; SessionBundle is reference only.

## When to use

- User provides a Vue page directory (e.g. after CDP recording) and wants UI config + handlers + `@sokai/vue-renderer`.
- Pilot scope: list pages like `composePool/list` — search, table, pagination, row actions.
- **Do not** use for CLI auto-migrate, Dialog→spec conversion, rrweb, or `@sokai/runtime` preview.

## Inputs

| Input | Required | Purpose |
|-------|----------|---------|
| Page directory | Yes | Contains `index.vue`, `hooks/`, `interface.ts` |
| SessionBundle path | No | Cross-check regions/actions; backtest script later — **not** the spec source |

Typical layout:

```text
<page-dir>/
  index.vue
  hooks/useComposePoolListPage.ts   ← do not rewrite logic body
  interface.ts
  page.spec.json                    ← create
  handlers.ts                       ← create
```

## Prerequisites

### 1. Build `@sokai/vue-renderer`

From sokai repo root:

```bash
pnpm --filter @sokai/vue-renderer build
```

Renderer must be built to `dist/` before the business app can import it.

### 2. Wire `file:` dependency in marketing

In `apps/yy-modules/apps/marketing/package.json` `dependencies`:

```json
"@sokai/vue-renderer": "file:../../../../packages/vue-renderer"
```

Then from `apps/yy-modules`:

```bash
pnpm install
```

If the workspace cannot resolve the path, try the parent `apps/yy-modules/package.json` and document the fallback.

Vite must allow the sokai packages directory (outside the yy-modules workspace root), or `file:` will fail at runtime:

```ts
// apps/yy-modules/apps/marketing/vite.config.ts
fs: {
  allow: [
    workspaceRoot,
    path.resolve(__dirname, "../../../../packages"),
  ],
},
```

## Migration steps

### Step 1 — Read source; map regions vs logic

Read `index.vue` and its hooks. Produce a short inventory:

- **Template regions:** search form, table, pagination, heading, dialogs kept as Vue
- **Callable logic:** functions already on the composable or local helpers (search, reset, pagination, export, open dialog)
- **State/refs:** query, tables, pageNo, loading, etc.

SessionBundle (if given): confirm the same regions/actions appear in recording — do not copy bundle JSON into the spec.

### Step 2 — Create `page.spec.json`

**v1 Spec is hook/region ids + heading only.** Catalog types accept `regionId`, action ids, and `Heading.text`. Do **not** put `fields`, `columns`, query models, or table data in the spec — v1 catalog ignores them. Bind search/table/pagination state in a **page-local bound registry** (Step 4).

json-render spec using `@sokai/vue-renderer` pilot catalog types. Import constants from the package — do not invent new ids.

**Pilot action ids** (`PILOT_ACTION_IDS`):

| Key | Id |
|-----|-----|
| search | `action-search` |
| reset | `action-reset` |
| export | `action-export` |
| openBlacklistDialog | `action-open-blacklist-dialog` |
| pageNext | `action-page-next` |

**Pilot region ids** (`PILOT_REGION_IDS`):

| Key | Id |
|-----|-----|
| search | `region-search` |
| table | `region-table` |
| pagination | `region-pagination` |

**Catalog types:** `Page`, `Heading`, `SearchForm`, `Table`, `Pagination`, `Button`, `Link`, `Unknown`.

Minimal shape (ids + heading; copy labels into the bound registry, not the spec):

```json
{
  "root": "page",
  "elements": {
    "page": {
      "type": "Page",
      "props": {},
      "children": ["title", "search", "table", "pager"]
    },
    "title": { "type": "Heading", "props": { "text": "合成池管理" } },
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

Spec actions reference ids only — no inline business code.

### Step 3 — Create `handlers.ts`

Use `defineHandlers` from `@sokai/vue-renderer`. Wrap **existing** hook/local functions — do not reimplement business logic.

```typescript
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

Adapt handler names/signatures per page; keep `PILOT_ACTION_IDS` keys.

### Step 4 — Page-local bound registry + thin `index.vue`

**Business host pattern:** wrap `createJdesignRegistry()` in a page-local `createXxxBoundRegistry(page)` that overrides `SearchForm` / `Table` / `Pagination` (and heading chrome) to bind hook refs. Stock `createJdesignRegistry()` alone is only a **hook fallback** — it stamps `data-sokai-*` attrs but does not bind query/table/pagination data.

Import `createJdesignRegistry` from `@sokai/vue-renderer/jdesign` (default `@sokai/vue-renderer` stays free of optional JdDesign peers). Use `sokaiActionAttrs` / `sokaiRegionAttrs` from the default entry.

```typescript
import { createJdesignRegistry } from "@sokai/vue-renderer/jdesign";
import { sokaiActionAttrs, sokaiRegionAttrs } from "@sokai/vue-renderer";

export function createComposePoolBoundRegistry(page: PageApi) {
  const { registry } = createJdesignRegistry();
  // define SearchForm / Table / Pagination that read page.query, page.tables, …
  return { ...registry, Heading, SearchForm, Table, Pagination };
}
```

See `apps/yy-modules/apps/marketing/src/views/coupon/composePool/list/bound-registry.ts`.

Thin shell:

- Call `useComposePoolListPage()` (or page composable) **unchanged**
- `createXxxBoundRegistry(page)` — not stock `createJdesignRegistry()`
- Import `page.spec.json`
- `createComposePoolListHandlers(...)` with dialog/export helpers
- Wrap with `StateProvider` → `ActionProvider` → `Renderer` (add `VisibilityProvider` if needed)
- `onMounted(() => loadRecords())` as before
- **Keep Dialog as Vue child** — e.g. `ComposePoolBlacklistUploadDialog` stays in template; handler opens it

```vue
<script setup lang="ts">
import { ActionProvider, Renderer, StateProvider, VisibilityProvider } from "@json-render/vue";
import spec from "./page.spec.json";
import { createComposePoolListHandlers } from "./handlers";
import { createComposePoolBoundRegistry } from "./bound-registry";
// … composable, dialog ref, local helpers unchanged …
const registry = createComposePoolBoundRegistry(page);
const handlers = createComposePoolListHandlers({ page, openBlacklistUploadDialog, handleExport });
</script>

<template>
  <StateProvider :initial-state="{}">
    <VisibilityProvider>
      <ActionProvider :handlers="handlers">
        <Renderer :spec="spec" :registry="registry" />
      </ActionProvider>
    </VisibilityProvider>
  </StateProvider>
  <!-- Dialog remains Vue -->
  <ComposePoolBlacklistUploadDialog ref="blacklistUploadDialogRef" … />
</template>
```

Prefer full Spec rendering via the bound registry. Use stock `createJdesignRegistry()` only when you need hook attrs without data binding — note that gap; do not silently leave the old full template.

### Step 5 — Do not rewrite hook logic body

**Leave `hooks/useComposePoolListPage.ts` (and `interface.ts`) unchanged.** Only add `page.spec.json`, `handlers.ts`, and thin `index.vue`. Business functions (`loadRecords`, `handleSearch`, API calls, store) stay in the composable.

## Checklist before done

- [ ] `region-search`, `region-table`, `region-pagination` present in spec or DOM output
- [ ] All five pilot action ids wired in spec props and `handlers.ts`
- [ ] Spec has heading + hook/region ids only (no unused `fields` / `columns`)
- [ ] Page uses `createXxxBoundRegistry` wrapping `createJdesignRegistry` from `@sokai/vue-renderer/jdesign`
- [ ] `pnpm --filter @sokai/vue-renderer build` succeeds
- [ ] Marketing resolves `@sokai/vue-renderer` via `file:../../../../packages/vue-renderer`
- [ ] Vite `server.fs.allow` includes sokai `packages/` so the `file:` path can load
- [ ] Dialog still Vue; opens via handler
- [ ] Hook/composable logic body untouched
- [ ] Manual smoke: load, search, paginate, open dialog (`pnpm dev:marketing`)

If search/table/pagination regions are missing, migration is **incomplete** — do not claim backtest-ready (spec §7).

## Out of scope

- CLI `sokai migrate` or any automated business-repo rewrite
- Converting Dialog / subcomponents into spec
- rrweb recording or playback
- `@sokai/runtime` preview host
- Batch migration of other pages
- Publishing renderer to a private npm registry (pilot uses `file:` only)

## After migration (manual)

```bash
pnpm --filter @sokai/vue-renderer build
# start marketing, then:
pnpm sokai -- backtest --bundle <SessionBundle> --target-url <list-page-url> --out /tmp/report.json
```

Pilot script: enter page → search → next page → open Dialog → close.

## References

- `@sokai/vue-renderer`: `PILOT_ACTION_IDS`, `PILOT_REGION_IDS`, `defineHandlers`, `createDomRegistry`, `sokaiPilotCatalog`
- `@sokai/vue-renderer/jdesign`: `createJdesignRegistry` (optional JdDesign peers)
- Mini fixture: `packages/vue-renderer/tests/fixtures/compose-pool-mini.spec.json`
- Design spec §5.3: source-first split, SessionBundle for对照 only
