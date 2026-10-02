---
description: "qilin Web 客户端右侧边栏的侧聊页：当前会话的侧聊线程、打开线程的自有转录，以及驱动它们的输入框，经由线程 follow 流回读。"
kind: "package-reference"
---

# @qilin/client-ui-sidechat

[English](README.md) | 中文

## 概述

右侧边栏的侧聊页：一列列出当前会话的侧聊线程，一格显示打开线程的自有转录与输入框。它是按类型打开、不声明地址的页面。列表与转录是面板自己的读取——会话控制器的六个 `sidechat*` 远程加上每个线程子代理地址上的 `session.follow`——所有操作都经由这些远程。`ui-sidebar-right` 对本包一无所知。

## 目录

- [注册了什么](#what-it-registers)
- [面板](#the-panel)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="what-it-registers"></a>
## 注册内容

- **类型** —— `ctx.sidebarRightTabs.register(...)`：kind `sidechat`、id `@qilin/client-ui-sidechat`、band `builtin`、`single`、无 patterns；`ctx.sidebarRight.openTab('sidechat')` 打开它。
- **面板体** —— 该 id 下带键的 `sidebar.right.pane.tab` 座位，经 `hooks` 舱注入面板的状态源，经 inject 面注入操作。

`src/client/` 下九个源文件：`definition.tsx`（类型）、`sidechat-model.ts`（纯视图模型：follow 地址与转录折叠）、`sidechat-source.ts`（对象层状态源）、`face.ts`（操作及其远程绑定）、`SidechatBody.tsx` 与 `SidechatBody.module.css`（绘制内容）、`locales.ts`（文案），以及 `index.ts`（装配）。

<a id="the-panel"></a>
## 面板

**线程列表** 读取面板所在会话的 `session/sidechatThreads`，按创建先后排序。每行显示线程的持久标签与活跃/运行状态；点击一行打开该线程的转录。

**转录** 通过 `session.follow` 在线程的子代理地址（当前会话的 `continuable` 子级）上跟随打开的线程。开场快照回放线程自有事件——用户消息、继承边界与助手回复——提交帧到达时追加。继承的父前缀不会出现：它是宿主侧的参考上下文，不属于线程自有日志切片。

**输入框** 将草稿作为侧聊 prompt 发送（`session/sidechatPrompt`），Enter 发送。运行中的线程提供取消（`session/sidechatCancel`）；活跃空闲的线程提供释放（`session/sidechatRelease`）；侧栏按钮从当前会话分叉新线程（`session/sidechatStart`），可用第一个问题命名。

<a id="model-experience"></a>
## 模型体验

无，本包在浏览器中绘制会话侧的线程，不注册任何面向模型的内容。线程自身的模型请求属于宿主上线程自己的会话。

#### KV Cache 效应

无；面板不发起模型请求，也不向任何提示词增加 token。它的读取是会话远程已提供的 follow 流之上的持久事件折叠。

## 已知限制与推迟的工作

<a id="known-limitations-and-deferred-work"></a>

- **每个表面一个页签。** 页面使用页内线程列表，而上游 coding-sidebar 的 SideChat 为每个线程安排一个页签：切换线程会替换当前打开的转录，无法并排阅读两个线程。
- **线程身份由宿主所有。** 线程以宿主的侧聊描述符识别（provider `sidechat`、mode `continuable`），而非上游的标题前缀约定，标签遵循宿主的 `Side: …` 命名而非任何客户端前缀规则。
- **只绘持久事件。** follow 请求会请求助手流基线，但面板不绘制流帧——助手文本在其持久 `assistant/message` 事件提交后出现。
- **仅当前会话。** 面板只附着于打开它的会话，无法浏览侧聊工作区附件，因为侧聊线程不携带任何附件。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作背景——点击展开</summary>

状态源是注册作用域的对象层（`sidechat-source.ts`）：线程列表、打开的转录与进行中标志在面板体卸载后仍然存活，face 是它唯一的写入者。面板不声明 store——没有需要跨条目共享的查看状态。

</details>

**运行时不变量：** 不发布伴随物。面板在其状态源之外不持有状态——视图模型是 follow 帧之上的纯折叠并由单元规格断言，不存在会发散的第二次观察。
