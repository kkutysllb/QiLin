---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-10-17-job-session-lifecycle

English | [中文](2026-10-17-job-session-lifecycle.zh.md)

## Summary

Records owned job registration and settlement with one unique JobId, original timestamps, creating tool calls, and producer completion reports.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-10-17-job-session-lifecycle
baseline: false
changes:
  - root: "event:job/registered"
    previous: null
    after: "9eaf18d12d45a42fc6bf1f57f84a67e7cb3360800818a4317a9ba4bb5a520805"
    decision: same-version
  - root: "event:job/settled"
    previous: null
    after: "7c2fb6f1c5264fda5cb330b30743218ed6578e6b6044bab3f767e0c6dcabab3d"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Adds required job event kinds without changing the Session envelope. New JobIds use a kind-prefixed short UUID for both live controls and durable pairing; historical sessions receive no fabricated job history. Older builds reject unknown required events. producerReported describes completion-promise fulfillment, not verified resource release.

<a id="verification"></a>
## Verification

pnpm vitest run packages/jobs packages/sdk packages/api/job-controller: 178, 142, and 54 tests passed. Registry lifecycle specs cover causal order before hub reactions, unique short-UUID JobIds, and append-failure containment.

<a id="dev-note"></a>
## Dev Note

None.
