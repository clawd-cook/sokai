# Design: Page Record → Schema Rebuild → Backtest

**Date:** 2026-09-04  
**Status:** Draft for review  
**Pilot page:** `apps/yy-modules/apps/marketing/src/views/coupon/composePool/list`（合成池管理列表）

## 1. Problem

运营后台页面（以合成池列表为典型）包含搜索表单、表格、分页与弹窗。希望用工具一次性采集真实页面的**界面关键帧、DOM 语义变化、接口请求**，再由**本地 Agent**结合代码与规范产出**可运行时渲染的页面 schema**，最后用同一份录制素材对 schema 播放结果做**三路硬门槛回测**，形成可重复的闭环。

## 2. Goals & Non-Goals

### Goals (MVP)

- 浏览器扩展只负责**录制与导出标准录制包**（数据），不调模型、不写 schema。
- 本地 Agent 读取录制包 + 现有代码 + schema 规范，生成 `page.schema.json`。
- 仓库内 schema 播放器用 Jd 组件渲染 schema，并用录制网络数据 mock。
- 回测三路全部硬门槛：截图差分 ∩ DOM 断言 ∩ 接口契约；全绿才通过。
- 试点仅 `composePool` 列表场景：加载、搜索、翻页、打开黑名单弹窗。

### Non-Goals (MVP)

- 扩展内一键 LLM 生成 schema。
- 通用低代码可视化编辑器、任意组件树、自定义 JS action。
- 把 marketing 业务源码自动改写成 schema 驱动（schema 与源码并行；迁移另开任务）。
- 用短视频/动图做自动判定。
- 多页面泛化、自动路由发现、CI 强制门禁（可后接；MVP 先本地 CLI）。

## 3. Architecture

```text
[真实 marketing 页]
        │  Chrome 扩展注入
        ▼
  录制包：关键帧截图 + 短视频 + DOM + 网络（+ 元数据）
        │  下载到仓库 fixtures/
        ▼
[本地 Agent] 读录制包 + 读现有代码/组件规范/schema 规范
        → 写出 page.schema.json
        ▼
[仓库] schema 播放器（Jd 渲染）
        │  Playwright + 接口 fixture
        ▼
  回测：截图差分 ∩ DOM 断言 ∩ 接口契约
```

### Component responsibilities

| Component | Does | Does not |
|-----------|------|----------|
| Chrome extension | Capture UI/DOM/network; export recording package | Call LLM; write schema; run hard-gate backtest |
| Local Agent | Generate/iterate `page.schema.json` from recording + code + spec | Replace recorder or backtest runner |
| Schema player | Render schema with Jd; mock network from fixture | Generate schema |
| Backtest CLI | Enforce three hard gates; emit report + exit code | Call LLM |

### Repository layout (proposed)

| Path | Role |
|------|------|
| `tools/page-recorder-ext/` | Chrome extension (record + export only) |
| `apps/schema-player/` | Vue app: load schema + fixture, Jd render, mock layer |
| `tools/page-backtest/` | Playwright backtest CLI |
| `packages/page-schema/` | JSON Schema + short human/Agent doc for page schema |
| `fixtures/compose-pool/<sessionId>/` | Pilot recording packages (+ generated schema beside or inside) |

Large videos under `clips/` may be gitignored; keep manifests, asserts, contracts, and keyframe PNGs as needed for reproducible backtest.

## 4. Recording package format

Extension sole formal output: one session directory (or zip).

```text
fixtures/compose-pool/<sessionId>/
  manifest.json
  frames/                  # keyframe screenshots (primary visual baseline)
  clips/                   # short video/gif (human review only)
  dom/
    timeline.jsonl
    asserts.json
  network/
    har.json               # or entries.jsonl
    contracts.json
  events/
    user.jsonl
  page.schema.json         # written later by Agent (not by extension)
  NOTES.md                 # optional Agent notes
```

### `manifest.json` (required concepts)

- `pageId`: e.g. `marketing.coupon.composePool.list`
- `url`, `viewport`, `userAgent`, `recordedAt`
- `scenario`: human-readable path, e.g. `load → search → paginate → openBlacklistDialog`
- `frames[]`: `{ id, ts, path, label, domRef, networkRefs[], mask? }`
- `clips[]`: `{ id, path, label, reviewOnly: true }`
- `redaction`: list of redacted field names / rules applied

Alignment across screenshot, DOM, and network uses monotonic `ts` + `frameId`, not wall-clock sync alone.

### Capture rules (MVP)

- **UI:** Keyframes at idle-after-load, after search, after pagination, dialog open (auto and/or manual bookmark). Optionally 1–2 short clips for human review.
- **DOM:** Not full HTML trees by default. Semantic summaries (title, headers, row count, visible action labels) plus compact snapshots aligned to frames. `dom/asserts.json` holds candidate assertions for backtest.
- **Network:** Intercept `fetch` / `XHR`. Keep method, normalized URL, status, request/response bodies with default redaction of tokens/cookies. Derive `contracts.json` drafts for list query and related calls.
- **Events:** Click/input/pagination in `events/user.jsonl` so Agent can reconstruct flow.

### Extension UX (minimum)

Start → user operates page → auto/manual keyframes → stop → export package. No schema generation UI beyond optional “open folder / download zip”.

## 5. Page schema model

MVP page type: **list-page** only (enough for composePool).

### Top-level shape

```json
{
  "schemaVersion": "1",
  "pageId": "marketing.coupon.composePool.list",
  "title": "合成池管理",
  "layout": "list-page",
  "dataSources": [],
  "sections": []
}
```

### Section whitelist

| type | Meaning | Player mapping |
|------|---------|----------------|
| `pageHeader` | Title | Text node |
| `searchForm` | Fields, validation, search/reset | `JdProSearchForm` |
| `table` | Columns, rowKey, empty text, limited merge | `JdTable` / `JdTableColumn` |
| `pagination` | page sizes, layout | `JdPagination` |
| `dialog` | Trigger + declarative form/upload subset | Dialog pattern used by blacklist upload |

### Data binding & actions

- `dataSources[]`: `id`, `method`, `urlPattern`, request/response field mapping; aligned with `network/contracts.json`.
- Table data from a dataSource path (e.g. list under `result.resultList`); pagination binds `pageNo` / `pageSize` / `totalCount`.
- Actions are declarative only: `search` | `reset` | `pageChange` | `openDialog` | `exportUrl`. No arbitrary JavaScript in schema.
- Complex `spanMethod`: MVP may use limited enum (e.g. `mergeBy: combinateMsPoolId`) or accept structural approximation with documented screenshot tolerance.

### Validation

Player and backtest validate `page.schema.json` against `packages/page-schema` JSON Schema before run; invalid schema fails closed.

### Agent workflow (explicit)

1. Read recording package (`manifest`, `dom/asserts`, `network/contracts`, keyframes; clips optional).
2. Read related source (e.g. composePool list Vue/hooks/API) and dongDesign/dongPro usage norms as needed.
3. Read `packages/page-schema` spec.
4. Write `page.schema.json` + optional `NOTES.md` (uncertainties, simplifications).
5. Do not modify marketing business source unless a separate task requests it.

## 6. Schema player

- Stack: Vue + same `@jd/jdesign-vue` / `@jd/jdesign-vue-pro` as marketing where practical.
- Entry: query `?fixture=<sessionPath>` or local directory picker; load schema + `network/` fixture.
- Mock layer matches `urlPattern` to recorded responses; no live backend in backtest mode.
- Can drive key path from `events/user.jsonl` (search → page → open dialog) to align frames.
- Optional side-by-side recorded keyframe preview for humans (not a gate).

## 7. Backtest gates

CLI: `pnpm backtest fixtures/compose-pool/<sessionId>` (exact script name TBD in implementation plan).

For each `manifest.frames[]`:

1. **API contract (hard)**  
   Mock must hit recorded entries. Assert method, normalized URL, status, and presence of key fields from `contracts.json`. Undeclared requests fail (no silent passthrough).

2. **DOM asserts (hard)**  
   Run `dom/asserts.json` (and per-frame asserts): title, column headers, empty text, key controls. Prefer role/name selectors over brittle CSS.

3. **Screenshot diff (hard)**  
   Compare to `frames/*.png` with small perceptual/pixel threshold; honor `mask` regions for dynamic cells. Failures write diff artifacts.

`clips/` never affect pass/fail; may appear in HTML report for manual review.

### Reporting

- `backtest-report.json` + HTML summary (per frame: contract / DOM / screenshot status).
- Any hard failure → non-zero exit; all green → 0.

### Error handling

- Schema validation failure → fail immediately with path.
- Missing frame or contract → fail; do not skip silently.
- Mock miss → fail and list actual request.

### Dialog scope in MVP

Dialog may be “opens + title/primary controls” fidelity; screenshot may compare dialog region or a dedicated frame only.

## 8. Pilot success criteria

End-to-end on composePool list:

1. Extension produces a valid recording package for the agreed scenario.
2. Local Agent produces a schema that validates against `packages/page-schema`.
3. Player renders the page under mock.
4. Backtest exits 0 with all three gates green for declared keyframes.

## 9. Out of scope / later

- Extension-hosted LLM.
- Broader page layouts (wizards, dashboards).
- Replacing production marketing routes with schema player.
- CI required check; visual baseline cloud storage.
- Full rrweb-style continuous replay as the primary artifact (keyframes + semantic DOM are enough for MVP).

## 10. Open decisions deferred to implementation plan

- Exact Chrome MV3 extension packaging and host permission list for local/dev marketing origins.
- Pixel vs perceptual hash library and default threshold numbers.
- Whether `page.schema.json` lives inside the session folder or a sibling `schemas/` path (recommend: inside session for one-folder backtest).
- Whether `apps/schema-player` is a top-level sokai app or nested under `apps/yy-modules` (recommend: top-level `apps/schema-player` to avoid coupling to marketing build, while depending on the same Jd packages).
