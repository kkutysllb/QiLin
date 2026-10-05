---
description: "让 QiLin 加载 DSH 时代插件 manifest 与模块名称的运行时兼容工具。"
kind: "package-library"
---

# @qilin/dsh-compat

[English](README.md) | 中文

## 概述

本包保持 DSH 插件生态在 QiLin 中可用。它会从原生的 `qilin` manifest 键或 DSH 时代的 `dsh` 键读取 bundle/client 声明，并把已重命名的 DSH 模块说明符归一化到 QiLin 的模块表条目。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

Profile 加载通过 `bundlePatchOf` 同时读取 `qilin.bundle.patch` 与 `dsh.bundle.patch`。客户端模块图和浏览器加载器通过 `clientDeclarationOf` 与 `dshCompatModuleId` 处理预构建 DSH 工厂，使其可以保留原有的 `require()` 名称。

精确的平台别名由 `DSH_PLATFORM_MODULE_ALIASES` 导出。未知的第三方名称保持不变；兼容层不会替换服务实现，也不会提供 Electron 专属 API。

-----

<a id="understand-the-implementation"></a>
## 实现说明

当两个键同时存在时，manifest 读取器优先使用 QiLin 声明。模块解析先应用精确别名，再把 `@deepseek-ai/dsh-<name>` 映射到 `@qilin/<name>`；其中 `client-runtime` 映射到 QiLin 的 `client-modules`。浏览器 shell 提供静态平台别名，动态图边与工厂请求在各自的加载器中归一化。

-----

<a id="model-experience"></a>
## 模型体验

无，因为本工具只映射 DSH 时代的 manifest 键与模块名称；它不改变任何 prompt、工具 schema、Session 事件或 token 预算。

#### KV Cache 影响

无；它不为请求增加任何内容，也不订阅任何缓存前缀。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **依赖引擎细节的 DSH 插件仍需逐个验证** —— 依赖引擎专属服务、资源 URL scheme 或 Electron bridge 的插件不在范围内。本包只处理 manifest 与模块身份兼容，不模拟 DSH 与 QiLin 之间已经漂移的 API。

<a id="dev-note"></a>
### 开发备注

别名表与 vendored coding-sidebar channel 使用的 DSH 到 QiLin 包名重写保持一致。只有在真实 DSH 包或 bundle 需要时增加映射，并同时覆盖图排序与浏览器 `require()` 行为。
