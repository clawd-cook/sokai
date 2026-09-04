# AGENTS.md

## 项目概览

**Sokai（溯洄）** 是一个 monorepo，围绕页面的 **录制 → Schema → 回测** 闭环：

1. 采集真实运营后台页面会话（UI 关键帧、DOM 语义、网络请求）。
2. 本地 Agent 根据录制包 + 源码 + Schema 规范生成 `page.schema.json`。
3. Schema 播放器用 Jd 组件渲染，并用网络数据做 mock。
4. Playwright 回测强制校验截图 + DOM + API 三路硬门槛。

试点目标（仅作参考）：营销合成池列表（`marketing.coupon.composePool.list`）。

**设计 / 计划（产品方向的事实来源）：**

- Spec：`docs/superpowers/specs/2026-09-04-page-record-schema-backtest-design.md`
- Plan：`docs/superpowers/plans/2026-09-04-page-record-schema-backtest.md`

**技术栈：** Node.js `24.20.0`、pnpm `11.23.0`、TypeScript、Vitest、Vue 3 + Vite（播放器）、Playwright、Chrome MV3 扩展、Ajv（JSON Schema draft-2020-12），需要时使用 `@jd/jdesign-vue` / `@jd/jdesign-vue-pro`。

## Monorepo 目录结构（重要）

```text
sokai/
  packages/     ← 全部项目 / 产品代码（pnpm workspace 包）
  apps/         ← 仅独立测试 / 参考项目 — 不是 Sokai 产品代码
  docs/         ← 规格、计划、灵感
  fixtures/     ← 录制包 + Schema（有则存在）
  tools/        ← CLI / 扩展（有则存在；不一定是 workspace 成员）
```

### `packages/` — Agent 的工作区

- pnpm workspace 成员仅为 `packages/*`（见 `pnpm-workspace.yaml`）。
- 共享契约、库与产品包放在这里（例如 `page-schema`、`recording-pack`）。
- 使用 `--filter` 时，优先用 `@sokai/<name>` 或各 `packages/*/package.json` 中的 `name` 字段。

### `apps/` — 不要当作产品代码

- `apps/` 下每个目录都是**独立的测试或参考项目**，与 Sokai 自身实现无关。
- `apps/yy-modules` 是 **git submodule**（`git@coding.jd.com:webapp/yy-modules.git`），用作真实试点 / 参考页面（如 composePool）。除非用户明确要求，不要把「修 yy-modules / 重构 yy-modules」当作 Sokai 任务的一部分。
- 不要把 Sokai 产品功能写进 `apps/`。不要假定 `apps/*` 是 workspace 包（根目录 `pnpm-workspace.yaml` 未包含它们）。
- 需要试点页源码时，从 submodule 读取；Sokai 产物写到 `packages/`、`fixtures/`、`tools/` 或根目录 docs — 不要写进 yy-modules。

### 根目录

- 根目录 `package.json` 是 workspace 根（`packageManager`：`pnpm@11.23.0`）。
- 默认私有源：`http://registry.m.jd.com/`（见 `pnpm-workspace.yaml`）。

## 环境与安装

使用锁定的工具链：

- Node：**24.20.0**（`.node-version`）
- pnpm：**11.23.0**（根目录 `packageManager` 字段）

```bash
# 确保 Node 24.20.0（fnm / nvm / asdf / volta 等）
node -v   # 期望 v24.20.0

corepack enable
corepack prepare pnpm@11.23.0 --activate
pnpm -v   # 期望 11.23.0

pnpm install
```

可选：拉取试点参考用的 submodule：

```bash
git submodule update --init --recursive
# apps/yy-modules 是独立项目；除非本地需要跑该应用，否则不要在其中执行 install
```

## 开发工作流

- 只在仓库根目录为 Sokai 包安装依赖：`pnpm install`
- 运行某个包的脚本：`pnpm --filter <package-name> <script>`
- 在所有已定义该脚本的 workspace 包中运行：`pnpm -r --if-present <script>`
- 给单个包加依赖：`pnpm --filter <package-name> add <dep>`
- 新的产品代码放在 `packages/<name>/`，并自带 `package.json`

包落地后，常见脚本（名称可能变化 — 以各包 `package.json` 为准）：

- `pnpm test` — 各包定义了 `test` 时递归执行
- 包内 `dev` / `build` / `start` 通过 `--filter` 调用

**不要**把 yy-modules 的 turbo/vite 脚本当作 Sokai 的主工作流。

## 测试说明

- `packages/*` 内单测优先用 Vitest。
- 根目录（各包定义了 `test` 后）：`pnpm -r --if-present test`
- 单个包：`pnpm --filter <package-name> test`
- 聚焦单个 Vitest 用例：`pnpm --filter <package-name> exec vitest run -t "<name>"`
- Playwright / 回测 CLI 在存在时位于 `tools/`；通过该包脚本运行，不要经 `apps/`。
- 改动 `packages/` 中的代码时，补充或更新对应测试。
- 根目录 `package.json` 在包尚未引导完成前可能仍是占位 `test` 脚本 — 以包级测试为准。

## 代码风格

- `packages/` 下共享契约与库使用 TypeScript。
- 已有包时，对齐其约定（exports、`src/`、ESM vs CJS）。
- 录制 / Schema 契约保持类型化，并用 Ajv 按已发布的 JSON Schema 校验。
- 不要在 fixtures 中提交密钥、鉴权 token 或未脱敏的 PII；遵循设计稿中的脱敏规则。
- 大型录制片段：`fixtures/**/clips/**` 已 gitignore；为可复现回测保留关键帧 PNG、manifest、asserts、contracts 与 `page.schema.json`。
- 忽略构建噪音：`node_modules/`、`dist/`、`*.local`、`tools/page-backtest/artifacts/`、`.worktrees/`。

## 构建与部署

- MVP 不需要生产部署流水线；先做本地 CLI + fixtures。
- 按包构建：存在 `build` 脚本时执行 `pnpm --filter <package-name> build`。
- Schema 播放器 / 扩展 / 回测工具按计划文档引入；共享库放 `packages/`，CLI/扩展放 `tools/`。不要把产品代码放进 `apps/`。

## 架构约束（MVP）

来自设计稿 — Agent 必须遵守：

- 扩展只负责录制与导出；**不调用 LLM**，**不**写入 `page.schema.json`。
- `page.schema.json` 放在 `fixtures/` 下对应会话目录**内部**。
- `clips/` 永不影响回测通过/失败。
- 回测期间未声明的网络请求一律失败（禁止静默透传）。
- MVP 布局白名单：仅 `list-page`；区块类型：`pageHeader` | `searchForm` | `table` | `pagination` | `dialog`。
- 仅声明式动作：`search` | `reset` | `pageChange` | `openDialog` | `exportUrl`。
- 截图门槛：`pixelmatch` 的 `threshold: 0.1`；应用 mask 后若 `diffPixels / totalPixels > 0.02` 则失败。

## Pull Request 规范

- 标题：`[sokai] <summary>` 或 `[<package-name>] <summary>`
- 声称完成前：对改动包跑相关的 `pnpm --filter … test` / typecheck。
- 除非有意为之，不要夹带无关的 `apps/yy-modules` submodule 指针变更。
- 优先小 PR：单个包，或录制 / Schema / 回测闭环中的一条垂直切片。

## 安全

- Registry 与 `@jd/*` 包可能需要公司内网 `.npmrc` / 鉴权；**永远不要**提交凭证。
- 录制网络 fixtures 默认脱敏 token / cookie。
- 将录制的 HAR / body 视为敏感数据；fixtures 尽量精简且已脱敏。

## 排错提示

- 排查安装异常前，先确认 Node 为 24.20.0、pnpm 为 11.23.0。
- 若 `@jd/*` 安装失败，可从 yy-modules 的 `.npmrc` 复制/链接私有源鉴权仅供本地使用 — 不要提交密钥。
- Workspace 范围仅为 `packages/*`；在 `apps/` 下新建目录**不会**被 sokai 根目录的 `pnpm -r` 收录。
- 产品行为有疑问时，先读 `docs/superpowers/specs/`，不要自行发明 API。
- `CLAUDE.md` 仅指向本文件（`@AGENTS.md`）。
