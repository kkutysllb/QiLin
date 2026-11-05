---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-05-retired-fixture-source

English | [中文](2026-11-05-retired-fixture-source.zh.md)

## Summary

Deleting the browser development fixture removed the only declaration of the `fixture` message-source kind. That declaration intersected `{ kind: 'fixture' }` with the seven-member ContextFormed union, so four recorded source paths — `user/message`, `developer/message`, the inserted messages of `agent/inbox/spliced`, and the recorded messages of `session/title-llm-request` — each lose seven alternatives at once. Removing existing alternatives is a breaking declared-type change, so `SessionHeader.version` advances from 5 to 6; no other header field, event body, or event envelope changes.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

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
## Compatibility

Online records and wire data are unchanged. The retired kind was declared only by the browser development fixture module of the client connection package, which this release removed and which no shipped writer ran, so no stored Session recorded it and no wire message carries it. A historical log that does contain `kind: "fixture"` keeps it verbatim: the JSONL provider preserves unknown source kinds (`unknownKinds: preserve`) and readers dispatch an unrecognized alternative through the merge-extensible default branch instead of refusing the log. The adjacent V5-to-V6 edge therefore steps only the header version and passes every event and the compact run body through unchanged; it applies no payload transformation and reuses the V5 codec and admission rules as they are. Because the change removes declared union alternatives rather than adding or loosening one, it requires this version bump and cannot be acknowledged at the same version. The edge's behavior lives in [the V5-to-V6 migration package](../../packages/session/session-format-v5-to-v6/README.md).

<a id="verification"></a>
## Verification

`pnpm exec vitest run packages/session/session-format-v5-to-v6/tests` passes 3 files and 29 tests covering the header step, verbatim event and compact-run passthrough, V5 codec reuse, and V6 delivery-watermark validation at full statement and branch coverage. `pnpm run verify-persistence-formats` reports `Persistence formats: v0 through v6 verified (7 complete references).`; `pnpm run verify-persistence-changes --check` accepts this record as the acknowledgement of every detected change; `pnpm run doc-sync` passes all 45 gates.

<a id="dev-note"></a>
## Dev Note

None.
