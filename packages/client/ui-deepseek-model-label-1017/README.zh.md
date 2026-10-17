---
description: "在输入框模型选择器中为官方 DeepSeek Flash 标签显示临时的 1017 角标。"
kind: "package-reference"
---

# @qilin-agent/client-ui-deepseek-model-label-1017

[English](README.md) | 中文

## 概述

本包在输入框模型选择器的 `DeepSeek-V4.1-Flash` 旁显示 `1017`：输入框触发按钮、根菜单的当前模型行和每个模型选项。它用共享 `Tag` 基元装饰可识别的官方条目，保留目录名称与请求 ID。Web 默认组合包含本插件；停用其条目即恢复纯目录名称。

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

Web bundle 包含本插件，桌面端使用该 bundle 时也会加载。本包没有配置字段。

只有提供方为 `deepseek-official` 或 `deepseek-account`、模型 ID 为 `deepseek-flash`，且目录名称恰好为 `DeepSeek-V4.1-Flash` 时才显示角标。其他提供方、ID 或名称保留目录文字，已经带日期的发布名称也保留。本仓库不组合账号路由，因此该条件中 `deepseek-account` 一侧永不匹配；它保持上游写法，后续移植无需改动。

角标依赖[模型选择](../ui-model-selection/README.zh.md)声明的模型标签 slot。移除该包后本包不贡献任何内容。

通过 profile patch 停用以下条目即可恢复目录名称：

```yaml
- id: ui-deepseek-model-label-1017
  disabled: true
```

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>内部实现 — 点击展开</summary>

浏览器入口通过 `ctx.slots.inject()` 向已有的 `conversation.input.model.label` slot 注册组件：它等待该声明，重新声明后重跑，并随自身 fiber 卸载。组件根据 owner props 派生标签，使用共享 `Tag` 基元，不拥有缓存、订阅、网络请求或模型选择状态。`deepseek-model-label-1017` 字典作为一个 effect 注册。Host 入口是空 `apply`，让包留在 host roster 上。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

以下包分别拥有选择器和目录来源。

- [模型选择](../ui-model-selection/README.zh.md) — 名称显示位置与选择行为。
- [DeepSeek 传输](../../llm/llm-deepseek/README.zh.md) — 内置模型目录。

-----

<a id="model-experience"></a>
## 模型体验

无，本包只装饰浏览器标签，不改变模型请求或 Session 事件。

#### KV Cache effect

无；提供方请求及其缓存前缀保持不变。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

固定的版本标记有以下显示限制：

- 设置编辑器、`/model` 命令、触发按钮的无障碍文字及已有提示保留原始目录名称。
- 本包占用 `single` slot。其他模型名称插件若使用相同优先级会冲突，两种展示不会自动组合。
- 角标只匹配一个确切的目录名称。目录若改名 Flash 条目，标记会隐藏，而不是装饰新名称。
- `1017` 是固定的客户端展示，不是服务端能力声明，上游按临时形态提供。结构化版本标签替代它时，移除本包及其 bundle 条目。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
