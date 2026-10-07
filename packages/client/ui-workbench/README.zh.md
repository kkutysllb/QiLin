---
description: "qilin Web 客户端的工作台标签状态属主：通用/编码选择、每个标签记住的新任务预设，以及预设到标签、工作区 Git 类型的会话可见性折叠。"
kind: "package-reference"
---

# @qilin/client-ui-workbench

[English](README.md) | 中文

## 概述

本包持有工作台选择：客户端界面显示两个工作台标签——通用或编码——中的哪一个，以及每个标签的新任务携带哪个 agent preset。它对外提供一个 `workbench` 客户端服务，内含持久化的选择、每标签的预设记忆，以及判断某个会话记录的预设是否属于某标签列表、无预设会话按其工作区 Git 类型归入哪个标签的可见性折叠。本包只管状态：切换标签、过滤列表、换绑会话的界面消费该服务，因此依赖边保持单向。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

两个标签是会话的筛选器，不是组装拆分。**通用**显示 standard 与 creator 预设；**编码**显示 coding 与 creator 预设。折叠未点名的预设——用户复制品或更新的部署随附的预设——在两个标签下都可见，因此自定义预设的会话永远不会从所有列表里消失；投影未到达的会话在任何标签下都保持可见。

新任务显式点名自己的预设（双工作台 D3）：通用标签默认 `standard`，编码标签默认 `ptc`，标签内的改选只为该标签记住。切换标签只是呈现变化；把屏上空白会话换绑到标签预设是调用方界面的职责，走预设 `select` remote——会话一旦开始，宿主拒绝换绑。

选择持久化在本浏览器 `qilin.workbench.v1` 下。它是按浏览器的视图偏好，与会话内容宽度同族，不是宿主用户设置：另一个浏览器或另一台机器从通用标签开始。

### 消费该服务

注入 `workbench` 服务并把 `state` 当作可观察快照读取。`setActive(tag)` 切换标签；`presetFor(tag)` 与 `setPresetFor(tag, presetId)` 读写每个标签记住的新任务选择；`shows(preset, tag)` 对单个会话的 `agentPreset` 投影值回答预设折叠，`workbenchFallbackShows(git, tag)` 对无预设会话的工作区回答 Git 类型折叠。折叠与标签词汇表也以纯值导出，测试无需启动服务即可断言成员关系。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部——点击展开</summary>

一个经共享 client-store localStorage 挂载持久化的快照存储：整体状态——活动标签加两个预设字段——是一份 JSON 文档，启动时按状态形状重新校验，旧构建或坏构建写入的文档会重置为默认值，而不是把未知标签漏进切换器。服务以名为 `workbench` 的 cordis Service 注册，不要求任何其他客户端服务；host 半是惰性 apply，让本包保持合法的 Loader entry。因为服务不持有 session 或 remote 访问，切换标签本身无法换绑任何东西；渲染切换器的界面就 D3 换绑回调会话导航，使 ui-workbench 与其消费方之间没有依赖环。

</details>

-----

<a id="model-experience"></a>
## 模型体验

无。该包是浏览器端的工作台视图状态，不注册任何面向模型的内容。

#### KV Cache 影响

自身没有；标签选择不给任何请求增加内容，也不订阅任何缓存前缀。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **标签映射是随附常量**——每个标签显示的预设 id 固定在代码里，不是配置。部署重命名或新增随附预设时，需要连同修改折叠。
- **选择按浏览器隔离**——换机器或换浏览器的用户从通用标签重新开始。宿主 settings 能让选择跟随账号；2026-09-14 的右栏 note 记录了这一族状态留在浏览器本地的理由。
- **没有从已移除预设选择器的迁移路径**——被 D4 停用的 ui-agent-preset 插件记住的是单一全局默认；本包不读该值。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

本 Dev Note 是维护者的工作上下文：未决的设计问题与方向，明确不具权威性——已发布的行为、限制与既定理由以上方章节、包代码与所链接的 Agent Note 为准。

#### 未来：部署需要时再提供 settings 支撑的标签

希望标签跟随账号的部署注册一个宿主 settings 命名空间，并在 localStorage 文档之上采纳它；状态形状已把持久化文档与折叠分开，替换只涉及属主的启动路径。

</details>
