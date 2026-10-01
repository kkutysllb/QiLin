---
description: "qilin web 客户端右侧 Sidebar 的 Git 面板 tab 类型：分支状态与上游位置，按未暂存、已暂存、未跟踪分组的变更与逐文件暂存、内联差异、带全部暂存语义的提交框、可检出与新建的本地分支列表，以及走 workspaceGit Remote 命名空间的 GitHub 拉取请求节。"
kind: "package-reference"
---

# @qilin/client-ui-sidebar-git

[English](README.md) | 中文

## 概述

右侧 Sidebar 的源代码管理面板：一个从引导页进入的 `git` 页面，展示会话工作区根目录下的仓库。头部携带分支与上游位置，旁边是拉取、推送与刷新；变更按未暂存、已暂存、未跟踪分组，每行有自己的上下文菜单；点击一行在下方打开该文件的内联差异；提交框按面板的全部暂存语义提交；分支列表支持检出与新建；GitHub 节在 `gh` 可应答时列出、创建并合并拉取请求。一切走 `@qilin/api-workspace-git` Remote 命名空间，`ui-sidebar-right` 对本包一无所知。

## 目录

- [注册内容](#what-it-registers)
- [面板](#the-panel)
- [GitHub 节](#the-github-section)
- [Model Experience](#model-experience)
- [已知限制与遗留工作](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="what-it-registers"></a>
## 注册内容

- **`git` 类型** — `ctx.sidebarRightTabs.register(...)`：kind 为 `git`，id 为 `@qilin/client-ui-sidebar-git`，`builtin` 档，无 patterns，引导页一条目（order 20，标题与描述来自 `sidebarGit` 命名空间，图形是共享的分支图标）打开该类型。每个 surface 一个面板：声明 `single: true`。
- **正文与 chip 标题** — `@qilin/client-ui-sidebar-git` 名下键控的 `sidebar.right.pane.tab` 与 `sidebar.right.pane.tab.title` 两个座位：面板本身，以及 chip 里标题前的分支图形。

两个座位共享每会话一个 store 实例，按 tab id 分桶；浏览器半边在 `src/client/` 下：`definition.tsx`（类型是什么）、`store.ts`（留下什么）、`face.ts`（如何请求 `workspaceGit` 命名空间，带代次守卫）、`git-model.ts`（分组、角标、差异行与失败文案的纯计算）、`GitBody.tsx` 与 `GitTitle.tsx`（画什么）、`locales.ts`（说什么）、`index.ts`（接线）。

<a id="the-panel"></a>
## 面板

挂载时先探测 `workspaceGit.isRepo`：无仓库的工作区画空状态，应答不了的探测画失败行，是仓库则读第一份状态。头部命名分支（未生成分支或游离 `HEAD` 时是措辞替代），旁边是上游位置——领先用成功色、落后用错误色，无上游时是措辞替代——再是拉取（无上游时休止）、推送与刷新。无上游时推送提供设置上游的变体，这也是它的 Remote 调用所传的参数。

变更按条目自己的旗标分组——未暂存、已暂存、未跟踪；既暂存又未暂存的条目同时坐在两组里——每节带计数与整节的暂存/取消暂存动作。一行的 `XY` 字母做角标；点击在节下方按该组读取的一侧打开该路径的内联差异。上下文菜单提供暂存（或取消暂存）、仅对已跟踪条目的丢弃——丢弃从索引恢复，未跟踪路径因此被拒绝——以及复制仓库相对路径。同一时刻只飞一个变更：`busy` 立着时全部控件休止，每次成功后跟一次状态读取，一条共享的失败条按码措辞——`not-a-repo`、`bad-branch`、`bad-message`、`bad-path`、`too-large`、`command-failed`（调用与 stderr 收在提示里），其余是传输自身的消息。

内联差异逐行渲染统一文本：文件头与块头暗色，新增行成功色，删除行错误色。暂存开关重读同一路径的另一侧；复制控件写入整段差异文本；关闭把它收下。被 Host 按字节上限整段拒绝的差异会说明，空差异也会说明。

提交框先修剪再做任何事：修剪为空时按钮在空提示下休止，干净树上按钮同样休止。对脏树提交未动过的索引会先全部暂存——全部暂存提示点名此事——且从不覆盖选择性索引。成功清空输入框；`Ctrl-Enter` 提交。

分支节可折叠；展开读取本地分支列表，被上限截断时说明。当前分支带标记且该行休止；点击其他分支检出并重读列表。内联新建表单取名字与可选起点（留空从 `HEAD` 起），提交即收起，被拒绝的名字——`bad-branch`——带着自己的名字浮现在共享失败条里。

<a id="the-github-section"></a>
## GitHub 节

仅当挂载时的 `ghAvailable` 探测应答明确的 yes 时该节点亮；其余应答都隐藏它。展开时探测登录：未登录时展示带 gh 自身状态消息的登录提示与重新检测控件；已登录时按筛选——打开、已关闭、全部——读取拉取请求列表，筛选每次变化都重读。一行展示编号、标题、草稿标记与 head → base 引用；它的合并控件打开方式选择（仓库默认、merge、squash、rebase）与合并动作。新建表单取标题、描述与预填当前分支的目标分支；创建成功的拉取请求立起带编号与复制链接控件的提示。被拒绝的标题或描述按 `bad-pr-title` 码带字段与长度措辞。

<a id="model-experience"></a>
## Model Experience

无：本包在浏览器绘制源代码管理面板，不注册任何面向模型的内容。

#### KV Cache effect

无：状态、差异、分支列表与拉取请求走 Remote，不组装任何模型请求。

## 已知限制与遗留工作

<a id="known-limitations-and-deferred-work"></a>
- **推送的上游固定为 `origin`。** Host 的 `push` Remote 在被要求时把上游设为 `origin`；不提供改名的远端。无上游时拉取休止，面板如实说明。
- **差异整段或拒绝。** 超过 Host 字节上限的差异整段拒绝（`too-large`），从不截短；没有分块分页，也没有文件系统监听，面板只随自己的读取与变更而变化。
- **分支列表有上限，拉取请求一次一个筛选。** 分支列表在 Host 列表上限截断时说明；拉取请求行自身不带打开/关闭列（线类型没有），筛选是唯一的状态视图。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

一个 store 工厂（`createGitStore`）、一个注册期句柄、按 tab id 分桶。face（`face.ts`）是 Slot 的 `inject` 形态：会话 id 与绑定的动作进，每个请求一个入口，组件里没有任何 await。四类读取各带每 tab 代次——状态、分支、差异、拉取请求——谁后请求谁赢，无论谁先应答；tab 记录的中止监听每 tab 只武装一次，遗忘时连同代次一起清桶。变更走同一条 `mutate` 路径：busy、调用、失败记录或成功后跟一次状态读取（检出与新建还会重读分支列表；拉取请求的创建与合并按节面所示筛选重读列表）。

</details>

**运行时不变量：** 未发布 companion。本包唯一的运行时状态是每会话一个 Slot store，按 tab id 分桶，由拥有各自桶的 body 与 face 写入、在每个 tab 的中止信号上遗忘；没有第二处观察可以对照。
