---
description: "qilin Web 客户端的已归档会话设置页：把注册表全局归档集合呈现为可搜索列表，每行提供取消归档与永久删除操作。"
kind: "package-reference"
---

# @qilin-agent/client-ui-settings-unarchive-sessions

[English](README.md) | 中文

## 概述

**已归档会话**设置页是从 Workspace 导航中隐藏的会话的恢复入口。它按归档时间由新到旧列出每个已归档会话，并显示其所属 Workspace 与最近活动时间，每行提供取消归档与永久删除操作。搜索框按会话标题或 Workspace 名称过滤列表，并显示当前归档会话数量。行由归档集合与已加载的 Session 摘要合并而来，因此会话记录已不存在的归档条目既没有行也没有操作。每次恢复与每次删除都经由共享的 Workspace 命令集合。

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

打开设置并选择**已归档会话**，即可看到当前从所有分组视图中隐藏的会话。在已提供设置外壳、Workspace 服务与 Session 列表的 Web 组合中挂载 `@qilin-agent/client-ui-settings-unarchive-sessions`；该页面注册自己的导航条目，无需配置。

### 阅读一行

每行显示会话的显示标题、为其记账的 Workspace 标题或未分组标签，以及以紧凑相对时间表示的最近活动。页面把最近归档的会话排在前面，与持久归档顺序相反。页面会先等待 Session 列表再渲染行；列表加载期间显示读取状态，而不是空归档。空归档、归档条目均无已加载 Session 可恢复、以及查询无匹配分别给出三种提示，因此搜索和不可寻址的条目都不会被误认为归档为空。

### 恢复会话

取消归档会把会话恢复到其 Workspace 下记录的位置；会话不属于任何 Workspace 时则恢复到未分组会话中，该行随即从页面消失。该操作调用 `ctx.uiWorkspace.unarchiveSession`，其回传的完整归档集合会更新所有依据它过滤的界面，因此会话也会重新出现在侧边栏与搜索中。调用被拒绝时会记录一条 console 诊断，并保留该行以便再次尝试。

### 永久删除会话

垃圾桶操作会打开确认对话框；因为删除不可撤销，在勾选确认框之前「永久删除」一直不可用。确认后调用 `ctx.uiWorkspace.deleteArchivedSession`，它会删除该会话的持久日志（包括全部保留代次与该存储写入的派生检查点）并移除归档条目；该行同样通过回传的归档集合消失；由于没有存活 Session 会上报冷日志的移除，Workspace 客户端会重新拉取宿主会话列表，因此被删除的对话也会从侧边栏与搜索中消失。宿主会拒绝不安全的删除，页面负责说明命中的拒绝原因：仍在分组视图中的会话尚未归档；在本应用里打开的会话、或仍有任务在运行的会话，需要先关闭或停止；存储句柄仍被占用、或后端不支持删除时，日志保持原样。被拒绝时该行连同原因保留在屏幕上，因此失败不会被误当成已删除。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

页面是 id 为 `archived-sessions` 的一个本地化 `settings.section` 贡献；导航条目与挂载的分区归设置外壳所有，不在此包内。搜索框、行列表与删除确认对话框由本页面持有。

### 注册与数据来源

`apply()` 注册并绑定 locale namespace，再用 `ctx.slots.inject()` 贡献该分区，因此延迟声明或恢复声明的 slot 依然能触达它。页面从 `useWorkspaces` 读取 `state.archivedSessionIds` 与 `state.items`，从 `useSessions` 读取 Session 摘要；它不持有 store 也不持有 transport，写入是注册处以 `ctx.uiWorkspace.unarchiveSession` 与 `ctx.uiWorkspace.deleteArchivedSession` 闭包注入的 `unarchive` 与 `deleteArchivedSession` 回调。注册处把删除被拒的 Remote 失败码映射成页面要解释的原因，因此组件不解析传输层文字。

### 行的派生

行由归档集合与已加载摘要合并派生：没有摘要的成员不产生行，因此在 Workspace 注册表之外被删除的会话不会留下取消归档操作。Workspace 归属从各 Workspace 的 `sessionIds` 读取；不属于任何 Workspace 的成员以未分组标签渲染。搜索只规范化一次查询，并与行标题和 Workspace 标签匹配。

### 源码地图

| 文件 | 职责 |
|---|---|
| [`src/index.ts`](src/index.ts) | 宿主 loader 入口：该页面仅供浏览器使用，因此插件体为空 |
| [`src/client/index.ts`](src/client/index.ts) | 浏览器插件：locale namespace、分区注册、注入的取消归档与删除操作、失败码映射 |
| [`src/client/ArchivedSessionsSection.tsx`](src/client/ArchivedSessionsSection.tsx) | 页面组件：行的派生、搜索、每行的取消归档、删除确认与拒绝文案 |
| [`src/client/locales.ts`](src/client/locales.ts) | 全部可见与无障碍字符串的中英文字典 |
| [`src/client/ArchivedSessionsSection.module.css`](src/client/ArchivedSessionsSection.module.css) | 页面样式 |

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

以下页面覆盖承载该页面的设置界面、其背后的归档写入，以及它所渲染的状态。

- [ui-settings](../ui-settings/README.zh.md)——声明 `settings.section` 与 namespace scope 服务的领域底座。
- [ui-settings-general](../ui-settings-general/README.zh.md)——渲染导航并挂载该分区的设置外壳。
- [ui-workspace](../ui-workspace/README.zh.md)——其 Session 行负责归档的侧边栏浏览器，以及本页面借以恢复的 `ctx.uiWorkspace` 服务。
- [Workspace Controller](../../api/workspace-controller/README.zh.md)——`workspace.unarchiveSession` Remote 与持有归档集合的 Client model。
- [Workspace 子系统](../../../docs/subsystems/workspace.zh.md)——持久归档集合、其领域字段，以及恢复背后的注册表操作。

-----

<a id="model-experience"></a>
## 模型体验

无。该包是浏览器端 UI 插件层，不注册任何面向模型的内容。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定本页面能够恢复哪些已归档会话；它们是当前包约束。

- **已加载摘要缺失的已归档会话无法寻址**：页面通过与 Session 列表合并来派生行，因此列表未携带的成员没有行也没有取消归档操作，尽管归档集合仍持有它；当集合中的成员全部处于该状态时，页面报告无法恢复，而不是报告归档为空。
- **删除只作用于已归档会话**：归档集合是本页面的全部领域，仍在分组视图中的会话不能从这里删除，需先归档。
- **删除不可撤销**：持久日志与该会话的缓存检查点都会从磁盘移除。不保留任何副本，因此被删除的对话无法恢复、搜索或再次打开。
- **删除释放的是持久日志，不包含共享产物**：附件在会话间去重、溢出文件按其自身的保留策略清扫、用量账本属于记账记录；它们都不随单个会话的删除一起移除。
- **Workspace 会保留被删除会话的排序槽位**：删除会移除归档条目与持久日志；Workspace 已保存的顺序仍可能记着该 id，但所有分组视图都会因没有对应 header 而把它过滤掉。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
