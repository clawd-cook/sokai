# Sokai（溯洄）

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

## 录制合成池试点

```bash
pnpm sokai -- record --url <已登录可打开的合成池列表 URL> --out /tmp/compose-session --user-data-dir ~/Library/Application\ Support/Google/Chrome
```
