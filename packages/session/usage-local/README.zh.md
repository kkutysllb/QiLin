---
description: "单用户界面的本地用量账本：用 token-meter 派生，从本运行时自己的会话日志得到 /api/usage/me"
kind: "package-reference"
---

# @qilin-agent/usage-local

[English](README.md) | 中文

## Summary

单用户界面——桌面端、手工启动的 web 运行时——没有可读用量的部署账本。本插件就是这类界面的本地账本：在共享 API 通道上注册 `GET /api/usage/me`，并从本运行时拥有的会话日志推导答案，用 token-meter 派生折叠每一个 Turn。自带账本的部署通过外部账本上报用量，不挂载这一行。

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)

-----

<a id="use-this-package"></a>
## Use this package

在界面需要本地读取用量的组合中挂载这一行——随附的 Web/桌面 bundle 已经挂载。向监管者账本上报的部署组合不挂载它。

### Composition

```yaml
- name: '@qilin-agent/session'
- name: '@qilin-agent/session-query-sqlite'
- name: '@qilin-agent/usage-local'
```

本行不声明配置。它与其他 `/api` 调用方一样接受账户会话门禁的保护，未认证的请求在进入派生逻辑之前就会被拒绝。

### Reading it

`GET /api/usage/me?from=<epoch ms>&to=<epoch ms>` 应答 `accountId`、全账本 `total`（所有可证明的 Turn，而不仅是窗口内）、按结束时间排序的窗口内 `records`，以及 `truncated: false`——读取的是完整日志，应答永远不会被截断。格式错误的窗口应答 `400` 与 `{ "error": { "code": "invalid-window" } }`。

## Understand the implementation

处理器通过 session-query 服务枚举语料并读取每个会话的完整原始日志，把 `turn/start` 到 `turn/end` 交给 `deriveTurnTokenUsage` 折叠。尝试生命周期无法证明用量的 Turn 不会产生记录，也不会被估算——与上报侧遵循同一条规则。Turn 结束事件自身的时间戳就是记录的 `at`。

## Further Exploration

- [Token meter](../../llm/token-meter/README.md) 拥有本账本使用的派生逻辑。
- [Usage report](../usage-report/README.md) 是部署侧的一半：向监管者账本上报 Turn。
- [Session query](../../session-query/session-query/README.md) 拥有本账本派生所用的语料读取。

## Model Experience

None, as this row only derives an HTTP read from local session logs, adding no prompt, tool schema, or model-visible output.

#### KV Cache effect

The read never touches a Session's log or context, so every Session's cache footprint is unchanged.

## Known Limitations and Deferred Work

- **账本按运行时计。** 只统计完整持久日志位于本运行时 home 中的 Turn；跨运行时的核算属于部署的外部账本，本行刻意不实现它。
- **无法证明的 Turn 不出现。** 尝试生命周期无法证明用量的 Turn 会被跳过而不是估算，因此页面可能少计崩溃的 Turn。
- **窗口读取扫描完整日志。** 没有增量索引；一次读取的成本是每个会话一次完整日志扫描，面向单用户的历史规模。
