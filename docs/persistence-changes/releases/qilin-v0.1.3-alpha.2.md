---
description: "Retrospective Session persistence types and adjacent-release changes for qilin-v0.1.3-alpha.2."
kind: persistence-release
---

# Persistence release: qilin-v0.1.3-alpha.2

English | [中文](qilin-v0.1.3-alpha.2.zh.md)

## Summary

feedback/message-put and feedback/message-delete are added without changing the existing persistence root digests. The writer format remains 2.

## Table of Contents

- [Release evidence](#evidence)
- [Declaration](#declaration)
- [Structural changes](#changes)
- [Verification](#verification)
- [Dev Note](#dev-note)

-----

<a id="evidence"></a>
## Release evidence

This approximate backfill supports reading and format validation; it is not a contemporaneous compatibility acknowledgement. See the [archive reference](README.md) for extraction and coverage limits.

| Item | Recorded value |
|---|---|
| Source tag | `qilin-v0.1.3-alpha.2` |
| Source date | 2026-09-07T11:45:35.000Z |
| Release record | Release object present. |
| Previous release | [qilin-v0.1.3-alpha.1](qilin-v0.1.3-alpha.1.md) |
| Session writer version | 2 |
| Reconstructed inventory | <!-- persistence-release-inventory:start -->56 roots / 435 types<!-- persistence-release-inventory:end --> |
| This snapshot | [qilin-v0.1.3-alpha.2.schema.json](qilin-v0.1.3-alpha.2.schema.json) |

Source evidence for the writer version constant at this tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 2`

<a id="declaration"></a>
## Declaration

```yaml persistence-release
schemaVersion: 1
tag: qilin-v0.1.3-alpha.2
previous: qilin-v0.1.3-alpha.1
sessionFormatVersion: 2
changes:
  - root: event:feedback/message-delete
    before: null
    after: a5720e04949032e747f8720a40d9c24835cd482db77e5de8b172e3c665e4d79a
  - root: event:feedback/message-put
    before: null
    after: 4800ed647e01e96f4cb905fbf4a38558b24e9c931af3cb639ea4a2114d4f2a11
```

<a id="changes"></a>
## Structural changes

<!-- persistence-release-changes:start -->

Detected 2 changed roots and 2 structural differences. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.

| Path | Change | Current minimum |
|---|---|---|
| `event:feedback/message-delete` | `root-added` | `same-version` |
| `event:feedback/message-put` | `root-added` | `same-version` |

<!-- persistence-release-changes:end -->

<a id="verification"></a>
## Verification

Extraction passed canonical-graph, root-digest, and reachable-type-digest validation, permitting the original optional `surfaceOp` only for historical surface events. The in-tree check reconstructs each tag from its predecessor and verifies before/after values, snapshot coverage, and bilingual machine declarations.

```sh
pnpm run verify-persistence-releases
```

<a id="dev-note"></a>
## Dev Note

None.
