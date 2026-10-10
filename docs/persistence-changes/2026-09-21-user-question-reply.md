---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-09-21-user-question-reply

English | [中文](2026-09-21-user-question-reply.zh.md)

## Summary

Adds a qualified user-question-reply message source for a late answer to a continued ask_user_question call.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Existing logs contain no such source and remain valid. The new source is qualified attribution on an ordinary user message; readers without dsh-user-questions preserve the message and derive history from its content. Only the userQuestions projection reads this source to close the named question and record its answers. The answer RPC is its only producer and writes outcome answered; closing the Client panel persists no reply. No event type or Session header changes.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/interaction/user-questions/tests packages/interaction/tool-ask-user/tests: 81 tests passed. The focused projection, reply, view, and process-group suite passed 70 tests. pnpm run typecheck passed. pnpm run doc-sync passed all 42 gates, including persistence history and translation pairing.

<a id="dev-note"></a>
## Dev Note

None.
