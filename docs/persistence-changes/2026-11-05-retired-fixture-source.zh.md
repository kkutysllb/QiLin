---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-05-retired-fixture-source

[English](2026-11-05-retired-fixture-source.md) | 中文

## 概述

删除浏览器开发夹具后，`fixture` 消息来源类别失去了唯一声明。该声明把 `{ kind: 'fixture' }` 与 7 成员 ContextFormed 联合相交，因此四条记录来源路径——`user/message`、`developer/message`、`agent/inbox/spliced` 的插入消息，以及 `session/title-llm-request` 记录的消息——各自一次性失去 7 个备选。移除既有备选属于破坏性的声明类型变更，因此 `SessionHeader.version` 由 5 推进到 6；其余 header 字段、事件正文与事件 envelope 均无变化。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-05-retired-fixture-source
baseline: false
changes:
  - root: "SessionHeader"
    previous: "2026-10-11-session-format-v5"
    after: "d4a8d69cf67a077443a1b4ee1712a4954b9f12c884d9a3cf588b7d4fc6d681a6"
    decision: version-bump
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-13-user-rpc-principal"
    after: "9fe729484a4adaf50dd178873c823582188fcce7766073e444f4c2f6214fe4d2"
    decision: version-bump
  - root: "event:developer/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "1692d09ef1e267f31e424960f9bdeed95a13dfd0beca7d6516394f0ff8439315"
    decision: version-bump
  - root: "event:session/title-llm-request"
    previous: "2026-10-13-user-rpc-principal"
    after: "4477d4869865b0f5bd32cc4614f068eb58ad6ad611a2b57b86dfbd2b267ba61b"
    decision: version-bump
  - root: "event:user/message"
    previous: "2026-10-13-user-rpc-principal"
    after: "2aae6f99e98debd212645ed930b457e5b0d195227debbbfb7354069c60e5bc2a"
    decision: version-bump
```

<a id="compatibility"></a>
## 兼容性

线上记录与 wire 数据没有变化。退役类别仅由客户端连接包的浏览器开发夹具模块声明，该模块已随本次发布移除，且任何随包写入器都未运行它，因此没有已存 Session 记录该类别，也没有 wire 消息携带它。历史日志若确实包含 `kind: "fixture"`，则原样保留：JSONL 提供方保留未知来源类别（`unknownKinds: preserve`），读取方按 merge-extensible 默认分支处理未识别备选，而不会拒绝该日志。因此相邻的 V5 到 V6 边只步进 header 版本，事件与紧凑 run 正文原样透传；它不做任何 payload 变换，并原样复用 V5 codec 与准入规则。由于该变更移除已声明联合备选而非新增或放宽备选，它必须由本次版本步进承接，不能以同版本形式确认。该边的实现见 [V5 到 V6 迁移包](../../packages/session/session-format-v5-to-v6/README.zh.md)。

<a id="verification"></a>
## 验证

`pnpm exec vitest run packages/session/session-format-v5-to-v6/tests` 通过 3 个文件、29 个用例，覆盖 header 步进、事件与紧凑 run 原样透传、V5 codec 复用与 V6 交付水位校验，语句与分支覆盖率均为 100%。`pnpm run verify-persistence-formats` 输出 `Persistence formats: v0 through v6 verified (7 complete references).`；`pnpm run verify-persistence-changes --check` 接受本记录作为全部检出变更的确认；`pnpm run doc-sync` 45 个门禁全部通过。

<a id="dev-note"></a>
## 开发备注

无。
