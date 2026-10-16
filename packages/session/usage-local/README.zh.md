---
description: "单用户界面的本地用量账本：用 token-meter 派生，从本运行时自己的会话日志得到 /api/usage/me"
kind: "package-reference"
---

# @qilin-agent/usage-local

[English](README.md) | 中文

## 概述

单用户界面——桌面端、手工启动的 web 运行时——没有可读用量的部署账本。本插件就是这类界面的本地账本：在共享 API 通道上注册 `GET /api/usage/me`，并从本运行时拥有的会话日志推导答案，用 token-meter 派生折叠每一个 Turn。自带账本的部署通过外部账本上报用量，不挂载这一行。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在界面需要本地读取用量的组合中挂载这一行——随附的 Web/桌面 bundle 已经挂载。向监管者账本上报的部署组合不挂载它。

### 组合方式

```yaml
- name: '@qilin-agent/session'
- name: '@qilin-agent/session-query-sqlite'
- name: '@qilin-agent/usage-local'
```

本行不声明配置。它与其他 `/api` 调用方一样接受账户会话门禁的保护，未认证的请求在进入派生逻辑之前就会被拒绝。

### 读回用量

`GET /api/usage/me?from=<epoch ms>&to=<epoch ms>` 应答 `accountId`、全账本 `total`（所有可证明的 Turn，而不仅是窗口内）、按结束时间排序的窗口内 `records`，以及 `truncated: false`——读取的是完整日志，应答永远不会被截断。格式错误的窗口应答 `400` 与 `{ "error": { "code": "invalid-window" } }`。

<a id="understand-the-implementation"></a>
## 理解实现

处理器通过 session-query 服务枚举语料并读取每个会话的完整原始日志，把 `turn/start` 到 `turn/end` 交给 `deriveTurnTokenUsage` 折叠。尝试生命周期无法证明用量的 Turn 不会产生记录，也不会被估算——与上报侧遵循同一条规则。Turn 结束事件自身的时间戳就是记录的 `at`。

<a id="further-exploration"></a>
## 进一步探索

- [Token meter](../../llm/token-meter/README.zh.md) 拥有本账本使用的派生逻辑。
- [Usage report](../usage-report/README.zh.md) 是部署侧的一半：向监管者账本上报 Turn。
- [Session query](../../session-query/session-query/README.zh.md) 拥有本账本派生所用的语料读取。

<a id="model-experience"></a>
## 模型体验

无：本行只从本地会话日志派生一次 HTTP 读取，不增加任何提示词、工具 schema 或模型可见输出。

#### KV 缓存影响

该读取从不触碰 Session 的日志或上下文，因此每个 Session 的缓存占用不变。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办

- **账本按运行时计。** 只统计完整持久日志位于本运行时 home 中的 Turn；跨运行时的核算属于部署的外部账本，本行刻意不实现它。
- **无法证明的 Turn 不出现。** 尝试生命周期无法证明用量的 Turn 会被跳过而不是估算，因此页面可能少计崩溃的 Turn。
- **窗口读取扫描完整日志。** 没有增量索引；一次读取的成本是每个会话一次完整日志扫描，面向单用户的历史规模。

<a id="dev-note"></a>
### 开发备注

随附的 Web 与桌面 bundle 会挂载这一行——这些界面没有可读的外部账本；它不需要配置，只注入 `sessionQuery` 与 `connection`。
