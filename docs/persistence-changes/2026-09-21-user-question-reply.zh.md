---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-09-21-user-question-reply

[English](2026-09-21-user-question-reply.md) | 中文

## 概述

新增受限定的 user-question-reply 消息来源，将已继续的 ask_user_question 调用的迟到回答送入 agent inbox。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-09-21-user-question-reply
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-16-session-format-v4"
    after: "0111c9b63e2bb61dc671d27e01ffa5286a6bb37ced1c7b9e6b982ce2b9ef807a"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-09-16-session-format-v4"
    after: "a66da8a304b342cfb814eb4aecd0157d757877a970ef91569b79b38f3c9d8239"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-09-16-session-format-v4"
    after: "505820ef2cbe21dbceb79433b59a9101dd14ce909696925574562bf9fa1366aa"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-09-16-session-format-v4"
    after: "334aaaef7feedf98e781f00f880f24c7bcc980b4ef0e5fa344127a0772d47eae"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有日志不含该来源，仍然有效。新来源是普通用户消息上的受限定归属；没有 dsh-user-questions 的读取方保留消息，并从内容推导历史。只有 userQuestions projection 读取该来源，关闭指定的问题并记录答案。answer RPC 是唯一生产方，只写入 outcome answered；关闭 Client 面板不会持久化回复。不新增事件类型，也不改变 Session header。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/interaction/user-questions/tests packages/interaction/tool-ask-user/tests：81 个测试通过。projection、reply、view 和 process-group 的定向测试共 70 个通过。pnpm run typecheck 通过。pnpm run doc-sync 的 42 项检查全部通过，包括持久化历史和翻译配对。

<a id="dev-note"></a>
## 开发备注

无。
