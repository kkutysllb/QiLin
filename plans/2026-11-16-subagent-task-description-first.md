---
description: "上游 rc.2 §3.2-5 的 UI 吸收：子代理行与拓扑图节点改「任务描述优先」，保留逐层展开与读取失败重试；并裁决描述取持久 session/title、不新增 catalog 字段、不升会话格式。"
kind: "plan"
---

# 子代理浏览：任务描述优先（rc.2 §3.2-5 的 UI 吸收）

- 日期：2026-11-16
- 基线：3.1.12-rc.3 之后的工作树（含会话页头两枚徽章移除）

## 1. 背景与吸收前状态

上游 dsh 0.2.2-rc.2 体验优化第 5 条：「多层子代理浏览与任务协调、按任务描述优先、逐层展开、读取失败重试」。

本仓吸收前状态有两处记录：[delta 分析](2026-11-12-upstream-0.2.2-rc.2-delta-analysis.md) 把它记为「未吸收（B6）」（§3.2-5，第 54 行），并把 `client/ui-subagent` 的 +1,950/−430 churn 标为「专（B6）」（第 234 行）；[alignment 计划](2026-11-12-upstream-0.2.2-rc.2-alignment.md) 的 B6 执行清单（第 95–111 行）与状态表（第 184 行）虽然写「完成」，完成的是数据面与格式——中断默认关闭、包迁移、命名域 + catalog v3、模型面按名寻址、会话格式 v7——不含这条 UI。

现状核对：多层浏览、逐层展开、读取失败重试在吸收前已经存在（来源是早前 0.1.7 对齐与自研 Agent Teams），缺的是「描述优先」的展示层；任务板也缺紧凑列表里的描述。

## 2. 决策

- **D1 立即吸收 UI 部分，不等数据面。** 展示层可以先消费既有持久事实，避免把一次 UI 改进绑在会话格式变更上。
- **D2 描述的来源是既有持久 `session/title`，不新增字段。** `session/title` 是 log-only、最新覆盖的持久事件；每个会话（含子代理）收到首条用户消息都会写一条确定性回退标题（[session-title/src/index.ts:558-582](../packages/session/session-title/src/index.ts#L558-L582)，回退实现在 [:861-873](../packages/session/session-title/src/index.ts#L861-L873)）；LLM 生成标题仅根会话路由（[:565-570](../packages/session/session-title/src/index.ts#L565-L570)），子会话用确定性回退，因此派发不额外产生模型调用。浏览器侧本来就把子会话标题并入摘要：`SessionSummary.title` 由 catalog 子项与 scope 子会话的 `projectionValues.title` 派生（[session-controller service.ts:650-690](../packages/api/session-controller/src/client/sessions/service.ts#L650-L690)）。结论：**无需 catalog 新负载、无需会话格式继任、无需夹具换代**。
- **D3 名称不移除，降到次行。** 描述回答「这个子代理在做什么」，名称回答「是哪个 agent」；两者都需要。行主行=描述（带 `title` 悬停全文），次行=`名称 · 模式 · 活动`；图卡的可访问名同样携带名称与模式。描述缺失时才回退为「名称打头」。
- **D4 不做 `subagent/catalog` v4 / 会话格式继任。** 只有产品需要「完整任务指令」（不限长的原始派发文本）而非标题摘要时才值得做：那要新增负载版本、写确认文档、升 `SESSION_FORMAT_VERSION`、加继任包并换代夹具（B6.5 的先例）。当前收益不足，明确不开工；如需重开，按格式变更流程单独立项。

## 3. 落地清单

| 面 | 变更 | 文件 |
|---|---|---|
| 会话页头子代理切换器 | 主行取子会话持久标题，次行 `名称 · 模式 · 活动`；`aria-label` 同步；主行 `title` 提示 | [`SubagentHeaderLineage.tsx`](../packages/client/ui-subagent/src/client/SubagentHeaderLineage.tsx) |
| 右侧边栏「任务与子代理」列表 | 行模型新增 `description`（由会话标题注入），行主行=描述、次行=`名称 · 模式`；缩进层级不变 | [`rows.ts`](../packages/client/ui-sidebar-tasks/src/client/rows.ts)、[`TasksBody.tsx`](../packages/client/ui-sidebar-tasks/src/client/TasksBody.tsx) |
| 侧栏拓扑图 | 卡片标题取描述（24 字省略），可访问名保留 `名称 · 模式`，`<title>` 悬停全文 | [`tasks-graph-model.ts`](../packages/client/ui-sidebar-tasks/src/client/tasks-graph-model.ts)、`TasksBody.tsx` |
| Team 页「协作任务」紧凑行 | 主题下加一行描述（单行省略 + tooltip），无描述不渲染该行 | [`TeamBody.tsx`](../packages/client/ui-agent-team/src/client/TeamBody.tsx)、`TeamBody.module.css` |
| 逐层展开 / 重试 | **保持不变**：`expanded` 集合 + 展开时懒读该层、每层 error 重试、侧栏失败重试与图占位卡补读 | 同上 |

三份双语 README 的「使用」段与「已知限制」同步了描述来源与边界。

## 4. 验证

| 检查 | 命令 | 结果 |
|---|---|---|
| 改动包聚焦测试 | `vitest run packages/client/ui-subagent packages/client/ui-sidebar-tasks packages/client/ui-agent-team` | 25 文件 / 331 用例通过 |
| GUI 全量单测 | `pnpm run test:gui` | 724 文件 / 10929 通过 / 1 跳过 |
| 覆盖（过滤单跑） | `vitest run --coverage <三个包>` | ui-agent-team、ui-sidebar-tasks 全包 100%；改动文件 100%（ui-subagent 仅入口 `src/client/index.ts` 因未跑全量而低，非本次改动） |
| 类型与静态检查 | `typecheck:contracts-ready` / `oxlint` / `verify-client-ui-i18n` / `verify-client-catalog` | 全绿 |
| 双语配对 | `verify-translation-pairing` | 1205 对一致 |
| 快照 | `snapshots/web/subagent-conversation/tree.expected.md` | 按 aria 组装规则更新为「描述 名称 · 模式 · 活动」顺序（见 §5） |

## 5. 遗留与风险

- **描述是标题摘要，不是完整指令**：确定性回退取首条任务消息的 5 词 / ≤40 字节，标题上限 80 字节（[bundle/base/cordis.patch.yml:60-65](../packages/bundle/base/cordis.patch.yml#L60-L65)）。列表能扫读，完整指令点开子会话即可看到；需要不限长指令时按 D4 重开。
- **标题到达前的短暂窗口**：子项在该窗口内回落为 catalog 名称，不显示空行。
- **本机 web 验证受限**：web e2e 与 snapshot lane 在本机受既有漂移影响跑不绿（页头插件管理 `Agent Teams` 开关、侧栏 `Other` 分组、设置弹窗关闭控件改名），本批 golden 只能按既有 aria 组装规则手改；待 lane 修复后应复跑 `snapshots/web/subagent-conversation` 与相关状态。
