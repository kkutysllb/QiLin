---
description: "面向模型的请求：在所属会话的侧栏中打开一个文件或一个 http(s) 页面。"
kind: "package-reference"
---

# @qilin/sidebar-opens

[English](README.md) | 中文

## 摘要

`sidebar_open` 让模型直接"展示"而不是"描述"：一个已存在的文件，或一个 http(s) 页面。请求以 Host Remote 流（`sidebarOpens.watch`）送到 [`@qilin/client-ui-agent-opens`](../../client/ui-agent-opens/README.zh.md)，由它在**该会话自己的**侧栏中打开。投递是瞬时的：视图附着时随发随取，否则在每会话的有界队列里等待下一次附着重放。

## 目录

- [工具](#the-tool)
- [投递](#delivery)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="the-tool"></a>
## 工具

`path` 与 `url` **必须且只能提供一个**。

- `path` 接受绝对路径或相对会话工作目录的路径，并在请求发出前经会话文件系统验证：无法解析、或不是普通文件时，调用本身失败，而不是打开一个坏 tab。
- `url` 只接受 `http://` 与 `https://`。其他一律拒绝，因此模型拼出的 `file://` 到不了浏览器的打开入口。
- 标题取文件的 basename 或页面的 host。

结果报告解析后的目标，以及附着的视图是否当场取走它。Host 铸造的请求标识留在内部。

<a id="delivery"></a>
## 投递

`watch(sessionId, signal)` 先产出"无人附着期间排队的请求"，再产出随后到达的每一个。同一会话的第二个 watcher 会**接管**：最新的视图就是用户正在看的那个。`enqueue` 回答附着的视图是否当场消费；无人附着时入队，并在超过 `maxQueued` 时丢弃最旧的，避免无人观看的会话无限堆积。

<a id="model-experience"></a>
## 模型体验

### sidebar_open

#### 模型看到什么

[sidebar_open 的 schema](../../../docs/tool-catalog.zh.md#sidebar_open) 提供一个文件或一个 http(s) 页面："Open one file or one http(s) page in the Sidebar the user is viewing this Session in. Use it when the user asked to see something: a file you produced, a file worth reading beside the conversation, or a page you found. Pass exactly one of `path` (a file that already exists) or `url`. The file opens in the document preview and the page in the built-in browser; both appear beside the conversation rather than leaving the application." 结果是一行——目标已打开，或目标在等待该会话的侧栏——并带有 `kind`、`target`、`title` 与 `delivered`。

#### Token 影响

每次调用两个参数与一个很小的结果。这里没有任何内容进入系统提示词。

#### KV Cache 影响

没有直接影响。一次调用及其结果像任何工具轮次一样追加到会话；缓存随普通工具调用的方式变化。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

- **目录不可打开。** 侧栏的文件树以工作区为根，"给我看这个目录"没有可到达的 tab；只有普通文件或页面可以打开。目录路径会让调用失败。
- **页面的落点取决于组合进来的浏览器 tab 类型。** 把 `@qilin/client-ui-sidebar-browser` 组合掉时，消费者退回新浏览器标签页，即离开应用。
- **请求不跨重新加载。** 无人附着时发出的请求只在该 Host 进程内存中等待，直到该会话结束；重启 Host 或销毁会话即丢弃。
- **队列有界且丢弃最旧。** 从不开侧栏的会话只保留最近 `maxQueued` 个请求。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者信息 — 点击展开</summary>

无。

</details>

**运行时不变式：** 未发布伴随包。`SidebarOpens` 是其每会话队列与 watcher 的唯一写入者，包内 spec 直接驱动入队、接管、中止与销毁。
