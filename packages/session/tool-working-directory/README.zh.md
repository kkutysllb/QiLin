---
description: "用同一个工具读取 Session 当前目录或进入既有目录。相对路径基于当前目录解析。返回的绝对路径可传给其他工具。"
kind: "package-reference"
---

# @qilin-agent/tool-working-directory

[English](README.md) | 中文

## 概述

用同一个工具读取 Session 当前目录或进入既有目录。相对路径基于当前目录解析。返回的绝对路径可传给其他工具。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

与 `tools`、`workingDirectory` 一同挂载。调用 `working_directory({})` 读取，或 `working_directory({ cd: "src" })` 切换目录。本工具没有配置字段。

```yaml
- name: '@qilin-agent/tool-working-directory'
```

-----

<a id="understand-the-implementation"></a>
## 理解实现

本工具把校验、恢复、持久化与上下文通知全部委托给目录所有者。其规范结果包含 `cwd`；原生渲染返回该路径。通用工具卡片展示参数与结果，不需要单独的 GUI 渲染器。

-----

<a id="further-exploration"></a>
## 延伸阅读

- [Session 组](../README.zh.md) — 持久 Session 服务。
- [工具目录](../../../docs/tool-catalog.zh.md) — 面向模型的工具 schema。
- [测试](../../../docs/testing.zh.md) — 组合与回放验收。

-----

<a id="model-experience"></a>
## 模型体验

### 工具 schema 与结果

#### 模型看到什么

[工具目录](../../../docs/tool-catalog.zh.md#qilin-agenttool-working-directory)定义了可选参数 `cd` 与规范结果 `cwd`。目录通知由 `@qilin-agent/working-directory` 持有。

#### token 影响

工具可用并被调用时，注册的 schema 与返回路径计入 token。

#### KV Cache 影响

工具可用性变化会改变请求中的 schema；目录变更本身不增加 schema token。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **目录变更按 Session 隔离** —— 既有 shell、后台任务与沙箱授权保持各自目录，本工具不会移动它们。

<a id="dev-note"></a>
### 开发备注

无。
