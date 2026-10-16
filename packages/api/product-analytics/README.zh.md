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
