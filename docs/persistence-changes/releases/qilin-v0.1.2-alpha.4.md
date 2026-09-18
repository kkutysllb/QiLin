---
description: "Retrospective Session persistence types and adjacent-release changes for qilin-v0.1.2-alpha.4."
kind: persistence-release
---

# Persistence release: qilin-v0.1.2-alpha.4

English | [中文](qilin-v0.1.2-alpha.4.zh.md)

## Summary

The logical SessionHeader replaces optional seedLength with required isSeeded, while the physical JSONL header still declares seedLength. The subagent-report and coordinator user-message source variants become agent-message. The writer format remains 0.

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
| Source tag | `qilin-v0.1.2-alpha.4` |
| Source date | 2026-09-01T15:37:26.000Z |
| Release record | Release object present. |
| Previous release | [qilin-v0.1.2-alpha.3](qilin-v0.1.2-alpha.3.md) |
| Session writer version | 0 |
| Reconstructed inventory | <!-- persistence-release-inventory:start -->54 roots / 415 types<!-- persistence-release-inventory:end --> |
| This snapshot | [qilin-v0.1.2-alpha.4.schema.json](qilin-v0.1.2-alpha.4.schema.json) |

Source evidence for the writer version constant at this tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## Declaration

```yaml persistence-release
schemaVersion: 1
tag: qilin-v0.1.2-alpha.4
previous: qilin-v0.1.2-alpha.3
sessionFormatVersion: 0
changes:
  - root: SessionHeader
    before: ad0970b1b63709bb65b27c32b70ce7e4aec4930f24eff568345f06de08176c85
    after: 77035afc88bfaf97333b168d366e3c2fa858a9e4ccd1c71b9ea7ad3b83a0a223
  - root: event:agent/inbox/spliced
    before: af34b2a458b99db8fa54831b3be38c363f3794829e51de8bfd041dce948f6b57
    after: 3571a8297497b4a886dc0cc6468127989d7144d8a9d3be44848c297116c7f028
  - root: event:session/title-llm-request
    before: a014c48547e5585f7310bfe020c1620e88cb881cb650b099cbc1f4f8afdc58f5
    after: 81680595ce19cd7b4fc038ac5a9ace5b26c513a31e41c2acda5de2f71bcbb445
  - root: event:user/message
    before: 71d0413dde4836f5d66c496853093ef9e671ef7ce5bb3f17bdf9b01fcbf7c011
    after: 3210ec83169e0e2448c190bd4feb4edad73f7c19703519cf90e2edc39572dbcc
```

<a id="changes"></a>
## Structural changes

<!-- persistence-release-changes:start -->

Detected 4 changed roots and 5 structural differences. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.

| Path | Change | Current minimum |
|---|---|---|
| `SessionHeader.seedLength` | `property-removed` | `version-bump` |
| `SessionHeader.isSeeded` | `required-property-added` | `version-bump` |
| `event:agent/inbox/spliced.data.inserted[].source` | `union-variants-changed` | `version-bump` |
| `event:session/title-llm-request.data.messages[].source` | `union-variants-changed` | `version-bump` |
| `event:user/message.data.source` | `union-variants-changed` | `version-bump` |

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
