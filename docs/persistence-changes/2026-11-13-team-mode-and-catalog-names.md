---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-11-13-team-mode-and-catalog-names

English | [中文](2026-11-13-team-mode-and-catalog-names.zh.md)

## Summary

Records Team mode as a required Session fact and admits the named subagent catalog fact into the same writer generation.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-11-13-team-mode-and-catalog-names
baseline: false
changes:
  - root: "SessionHeader"
    previous: "2026-11-05-retired-fixture-source"
    after: "3ba034e9590c2ef5f57dbde1742846b7c3776f89aa9285fe6682bf98d6963f18"
    decision: version-bump
  - root: "event:subagent/catalog"
    previous: "2026-10-11-subagent-external-catalog"
    after: "e6adc9de30d7261b9ea463145f7e52a7cf0e28c75086db2d0858386eab45dd96"
    decision: version-bump
  - root: "event:team/mode"
    previous: null
    after: "a3c2d8bf46d07299ae6a8ffc0b3762a66e0b0c33210a2d7fcb481f9ceb745275"
    decision: version-bump
```

<a id="compatibility"></a>
## Compatibility

The writer stamps SessionHeader.version 7. A V6 reader refuses a log containing team/mode because the event is not ignorable, instead of reconstructing a Session that silently ignores its mode. V7 readers still read every V6 log: the V6-to-V7 edge steps only the header version, and catalog facts keep their versions 0 through 2 meaning while version 3 adds the name field. Team mode is log-only and never enters the model-visible surface, and a Session that never entered Team mode records no such event.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/session/session-format-v6-to-v7/tests: 38 tests passed. pnpm exec vitest run packages/team/agent-team/tests: 85 tests passed. pnpm run verify-persistence-formats: v0 through v7 verified (8 complete references).

<a id="dev-note"></a>
## Dev Note

None.
