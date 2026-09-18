---
description: "Retrospective Session persistence types and adjacent-release changes for qilin-v0.1.1-rc.1."
kind: persistence-release
---

# Persistence release: qilin-v0.1.1-rc.1

English | [中文](qilin-v0.1.1-rc.1.zh.md)

## Summary

permission/preset gains optional origin with default, selection, and inferred values. The writer format remains 0.

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
| Source tag | `qilin-v0.1.1-rc.1` |
| Source date | 2026-08-21T06:21:44.000Z |
| Release record | Release object present. |
| Previous release | [qilin-v0.1.0-rc.8](qilin-v0.1.0-rc.8.md) |
| Session writer version | 0 |
| Reconstructed inventory | <!-- persistence-release-inventory:start -->51 roots / 407 types<!-- persistence-release-inventory:end --> |
| This snapshot | [qilin-v0.1.1-rc.1.schema.json](qilin-v0.1.1-rc.1.schema.json) |

Source evidence for the writer version constant at this tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## Declaration

```yaml persistence-release
schemaVersion: 1
tag: qilin-v0.1.1-rc.1
previous: qilin-v0.1.0-rc.8
sessionFormatVersion: 0
changes:
  - root: event:permission/preset
    before: 3f71fdbd8291b0be2279d2862dd340ee4650a21ebb1b9418911d6df5a04a7dc9
    after: 6f413b3e7c8f1d9ba249cc32799ffde6fe70ffbe78aa331555fced12c778e519
```

<a id="changes"></a>
## Structural changes

<!-- persistence-release-changes:start -->

Detected 1 changed root and 1 structural difference. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.

| Path | Change | Current minimum |
|---|---|---|
| `event:permission/preset.data.origin` | `optional-property-added` | `same-version` |

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
