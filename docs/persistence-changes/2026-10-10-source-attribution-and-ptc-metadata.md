---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-10-source-attribution-and-ptc-metadata

English | [中文](2026-10-10-source-attribution-and-ptc-metadata.zh.md)

## Summary

Adds three attribution-only message source kinds, records a durable working-directory change event, and persists optional nested PTC presentation metadata.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-10-source-attribution-and-ptc-metadata
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-21-user-question-reply"
    after: "ffd19ae3eae1824d99dee649722fe6a35a6266816fdb3dbf6d45eade921f2b8b"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-09-21-user-question-reply"
    after: "c369a3b962a941958b768ca01ceba38e97417e1b45a21bcd4cd24371ccfa5334"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-09-21-user-question-reply"
    after: "f2c80c5726975ce263227fe63277825dfba9a90a989704e613759861aee10d1c"
    decision: same-version
  - root: "event:tool/ptc-dispatch"
    previous: "2026-09-16-session-format-v4"
    after: "154d6c6e9c3bdbeb174f6b3f1ebe95c403b75d11e163aa2236864040635d3cfc"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-09-21-user-question-reply"
    after: "6fc04c7ad381dd1550c230f30350e5688c2390c5a027a68f2d8565c465278dc8"
    decision: same-version
  - root: "event:working-directory/change"
    previous: null
    after: "92594da0c837153cd3f5619774508d72c1a3b1450217b970b4aa37b6c9b17e2b"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing records remain valid. fixture, sidechat-boundary, and working-directory are attribution-only source kinds: the declared source policy preserves unknown attribution without interpreting it, so a reader without the producer keeps the message content. The optional presentation meta on tool/ptc-dispatch sits outside model content and changes neither canonical program values, message ordering, nor tool identities. The new working-directory/change event is required on read, so an older build refuses a log containing it; the vocabulary grows without changing the structural Session format. The writer and accepted baseline stay at V4.

<a id="verification"></a>
## Verification

Four focused files passed 396 tests (packages/core/tools/tests 266, packages/client/ui-chat/tests/conversation-node-definitions.client.spec.ts plus packages/client/ui-trajectory/tests/conversation-definitions.client.spec.ts 85, packages/sdk/client/tests/sdk-client.spec.ts 45); pnpm run typecheck exited 0; python/sdk passed 29 tests under uv run --with pytest.

<a id="dev-note"></a>
## Dev Note

None.
