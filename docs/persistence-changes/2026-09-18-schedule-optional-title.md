---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-09-18-schedule-optional-title

English | [中文](2026-09-18-schedule-optional-title.zh.md)

## Summary

Makes the stored title optional on the after, at, and every variants of a persisted schedule/change create record.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-09-18-schedule-optional-title
baseline: false
changes:
  - root: "event:schedule/change"
    previous: "2026-09-11-initial"
    after: "15ae0897fa5ec8a13fc6e0fa9071ed071febab2d34db2a812c93eef25c9f56e9"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

A version-1 Session event written before titles existed has no title member, so those logs decode and fold without one instead of being refused. Readers that require a name treat an absent title as an unnamed task. The Host task record still requires the member: the storage decoder rejects a stored task without it, and creation, update, and the schedule tools still require it.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/schedule packages/storage/storage-json: 20 files, 879 tests passed, including the decode of a create record without a title, the refusal of a malformed present title, and the required stored Host title.

<a id="dev-note"></a>
## Dev Note

None.
