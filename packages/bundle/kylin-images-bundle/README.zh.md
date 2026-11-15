---
description: "随安装提供、默认关闭的 dsh-kylin-images 可选 Bundle，在插件页以“图像工坊”卡片提供开关。"
kind: "package-bundle"
---

# @qilin-agent/kylin-images-bundle

[English](README.md) | 中文

## 概述

此 Bundle 把图像工坊插件带进麒麟安装实例。它本身没有运行时代码：唯一一行插入 `dsh-kylin-images`，由该依赖提供图像工具、路由、技能与设置页。本包声明插件页读取的展示元数据与 `qilin.bundle.patch`，因此安装实例可以提供一个内置卡片，而不必让该能力进入每个 profile。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

在插件页的「内置插件」页签开启 **图像工坊** 卡片。该 Bundle 随安装提供、默认关闭且不可卸载；开启会把本包追加到 profile 的 `qilin.profile.bundles`，应用 `cordis.patch.yml` 并挂载依赖。关闭后，该 profile 不再加载图像工具、路由、技能与「图像工坊」设置项，但无需卸载本包。

<a id="understand-the-implementation"></a>
## 理解实现

补丁只有一行 `dsh-kylin-images`，带上插件的非敏感默认配置。依赖的宿主侧注册 `img_*` 工具、回环路由与 runtime skill；客户端侧在设置页注册「图像工坊」。凭据留在插件自己的 vault，不进入 profile 补丁。

<a id="model-experience"></a>
## 模型体验

间接地，通过随包的 `dsh-kylin-images` 依赖：开启此 Bundle 会挂载其工具与技能，模型可见内容由该依赖拥有。

#### KV Cache 影响

挂载内容会改变切换时的请求前缀，并可能减少后续请求的提供方侧缓存复用。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **依赖是带版本的 npm 包**——本 Bundle 固定 `dsh-kylin-images`；升级插件需要在此提升依赖版本，而不是复制源码。
- **卡片描述的是 Bundle，不是插件界面**——开启是全有或全无；模型通道与凭据仍由插件自己的设置分区管理。
- **依赖要求 Node 24**——`dsh-kylin-images` 声明 Node >=24；在 Node 22 上运行源码版 QiLin 不在其支持范围内。

<a id="dev-note"></a>
### 开发备注

包装层让麒麟自己的包元数据与准入列表独立于第三方包清单，同时原样复用其宿主与客户端两半。
