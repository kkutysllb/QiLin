---
description: "Web GUI 的模型选择：/model 弹窗与 composer 模型位共用一份按提供方分组的会话级目录；供模型路由的用户与维护者阅读。"
kind: "package-reference"
---

# @qilin-agent/client-ui-model-selection

[English](README.md) | 中文

## 概述

Web GUI 允许用户通过 `/model` 弹窗或 composer 模型控件切换既有会话使用的模型与推理（reasoning）强度。两个界面呈现同一组按提供方分组的选择；所选模型决定可用的推理强度名称与默认值。完整选择从下一次请求开始生效；运行中的步骤保留其启动时的模型与推理强度。如果没有适配器可以服务会话路由，composer 会保持停用，直至路由恢复可用。

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

与 `ui-conversation` 及命令包一起挂载本插件；composer 随即在待处理指示器旁显示模型位，`/model` 则以弹窗打开同一份目录。模型位菜单打开期间，`↑`／`↓` 在所显示面板的行间移动焦点，`Tab` 选定聚焦行，Escape 与 `Shift+Tab` 先退出已下钻的面板，否则关闭并回到触发器。下钻落在正在使用的那一行，返回则落在打开该面板的格子上。当确切提供方／模型对仍在已公布分组中时，两个界面都显示 Host 报告的当前选择。所选模型或提供方不在目录中时，选择仍可路由并保留已保存的提供方、模型与推理强度，但触发器显示「请选择模型」并隐藏推理强度文案与已保存的 ID；目录为空时显示「暂无可用模型」。

### 模型与推理强度

模型按提供方分组。composer 菜单只显示模型与推理强度名称。`/model` 弹窗显示提供方名称与目录说明；其中两个内置 DeepSeek 模型的说明使用当前语言，外部提供方说明保持原文。弹窗应用所选模型的默认推理强度；composer 随后可以选择任一已公布的推理强度。适配器没有推理元数据时不显示 Effort 行；不存在任意推理强度输入。

### 模型名称扩展

`conversation.input.model.label` 是会话作用域的 `single` slot，覆盖 composer 触发按钮（`placement: 'trigger'`）、根菜单中的当前值（`'menu'`）和各模型选项（`'option'`）。owner props 提供 `provider: { id, name }`、准确的目录 `model`、`placement` 和 `selected`。提供方名称是本地化显示名称；按 `provider.id` 匹配渠道，按提供方与模型 ID 的组合识别模型。slot 不接收连接 URL 或凭据。

扩展必须渲染非交互内容，例如带颜色的名称或徽标。选择器负责点击、搜索、焦点、禁用状态、勾选标记、推理强度和触发按钮的无障碍文字。没有扩展（包括插件卸载后）时显示目录名称；模型带有目录角标 `model.badge` 时，触发按钮在名称前、菜单在名称后显示一个按角标语调着色的 `Tag`，文字按当前语言解析。较长的目录名称会在可用宽度内省略，角标保持可见。扩展会同时替换两者，并从 owner props 收到角标。加载中或当前选择不可用时不调用 slot。`/model` 命令行使用命令弹窗独立的渲染 API。

以 type-only 方式导入本包的 `/client` 声明，再通过 `ctx.slots.inject('conversation.input.model.label', () => ctx.slots.register({ name: 'conversation.input.model.label' }, ModelLabel))` 注册。`ModelLabel` 的 props 从 `PropsRuntime<'conversation.input.model.label'>` 派生；用提供方 ID 选择 CSS Module 类，并保留 `model.name` 作为文字。注册随声明和贡献插件的生命周期清理。不替换组件时，样式也可以在三个显示位置通过名称外层的 `data-provider-id` 和 `data-model-id` 属性定位。

### 不可路由的会话

当 Host 报告没有适配器服务该会话的路由时，本插件注册一个 composer 阻塞块，输入框随之停用并显示本插件自己的文案；恢复后无需重新加载即清除。首次加载之前或加载失败之后的 `null` 绝不阻断；目录成员关系同样不阻断——一条仍在服务、只是不公布该模型的路由不在分组里，却可用。

### 选择失败

当会话被其他写句柄占用时，模型选择失败提示用户退出其他正在运行的 DSH 后重试。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

两个入口共用一份由 `ModelDirectoryResolver`（`ctx.modelDirectories`）持有的会话级目录：`/model` popupSelect 贡献项（经 `ctx.commandUi` 注册）与 composer 的具名 `conversation.input.model` 位都经 `session.models` 加载会话的建议目录、经 `session.selectModel` 通过同一个 `ModelDirectory` 实例提交，因此任一入口所做的切换正是另一个入口接下来显示的。目录加载与选择共享一个代次计数器，旧响应不会覆盖新结果；连接重置丢弃所有常驻投影，并在显示前重新拉取 Host 恢复的选择。目录按会话惰性解析，随会话作用域一并 dispose（资源释放）；已寻址 subagent 会话不公开任一入口。每份常驻目录都会直接在转发的 `llm/adapters-updated`、`llm/models-updated` 与 `settings/document-updated` owner 事件上重拉。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

当仅了解模型界面还不够时，请阅读以下页面。这些页面从浏览器界面逐步深入到命令弹窗外壳与选择约定。

- [ui-commands](../ui-commands/README.zh.md)——`/model` 贡献项注册进的 popupSelect 外壳。
- [ui-conversation](../ui-conversation/README.zh.md)——声明 composer 的 `conversation.input.model` 位与 composer 阻塞块。
- [qilin-agent-default-model](../../core/agent-default-model/README.zh.md)——为从未选择的会话提供默认模型的默认模型服务。
- [客户端包映射](../README.zh.md)——相邻的浏览器 UI 包。

-----

<a id="model-experience"></a>
## 模型体验

两个入口提交的 `session.selectModel` 选择会间接影响模型：Host 会在下一次提示词组装边界为完整的 `ModelSelection` 创建快照，并负责使其对模型生效；运行中的步骤则保留已组装的选择。

#### KV Cache 影响

切换路由可能减少提供方侧后续请求的缓存复用，或使其失效；提示词前缀本身不受影响。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制界定了当前模型选择界面。它们是当前包约束，不是通用模型路由器对比或任务积压。

- **无创建期或已寻址 subagent 选择**——两个入口都要求既有普通会话的 agent（智能体）；没有可纳入会话创建的草稿阶段模型选择，subagent 继续执行也有意不公开独立的模型选择约定。
- **目录名仅供呈现**——选择与持久化使用提供方／模型／推理强度 id；目录查询或确切模型元数据查询失败的提供方以不可选失败行列出，重新加载前保持原样。
- **不能任意输入推理强度**——composer 仅提供确切模型由适配器公布的推理强度；适配器没有推理元数据时不显示 Effort 行。
- **角标只出现在 composer 模型位**——`/model` 弹窗各行、触发按钮的无障碍名称及其提示仍只显示目录名称。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>
