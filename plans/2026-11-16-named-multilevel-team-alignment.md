---
description: "上游 rc.2 §3.1-2 的对账与裁决：具名多层子代理与共享成员/任务板已完成（B6）；跨层按名寻址与会话级 Team 开关两处偏离保留，并记录完全对齐的代价。"
kind: "plan"
---

# 具名多层子代理与 AgentTeam：§3.1-2 的对账与口径

- 日期：2026-11-16
- 上游条目：dsh 0.2.2-rc.2 新增功能第 2 条「SubAgent 支持具名与多层协作，AgentTeam 可按会话开启，共用成员与任务面板」
- 关联记录：[描述优先的 UI 吸收](2026-11-16-subagent-task-description-first.md)、[补丁重放批次](2026-11-12-upstream-0.2.2-rc.2-alignment.md)

## 1. 吸收轨迹

[delta 分析](2026-11-12-upstream-0.2.2-rc.2-delta-analysis.md) 第 46 行把这条记为「未吸收（B6，L）」。B6 批次随后吸收其数据面与格式部分：[alignment 计划](2026-11-12-upstream-0.2.2-rc.2-alignment.md) 的 B6.1–B6.5（第 95–111 行）与状态表（第 184 行）包含中断默认关闭、包迁移（四包入 `packages/team` 与 `packages/client`）、命名域 + catalog v3、模型面命名与按名寻址、会话格式 v7。UI 与展示层的跟进见关联记录。本条记录剩余两处偏离为何保留。

## 2. 逐句对账（可复核的事实）

| 发布说明分句 | 状态 | 证据 |
|---|---|---|
| SubAgent 具名 | 已实现 | `subagent` / `subagent_fork` 暴露可选 `name`（1–32 位小写字母、数字、连字符，首位字母，`lead` 保留）——[tool-subagent/src/index.ts:249-251](../packages/subagent/tool-subagent/src/index.ts#L249-L251)、[:358](../packages/subagent/tool-subagent/src/index.ts#L358)；规则与根名见 [names.ts:12-23](../packages/subagent/subagent/src/names.ts#L12-L23)，兄弟占名见 [:65](../packages/subagent/subagent/src/names.ts#L65)；名称随 catalog v3 持久化——[catalog.ts:25](../packages/subagent/subagent/src/catalog.ts#L25)、事件联合 [:37-42](../packages/subagent/subagent/src/catalog.ts#L37-L42)；`list_agents` 子行携带 `name`/`path`——[list-agents.ts:33-45](../packages/subagent/tool-subagent-control/src/list-agents.ts#L33-L45) |
| 多层协作 | 已实现 | 委派深度按父会话单调推进，只有显式 `maxDepth` 才拦截（[child-agent.ts:50-58](../packages/subagent/subagent/src/child-agent.ts#L50-L58)；bundle 与 preset 均未配置 `maxDepth`）；`listDescendants` 递归读取可到的父子 catalog 并给出 `depth`/`path`（[index.ts:535-558](../packages/subagent/subagent/src/index.ts#L535-L558)）；浏览器侧逐层展开见关联记录 |
| AgentTeam 按会话开启 | 未对齐（有意） | Team 由组合（安装级 profile）启用：插件管理页开关写入 profile bundles、重启生效（[locales.ts:47-48](../packages/client/ui-plugin-manager/src/client/locales.ts#L47-L48)、[AgentTeamSwitch.tsx](../packages/client/ui-plugin-manager/src/client/AgentTeamSwitch.tsx)）。`team/mode` 是按会话持久的事实，但生产写入方只有「首次团队写入记 `{mode:'on', source:'composition'}`」（[journal.ts:71](../packages/team/agent-team/src/journal.ts#L71)），没有 `off` 写入方，也没有会话内开关；裁决见 [alignment D14:27](2026-11-12-upstream-0.2.2-rc.2-alignment.md#L27) |
| 共用成员与任务面板 | 已实现 | 每个 Lead 会话的 `agentTeam` 投影携带 members 与 tasks（[types.ts:115-126](../packages/team/agent-team/src/types.ts#L115-L126)）；Team 页绘制编队图、名册与共享任务板；模型面提供 `spawn_teammate`、`send_message`、`list_agents`、`wait_agent`、`interrupt_agent`、`team_task_create/list/get/update`（[tool-agent-team/src/index.ts:226-421](../packages/team/tool-agent-team/src/index.ts#L226-L421)） |

## 3. 决策

- **D1 具名与多层协作按现状收口，不重开。** 命名域、兄弟唯一、catalog v3、深度推进与多层浏览都已落地，缺口只在「按名寻址的作用域」。
- **D2 跨层按名寻址不做，保留邻接授权模型。** `resolveName` 只在调用者的直接子级 catalog 中匹配名称，其他单 token 按 Session id 透传，斜杠路径抛 `AGENT_NAME_NOT_FOUND`（[index.ts:522-537](../packages/subagent/subagent/src/index.ts#L522-L537)）。原因是授权模型是直接父/子邻接：路径解析不授予权限，但引入整树路径会迫使消息、中断与名单三处同时重述授权边界（[alignment:105](2026-11-12-upstream-0.2.2-rc.2-alignment.md#L105)）。跨层寻址的需求以「拿 id」满足。
- **D3 不提供会话级 Team 开关。** 继续组合驱动：装上 `agent-team-profile` 即有 Team 能力，会话在首次团队写入时记为 `on`。理由与 D14 一致——开关的真相在 profile，会话内开关会产生「profile 未装却打开」的不可达状态。
- **D4 `team/mode` 不进入 wire 视图。** `agentTeam` 的发布视图只带 members、tasks 与 failure（[projection.ts:362](../packages/team/agent-team/src/projection.ts#L362)、[:407-413](../packages/team/agent-team/src/projection.ts#L407-L413)），浏览器不据 mode 决定 Team 入口是否显示；入口由 profile 是否挂载决定。若将来做 D3 的反向（会话内开关），wire 视图与 `stateVersion` 必须同批变更。
- **D5 完全对齐上游是两个独立批次，代价分别如下。**
  1. **会话级开关**：新增 `off` 的生产写入方与切换语义（谁有权、切换后既有成员/任务如何处置）、Remote 与写桥、会话内 UI 入口，并给 `agentTeam` wire 视图加 `mode`（投影 `stateVersion` 与 wire schema 变更 → 按持久化格式流程写确认文档、升会话格式代、换代夹具）。
  2. **跨层按名寻址**：`resolveName` 支持 `a/b/c` 与 `lead`，并补「解析不等于授权」的三面测试（消息、中断、名单），同时定义无名历史条目的路径语义。

## 4. 现状边界

- **浏览器不知道某会话是否 Team 开启**：wire 无 `mode`，Team 页在 profile 安装后对每个会话都可打开，空 Team 显示空名册与空任务板。
- **模型只能按直接子级名称寻址**：跨层目标需要用裸 Session id；`list_agents(scope='descendants')` 提供的 `path` 是给人读与检索用的，不能直接作为消息地址。
- **历史目录条目没有名称**：catalog v0–v2 条目无 `name`/`path`，列表与路径回落为 id（[names.ts:38-46](../packages/subagent/subagent/src/names.ts#L38-L46)）。
- **深度无产品级闸门**：未配置 `maxDepth` 时只有模型自身与预算约束委派深度；长链委派的成本由使用方承担。

## 5. 复核方式

| 事实 | 命令 |
|---|---|
| 无 `off` 生产写入方 | `git grep -n "mode: 'off'" -- packages/team packages/api`（除测试与投影初值外应为空） |
| 未配置委派深度上限 | `git grep -n "maxDepth" -- packages/bundle packages/preset packages/team`（应为空） |
| 命名、深度、Team 面测试 | `npx vitest run packages/subagent/subagent packages/subagent/tool-subagent packages/subagent/tool-subagent-control packages/team/agent-team packages/team/tool-agent-team packages/client/ui-agent-team` |

## 6. 遗留

- 若产品需要「在会话里显示 Team 已开启」的只读指示，最小代价是给 wire 视图加 `mode`（投影 `stateVersion` 变更，不含写入方），与 D3 无关。
- 跨层寻址若被真实使用方提出，按 D5-2 立项，不在此处零散补丁式放开。
