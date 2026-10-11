---
description: "把每个已结算 Turn 的精确 token 用量上报给启动该运行时的部署监督者，供多账户部署的按账户账本使用。"
kind: "package-reference"
---

# @qilin-agent/usage-report

[English](README.md) | 中文

## 概述

一个 web 入口服务多账户的部署给每个账户一个自己的运行时，因此需要知道各自花了多少。本插件是这笔记账在运行时一侧的那一半：它跟随会话事件流，把一个 Turn 的持久尝试折成精确用量——与转录页显示的是同一套推导，且拒绝猜测——再投递给监督者指定的端点。不是由监督者启动的运行时没有这个端点，插件于是什么都不做。

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

每个运行时挂载一次。它不声明任何配置：部署提供两个环境变量，二者缺席就是唯一的开关。

| 变量 | 含义 |
|---|---|
| `QILIN_USAGE_URL` | 接受「每个已结算 Turn 一份 JSON 报告」的端点 |
| `QILIN_USAGE_TOKEN` | 该端点接受的凭据；部署把它绑定到本运行时服务的账户 |

启动运行时的监督者会写入这两者；手工启动的 `qilin` 两者都没有。一份报告就是一个 Turn，投递为尽力而为：

```json
{ "sessionId": "…", "turn": 3, "inputTokens": 4192, "outputTokens": 318,
  "cacheReadTokens": 3072, "at": 1791725148421 }
```

`inputTokens` 计的是按未命中计费的提示 token；`cacheReadTokens` 与 `cacheWriteTokens` 只在该 Turn 的每次尝试都报了它们时才出现；`at` 是本进程的上报时刻。端点**从凭据**判断账户，绝不从请求体判断。

### 投递

报告在 Turn 结束时发送一次。端点拒绝或不可达只写入 warning 级日志然后丢弃；账本是报告而非义务，因此遥测故障既不会拖延一个 Turn，也不会让它失败。

### 读回自己的用量

提供 web 传输的运行时还会为它自己的账户应答 `GET /api/usage/me`：把查询串（例如上报时间窗口 `?from=<epoch ms>&to=<epoch ms>`）连同同一凭据转发给账本。应答里带该账户的 `total`、窗口内按上报时间排序的 `records`，以及当账本里的 Turn 超过单次应答容量时的 `truncated`。该路由与其它 `/api` 调用一样受账户门禁保护，且读取由凭据限定作用域——一个运行时只可能读到自己的账户。账本不可达时返回 `503` 与 `{ "error": { "code": "ledger-unavailable" } }`，而不是一个空合计。

<a id="understand-the-implementation"></a>
## 理解实现

插件缓冲每个会话当前所在 Turn 的持久事件（`turn/start` 到 `turn/end`），用 token-meter 包的 `deriveTurnTokenUsage` 折叠它们。该推导拒绝推断用量：尝试生命周期不完整、样本不安全、或精确总数与各部分矛盾的 Turn 一律得不出结果，此时本插件不上报而不是上报估计值。本进程没有见过 `turn/start` 的 Turn——重放的历史，或在本行挂载之前就开始的会话——不在它能记账的范围内，直接跳过。

<a id="further-exploration"></a>
## 进一步探索

- [Token meter](../../llm/token-meter/README.zh.md) 拥有本插件所上报的那套推导。
- [Accounts](../../identity/accounts-local/README.zh.md) 拥有部署账本据以归属报告的名册。
- [CLI reference](../../../apps/cli/reference/README.zh.md) 记录了启动这些运行时的部署 flag。

<a id="model-experience"></a>
## 模型体验

无：本行只读取会话事件流并写入部署端点，不增加任何提示词、工具 schema 或模型可见输出。

#### KV 缓存影响

本行观察的请求都不被改动，因此每个 Session 的缓存占用不变。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办

- **报告不是持久义务。** 在 Turn 结束前死掉的进程会丢掉该 Turn 的报告，被丢弃的报告不会重试；账本汇总的是已到达的那些。
- **按 Turn 投递，而不是按请求。** 一个 Turn 内的重试被折进它的尝试里，因此账本显示的是该 Turn 结算的量，而不是每次调用的开销。
- **账本的归属由部署决定。** 凭据决定报告落在哪个账户名下；手工启动的运行时根本无法上报。

<a id="dev-note"></a>
### 开发备注

每个运行时都会挂载这一行（包括单账户的），而它在缺少那两个变量时是惰性的；这就是它不需要配置、也不需要按部署启用的原因。
