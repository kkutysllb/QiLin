---
description: "Retrospective Session persistence types and adjacent-release changes for qilin-v0.0.1-rc.3."
kind: persistence-release
---

# Persistence release: qilin-v0.0.1-rc.3

English | [中文](qilin-v0.0.1-rc.3.zh.md)

## Summary

The four compact/* event keys become compaction/*; user-message source kind workspace-instructions becomes agent-instructions, and hook dialect claude becomes claude-code. These literal and event-key changes occur while the writer format remains 0.

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
| Source tag | `qilin-v0.0.1-rc.3` |
| Source date | 2026-08-12T20:18:26.000Z |
| Release record | Tag only; no release object. |
| Previous release | [qilin-v0.0.1-rc.2](qilin-v0.0.1-rc.2.md) |
| Session writer version | 0 |
| Reconstructed inventory | <!-- persistence-release-inventory:start -->47 roots / 374 types<!-- persistence-release-inventory:end --> |
| This snapshot | [qilin-v0.0.1-rc.3.schema.json](qilin-v0.0.1-rc.3.schema.json) |

Source evidence for the writer version constant at this tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## Declaration

```yaml persistence-release
schemaVersion: 1
tag: qilin-v0.0.1-rc.3
previous: qilin-v0.0.1-rc.2
sessionFormatVersion: 0
changes:
  - root: event:agent/inbox/spliced
    before: 58f232d14e7de7d2a534d1d7dbe3501b8635834234c141cda51bf7b72e5c0139
    after: 8e2b5ac90d3f0e0388c0613ce467dee59c95899993233d4f74cb4f9690940f1f
  - root: event:compact/end
    before: 8c5412f03e68335c117db7d0e1d61de84ff8e14d6e01a85550605af209057f95
    after: null
  - root: event:compact/prune
    before: 97e4e8eef41c3f8d913f9a2d2eb9733ae6e3a229456a0607850a68869b81017f
    after: null
  - root: event:compact/start
    before: 18b97ee45b781f9143b72294fa92c9809b3441e1577131da55d410bd649cf8fe
    after: null
  - root: event:compact/summary
    before: 6ba4a4a7865f610cd9e3262761b738b306be0d8e72bfb8a2ad3d509369121b56
    after: null
  - root: event:compaction/end
    before: null
    after: 3d013d512b88ab163cd7724f3d7bc0c827a4fbb9496e5feecb510333d8b5d7b5
  - root: event:compaction/prune
    before: null
    after: 0e945bd0de4230a4a89a53d521df897420cdce723246f8d0122d880e556f27a8
  - root: event:compaction/start
    before: null
    after: 8ba607ceecaaa5ec0dd6bf7d02c27fe96ea108a78b676a7878bdb3d9fe5fc636
  - root: event:compaction/summary
    before: null
    after: 2e4b9d8c21f8cb8407ac9ef831714a3e820cdbc481a517f55541aa7361a6f08f
  - root: event:hook/invoked
    before: 2d4afb349075eacb49e7fe7ba93d6934e4634ec8df47f8a9e4c973030556bf6a
    after: b80b7e0307e20392445b88da64b5d4df063f367d7833d53a8e3f98d7505b0bde
  - root: event:session/title-llm-request
    before: fa96a585f7e2bfc3c8f79f20040f5537a9ea9de6ffea199dbf861973e66fb94a
    after: 39fde2b3c870f5eafd688ac248a3a5cd871b016f884f3015a9b1dbb7ecf2a330
  - root: event:user/message
    before: a8d9513d06dd3b02f30ebff60cdd37747b21fe3df1bb2238255ca40be8115379
    after: 61d6c6edfbbff05655f4b6f87aadb7c4a143827b7db40d16d32265d481e3fb8a
```

<a id="changes"></a>
## Structural changes

<!-- persistence-release-changes:start -->

Detected 12 changed roots and 12 structural differences. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.

| Path | Change | Current minimum |
|---|---|---|
| `event:agent/inbox/spliced.data.inserted[].source.kind` | `type-changed` | `version-bump` |
| `event:compact/end` | `root-removed` | `version-bump` |
| `event:compact/prune` | `root-removed` | `version-bump` |
| `event:compact/start` | `root-removed` | `version-bump` |
| `event:compact/summary` | `root-removed` | `version-bump` |
| `event:compaction/end` | `root-added` | `same-version` |
| `event:compaction/prune` | `root-added` | `same-version` |
| `event:compaction/start` | `root-added` | `same-version` |
| `event:compaction/summary` | `root-added` | `same-version` |
| `event:hook/invoked.data.dialect` | `type-changed` | `version-bump` |
| `event:session/title-llm-request.data.messages[].source.kind` | `type-changed` | `version-bump` |
| `event:user/message.data.source.kind` | `type-changed` | `version-bump` |

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
