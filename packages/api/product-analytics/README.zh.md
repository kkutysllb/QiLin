---
description: "桌面端上报产品用量所依据的事件映射，不含上游与之同发的采集器。"
kind: "package-reference"
---

# @qilin-agent/client-product-analytics

[English](README.md) | 中文

## 概述

`@qilin-agent/client-product-analytics` 发布桌面端上报产品用量所依据的事件名与字段类型，以及桌面渲染端的 `./client` 发送方——它经宿主已鉴权的分析 Remote 命名空间上报。它不带采集器：上游那个包的宿主插件、其生成的 Typert 面、locale 文件与环境采样都依赖本仓暂时没有的宿主包。

## 目录

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

在声明事件处引用映射，在发送处引用事件类型：

### 导航、预设与新会话事件

官方导航上报 New Session、插件、自动化任务与「更多」点击，并携带其物理位置：`sidebar`、`sidebar_more` 或 `titlebar`。从左侧栏「更多」菜单打开自动化任务记为 `sidebar_more`，而非直接的侧栏点击。缺少 `position` 的历史 `sidebar_menu_click` 记录保持无归属。「更多」菜单的动作区分侧栏、会话与右侧栏三个区域。第三方入口标识与自定义预设名不采集。

模式选择器中直接切换预设时，上报被接受且确实不同的选择：未绑定 Session 的暂存选择，或空白 Session 由 Host 应用的选择。自定义来源模式记为 `other`，只上报内置目标。默认值变更、自动回退、恢复与 Creator 入口不在此列。每次切换记录动作时已知的代码工作工具设置；设置未知时不上报。`code_work_view_toggle` 上报该设置的成功变更。

`send_button_click` 携带 `is_new_session`（提交的 Session 仍为空白时为 true）与 `agent_preset`（会话预设，内置值为 `creator`、`ptc`、`minimal`、`standard`，自定义预设为 `other`）；预设未知时省略 `agent_preset`。


<a id="dev-note"></a>
## 开发备注

上游包是 `deepseek-harness` 的 `the upstream client/product-analytics package`；它的宿主半边依赖 `@deepseek-ai/dsh-host-product-telemetry-otel`，本仓暂无对应物。

## Model Experience

None, as analytics adds no model context or Session events.

#### KV Cache effect

None; collection does not modify model requests.

## Known Limitations and Deferred Work

- 采集器、其宿主 Remote 方法与 locale 文件未移植。`./client` 发送方需要桌面宿主提供的分析 Remote 命名空间；本仓没有任何地方挂载它，因此宿主半边落地前该发送方不会被使用。
- 桌面端通过这些事件上报，发送方在桌面应用内，不在此处。
