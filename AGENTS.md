# AGENTS.md

## 项目概览

**Sokai（溯洄）**：页面「录制 → Schema → 回测」工具链的 monorepo。产品方向见 `docs/superpowers/`；当前迭代规格与计划见 `docs/superpowers/specs/`、`docs/superpowers/plans/`；离线 smoke 见 `README.md`。

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

### Node 版本（必读）

本仓库锁定 **Node.js `v24.20.0`**（见 `.node-version` / `.nvmrc`）。

- **必须用 nvm 的 24**，不要用 Homebrew（或其它路径）自带的 Node（本机常见为 `/opt/homebrew/bin/node` → v26.x）。
- 每个新 shell / agent 会话开工前先切版本并核对：

```bash
export NVM_DIR="$HOME/.nvm"
. "$NVM_DIR/nvm.sh"
nvm use          # 读 .nvmrc → v24.20.0；若失败：nvm install 24.20.0 && nvm use
which node       # 期望 …/.nvm/versions/node/v24.20.0/bin/node
node -v          # 期望 v24.20.0
# 若 which node 仍是 /opt/homebrew/bin/node，说明 nvm 未生效，不要继续装依赖或跑测试
```

### 依赖与脚本

```bash
pnpm -v    # 期望 11.23.0
pnpm install
pnpm playwright install   # 根依赖 playwright@1.62.1；浏览器已装到本机 ms-playwright 缓存
pnpm --filter <package-name> <script>
pnpm -r --if-present test
pnpm sokai -- <cli-args>  # 根脚本 → @sokai/cli
```

私有源默认：`http://registry.m.jd.com/`（`pnpm-workspace.yaml`）。

## 规范

- 执行脚本 / shell 命令时**不要使用沙箱**（需完整网络与本地权限）。
- 包级脚本与测试写在各自 `packages/*/package.json`；根目录只做 workspace 编排。
- 改动代码时同步补测试（优先 Vitest）。
- 不要提交密钥、token、未脱敏敏感数据。
- PR 标题：`[sokai] …` 或 `[<package-name>] …`。
