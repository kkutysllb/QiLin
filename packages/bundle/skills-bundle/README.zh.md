---
description: "随安装提供、默认关闭的 dsh-skills-bundle 可选 Bundle，在插件页以“方法论技能包”卡片提供开关。"
kind: "package-bundle"
---

# @qilin-agent/skills-bundle

[English](README.md) | 中文

## 概述

此 Bundle 把方法论技能包带进麒麟安装实例。它本身没有运行时代码：唯一一行插入 `dsh-skills-bundle`，由该依赖在激活时注册 31 项核心 runtime skill，并通过设置分区提供 40 项可选长尾技能。本包提供卡片元数据与 `qilin.bundle.patch`，插件页因此提供一个内置开关，而不要求用户另行安装。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用此包

在插件页的「内置插件」页签开启 **方法论技能包** 卡片。该 Bundle 随安装提供、默认关闭且不可卸载；开启会把本包追加到 profile 的 `qilin.profile.bundles`，应用 `cordis.patch.yml` 并挂载依赖。31 项核心技能立即注册；打开设置页的 **可选技能** 分区，可逐项开启或关闭 40 项长尾技能。关闭 Bundle 后，两批技能与设置分区都会从后续会话移除。

<a id="understand-the-implementation"></a>
## 理解实现

补丁只有一行 `kcoder-skills`，指向 `dsh-skills-bundle`。依赖读取随包的 `skills/manifest.json`，注册核心技能及其资源目录，并为设置分区提供仅限回环访问的目录/启停 API。可选技能集合持久化在插件自己的数据目录，不写入 profile 补丁。

<a id="model-experience"></a>
## 模型体验

间接地，通过随包的 `dsh-skills-bundle` 依赖：开启此 Bundle 会注册其核心技能，模型可见的技能描述与正文由该依赖拥有。

#### KV Cache 影响

增加或移除技能会改变组装后的技能面与请求前缀，并可能减少后续请求的提供方侧缓存复用。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与延期工作

- **依赖是带版本的 npm 包**——本 Bundle 固定 `dsh-skills-bundle`；升级技能包需要在此提升依赖版本。
- **核心技能是全有或全无**——卡片启停整个技能包；只有可选长尾批次提供逐项选择。
- **可选状态由设置分区拥有**——开启某个长尾技能只改插件自己的持久化集合，不改 profile 的组合包列表。

<a id="dev-note"></a>
### 开发备注

包装层让麒麟自己的卡片元数据与准入列表独立于上游包清单，同时原样复用其宿主与客户端两半。
