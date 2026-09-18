---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-09-12-auto-review-error-metadata

English | [中文](2026-09-12-auto-review-error-metadata.zh.md)

## Summary

Adds optional structured error metadata to persisted PTC dispatches and an optional user-facing reason to persisted native tool errors. Both additions retain the Session format version.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-09-12-auto-review-error-metadata
baseline: false
changes:
  - root: "event:tool/ptc-dispatch"
    previous: "2026-09-11-initial"
    after: "9491c9d5e55517d5a4b8318eac55af3c02e90c782b52f9dd6b029bdbcd0c84df"
    decision: same-version
  - root: "event:tool/result"
    previous: "2026-09-11-initial"
    after: "3ed0aec8bfb44e11daa3f6140f6115be93fa59e2a403983b71a4c03aee8e45f9"
    decision: same-version
```

<a id="compatibility"></a>
## Compatibility

Existing tool/ptc-dispatch events can omit error, and existing tool/result errors can omit reason. PTC dispatch events do not enter model history; native tool-result replay projects data.message and does not include error metadata. Older readers can ignore these additions without changing model replay. Current Web readers accept absent reasons and only display Auto review denial details when the recorded error identity matches. Permission mode remains a string in the existing event; selecting auto introduces no declared persistence-type change. No header, event envelope, or existing value type changes, and no adjacent migration is required.

<a id="verification"></a>
## Verification

pnpm exec vitest run scripts/persistence-changes.spec.ts scripts/persistence-schema.spec.ts passed 64 tests. Focused permission, Auto review, tool execution, agent-loop, subagent inheritance, and TypeScript SDK owner tests passed 390 tests across 10 files, including native and PTC denial metadata. uv run --python 3.10 --group test --project python/sdk pytest python/sdk/tests/test_client.py -k preserves_auto_review_errors passed 1 test. The persistence preview classified only the two optional additions and required no version bump.

<a id="dev-note"></a>
## Dev Note

None.
