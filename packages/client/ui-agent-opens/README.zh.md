---
description: "在所属会话自己的侧栏中打开模型要求查看的内容。"
kind: "package-reference"
---

# @qilin-agent/client-ui-agent-opens

[English](README.md) | 中文

## 概述

`sidebar_open` 的浏览器半边：跟随当前查看会话的 `ctx.remote.sidebarOpens.watch`，并在该会话的侧栏中打开每个请求。组合了 `@qilin-agent/client-ui-sidebar-browser` 时页面在**内置浏览器**中打开，否则退回新浏览器标签页；文件通过其资源地址打开，因为"哪个 tab 类型认领这个地址"是侧栏的决定。编码工作台标签激活时，由编码侧栏自己的页签认领打开（并自动展开折叠的栏框）；通用标签或未组合编码栈时仍由原生侧栏接手。插件不保留状态：请求只投递一次，绝不重放。

## 目录

- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- **不支持目录目标。** 目录没有可打开的侧栏界面（文件树以工作区为根），所以宿主工具在到达这里之前就拒绝了。
- **每个会话只有一个观看者。** 同一会话的两个浏览器视图共享一条 Host 流：最新的附着接管它，较旧的视图不再收到打开请求。
- **载体失败会静默结束监听。** 下一次切换会话会开一条新流；在流中断且无人附着期间发出的请求仍留在 Host 队列里，等到那时再投递。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者信息 — 点击展开</summary>

无。

</details>
