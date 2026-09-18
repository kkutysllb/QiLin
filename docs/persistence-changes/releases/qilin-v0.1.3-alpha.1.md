---
description: "Retrospective Session persistence types and adjacent-release changes for qilin-v0.1.3-alpha.1."
kind: persistence-release
---

# Persistence release: qilin-v0.1.3-alpha.1

English | [中文](qilin-v0.1.3-alpha.1.zh.md)

## Summary

The writer format advances from 0 to 2 across these tags: the JSONL header replaces seedLength with required isSeeded, and session/end-seed gains optional inherited. assistant/chunk is removed, assistant/attempt is added, and assistant/message gains a required stream array. Team event payload versions advance from 1 to 2, alongside changes to shared content types and optional capturedFormatVersion/sessionFormatVersion metadata.

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
| Source tag | `qilin-v0.1.3-alpha.1` |
| Source date | 2026-09-04T09:16:23.000Z |
| Release record | Release object present. |
| Previous release | [qilin-v0.1.2-rc.1](qilin-v0.1.2-rc.1.md) |
| Session writer version | 2 |
| Reconstructed inventory | <!-- persistence-release-inventory:start -->54 roots / 425 types<!-- persistence-release-inventory:end --> |
| This snapshot | [qilin-v0.1.3-alpha.1.schema.json](qilin-v0.1.3-alpha.1.schema.json) |

Source evidence for the writer version constant at this tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 2`

<a id="declaration"></a>
## Declaration

```yaml persistence-release
schemaVersion: 1
tag: qilin-v0.1.3-alpha.1
previous: qilin-v0.1.2-rc.1
sessionFormatVersion: 2
changes:
  - root: JsonlHeaderLine
    before: e80e639fc3801d351f28f95b8fa9247d00e15af0e65bd980cd376f12443ffe70
    after: 44330f7e3cda60fa8c4343730044a31e83605d29b256835b60aadf4c1bda66e3
  - root: SessionHeader
    before: 77035afc88bfaf97333b168d366e3c2fa858a9e4ccd1c71b9ea7ad3b83a0a223
    after: 57a2af826cbae9281e0c361afc57236011158f3a603f64f3a247c51182b45e5c
  - root: event:agent/inbox/spliced
    before: 3571a8297497b4a886dc0cc6468127989d7144d8a9d3be44848c297116c7f028
    after: 783b187ebf5f1d24e923cb0e3fd60b5a6544a3c851c1bfbbc3463388617b0475
  - root: event:assistant/attempt
    before: null
    after: 4f71344240c07c4737a7cc35c5c7bffcac3972dd07892cba6357ed54ecb74a5c
  - root: event:assistant/chunk
    before: faf8e7663e444251af07cceddf71d951bb9675b7a016dda5c1c468eaf2e5065a
    after: null
  - root: event:assistant/message
    before: e478dca2d0999a62f431c2765166396eca5cf8cd3a7d645a256e99c4132681a2
    after: 5fdc9586028272d102af906a74e4e8c248ff88cc8d5ef6cd34dc19fedf68aa30
  - root: event:compaction/summary
    before: 41bb0fff298288e22cbc0e0bbec787f9d129ccb1e7ffc7cc5bc3f4f9ab1bb018
    after: c5771633ccbfadb76179399c6eb759411d1f214f234feee71148501133c43083
  - root: event:session-log-deepseek/delivery-accepted
    before: 102eecd9c1889c120e36cabe58d3e1c575518f2c34dbb1843cb5b0a1916c2163
    after: f210abcc1afd6ad87dd9a82c645adb2be6eaed9ba5842d1f60095fa7f8b7ff23
  - root: event:session/end-seed
    before: 82660567837aac6aa0cb4012a1e84fb4311483704cefbc7fbf4d368bfd808ead
    after: 1909d58cdcd473618ef432da807e53d1c914f776f4c32f15cde2ffe513c73881
  - root: event:session/title-llm-request
    before: 81680595ce19cd7b4fc038ac5a9ace5b26c513a31e41c2acda5de2f71bcbb445
    after: 6a595a4811e990db4c28001a28c8a6362138f35283de62c4352e1d9ae684483c
  - root: event:team/member
    before: 63bed23b0a3a1687977d86baee8ac743fede402cd819a8fc0efa0dfb61717da8
    after: 75609058adbd64d89f1fa99d98328166ddea00314688d2aad3d9fd3e86494d00
  - root: event:team/message/delivered
    before: 7fe9be37b832dd7c94365fb67765f582ecd65512bf01f0b68f995252a3fda596
    after: a090f11909db8462bf294a9b5a98acaa92f016e6b945d32cb995e6f430810dd0
  - root: event:team/message/queued
    before: 39a43e22e6beb772461df9f4e44847be7b927bb40302ad3cbeaac387714c0e41
    after: 184c207efebc92299686fbab1d97794e93ac5d073bb3fc6283a145774344680e
  - root: event:team/task
    before: dc5948fd11768c22da34cfc48fa24dac1ff5f15640343e7d1991ac8f39c4169d
    after: 4d75f4921acce3c74edc4a9a3b2d022e2c95ed2b18a5bf74a8b48ec840411d75
  - root: event:tool/code-dispatch
    before: a33b54e2e423eff71fb5614f366152db3d4b3e2752294c47e0ede3dcf43f770a
    after: e23ccdd396bb096b110310d0b36ce68c41d717f05eb43e8006c012903f4ebeca
  - root: event:tool/result
    before: 66bee4199609086bd783e3efac66e1cfb93600262eb22115d714685730cf3a66
    after: 253a12354ef873465b8f7706cd81e178e1cee2f48bf1de04c76546ff15e5bb68
  - root: event:user/message
    before: 3210ec83169e0e2448c190bd4feb4edad73f7c19703519cf90e2edc39572dbcc
    after: 30a5aea28d034c6bdb6ebf7906b68a705ab3f479a9934e790bec1ea11915982c
```

<a id="changes"></a>
## Structural changes

<!-- persistence-release-changes:start -->

Detected 17 changed roots and 25 structural differences. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.

| Path | Change | Current minimum |
|---|---|---|
| `JsonlHeaderLine.seedLength` | `property-removed` | `version-bump` |
| `JsonlHeaderLine.isSeeded` | `required-property-added` | `version-bump` |
| `SessionHeader.version` | `type-changed` | `version-bump` |
| `event:agent/inbox/spliced.data.inserted[].content[]` | `union-variants-changed` | `version-bump` |
| `event:agent/inbox/spliced.data.inserted[].source.references[].capturedFormatVersion` | `optional-property-added` | `same-version` |
| `event:assistant/attempt` | `root-added` | `same-version` |
| `event:assistant/chunk` | `root-removed` | `version-bump` |
| `event:assistant/message.data.message.content[]` | `union-variants-changed` | `version-bump` |
| `event:assistant/message.data.stream` | `required-property-added` | `version-bump` |
| `event:compaction/summary.data` | `union-variants-changed` | `version-bump` |
| `event:session-log-deepseek/delivery-accepted.data.sessionFormatVersion` | `optional-property-added` | `same-version` |
| `event:session/end-seed.data.inherited` | `optional-property-added` | `same-version` |
| `event:session/end-seed.data` | `index-signature-changed` | `version-bump` |
| `event:session/title-llm-request.data.messages[].content[]` | `union-variants-changed` | `version-bump` |
| `event:session/title-llm-request.data.messages[].source.references[].capturedFormatVersion` | `optional-property-added` | `same-version` |
| `event:team/member.data.version` | `type-changed` | `version-bump` |
| `event:team/message/delivered.data.version` | `type-changed` | `version-bump` |
| `event:team/message/queued.data.message.content[]` | `union-variants-changed` | `version-bump` |
| `event:team/message/queued.data.message.delivery` | `property-removed` | `version-bump` |
| `event:team/message/queued.data.version` | `type-changed` | `version-bump` |
| `event:team/task.data.version` | `type-changed` | `version-bump` |
| `event:tool/code-dispatch.data.content[]` | `union-variants-changed` | `version-bump` |
| `event:tool/result.data.message.content[0].content[]` | `union-variants-changed` | `version-bump` |
| `event:user/message.data.content[]` | `union-variants-changed` | `version-bump` |
| `event:user/message.data.source.references[].capturedFormatVersion` | `optional-property-added` | `same-version` |

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
