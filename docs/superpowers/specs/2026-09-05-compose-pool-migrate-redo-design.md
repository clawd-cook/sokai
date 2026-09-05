# 合成池列表迁页重做 — 协作与干净标准

日期：2026-09-05  
状态：draft（待实现计划）  
试点页：`apps/yy-modules/apps/marketing/src/views/coupon/composePool/list`  
父规格：`docs/superpowers/specs/2026-09-05-business-json-render-migrate-design.md`（架构不变）  
执行载体：`.agents/skills/sokai-migrate-page/SKILL.md`（主改）

## 1. 背景与目标

合成池列表已用 Spec + handlers 验证过流程，但产物偏糙（整页式 `bound-registry`、业务页直连 `@json-render/vue` 等）。本规格**不重画**「录制 → 源码迁 Spec → 业务 URL 回测」骨架，只约定：

1. 先把 `apps/yy-modules` 回退到 `origin/master`（丢掉试点迁页 commit）  
2. 与用户细粒度协作重做该页  
3. 把清单门禁与干净标准写进迁页技能，避免下一轮再滑回去  

**成功标准：** 回退后按门禁完成合成池列表迁页；页面只依赖 `@sokai/vue-renderer`；Spec / handlers / 薄壳（及可选薄 bound registry）经用户分步审批；行为与迁前一致。

## 2. 范围

### 2.1 In scope

- 回退 `apps/yy-modules` 至 `origin/master`（仅该 submodule 的迁页相关改动）  
- 更新 `sokai-migrate-page`：清单硬门禁、D 标准、反模式、分文件审批  
- migrate 父规格增加「试点重做约定」短节，指向本规格与技能  
- 按更新后的技能与用户共同重做合成池列表  

### 2.2 Out of scope

- 重画录制 / Schema / 回测架构  
- Dialog 或子树配置化  
- CLI 自动改业务仓  
- 批量迁页  
- 改动 `useComposePoolListPage` / `interface.ts` 业务主体（除非清单缺口强制且用户批准）  

## 3. 协作节奏

每步须用户明确同意后再进入下一步：

| 步 | 内容 | 产出 |
|---|---|---|
| 0 | 回退 yy-modules → `origin/master` | 干净业务源码 |
| 1 | **清单门禁**（只读源码；不写业务文件） | 区域 / 动作 / keep-as-Vue / hook 映射 / 缺口表 |
| 2 | 装包就绪 | `@sokai/vue-renderer` 已 build；marketing `file:` + Vite `fs.allow` |
| 3 | `page.spec.json` | 用户审 |
| 4 | `handlers.ts` | 用户审 |
| 5 | 薄 `bound-registry.ts`（若 v1 catalog 仍需绑 refs） | 用户审 |
| 6 | 薄壳 `index.vue` | 用户审 |
| 7 | 行为核对；有 SessionBundle 再业务 URL 回测 | 验收 |

## 4. 清单字段（Step 1）

| 列 | 含义 |
|---|---|
| region | UI 区块；id 必须来自 `PILOT_REGION_IDS`（标题可无 region） |
| keep-as-Vue | 本轮不进 Spec（如黑名单 Dialog） |
| action id | 必须来自 `PILOT_ACTION_IDS` |
| hook / 本地函数 | 调用点；不重写逻辑 |
| `data-sokai-*` | 与 region / action id 一致 |
| 缺口 | 源码有、试点常量没有的能力（如 `onPaginationSizeChange`）；先约定接法再写文件 |

SessionBundle（若有）只对照区域/动作是否出现，**不**作为 Spec 主输入。

## 5. 干净标准（D）与反模式

### 5.1 必须满足

1. **边界：** Spec 只管结构、regionId、actionId、标题文案；业务只在 hook + 薄 handlers  
2. **装包：** 业务页只 import `@sokai/vue-renderer`（及 `/jdesign`）；禁止 `@json-render/vue`  
3. **清单质量：** 写任何迁页文件前清单已获用户批准；落地严格按清单  

### 5.2 反模式

| 禁止 | 要求 |
|---|---|
| 业务页直接 `@json-render/vue` | 只走 `@sokai/vue-renderer` |
| 自造 action / region id | 缺 id 先改清单或包内常量，再写 Spec |
| Spec 内嵌业务字段 / 列模型 / 查询逻辑 | v1 Spec 保持 hook/region 级 |
| 无清单的整页重写式胶水 | 允许**薄** page-local bound registry：按区域绑 hook refs，只绑不复制业务；禁止再出现「第二套完整模板」式大文件 |
| 擅自改 hook 主体 | 逻辑复用优先 |

说明：v1 catalog 仍可能需要 bound registry 才能绑 `query` / `tables` / 分页；「少胶水」指瘦身与清单驱动，不是假装零胶水。

## 6. 目标产物

```text
composePool/list/
  index.vue                 # 薄壳
  page.spec.json
  handlers.ts               # defineHandlers
  bound-registry.ts         # 可选；薄、按区域
  hooks/…  interface.ts     # 不动
```

marketing：`file:` 依赖 + Vite 允许 sokai `packages/`。

## 7. 验收

- **行为：** 挂载拉数、搜索/重置、翻页、改 pageSize（按清单约定）、导出、点「更新」开 Dialog、成功后刷新 — 与迁前一致  
- **结构：** `data-sokai-region` / `data-sokai-action` 与清单一致  
- **回测：** 有 SessionBundle 且应用可启动时打业务 URL 最小剧本；无 bundle 不阻塞「清单 + 手动点验」闭环；失败不自动改 Spec  

## 8. 文档与实现顺序

1. 本规格 + 父规格「试点重做约定」短节（本文）  
2. 实现计划（writing-plans）：改技能 → 回退 → 按门禁迁页  
3. 主改技能 `sokai-migrate-page`；父规格只交叉引用，不重写架构章节  

## 9. 决策记录

| 决策 | 选择 |
|---|---|
| 相对父规格 | 流程骨架不变（方案 A） |
| 协作粒度 | 先清单，再按文件审（方案 C） |
| 干净标准 | 边界 + vue-renderer + 清单质量全要（方案 D） |
| 落地方式 | 技能优先；规格只锁约定（方案 2） |
| yy-modules | 先回退 `origin/master` 再重做 |
| sokai 包 | 回退时不动；装包步再接线 |
