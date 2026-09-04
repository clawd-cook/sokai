# AGENTS.md

## 项目概览

**Sokai（溯洄）**：页面「录制 → Schema → 回测」工具链的 monorepo。产品方向见 `docs/superpowers/`。

技术栈：Node.js `24.20.0`、pnpm `11.23.0`、TypeScript。

## 目录约定

```text
packages/   ← 全部产品代码（pnpm workspace：packages/*）
apps/       ← 独立测试 / 参考项目，与本仓库产品无关（含 yy-modules submodule）
docs/       ← 规格与计划
```

- 新代码只放 `packages/`，不要写进 `apps/`。
- `apps/yy-modules` 仅作试点参考；除非用户明确要求，不要改它。

## 环境与常用命令

```bash
node -v    # 期望 v24.20.0（见 .node-version）
pnpm -v    # 期望 11.23.0
pnpm install
pnpm --filter <package-name> <script>
pnpm -r --if-present test
```

私有源默认：`http://registry.m.jd.com/`（`pnpm-workspace.yaml`）。

## 规范

- 包级脚本与测试写在各自 `packages/*/package.json`；根目录只做 workspace 编排。
- 改动代码时同步补测试（优先 Vitest）。
- 不要提交密钥、token、未脱敏敏感数据。
- PR 标题：`[sokai] …` 或 `[<package-name>] …`。
