# Sokai 录制 → Schema → 回测 设计规格

日期：2026-09-05  
状态：draft（待实现计划）  
试点页：`apps/yy-modules/apps/marketing/src/views/coupon/composePool/list`（合成池管理列表）

## 1. 背景与目标

Sokai（溯洄）要把真实前端页变成可渲染、可回测的配置，再支撑后续可视化/对话编辑。完整愿景见 `docs/灵感.md`。

本规格只覆盖第一子项目闭环：

1. 录制页面操作与环境信号  
2. 生成页面 Schema  
3. 在 Sokai 运行时中渲染  
4. Agent/自动化按录制步骤重放并对比  

**成功标准（试点）：结构 + 关键行为过关。** Schema 能表达搜索区 / 表 / 分页 / 弹窗；回测能重放关键路径。观感/像素相似度不作硬门槛。

## 2. 范围

### 2.1 In scope

- Playwright/CDP 采集 → SessionBundle  
- 规则骨架 + 模型补语义 → PageSchema  
- Schema 运行时预览（自有组件映射，非业务仓库源码）  
- 默认 mock 网络的回测 + 对比报告；可选 `--live` 联机抽检  
- `packages/` 下的管线包与 CLI  

### 2.2 Out of scope（明确后置）

- Chrome 扩展入口（协议预留，实现后置）  
- 可视化点选编辑、对话改配置  
- 生成 `yy-modules` / Vue 业务源码  
- 修改 `apps/yy-modules`  
- 截图像素相似度硬门槛  

### 2.3 非目标用户流程

本轮不交付「安装浏览器插件即用」；开发者通过 Sokai CLI 驱动本机 Chrome 完成录制与回测。

## 3. 架构

```text
真实页(合成池) --record--> SessionBundle
SessionBundle --schema--> PageSchema
PageSchema --runtime--> 预览页
SessionBundle + PageSchema --backtest--> BacktestReport
```

| 包 | 职责 |
|---|---|
| `@sokai/session` | 会话包契约与读写 |
| `@sokai/record` | Playwright/CDP 采集 |
| `@sokai/schema` | 规则 + 模型 → PageSchema |
| `@sokai/runtime` | Schema → 可交互预览 |
| `@sokai/backtest` | 步骤重放、mock/live、报告 |
| `@sokai/cli` | `record / schema / preview / backtest` |

约束：

- 产品代码只放 `packages/`  
- Schema 使用 Sokai 自有 JSON；可借鉴 `json-render` 思路，通过 adapter 映射，第一版不绑死外部库 API  
- 扩展与 codegen 只消费既有契约，不重写内核  

## 4. 数据契约

所有顶层产物带 `schemaVersion`；破坏性变更才 bump。

### 4.1 SessionBundle

目录或 zip，至少包含：

| 路径 | 内容 |
|---|---|
| `meta.json` | url、viewport、起止时间、试点标签（如 `compose-pool-list`） |
| `keyframes/` | 关键时刻截图 |
| `dom/` | 与关键帧对齐的简化 DOM / 无障碍树（去脚本、限深；保留角色、可见文本、表单名、稳定属性） |
| `network.jsonl` | 方法、URL、状态码、请求/响应体（可截断）、时序 |
| `actions.jsonl` | 用户动作（click / fill / select / scroll 等）+ 目标定位提示 + 时间戳 |
| `index.json` | 关键帧 ↔ DOM ↔ 动作区间关联 |

**定位优先级：** `role+name` / label → 稳定属性 → CSS 路径。不依赖业务内部 class。

**脱敏：** 默认剥离或哈希 cookie、authorization、token 等敏感字段；未脱敏包禁止提交。

### 4.2 PageSchema

表达可渲染、可操作的页面结构（非像素稿）：

- 页面：`id`、标题、布局根  
- 节点：`type`（如 `SearchForm` / `Table` / `Pagination` / `Dialog` / `Button` / `Field`）+ `props` + `children`  
- 绑定：字段名、列定义、分页状态键  
- 动作点：稳定 id，与回测步骤对齐  
- `dataSources`：逻辑接口名 → 录制网络条目映射  
- `provenance`：规则 vs 模型来源标记  

**合成池最小形状：** 标题 → 搜索表单 → 表格（含导出/更新操作列）→ 分页 → 黑名单更新 Dialog。

### 4.3 BacktestReport

步骤结果列表：定位是否成功、动作是否完成、关键 DOM/网络断言是否通过；附差异摘要。无像素硬门槛。

## 5. 流程

### 5.1 Record

1. CLI 用 Playwright 打开本机 Chrome（可复用用户 profile / 已登录态，实现计划中细化）  
2. 用户手动操作合成池列表；采集 actions、关键帧+DOM、网络  
3. 结束录制 → 落盘 SessionBundle  
4. 关键帧触发：导航完成、网络空闲、显式动作后、弹窗 open/close  

### 5.2 Schema

1. **规则遍：** 从 DOM 识别区域骨架（search / table / pagination / dialog）与可见控件  
2. **模型遍：** 骨架 + 关键帧图 + 精简 DOM 文本 → 补字段语义、列名、操作意图；不得推翻规则已钉死的结构 id  
3. 写出 PageSchema 与 `dataSources` 映射  
4. 校验：可被 runtime 加载；缺关键区则失败并标明原因  

### 5.3 Runtime

1. 渲染预览页（视觉可简化）  
2. 默认挂 mock（按 `dataSources` 回放）  
3. 暴露与 Schema 动作点 id 一致的测试钩子  

### 5.4 Backtest

1. 启动 runtime（默认 mock）  
2. 按 `actions.jsonl` 逐步执行（可过滤无意义 hover/scroll）  
3. 每步检查：可定位、动作成功、约定网络触发、关键结构节点仍在  
4. 输出 BacktestReport；**不自动改 Schema**——改配置后重跑  
5. `--live`：跳过 mock 打真接口（可选，默认关）  

**试点最小剧本：** 进入页 → 搜索 → 翻页 → 点「更新」打开弹窗 → 关闭。

## 6. 错误处理

| 阶段 | 策略 |
|---|---|
| Record | 单条网络/DOM 采样失败 → warning，不中断；结束时缺 `actions` 或 `meta` → bundle 无效 |
| Schema | 规则找不到搜索区或表格 → hard fail；模型超时/坏 JSON → 保留规则骨架并标 `partial`，回测可跑但报告降级 |
| Runtime | 未知节点类型 → 占位 + 告警，不整页崩溃 |
| Backtest | 单步定位失败 → 该步 fail，默认继续后续步骤；`--fail-fast` 可选；mock 未命中 → fail 并写出请求指纹 |

## 7. 测试策略

优先 Vitest：

- `@sokai/session`：读写与版本校验  
- `@sokai/schema`：合成池风格 fixture DOM → 骨架稳定；模型层用假 LLM  
- `@sokai/runtime`：Schema fixture 渲染出可查询动作点  
- `@sokai/backtest`：runtime + mock 跑最小剧本，断言报告步骤  
- E2E：脱敏 fixture SessionBundle（不依赖每次连真页）；连合成池真页的 record 为手工/可选集成  

## 8. 后续子项目（本规格不实现）

1. Chrome 扩展作为同等采集前端  
2. 可视化点选编辑同步改 Schema  
3. 对话改配置并热更新预览  
4. 可选：Schema → Vue/JdDesign 代码生成  

## 9. 决策记录

| 决策 | 选择 |
|---|---|
| 第一切片 | 录制 → Schema → 回测 |
| 试点 | 合成池管理列表 |
| 成功标准 | 结构 + 行为（非像素） |
| 产物 | 运行时预览先于 codegen |
| 录制入口 | 先 Playwright/CDP；扩展后置 |
| Schema 生成 | 规则骨架 + 模型补语义 |
| 网络 | 默认 mock；可选 live |
| 包结构 | 管线分包（非单体） |
