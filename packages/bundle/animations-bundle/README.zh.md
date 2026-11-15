---
description: "随安装提供、默认关闭的 dsh-animations 可选 Bundle，在插件页以“动效工坊”卡片提供开关。"
kind: "package-bundle"
---

# @qilin-agent/animations-bundle

[English](README.md) | 中文

## 概述

此 Bundle 把动效工坊技能包带进麒麟安装实例。它本身没有运行时代码：唯一一行插入 `dsh-animations`，由该依赖注册 8 个 HTML 动画技能与一段系统提示能力通告。本包提供卡片元数据与 `qilin.bundle.patch`，插件页因此提供一个内置开关，而不要求用户另行安装。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

在插件页的「内置插件」页签开启 **动效工坊** 卡片。该 Bundle 随安装提供、默认关闭且不可卸载；开启会把本包追加到 profile 的 `qilin.profile.bundles`，应用 `cordis.patch.yml` 并挂载依赖。关闭后，后续会话不再获得这 8 个 runtime skill 与能力通告。

<a id="understand-the-implementation"></a>
## 理解实现

补丁只有一行 `dsh-animations`，配置为 `announceToAgent: true`。依赖读取随包的 `skills/manifest.json`，逐个注册技能及其资源目录，并向 system prompt 注入路由通告；它没有客户端半边。

<a id="model-experience"></a>
## 模型体验

间接地，通过随包的 `dsh-animations` 依赖：开启此 Bundle 会挂载其技能与路由通告，模型可见内容由该依赖拥有。

#### KV Cache 影响

技能目录与提示词通告会改变切换时的请求前缀，并可能减少后续请求的提供方侧缓存复用。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **依赖是带版本的 npm 包**——本 Bundle 固定 `dsh-animations`；升级技能包需要在此提升依赖版本。
- **8 个技能作为一个整体**——卡片只有一个开关，profile 不能单独选择某个动画技能。

<a id="dev-note"></a>
### 开发备注

包装层让麒麟自己的卡片元数据与准入列表独立于上游包清单，同时原样复用其宿主半边。
