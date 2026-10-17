---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-13-user-rpc-principal

English | [中文](2026-10-13-user-rpc-principal.zh.md)

## Summary

Adds an optional principal to the user-rpc message source for prompts submitted by a caller other than the owner.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-13-user-rpc-principal
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-10-source-attribution-and-ptc-metadata"
    after: "66e80c3282948757de1314b4bd83a3ca62ad4245893360e4dcdd96a08faad697"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-10-source-attribution-and-ptc-metadata"
    after: "8036634e542c25943579666649fa861b500370757705f8b3fa1f5fda05d3aa2f"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-10-source-attribution-and-ptc-metadata"
    after: "2346ab99de277c49ce2d3285e924019598099cc9c78d04d17b9554afe5f34455"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-10-source-attribution-and-ptc-metadata"
    after: "262e529437c928f8f44b4403fd01a44c5b85582b378f9bd35b85932c54b01258"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Owner prompts omit the field, so their sources and every existing Session log are unchanged; an absent principal means the owner. A reader that predates the field ignores it and treats the message as an ordinary user message, because the kind stays 'user'. A current reader of an older log finds no principal and treats every message as the owner's. The field is not part of any model request: provider adapters read only the model-visible message content. SESSION_FORMAT_VERSION does not change.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/api/session-controller/tests/commands-upload-file.host.spec.ts packages/api/session-controller/tests/time-zone.client.spec.ts packages/subagent/subagent/tests/control.spec.ts: owner prompts keep byte-identical sources, a non-owner caller persists source.principal on the follow-up source, and the owner records none; 43 tests passed.

<a id="dev-note"></a>
## Dev Note

None.
