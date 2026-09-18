---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-09-14-workspace-changes-event

English | [中文](2026-09-14-workspace-changes-event.zh.md)

## Summary

Adds the log-only workspace/changes event that records the files a top-level turn changed.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-09-14-workspace-changes-event
baseline: false
changes:
  - root: "event:workspace/changes"
    previous: null
    after: "df7b1ffd02c3e01583164008ea205341fa35c4a769c45c18f630dd9a50753610"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

A new root in the same Session format version. Existing logs contain no such event and stay valid; readers that predate it refuse a log carrying it, as every required-on-read event does. The event is appended only by the Web bundle's workspace-changes plugin and is never model-visible; the Web changed-files card is its only consumer and reads the latest event per turn.

<a id="verification"></a>
## Verification

pnpm exec vitest run packages/deliverables/workspace-changes packages/client/ui-deliverables: 165 tests passed; snapshots/web/changed-files-turn replays the recorded event through the Web profile.

<a id="dev-note"></a>
## Dev Note

None.
