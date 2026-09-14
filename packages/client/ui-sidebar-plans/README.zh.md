---
description: "qilin Web 客户端右侧边栏的任务计划页：按约定扫描会话工作区的计划文档，列成清单，并以资源地址打开到侧栏。"
kind: "package-reference"
---

# @qilin/client-ui-sidebar-plans

[English](README.md) | 中文

## 概述

右侧边栏的任务计划页：按约定找到会话工作区里的计划文档并读取成清单，再打开到侧栏。它是一个从引导页进入的页面型 tab，不认领任何地址；每一行用自己的地址打开文档，交给 `qilin-resource://file` 的查看器认领 —— `ui-sidebar-right` 完全不知道这个包。

## 目录

- [注册了什么](#what-it-registers)
- [计划清单](#the-plan-list)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="what-it-registers"></a>
## 注册了什么

- **类型** —— `ctx.sidebarRightTabs.register(...)`，kind 为 `plans`，id 为 `@qilin/client-ui-sidebar-plans`，band 为 `builtin`，不声明 patterns，`single`，并给引导页一个入口（order 50，标题与描述取自 `sidebarPlans` 命名空间，图标是共用的清单字形），点它即打开这个类型。
- **主体** —— 该 id 下键控的 `sidebar.right.pane.tab` 座位：条带下方一行 38px 的搜索行 —— 共用的 `Input` 加搜索字形，末尾是重新扫描按钮 —— 再往下每个计划文档一行，标题在上、工作区相对路径在下。

`src/client/` 下七个源文件：`definition.tsx`（类型）、`store.ts`（它保存什么）、`plans.ts`（约定与其中的纯规则）、`face.ts`（怎么读，含 Remote 绑定）、`PlansBody.tsx`（画什么，含状态行助手）、`locales.ts`（说什么）、`index.ts`（接线）。

<a id="the-plan-list"></a>
## 计划清单

一次扫描只看 agent 本来就会写计划的地方：`plans/`、`docs/plans/`、`.plans/` 的**一层** `*.md`，以及根的 `plan.md`、`PLAN.md`、`docs/plan.md`（这些目录存不存在都算）。更深的层级有意不看 —— 计划树是约定，不是文件系统遍历。

身份是文档的绝对路径，且大小写折叠。`workspaceFiles` 线上没有 device 或 inode，所以在大小写不敏感的卷上（那里 `plan.md` 与 `PLAN.md` 是同一个文件的两种拼写），折叠后的路径才是"同一个文件不会列两次"的依据。清单最多 20 条。

行的顺序就是约定声明的顺序：先 `plans/`，再 `docs/plans/`，再 `.plans/`，最后是那几个固定文档。线上没有修改时间 —— 文件的 `version` 是客户端从不解析的新鲜度令牌 —— 所以没有"最新在前"可排，而约定自身的顺序至少在轮询之间是稳定的。

行的标题是文档第一个 `#`–`###` 标题，取自它第一页行内容（`remote.workspaceFiles.read(sessionId, path, { offset: 1, limit: 20 })`）并截到其中 512 个字符；没有标题、读不到、页内没有标题时，都退回去掉 `.md` 的文件名。

| 调用 | 结果 |
|---|---|
| 对每个约定目录 `list` | 其中的 `*.md` 成为候选；目录不存在是正常情况。 |
| 对每个固定文档 `stat` | 存在且是普通文件即成为候选；不存在或不是普通文件的跳过。 |
| 对每个留下的文档 `read` | 标题所需的那段开头。这里失败不算扫描失败：文件名仍是如实的行标题。 |

不属于上述"不存在"的失败 —— 比如传输失败 —— 会被带出扫描并接管整个面板：工作区根本没读成的时候说"没有计划"是假话。点一行会用 `fileAddressFor(sessionId, root, path)` 经 `useTabInfo().tab.actions.openResource` 打开，落在该 tab 自己的窗格里。

根是会话的工作目录，取自 `useSessions().byId[sessionId].cwd`。扫描会在 tab 挂载时跑一次、每次按下重新扫描按钮时跑一次，并在 tab 可见时每五秒跑一次；隐藏的 tab 只画已经扫到的内容，不做任何轮询。

状态存在类型自己的 store 里，按 tab id 分桶：上一次扫描的 `rows`、是否有扫描在 `scanning`、该次扫描报出的 `failure`。同一 tab 的新扫描会作废仍在进行的那次；属主的 `signal` 结束一个桶：中止时该 tab 被遗忘，之后落地的扫描什么都不会写。

<a id="model-experience"></a>
## Model Experience

无：本包只在浏览器里画出工作区的计划文档，不注册任何面向模型的东西。

#### KV Cache effect

无；目录列表与文档读取都走 Remote，不组装任何模型请求。

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- **没有修改时间。** 线上不报 `mtime`，清单无法把最新的计划排到最前，只能保留约定的顺序。
- **只读一页标题。** 找标题只读文档第一页，页外还有标题的文档退回文件名。
- **只有一个根，且只读。** 清单以会话工作目录为根，没有别处可扫；面板也不新建、重命名或删除计划。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The panel's only runtime state is one Slot store per tab, written by the face that owns the scan and forgotten on the tab's abort signal; there is no second observation of it to compare against.
