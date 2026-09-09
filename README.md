# Sokai（溯洄）

> **本项目已废弃。** Json 标准尚未定下来，当前仓库不再继续开发。

录制 → Schema → 回测。规格：`docs/superpowers/specs/2026-09-05-record-schema-backtest-design.md`。

## 开发

```bash
pnpm install
pnpm playwright install   # if browsers missing
pnpm -r --if-present test
```

## 离线闭环（fixture）

```bash
pnpm sokai -- schema --bundle fixtures/compose-pool/sample-v1 --out /tmp/page.schema.json --no-llm
pnpm sokai -- preview --schema /tmp/page.schema.json --bundle fixtures/compose-pool/sample-v1
pnpm sokai -- backtest --bundle fixtures/compose-pool/sample-v1 --schema /tmp/page.schema.json
```

## Business migrate backtest (pilot)

Live marketing E2E is **not yet green**. A passing live run needs all of:

1. Marketing **from this worktree** (not the main-repo checkout) so the migrated compose-pool page is served
2. Vite `server.fs.allow` covering sokai `packages/` so the `file:` `@sokai/vue-renderer` path can load (`apps/yy-modules/apps/marketing/vite.config.ts`)
3. A logged-in Chrome profile that can open the list URL

v1 `page.spec.json` is hook/region ids + heading only; search/table binding stays in the page-local bound registry.

```bash
pnpm --filter @sokai/vue-renderer build
# start worktree marketing compose-pool list (logged-in profile as needed)
pnpm sokai -- backtest --bundle <SessionBundle> --target-url <marketing-list-url> --out /tmp/report.json
```

Example bundle: `fixtures/compose-pool/sample-v1`. Target URL must be the migrated compose-pool list page (with `data-sokai-action` / `data-sokai-region` hooks).

## 录制合成池试点

```bash
pnpm sokai -- record --url <已登录可打开的合成池列表 URL> --out /tmp/compose-session --user-data-dir ~/Library/Application\ Support/Google/Chrome
```
