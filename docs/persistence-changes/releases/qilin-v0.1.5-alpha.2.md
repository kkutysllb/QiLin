---
description: "Retrospective Session persistence types and adjacent-release changes for qilin-v0.1.5-alpha.2."
kind: persistence-release
---

# Persistence release: qilin-v0.1.5-alpha.2

English | [中文](qilin-v0.1.5-alpha.2.zh.md)

## Summary

deliverables/presented and subagent/catalog are added. Feedback records gain optional category, feedback/record text becomes optional, and the writer format remains 3.

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
| Source tag | `qilin-v0.1.5-alpha.2` |
| Source date | 2026-09-09T14:13:03.000Z |
| Release record | Release object present. |
| Previous release | [qilin-v0.1.5-alpha.1](qilin-v0.1.5-alpha.1.md) |
| Session writer version | 3 |
| Reconstructed inventory | <!-- persistence-release-inventory:start -->59 roots / 462 types<!-- persistence-release-inventory:end --> |
| This snapshot | [qilin-v0.1.5-alpha.2.schema.json](qilin-v0.1.5-alpha.2.schema.json) |

Source evidence for the writer version constant at this tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 3`

<a id="declaration"></a>
## Declaration

```yaml persistence-release
schemaVersion: 1
tag: qilin-v0.1.5-alpha.2
previous: qilin-v0.1.5-alpha.1
sessionFormatVersion: 3
changes:
  - root: event:deliverables/presented
    before: null
    after: 84a6a6dc424edd2a676fb032be113dba3864b458b776e4bb626492f3a60effb6
  - root: event:feedback/message-put
    before: 4800ed647e01e96f4cb905fbf4a38558b24e9c931af3cb639ea4a2114d4f2a11
    after: d15919d5a460a430af34e61697f3d3a37a7e37087f62c83140364fb23e2383db
  - root: event:feedback/record
    before: 5f9163423d1d2e9c027c80e49ccf99f96909789930fe207f6c93ac0afad75b57
    after: ff61c86dabd35785849deda1f6eec9a9b264ef1130bf8a3f54aa89fbd2aac71c
  - root: event:subagent/catalog
    before: null
    after: 2d901288e91cc0e1229bd1922be57d08fddc0282991c600aaed6ab97031abc3a
```

<a id="changes"></a>
## Structural changes

<!-- persistence-release-changes:start -->

Detected 4 changed roots and 5 structural differences. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.

| Path | Change | Current minimum |
|---|---|---|
| `event:deliverables/presented` | `root-added` | `same-version` |
| `event:feedback/message-put.data.item.category` | `optional-property-added` | `same-version` |
| `event:feedback/record.data.text` | `property-made-optional` | `same-version` |
| `event:feedback/record.data.category` | `optional-property-added` | `same-version` |
| `event:subagent/catalog` | `root-added` | `same-version` |

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
