---
description: "Retrospective Session persistence types and adjacent-release changes for qilin-v0.1.0-rc.8."
kind: persistence-release
---

# Persistence release: qilin-v0.1.0-rc.8

English | [中文](qilin-v0.1.0-rc.8.zh.md)

## Summary

Four team/* events and the team-message user-message source variant are added; assistant/message gains optional interrupted. The writer format remains 0.

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
| Source tag | `qilin-v0.1.0-rc.8` |
| Source date | 2026-08-19T15:11:50.000Z |
| Release record | Release object present. |
| Previous release | [qilin-v0.1.0-rc.7](qilin-v0.1.0-rc.7.md) |
| Session writer version | 0 |
| Reconstructed inventory | <!-- persistence-release-inventory:start -->51 roots / 403 types<!-- persistence-release-inventory:end --> |
| This snapshot | [qilin-v0.1.0-rc.8.schema.json](qilin-v0.1.0-rc.8.schema.json) |

Source evidence for the writer version constant at this tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## Declaration

```yaml persistence-release
schemaVersion: 1
tag: qilin-v0.1.0-rc.8
previous: qilin-v0.1.0-rc.7
sessionFormatVersion: 0
changes:
  - root: event:agent/inbox/spliced
    before: 8e2b5ac90d3f0e0388c0613ce467dee59c95899993233d4f74cb4f9690940f1f
    after: 5b505aed059ac2e938678358778fa5e98bdecb6f783155dba9bfd8a77d2a75d8
  - root: event:assistant/message
    before: 6648340d10db0e99a66341f9a8c9f24aff182118919cc63c87053c1cfac1835c
    after: 7c9bc8eda30de7e12d13dbb5558c63d9479ae4a67dd66ac72c1c39368f081989
  - root: event:session/title-llm-request
    before: 39fde2b3c870f5eafd688ac248a3a5cd871b016f884f3015a9b1dbb7ecf2a330
    after: 23e5e30e4a1689ef78588840c79feb5d923ddb0bbdc13afd0c022a9ac95d2051
  - root: event:team/member
    before: null
    after: 63bed23b0a3a1687977d86baee8ac743fede402cd819a8fc0efa0dfb61717da8
  - root: event:team/message/delivered
    before: null
    after: 7fe9be37b832dd7c94365fb67765f582ecd65512bf01f0b68f995252a3fda596
  - root: event:team/message/queued
    before: null
    after: b6558edfed1a45fed7bfd8bc8b65da322d5a2a6f62244d9adc85435fe870dd1b
  - root: event:team/task
    before: null
    after: dc5948fd11768c22da34cfc48fa24dac1ff5f15640343e7d1991ac8f39c4169d
  - root: event:user/message
    before: 61d6c6edfbbff05655f4b6f87aadb7c4a143827b7db40d16d32265d481e3fb8a
    after: a4d6fedc6db7d7d23b5731e427996113ea31cf5ba3947d664fc5b6f017cc5bd7
```

<a id="changes"></a>
## Structural changes

<!-- persistence-release-changes:start -->

Detected 8 changed roots and 8 structural differences. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.

| Path | Change | Current minimum |
|---|---|---|
| `event:agent/inbox/spliced.data.inserted[].source` | `union-variants-changed` | `version-bump` |
| `event:assistant/message.data.interrupted` | `optional-property-added` | `same-version` |
| `event:session/title-llm-request.data.messages[].source` | `union-variants-changed` | `version-bump` |
| `event:team/member` | `root-added` | `same-version` |
| `event:team/message/delivered` | `root-added` | `same-version` |
| `event:team/message/queued` | `root-added` | `same-version` |
| `event:team/task` | `root-added` | `same-version` |
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
