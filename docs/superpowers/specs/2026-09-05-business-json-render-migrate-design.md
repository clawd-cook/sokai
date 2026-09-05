# Sokai 业务仓 json-render 迁页与回测 设计规格

日期：2026-09-05  
状态：draft（待实现计划）  
试点页：`apps/yy-modules/apps/marketing/src/views/coupon/composePool/list`（合成池管理列表）  
相关：`docs/superpowers/specs/2026-09-05-record-schema-backtest-design.md`（录制 / SessionBundle 契约仍适用；本规格改变「真身」与回测宿主）

## 1. 背景与目标

Sokai（溯洄）第一期闭环把页面录成 SessionBundle，并在 Sokai 侧做 Schema 预览。本子项目把**可回测的真页面**迁到业务工程内：

1. 录制仍用 Playwright/CDP → SessionBundle（不用 rrweb）  
2. 用户提供业务源码；**IDE Agent**（非 CLI 自动改码）分析源码，将 UI 与逻辑拆开  
3. UI 配置化（json-render 风格 Spec）；业务逻辑经**稳定标识符**注册后调用  
4. 二开 Vue 渲染器以 **npm 相对路径（`file:`）** 装入业务工程，**tsdown** 打包  
5. 老列表页改为 json + render；复用现有 hook/API；再对**业务应用 URL** 回测  

**成功标准（试点）：** 合成池列表由 Spec + renderer 渲染；`useComposePoolListPage` 等逻辑经 handlers 复用且无大改；最小行为剧本在业务路由上回测通过（结构 + 行为）。观感/像素相似度不作硬门槛。

## 2. 范围

### 2.1 In scope

- 新包 `@sokai/vue-renderer`：二开 json-render Vue 渲染器 + 试点 catalog；tsdown 产出 `dist/`  
- 业务仓（试点 marketing）`file:` 依赖该包  
- IDE Agent 迁页技能（`.agents/skills/…`）：源码 → `page.spec.json` + `handlers.ts` + 薄壳 `index.vue`  
- `@sokai/backtest` / CLI：目标改为业务应用已启动的页面 URL（不再以 `@sokai/runtime` 为宿主）  
- 试点仅合成池**列表页**；黑名单 Dialog 本轮可仍为现有 Vue 组件，由 handler 打开  

### 2.2 Out of scope

- `@sokai/runtime` 作为本路径的渲染或回测宿主（本路径不依赖、不扩展；既有包可保留但非组成部分）  
- rrweb 录制或回放  
- CLI 自动改业务源码（`sokai migrate` 一类）  
- Dialog / 子组件配置化、整仓批量迁页  
- Chrome 扩展、可视化点选编辑、对话改配置  
- 发布私有 npm registry 版渲染器（试点只用相对路径）  

### 2.3 与既有「录制 → Schema → runtime」规格的关系

| 产物 | 本路径角色 |
|---|---|
| SessionBundle | **对照 + 回测剧本**（actions / network）；**不**作为生成 Spec 的主输入 |
| PageSchema / `@sokai/schema` | 非本路径必经；不强迫与 Spec 一一映射 |
| `@sokai/runtime` | **非本路径组成部分** |
| `@sokai/vue-renderer` | 业务仓真身渲染 |
| `@sokai/backtest` | 打业务 URL |

录制实现与 SessionBundle 目录契约继续遵循既有 record 规格；本规格不引入 rrweb。

## 3. 架构

```text
真实页 --record(CDP)--> SessionBundle ──对照/剧本──┐
用户给出源码 ──IDE Agent──┤──► 业务页(spec + handlers + 薄壳)
                          │
packages/vue-renderer ──tsdown──file:──┘──► yy-modules / marketing
packages/backtest + cli ─────────────────► Playwright → 业务路由 URL
```

| 包 / 位置 | 职责 |
|---|---|
| `@sokai/vue-renderer` | 二开 json-render Vue 渲染器、试点 catalog、`defineHandlers`、测试钩子约定；tsdown → `dist/` |
| 业务页 `composePool/list/` | `page.spec.json` + `handlers.ts` + 薄壳 `index.vue`；hook/interface **尽量不动** |
| `.agents/skills/…`（Sokai） | 迁页技能与装包指引 |
| `@sokai/backtest` / `@sokai/cli` | `--target-url` 指向业务页；消费 SessionBundle 动作 |
| `@sokai/record` / `@sokai/session` | 既有录制与契约；无 rrweb |

## 4. 包与装包约定（`@sokai/vue-renderer`）

- 路径：`packages/vue-renderer`  
- 构建：**tsdown**，产出 ESM + 类型声明到 `dist/`  
- `package.json` 的 `exports` / `main` / `types` 指向 `dist`；业务仓依赖**构建产物**，不直接消费未编译 `src`  
- **peerDependencies**：`vue` 以及试点所需的 `@jd/jdesign-vue` / `@jd/jdesign-vue-pro`（版本由业务仓解析）；不打进 bundle  
- 业务仓依赖示例：`"@sokai/vue-renderer": "file:<相对路径到 packages/vue-renderer>"`（具体深度以实现时仓库布局为准）  
- Catalog：覆盖合成池列表所需类型（如 SearchForm、Table、Pagination、Button、Link、Page/布局根）；未知类型 → 占位 + 告警，不整页崩溃  
- 测试钩子：稳定 `data-sokai-action`（或与 role+name 一致的约定），与 handler / Spec 动作 id 对齐，供 backtest 定位；**不**依赖业务内部 class  

## 5. 迁页产物与数据流

### 5.1 试点目录形态

```text
composePool/list/
  index.vue                 # 薄壳：挂 Renderer + handlers + 测试钩子
  page.spec.json            # UI Spec（json-render 风格）
  handlers.ts               # 标识符 → 现有逻辑
  hooks/useComposePoolListPage.ts   # 尽量不动
  interface.ts                      # 尽量不动
../components/ComposePoolBlacklistUploadDialog.vue  # 本轮仍 Vue
```

### 5.2 handlers

- 注册稳定标识符，例如：`loadRecords`、`handleSearch`、`handleReset`、`onPaginationCurrentChange`、`onPaginationSizeChange`、`handleExport`、`openBlacklistUploadDialog`  
- Spec 中动作只引用标识符，不内联业务代码  
- 策略：**尽量不动**现有 composable / API / store；仅抽注册表与薄壳  

### 5.3 Agent 流程（IDE）

1. 用户提供列表页源码路径 +（可选）SessionBundle  
2. Agent **以源码为主**拆模板 vs 可注册逻辑；SessionBundle 仅对照与后续回测  
3. 写出 `page.spec.json`、`handlers.ts`，收束 `index.vue`  
4. 确认业务仓已 `file:` 依赖且 renderer 已 tsdown 构建  
5. 启动 marketing → 回测打该路由  

不提供「CLI 一键改业务仓」作为本轮交付。

### 5.4 行为等价（迁完后）

挂载拉数、搜索/重置、翻页与改 pageSize、导出、点「更新」打开黑名单 Dialog、成功后刷新列表——与迁前列表页一致。

## 6. 回测

1. 业务仓已安装并构建 `@sokai/vue-renderer`，列表页已迁移  
2. 本地启动 marketing（登录态可复用本机 Chrome profile；细节在实现计划中定）  
3. `sokai backtest --target-url <业务页URL> --session <bundle>`（具体 flag 名以实现计划为准）  
4. 按 `actions.jsonl` 重放（可过滤无意义 hover/scroll）  
5. 每步检查：可定位、动作成功、关键结构节点仍在  
6. 网络：试点优先跟业务真实请求（live / 半 live）；是否复用 bundle mock 为可选增强，不阻塞试点  
7. 输出 `BacktestReport`；**不**自动改 Spec——改配置后重跑  

**试点最小剧本：** 进入页 → 搜索 → 翻页 → 点「更新」打开 Dialog → 关闭。

## 7. 错误处理

| 阶段 | 策略 |
|---|---|
| 迁页（Agent） | Spec 缺搜索区 / 表格 / 分页 → 迁移未完成，不得宣称可回测 |
| 装包 / 构建 | `file:` 解析失败、peer 不齐、tsdown 失败 → 构建失败并明示 |
| Catalog | 未知节点类型 → 占位 + 告警 |
| 回测 | 单步失败默认继续后续步骤；`--fail-fast` 可选；报告写清定位与差异 |

## 8. 测试策略

- `@sokai/vue-renderer`：Vitest — catalog 渲染出可查询动作点；未知类型占位；handlers 注册调用  
- `@sokai/backtest`：在假页面或 fixture URL 上验证「外部 target-url」驱动路径（不依赖 runtime）  
- CLI：`--target-url` 参数与报告落盘  
- 试点 E2E：合成池列表迁后 + SessionBundle 最小剧本（可 mock 登录/网络，细节计划中定）  
- 迁页技能本身：以检查清单 / 示例补丁验证，不作脆弱的全自动 codegen 单测硬门槛  

## 9. 决策记录

| 决策 | 选择 |
|---|---|
| 真身与回测宿主 | 业务仓应用 URL |
| 逻辑复用 | handlers 标识符注册；尽量不改业务函数本体 |
| Spec 生成依据 | 源码为主；SessionBundle 对照 + 回测剧本 |
| 试点范围 | 合成池列表单页；Dialog 暂留 Vue |
| 迁页驱动 | IDE Agent + `.agents` 技能；Sokai 提供包与回测 |
| 渲染器交付 | `file:` 相对路径 + **tsdown** 打包 |
| 录制 | 维持 Playwright/CDP；不用 rrweb |
| `@sokai/runtime` | 本路径不需要、不扩展 |

## 10. 试点重做约定

合成池列表首轮迁页验证通过后，若需回退业务仓并重做，**不改变**本规格的架构与成功标准，仅收紧协作与干净落地：

- 细则见 `docs/superpowers/specs/2026-09-05-compose-pool-migrate-redo-design.md`  
- 执行以 `.agents/skills/sokai-migrate-page` 为准：清单硬门禁 → 分文件审批；业务页禁止直连 `@json-render/vue`；禁止无清单的整页重写式 bound registry  

## 11. 后续（本规格不实现）

1. Dialog / 复杂子树配置化  
2. rrweb 作为可选对照层  
3. 私有源发布 `@sokai/vue-renderer`  
4. CLI 辅助迁页或校验-only 命令  
5. 可视化 / 对话改 Spec  
6. 批量页面迁移  
