---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-11-subagent-external-catalog

English | [中文](2026-10-11-subagent-external-catalog.zh.md)

## Summary

Adds the external-execution variant to the parent-owned subagent catalog event.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-11-subagent-external-catalog
baseline: false
changes:
  - root: "event:subagent/catalog"
    previous: "2026-09-20-unknown-child-catalog"
    after: "979bda52f82c57aed40934394184e1aecaba0dd1fb6ca5cfe9b348b215d02187"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing v0 and v1 records keep their meaning: v0 records local creation modes, and v1 also retains children whose mode an older writer could not classify. The new v2 payload records an external execution that has no local child Session, so a reader predating it meets an unrecognized version inside the chunked list; it must skip that entry instead of rejecting the log. No Session format version bump is required, and the catalog projection state version advances so cached views rebuild from the appended events.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/subagent/subagent/tests/catalog.spec.ts: 10 tests passed.

<a id="dev-note"></a>
## Dev Note

None.
