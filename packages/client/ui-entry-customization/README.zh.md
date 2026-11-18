---
description: "在左侧栏、会话视图与右侧栏引导的「更多」菜单中提供收起入口、插件浏览与 Creator 草稿。"
kind: "package-reference"
---

# @qilin-agent/client-ui-entry-customization

[English](README.md) | 中文

桌面端产品事件使用可选的[产品分析服务](../../api/product-analytics/README.zh.md)；普通 Web 交互不上报。

## 概述

填充左侧栏、会话视图页签行与右侧栏引导页的「更多」菜单：列出被收起的面板入口并提供固定控件、折叠的视图、插件浏览与可审阅的 Creator 草稿。Web 应用默认加载本包。各区域自行绘制「更多」按钮；本包不保存任何状态。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

`@qilin-agent/web-app` bundle 默认加载本包，无需插件开关或 profile 选择。只有当该区域的 actions 槽存在注册项时，该区域才绘制「更多」按钮；卸载本包会移除这三个按钮。

左侧栏的「更多」菜单按注册顺序列出被收起的（未固定的）面板入口，每行带一个固定控件。点击固定会调用侧栏的 `onPinnedChange(id, true)`，该入口回到注册顺序中的原位置，而不是追加到列表末尾；点击行本身则打开面板、不改变固定状态。已固定的面板不会在这里重复出现，因为它们已经在侧栏中。固定状态由 `ui-sidebar` 持有并只存在内存中，刷新页面会恢复全部入口。

会话视图页签行的「更多」菜单列出折叠的视图并标记当前视图，没有固定控件。右侧栏引导页的「更多」菜单既没有条目也没有固定控件。

**浏览更多插件**打开插件主列表，不弹出安装对话框；该行只在插件页提供可选的 `pluginNavigation` 服务时出现。**创建你的插件**打开一个新的或可复用的空白会话，使用 Creator 预设，并向其草稿追加一段该区域的本地化创建请求：空草稿直接把请求作为正文，已有草稿保留正文、引用与附件，并把请求作为新段落追加。它从不发送消息，请自行审阅后发送。当条目前面有内容时，浏览行上方会出现分隔线。

在桌面端，**浏览更多插件**与**创建你的插件**在执行前上报 `more_menu_item_click`，携带 `action=browse_plugins` 或 `action=create_plugin` 与该菜单的 `region`：`sidebar`、`conversation` 或 `rightbar`。菜单不上报曝光事件。没有分析服务时，两个动作行为不变且不上报。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

[`apply`](src/client/index.ts) 通过 `ctx.slots.inject` 以 id `entry-customization` 把 [`EntryMenuContent`](src/client/EntryMenuContent.tsx) 注册进 `sidebar.right.tab.guide.actions`，因此注册随该区域的声明生命周期释放。区域在自己的 `Menu` 中渲染该槽；菜单行在浏览或创建前先调用 `onDismiss`。

注册的 `inject` 提供区域与两个回调。每个回调先调用 `ctx.get('productAnalytics')?.track('more_menu_item_click', { region, action })`。浏览随后调用 `pluginNavigation.openList()`。创建随后调用 `uiWorkspace.startSession(undefined, { agentPreset: 'ptc', prompt, whenDraftExists: 'append' })`，提示词取该区域的本地化文案；它不经过 `ui-agent-preset`，因此预设胶囊不参与引导。[web-app bundle 补丁](../../bundle/web-app/cordis.patch.yml)挂载该浏览器插件。

</details>

-----

<a id="model-experience"></a>
## 模型体验

无。本包管理浏览器入口并准备尚未发送、可审阅的草稿；只有用户提交时其文本才进入模型。

#### KV Cache 影响

无；本包不组装也不发送模型请求。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 「更多」菜单不提供可见性控件；插件重载恢复默认。
- localStorage 中的旧固定值既不读取也不写入。
- **创建你的插件**不检查 Creator 预设是否存在。缺少该预设时会话创建失败，工作区显示创建失败通知，且不会准备草稿。草稿准备还需要可解析的工作区；没有工作区时沿用现有流程提示需要工作区。
- 标签行的估算分组由会话包负责；该菜单不提供排序。
- 会话控件遵循现有的非空白会话标题与代码工作工具可用性规则。右侧栏控件需要选中的会话，并显示在其引导页上。
- 菜单不列出插件；请使用浏览动作打开插件页。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

无。

</details>
