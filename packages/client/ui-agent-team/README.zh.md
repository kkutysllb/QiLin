---
description: "使用并驱动实验性 Web Agent Teams roster、共享任务板与 teammate 导航面板，包括通过 Team 写入桥执行的浏览器任务编辑。"
kind: "package-reference"
---

# @qilin-agent/client-ui-agent-team

[English](README.md) | 中文

## 概述

本包向 Web 会话页头添加两个 Agent Teams action：roster popover，以及陈述 agent 编队并打开 Team 标签页的队伍标签。标签页在 roster 与共享任务板上方绘制编队图，从共享 Session store 读取 Lead Session 的 `agentTeam` 投影，并通过 Host 上的 `agentTeams` 写入桥编辑任务：创建、编辑、完成、重新打开、删除与改派以 wire action 发出。普通 child history 导航继续使用稳定的 addressed-subagent 路径。通过实验性 Agent Teams Web profile 选择本包。这个 projection 不扩展稳定 API Proxy、不存储 Team 状态，也不注册面向模型的输入。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

本包提供 Agent Teams 的 Client plugin。当前没有任何已交付 bundle 挂载它；自定义 Web profile 可在稳定 Web bundle 与 Host-side Agent Teams profile 之后挂载 `/client` export。root Host export 不执行行为，本包也没有用户配置字段。

### 读编队

队伍标签位于子代理数量标签之后。它陈述 Team 规模与编队规模——Lead 加上页面能看到的每个被委派后代——并为当前会话在右侧边栏打开本 Team 页。打开标签页本身不发起投影请求，除页面自身的读取；工具栏刷新会重读当前查看会话的投影。

页面以编队图开场。会话家族的每个 agent 各占一张卡片：序号头像、持久标签、活动状态、该 Session 选定的模型与创建模式、累计 token、活跃轮次耗时、已开始的步数，以及按压力着色的上下文占用百分比。这些事实之下是一条堆叠条，把已用部分拆成计量器给出的系统提示词、工具与消息构成，后面留出空闲窗口；画布上方的图例为四段与运行中连线命名。Lead 卡片带主 Agent 标记，当前所在会话带“当前”标记，运行中的卡片显示 ongoing loader。连线从父卡片落到子卡片，取子节点所属分支的颜色，运行中的子节点连线带动画。

卡片的事实来自 Session 列表本身：每个摘要投影（用量、步数总计、耗时、模型、创建模式、邮箱消息）都随行下发，所以没打开过的 agent 也能陈述它们。上下文占用与构成属于 summary-excluded，页面因此为每个绘制出的子节点向 Host 请求它自己的 cell，每次挂载至多十六个，而不是打开该会话。

画布跟随实测的 stage：每次宽度变化都会重新排布，叶节点放不进一行时层级改为分带排列，而不是向两侧溢出。悬停或聚焦卡片会让该 agent、其父与子保持点亮并淡化其余；点击或按 Enter 通过其持久 subagent 地址打开该 agent 的会话。只有 Lead 的编队会说明编队将在 Lead 委派后展开。

图形旁是跨 Agent 协作面板，按时间倒序列出页面持有的持久流量：父节点把标签交给子节点（附子节点的创建模式与步数），以及每个 agent 收到的 peer 消息（附发送方与有界预览，读取收件人的 `agentMessages` 投影）。同一列还把共享任务汇总为只读行——状态点、主题、负责人——可编辑的任务板仍在下方。宽面板上图与时间线并排，窄面板上上下堆叠。

下方任务板与图形共享悬停负责人：悬停卡片会给该 agent 拥有的行着色，悬停行会点亮其负责人的卡片。

### 检查并导航 roster

面板从共享 Session store 展示 Lead Session 的 roster 与任务板。面板保持打开时，任务和成员更新会直接出现。打开面板不发起投影请求。会话或 Session 列表正在加载时，面板显示加载提示；加载结束后仍无 Team 值时，显示不可用提示。

Roster 行展示持久名称与阶段。provisioning 和 running 成员使用共享 ongoing loading，inactive 成员使用人物图标，failed 成员使用 error 红点。实时 Session 状态提供运行活动；共享 `modelSelection` 投影在可用时提供模型。当前会话带有“当前会话”标签且不可选择。在 teammate 会话中选择 Lead 会直接打开 Lead Session。选择 active teammate 会打开其普通 continuable 子会话地址。Host 在打开历史时校验 parent、child 与 mode；后续人类提示词使用同一 addressed-subagent 会话。

### 查看任务板

可开始的 pending 任务使用 idle 灰点，被依赖阻塞的 pending 任务使用 warning 橙点，in-progress 任务使用 ongoing loading，completed 任务使用 done 绿点。

任务板展示任务标识、负责人、依赖、就绪状态、提示性写入范围与重叠警告。分区标题显示成员与任务数量；空任务板显示简短描述，只有一名成员且无任务时采用单列面板。当投影报告某条持久 Team 记录被拒绝时，标签页在最后有效的 roster 与任务上方显示该失败。

### 从浏览器编辑任务

工具栏刷新当前查看会话的投影并打开创建表单。创建与编辑表单接收主题、描述、阻塞任务 id 与提示性写入范围；两个文本都非空之前提交保持禁用，列表中的重复值会折叠为一项。每张任务卡片为 in-progress 任务提供完成、为 completed 任务提供重新打开、两步确认的删除，以及覆盖 active 成员与“未指派”选项的负责人选择器。每个控件都通过 `agentTeams` 桥以 Lead 权限发出一条类型化 wire action，因此 teammate 会话的写入落在 Lead Session 上。

一条写入在途时页面锁定其控件并显示 busy 提示。stale-revision 拒绝会记录冲突提示并刷新任务板，让下一次尝试从已提交的 revision 出发；其他拒绝会记录 wire 诊断。提示会保留到被关闭为止，并且打开的表单会保持在提示旁，让已输入的内容在提交失败后得以保留。切换会话会重置页面状态。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

Client export 通过 Cordis effect 注册 locale dictionary、两个 conversation-header slot 与右侧边栏的 Team 标签页；它为写入桥挂载 `agentTeams` Remote namespace。Dispose plugin fiber 会移除这些 registration 并撤回该 namespace。

队伍标签与编队图只读取常驻的 `useSessions` 与 `useSessionStatus` 座位。`squad-model.ts` 沿 `parentId` 解析家族根，按父节点持久 `subagentCatalog` 顺序收敛后代，并追加 catalog 尚未记录的行，然后从投影值取每个 agent 的标签、模式、运行活动、序号、token、耗时、占用、构成与模型。`squadBarSegments` 把单张卡片的占用拆成上报的构成与空闲余量，`layoutSquad` 计算整齐树：叶节点按深度层各占一槽，父节点居中于其子节点之上；叶节点超过一行容量时改为按层分带。标签用 `ctx.sidebarRight.openTabIn(sessionId, 'agent-team')` 打开标签页，因此不创建自己的页面。`SquadFormation` 测量其 stage，把连线作为 SVG 绘制在绝对定位卡片之后，并上报悬停的负责人名称；`TeamBody` 持有该名称并向下回传，任务行与其卡片因此互相点亮。

面板渲染在会话容器外，并保持在视口范围内。成员卡片在静止、选中和悬停状态下均使用共享 elevation 描边绘制轮廓。悬停触发按钮 150ms 后打开面板；指针离开触发按钮和面板后，经过 120ms 宽限关闭。点击触发按钮会固定面板并将焦点移入其中。点击外部或按 Escape 可关闭面板；仅当焦点原本位于面板内时，Escape 才将焦点返回触发按钮。页头较窄时触发按钮折叠为图标，只响应点击打开。组件从 `useSessions`、`useSessionStatus` 与 `useSession` 座位派生每一行：Lead 身份来自当前 Session 的 subagent address，Team 视图来自 `projectionsBySession[lead].values.agentTeam`，成员活动来自 Session 状态并以列表摘要为后备，model 来自 `projectionsBySession[member].values.modelSelection.next`。每个 roster 行只选择自己的运行状态。唯一的注入回调通过当前与目标 Session 的 id 打开 roster Session。切换会话会关闭面板并清除导航失败。

| 文件 | 职责 |
|---|---|
| [`src/client/mount.ts`](src/client/mount.ts) | locale、标签页、导航、slot 与 Remote namespace registration |
| [`src/client/TeamAction.tsx`](src/client/TeamAction.tsx) | 由投影派生的 roster 与任务板 popover 及面板交互状态 |
| [`src/client/SquadChip.tsx`](src/client/SquadChip.tsx) | 陈述 Team 与编队规模并打开 Team 标签页的页头标签 |
| [`src/client/SquadFormation.tsx`](src/client/SquadFormation.tsx) | 编队图：agent 卡片、分支连线、悬停邻域与卡片导航 |
| [`src/client/squad-model.ts`](src/client/squad-model.ts) | 标签与图形共用的纯家族、计数、布局与格式化算术 |
| [`src/client/TeamBody.tsx`](src/client/TeamBody.tsx) | 右侧边栏 Team 页：roster、任务板、表单、提示与 busy 状态 |
| [`src/client/team-writes.ts`](src/client/team-writes.ts) | `agentTeams` namespace 之上的写入 face，处理冲突与拒绝 |
| [`src/client/team-page-store.ts`](src/client/team-page-store.ts) | 页面 busy 与提示状态 |
| [`src/client/team-model.ts`](src/client/team-model.ts) | 纯 roster、任务板与表单辅助 |
| [`src/client/definition.tsx`](src/client/definition.tsx) | 侧边栏标签页注册与 guide 条目 |
| [`src/client/locales.ts`](src/client/locales.ts) | 中英文 panel 与页面文案 |
| [`src/index.ts`](src/index.ts) | 不执行行为的 Host entry |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [Agent Teams service](../../team/agent-team/README.zh.md)——权威 roster、task 与投影行为。
- [会话 UI](../../client/ui-conversation/README.zh.md)——稳定 header slot 与 addressed-subagent 导航表层。
- [实验性包](../README.zh.md)——孵化状态与发布规则。

-----

<a id="model-experience"></a>
## 模型体验

无直接影响，因为该浏览器 projection 不注册面向模型的输入。

#### KV Cache 影响

无直接影响；Team 工具与普通会话提交负责后续任何模型可见用途。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

- **没有 mailbox timeline**——投影视图只承载 roster 与任务；不显示 peer 消息。
- **编队只画页面已持有的内容**——自身 catalog 从未读取过的分支显示为叶节点；图形不主动请求投影。
- **事实停在最后一次投影 cut**——页面保持打开时活跃轮次耗时与上下文占用不会自走；下一次投影推送或工具栏刷新才会推进。
- **没有计价费用**——页面不陈述金额。宿主的 `token-meter` 带有 route 定价，费用只差一个投影；本包不读取它。
- **消息是收件人自己的行**——时间线读取每个 agent 的 `agentMessages` 投影，它折叠收件人自己的日志。没有 Agent Teams 宿主服务（注册该单元）的装配只显示委派行。
- **晚启用插件** — 在已经打开的会话中启用 Agent Teams 后，需要刷新页面才能接收其 Team 投影。
- **模型可用性** — 仅当共享 store 包含该成员的持久选择或请求时才显示模型。冷缓存中缺少的值会保持缺失，直到正常 Session 加载或实时更新提供它们。
- **普通 child continuation**——导航后发送的人类消息使用稳定 addressed-subagent 提示词路径，而不是 Team peer mailbox。
- **没有 lifecycle 或 workspace control**——panel 不能 spawn、rename、delete 或 interrupt teammate，write scope 仍只是提示性 metadata。
- **claim 与 release 仍归模型所有**——浏览器只通过编辑、完成、重新打开、删除与改派修改任务；claim 与 release 仍是 Team agent 工具操作，任务板没有拖拽排序与活动流。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
