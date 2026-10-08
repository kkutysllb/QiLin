---
description: "Web 会话头部 \"Open In...\" 分体按钮：在记住的应用中打开会话 workspace 目录并列出主机探测到已安装的全部应用；另提供文档预览的文件打开器，经 Session Remote 把被预览的文件交给所服务的桌面。"
kind: "package-reference"
---

# @qilin-agent/client-ui-open-in-app

[English](README.md) | 中文

## 概述

本包提供 open-in-app 功能的浏览器表面：会话头部的一个分体按钮，主按钮在记住的应用中打开当前会话的 workspace 目录（会话摘要的 `cwd`），下拉箭头列出主机探测到已安装的全部 catalog 应用。可用性、图标与启动均来自 [`qilin-host-open-in-app`](../../host/open-in-app/README.zh.md) 的主机路由；两个包应一起挂载。没有 workspace 目录的会话、或没装任何可命名应用的主机，完全不渲染按钮。本包还提供文档预览的文件打开入口，经 Session Remote 把被预览的文件交给所服务的桌面。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把本插件与 [`qilin-host-open-in-app`](../../host/open-in-app/README.zh.md) 并排挂进 Web 组合；这对包用两行 cordis.yml 组成完整功能，本行不接受任何配置。只要主机探测到至少一个已安装的 catalog 应用且会话有已知的 workspace 目录，会话头部就会出现 "Open In..." 分体按钮。

### 预期行为

主按钮显示记住的应用图标——凡主机能提取的都是应用真实图标（macOS bundle 图标、Windows 可执行文件图标、Linux 主题图标），提取不到时是通用占位图形——并带设计系统 tooltip（「在本地打开」）；点击立即启动。下拉箭头打开已安装应用的紧凑菜单，记住的条目以整行填充标记。可用性每页读取一次；上次选择的应用持久化在浏览器中（`qilin.open-in-app.choice`），不再安装的选择回退到第一个可用条目。快速完成的启动不改变按钮外观——变暗的等待态只在飞行超过 250 毫秒后出现——失败的启动显示错误 tooltip 与红色描边两秒。所有文案在双语 `open-in-app` locale 命名空间中；词典无法命名的应用 id 不会被提供。 **在本地打开**快捷键与头部按钮捕获同一主会话目录与记住的应用（桌面 `Mod+Alt+O`，Web `Mod+Shift+O`）；该命令仅在选中会话界面、目录存在且已安装可用应用时可运行，启动进行中会被阻止。

文档预览头部另有本包的第二个控件：一个紧凑分体按钮，主操作以桌面默认应用打开被预览的文件，下拉箭头在 **显示文件位置** 之外列出该文件已注册的处理程序（并标记系统默认项），后者在文件管理器中定位该文件。预览无法渲染的文件在其空态显示带文字的同款控件。在 Host 报告可以打开路径、且文件已有 Host 路径之前，二者都完全不渲染；处理程序列表在菜单首次打开时读取，读取失败会明确说明而不是显示空列表。手势失败时按钮进入错误态并写明失败原因，一次手势在飞行中时下一次手势被整体忽略。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内幕——点击展开</summary>

插件通过标准 slot/inject 机制把分体按钮注册到 `conversation.session.header.utilities`，并以一个 effect 注册 `open-in-app` 词典。一个页面生命周期的 controller（[`src/client/controller.ts`](src/client/controller.ts)）拥有每页一次的可用性读取、持久化选择的 snapshot store 与启动 POST；组件经 inject 的 `hooks` 隔间接收两个 store，因此所有会话头部共享同一份事实。路由路径与 wire 载荷类型从主机包的浏览器安全子路径 `@qilin-agent/host-open-in-app/shared` 内联。飞行中的启动由 ref 守卫——启动期间的重复点击与菜单选择被整体忽略（否则会持久化一个该手势从未打开的选择）——busy/error 视觉由围绕 `launch` promise 的定时器驱动。文档控件的桌面可用性、文件关联与打开/定位手势走第二个页面生命周期 controller（[\`src/client/open-path.ts\`](src/client/open-path.ts)），调用生成的 `session` Remote 命名空间——`canOpenWorkspacePath`、`workspacePathApplications` 与 `openWorkspacePath`——其 Host 侧在执行任何原生命令前，先用组合文件系统复核每个路径。同一个 inject face 把 controller 的桌面快照与这三个调用送达 `sidebar.right.tab.document.actions` 与 `sidebar.right.tab.document.unpreviewable`。节点半边是一个空 `apply`，让插件出现在主机侧的插件名册上。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [qilin-host-open-in-app](../../host/open-in-app/README.zh.md)——提供可用性、图标与启动的主机路由，及其背后的目录。
- [qilin-session-log-export](../../session-query/session-log-export/README.zh.md)——会话头部的姊妹动作。
- [Web client 架构](../../../.agents/notes/implemented/architecture/2026-07-19-gui-web-client-architecture.zh.md)——浏览器插件行如何加载并注册 slot。

-----

<a id="model-experience"></a>
## 模型体验

无。分体按钮是浏览器 chrome；这里没有任何东西进入模型请求。

#### KV Cache 影响

无；本包从不组装或发送提供方请求。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **词典把守菜单。** 主机目录的新条目若在两份词典中没有对应的 `app.<id>` 条目，将保持不可见而不是显示裸 id；扩展目录意味着同时扩展 [`qilin-host-open-in-app`](../../host/open-in-app/README.zh.md) 与本包的 locale。
- **可用性每页只读一次。** 页面打开期间安装的应用要重新加载页面后才出现（主机侧还需主机重启）。
- **路径必须有经过验证的 Host 映射。** `openWorkspacePath` 会拒绝组合文件系统无法解析的路径（`gateway/bad-request`），因此文件在所服务的文件系统上无法解析时，预览显示失败手势而不是打开别的东西。
- **文档打开器的处理程序列表按文件读取。** 它只在菜单打开时读取、不做订阅，因此页面打开期间安装的处理程序会在下次打开菜单时随关联重新读取后出现。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作语境——点击展开</summary>

功能层面的各项决定，包括拆分为主机包与本表面包，记录在[转正 Agent Note](../../../.agents/notes/implemented/feature/2026-08-25-promote-open-anywhere-plugin.zh.md)。

</details>
