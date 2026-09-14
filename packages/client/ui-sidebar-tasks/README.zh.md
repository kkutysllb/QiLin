---
description: "qilin 网页客户端右侧边栏的任务页：本会话的子代理拓扑与后台任务，全部读自页面已持有的会话列表。"
kind: "package-reference"
---

# @qilin/client-ui-sidebar-tasks

[English](README.md) | 中文

## 概述

右侧边栏的任务页：本会话的子代理拓扑与后台任务收进同一栏。它是一个页面类型，从启动页进入，不认领任何地址。画出的所有内容都读自会话列表快照——页面自己不发起任何读取——每个动作都经由会话服务或 subagent Remote。`ui-sidebar-right` 不知道这个包的存在。

## 目录

- [注册了什么](#what-it-registers)
- [两个区块](#the-two-sections)
- [chip 徽标](#the-chip-badge)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="what-it-registers"></a>
## 注册了什么

- **类型** —— `ctx.sidebarRightTabs.register(...)`：kind `tasks`、id `@qilin/client-ui-sidebar-tasks`、band `builtin`、无 patterns、`single`，以及一个启动页条目（order 40，标题与描述来自 `sidebarTasks` 命名空间，图形用共享的清单图标）。
- **页面主体** —— 同一 id 下的 keyed `sidebar.right.pane.tab` 席位。
- **chip 徽标** —— 同一 id 下的 keyed `sidebar.right.pane.tab.badge` 席位。

`src/client/` 下七个源文件：`definition.tsx`（类型）、`rows.ts` 与 `lineage.ts`（两份快照的纯投影）、`face.ts`（动作及其 Remote 绑定）、`TasksBody.tsx` 与 `TasksBadge.tsx`（画什么）、`locales.ts`（说什么）、`index.ts`（接线）。

<a id="the-two-sections"></a>
## 两个区块

**子代理**把会话列表已持有的直接子目录目录（catalog）深度优先摊平：一层就是一个 parent 的 catalog，同层按宿主的持久创建时间 newest-first，只会走进「自己的 catalog 已被读过」的子项——没打开过的分支贡献它自己这一行，下面什么都没有。宿主教不出来的行画成诊断行，且不计数。区块声明的总数取两者中较大者：catalog 报告的子项数，与会话摘要谱系（`indexSubagentDescendants`）记录的后代数——所以谱系尚未收敛时，表头也不会少报。

**后台任务**把进行中的任务按开始时间放前面，已结束的按最新优先；结束时间打平的时候后开始者在前。进行中的行按一秒的时钟走表；已结束的行量它自己的时长。

两个区块到达即展开。超过预览数量的区块——子代理五行、任务三行——把其余的折叠进一个控件。区块与折叠状态是主体自己的，从不离开它。

共三个动作，都由注入的 face 在调用时执行：把某个子代理显现为当前会话、重读某个 parent 的 catalog、以及经 `subagents.interruptByParent` 停掉一个 continuable 子项。

<a id="the-chip-badge"></a>
## chip 徽标

徽标是本会话正在进行的工工作量：activity 为 `running` 的直接子 catalog 行，加上注册表仍持有的任务。孙辈在跑意味着父辈也在跑，所以直接子项已经覆盖了下面的事，徽标因此直接经标准的 `useSessions` 钩子读两份快照，而不去走谱系。零是空闲态而不是计数：chip 不会为它画一个空药丸。

<a id="model-experience"></a>
## 模型体验

无；本包在浏览器里画会话侧的工作量，不注册任何面向模型的东西。

#### KV Cache 影响

无；两份快照都来自客户端已持有的会话列表，页面不组装任何模型请求。

## 已知限制与暂缓事项

<a id="known-limitations-and-deferred-work"></a>
- **没有任务输出。** 任务快照带的是状态、时间与 detail，不是流，所以这里看不到进行中任务的输出；读输出是工具的职责，页面不发工具调用。
- **one-shot 子项不能在这里停。** 中断动作通过持久 parent 寻址 continuable 子项；one-shot 子项可以画出来、可以打开，仅此而已。
- **深度止步于已读的 catalog。** 页面自己不发起 catalog 读取，所以会话列表从没读过的分支只贡献一行；想展开分支靠刷新动作。
- **徽标只数直接子项**，理由同上：一次条带渲染不该去走谱系。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作台上下文——点开查看</summary>

无。

</details>

**Runtime invariant:** 不发布 companion。页面在主体之外不持有任何状态——投影是对会话列表快照的纯函数，由单元 spec 断言，不存在会与它分歧的第二次观测。
