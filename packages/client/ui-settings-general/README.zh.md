---
description: "qilin Web 客户端的设置外壳、无特定功能归属文案与持久化产品引导命名空间：「通用」分区、面板界面框架与引导账本投影。"
kind: "package-reference"
---
<details>
# @qilin/client-ui-settings-general
<details>
[English](README.md) | 中文
<details>
## 概述
<details>
使用本包可为 qilin Web 客户端提供设置页、连接恢复控件、由功能包贡献的导航，以及依次进行的首次运行引导。用户从侧边栏页脚的头像菜单打开面板、立即重试失败的连接，并在宿主为回环浏览器提供本地配置文件时访问该文件。各功能包提供自己的设置行、分区和引导步骤；本包提供共享的界面展示，但不添加引导文案或「通用」分区的内置行。
<details>
## 目录
<details>
- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)
<details>
### 引导步骤
<details>
<a id="use-this-package"></a>
## 使用本包
<details>
用户从侧边栏页脚的头像菜单进入外壳，其中的 Settings 行调用 `ctx.settingsShell.open()`；功能插件通过本外壳所投影的 slot 账本贡献自己的页面与引导步骤。外壳自身不渲染任何 Settings 控件。面板关闭期间，侧边栏页脚中浅黄色的**连接异常**操作表示浏览器离线暂停；自动恢复期间显示**自动重连中**，其后一至三个点每 500ms 前进一次。鼠标悬浮或键盘聚焦任一黄色状态时，只有文案变为**立即重连**，背景保持不变；按压反馈留在黄色色阶内，选中后立即从 retry 1 开始。恢复后该区域变为浅绿色的**连接成功**，驻留 2 秒再消失。所有可见状态的文字都左对齐，且图标、文字起点、高度和宽度保持固定。首次启动与未曾中断的健康连接保持静默。外壳渲染设置页、由 `settings.section` 条目构建的导航，以及每次只挂载一个的引导步骤。
<details>
在 Desktop 中，账户行更新控件显示可用版本、进度、验证、就绪和持久重试反馈。预加载仅传递语义化阶段、版本、进度和失败类别；组件从当前 `settings` locale 解析全部可见与无障碍文案，并在应用内语言变化后同步更新。选择可用更新即开始下载；安装需要独立的壳拥有的确认。侧栏收起时，其顶部展开按钮以圆点显示相同状态。连接反馈通常优先展示，但壳报告正在安装时，预期的后端断开不能遮盖更新状态；失败后恢复连接反馈。两个控件共用一次载体订阅；浏览器代码不能选择安装包或授权安装。[Desktop 更新](../../../apps/desktop/README.zh.md)负责发布流程。
<details>
### 调整导航宽度
<details>
设置页导航初始宽度为 188px，其右边缘是一个纵向的、带指针捕获的分隔条：拖动会提交被限制在 160–360px 的宽度，分隔条使用来自 `settings` 命名空间的本地化可访问名称。宽度是外壳占位者本地的查看状态，因此面板卸载后即重置，不会持久化进设置文档。
<details>
### 分区卡片与「关于」
<details>
每个设置分区都会居中放在稳定的详情卡片中。页眉的**返回工作区**胶囊按钮与遮罩和 Escape 键共用同一条关闭路径。导航会把外壳自有的**关于 QiLin**条目固定在底部；该页面使用包含「麒」和「麟」两个汉字的麒麟标识介绍当前项目。`settings.about.mark` 席位允许当前 QiLin 品牌提供方渲染矢量印章；本地化的「麒麟」文字是明确的回退内容。
<details>
### 「通用」分区
<details>
「通用」分区承载由功能包注册进 `settings.general.item` 的行——它没有内置行。功能插件拥有行文案与行为；外壳只提供分区及其 slot。例如「外观」行位于 ui-theme。
<details>
### 引导步骤
<details>
引导账本按升序投影，每次只挂载一个步骤。注册方持有持久化完成状态、能力就绪状态、文案、变更操作与可见包装，因此独立注册的流程无法堆叠，外壳也不会成为第二个配置事实来源。可见步骤自行持有弹窗框架与应用根节点 `inert` 生命周期。

<details>

<a id="understand-the-implementation"></a>
<details>

<details>
<summary>实现细节——点击展开</summary>
<details>
外壳拥有界面框架与投影；每段内容与文案都属于某个注册方。
<details>
### 账本投影
<details>
导航是 `settings.section` 账本的投影；导航 label 可以是跟随语言的 thunk，经 `resolveSlotLabel` 解析，并在分区账本更新或 locale revision 变化时重新渲染（`ctx.get('locale')` 可选读取，无硬 locale 依赖）。引导账本按升序投影；当前注册方会收到该条目的 id、`complete()` 与 `openSection(id)` 回调，完成或跳过当前步骤后，所有权转交给下一项。
<details>
### 连接恢复
<details>
外壳是明确的恢复功能消费方，因此直接注入 Connection，而不把生命周期控制放进 `ctx.remote`。它的私有 hooks compartment 绑定 `ctx.connection.state`，组件只接收选出的状态与调用 `ctx.connection.reconnect()` 的注入回调。`ConnectionIndicator` 拥有内联展示并从 `settings` locale namespace 接收全部可见与无障碍文案；2 秒恢复状态计时器归外壳所有。
<details>
### 宿主端
<details>
宿主端是一个惰性的 Loader 条目：外壳的产品事实与策略完全位于浏览器半边。
<details>
</details>
<details>
### 引导步骤
<details>
<a id="further-exploration"></a>
## 进一步探索
<details>
以下页面覆盖设置界面家族与组合模型。
<details>
- [ui-settings](../ui-settings/README.zh.md)——本外壳所依赖 slot 类型与 scope 服务所在的领域底座。
- [ui-sidebar](../ui-sidebar/README.zh.md)——承载 `sidebar.settings` 席位的侧边栏外壳。
- [ui-settings-models](../ui-settings-models/README.zh.md)——贡献 DeepSeek 引导步骤的功能包。
- [settings](../../settings/README.zh.md)——持久化用户设置 seam 及其文件提供方。
- [slot 系统标准](../../../.agents/notes/implemented/architecture/2026-07-22-slot-type-chain-implementation.zh.md)——账本背后的组合模型。
<details>
### 引导步骤
<details>
<a id="model-experience"></a>
## 模型体验
<details>
无。该包是浏览器端 UI 插件层，不注册任何面向模型的内容。
<details>
#### KV Cache 影响
<details>
无；该包既不组装也不发送提供方请求。
<details>
## 已知限制与延期工作
<details>
<a id="known-limitations-and-deferred-work"></a>
<details>
<details>
这些限制说明外壳自身提供什么、功能包必须提供什么；它们是当前包约束。
<details>
- **「通用」分区没有内置行**：每一行仅在其所属功能插件挂载时出现；外壳单独无法填满该分区。
<details>
<a id="dev-note"></a>
### 开发备注
<details>

<summary>维护者的工作上下文——点击展开</summary>
<details>
无。
<details>
</details>
<details>
**运行时不变式：** 不发布伴生入口。settings seam 校验并发布持久 onboarding section，slot core 会拒绝冲突；本地 document action 由 store 与组件测试覆盖。
<details>