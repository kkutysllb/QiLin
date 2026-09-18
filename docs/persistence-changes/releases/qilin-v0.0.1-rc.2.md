---
description: "Retrospective Session persistence types and adjacent-release changes for qilin-v0.0.1-rc.2."
kind: persistence-release
---

# Persistence release: qilin-v0.0.1-rc.2

English | [中文](qilin-v0.0.1-rc.2.zh.md)

## Summary

The event envelope gains optional ignorable, and schedule/change plus four tool-workflow events are added. The writer format remains 0.

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
| Source tag | `qilin-v0.0.1-rc.2` |
| Source date | 2026-08-11T15:04:55.000Z |
| Release record | Tag only; no release object. |
| Previous release | [qilin-v0.0.1-rc.1](qilin-v0.0.1-rc.1.md) |
| Session writer version | 0 |
| Reconstructed inventory | <!-- persistence-release-inventory:start -->47 roots / 374 types<!-- persistence-release-inventory:end --> |
| This snapshot | [qilin-v0.0.1-rc.2.schema.json](qilin-v0.0.1-rc.2.schema.json) |

Source evidence for the writer version constant at this tag:

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## Declaration

```yaml persistence-release
schemaVersion: 1
tag: qilin-v0.0.1-rc.2
previous: qilin-v0.0.1-rc.1
sessionFormatVersion: 0
changes:
  - root: SessionEventEnvelope
    before: 81063655072483a8fabf4f8efd962402d0feb1d40304e9e131c71d7c6afbfdbd
    after: e6e099e8c5577906208ed3beb2f76dd9566be2e6a3418c3ffc8d8ffd824a692e
  - root: event:agent-preset/selected
    before: 6aa3b3d1c46e5c4adae62629a0591f190f8c45ddf7e7a5ced63d3702b76e5b40
    after: c9abeb1be878617b6c35dc0403ad78c6f946d5681e65258b2309c739a9a929c2
  - root: event:agent/inbox/spliced
    before: 9b82f548a606fd073a3e91297071317d0c0690df204cdd2a15825f778e2f3a74
    after: 58f232d14e7de7d2a534d1d7dbe3501b8635834234c141cda51bf7b72e5c0139
  - root: event:approval/asked
    before: 094cf8c8e61b1b2021498bef277e89270ddc403fbe080c9b5a6bcf18e6ced3ee
    after: 127da95e367415d130f3bb3dadb4c39f466692c42cde7e756b90e50cf8ef78cb
  - root: event:approval/decided
    before: 027ed2c93dfee4842819b572fe5457e162234dbe28e389542a50f2f7b4ccbce7
    after: 3f6f01c3e1b9863677825517dbed5719adf9b6c955e01fa90938f054c4641e00
  - root: event:approval/policy
    before: b21d32a01214bc57635d0e4f7ce6adfcc9ffcbf538799f21b071eaf773d2bc14
    after: 00bf8297527398ea3c0a497354f4d029be4075cc7dc0149fcec75bd548b4b064
  - root: event:assistant/chunk
    before: 490fa112686738d83b1803923087812938f7c36313481178955d2a14226cf45a
    after: f2f093e0e7bf440002fccb7e95b28dc26b9206e11b267fd88b32040b212c052c
  - root: event:assistant/message
    before: d0100704bceb777fe4b63f00ba9347d57d381ca8d71ad49d1c54bf1e1745ecd1
    after: 6648340d10db0e99a66341f9a8c9f24aff182118919cc63c87053c1cfac1835c
  - root: event:command/done
    before: 4b70f0194b05fe0025c358d4194a25f5e0876b08390039adb3d617abd05f0df4
    after: e1b13c658b7137e6b7dc49245eb945333668db649842f02c8fd71feb0bbbcbe1
  - root: event:command/run
    before: f337368b47ccdcaf00ae8855808f57fd218d2a21d66c88ae2cc98ef719834b52
    after: 39e2925d1e624df4e386d062874927e4a4073466a89324945b8f71859f96ab5a
  - root: event:compact/end
    before: 7e93110a0aedbc6e2a2851e876e0ce2fd02d191cb66729b52769950c72d6b6ef
    after: 8c5412f03e68335c117db7d0e1d61de84ff8e14d6e01a85550605af209057f95
  - root: event:compact/prune
    before: 918817b7962cc177fac2c011cadc74f92d5927711ed0d17a2dbf4c400faf6cf5
    after: 97e4e8eef41c3f8d913f9a2d2eb9733ae6e3a229456a0607850a68869b81017f
  - root: event:compact/start
    before: df0a7b06c4efd1a94ac267fa0e1c32248eddd6e92df2c52cf44ab392c0d0ed9e
    after: 18b97ee45b781f9143b72294fa92c9809b3441e1577131da55d410bd649cf8fe
  - root: event:compact/summary
    before: 08a63b0e45c7d7a12dd2642025c832340b12d799161bc406379745115c48d633
    after: 6ba4a4a7865f610cd9e3262761b738b306be0d8e72bfb8a2ad3d509369121b56
  - root: event:feedback/record
    before: f73fa292a3dee44a49683d30ab4a6483e71024f4009581d35fb1fabdacf41778
    after: 5f9163423d1d2e9c027c80e49ccf99f96909789930fe207f6c93ac0afad75b57
  - root: event:goal/change
    before: 5e3d8d89b2c05ad14e4989ab69d4ef5c88449059d3e77ad8cf7555e23e4c994f
    after: bc20c8f52caf0089fa7bbf4cb663cee6bc5ef5385b98f2d8251893559c96ac0f
  - root: event:hook/invoked
    before: 0245d3882db18e492d4a6c346a1e398c29b8004d397ed868a3522b1b077e68ad
    after: 2d4afb349075eacb49e7fe7ba93d6934e4634ec8df47f8a9e4c973030556bf6a
  - root: event:hook/result
    before: 0cb59e15943bff2cffdb7c6cedfe105a53fab19a9fb58c037d6bc5aa6aeefa50
    after: a36fcb09e29a69783260c94084c6d9d38053c5c704fdd09ad481e71aff402b24
  - root: event:llm/retry
    before: c0a7a2323f8449ac4e9073c4c97caf179a813da505bade1fba63b25e614a3c7b
    after: 6db3c5383551b3bdd07234418cffc4eb7a88eba20558e1cbf497b856057901ec
  - root: event:llm/retry-started
    before: 90935820524182d6c2af21f56750e562e33137ca79d2e31a82742cfd564a7dee
    after: 98e3f7c0a4a706b4aa6a6578f8cdca9be12c1c58e36a79d1a73a6a0602baf32a
  - root: event:permission/preset
    before: 25b77d741d65f07c387cdb90f42a79b2f9aad4dffed53400bd9c4d9a45d04e89
    after: 3f71fdbd8291b0be2279d2862dd340ee4650a21ebb1b9418911d6df5a04a7dc9
  - root: event:plan/mode
    before: 062321652e0dd2d24850d7d2f9c2bad348cfeb3d49c75330606315c5959a3018
    after: 4b7103b8b80225722b2f718709a04a850495a3bcdd9ba7ba6ae07f3fb10de17a
  - root: event:request/context
    before: 5d5b5774187ac60bc9031c670f87dc64db1a17d1b53e25c3b3484d16902b134e
    after: 9dd86eb9031423c4f625884b7583cf7b59e08a4679abd2b32a3a3c0bb7c920b2
  - root: event:request/header
    before: b0f1f8ccd6ba3de14df09ab8c3fab636e4ec7920d808a9035d489ffae1ac4e32
    after: cfe1fbe1166a7224ab0f690449ef703bd49751f27590d7dd073463af65188516
  - root: event:sandbox/mode
    before: adad71a3e46cf34ba5658e5170d2bc4ad08cee8dd29d6a015469018187981870
    after: 7c9e7e4c21bf05c13ce9b80f23f8c531dcb7a87fbdb5a7272236e3b7002512e1
  - root: event:schedule/change
    before: null
    after: 9e3efc7bd63f2c8ac6f7ff4014155fec818d9959f2f0bbab733c5c2bfee58785
  - root: event:session/end-seed
    before: d373a740b167f65e04b2111d971873fe3a07784882b1c750fc57c43667dd381a
    after: 82660567837aac6aa0cb4012a1e84fb4311483704cefbc7fbf4d368bfd808ead
  - root: event:session/title
    before: 787eb0e0056d1fadbae05414578f12ef869ed6656267bc8f2ea73c714c3a06ac
    after: 01fca362a0bfa138953d584ed4d534dae52ddb160c3b42833285fbcd7efbf078
  - root: event:session/title-llm-request
    before: 8d57be25fa32383ad81472100e4311f1273b3610d43c6c4856be4d907a6cf3d9
    after: fa96a585f7e2bfc3c8f79f20040f5537a9ea9de6ffea199dbf861973e66fb94a
  - root: event:step/end
    before: 0728d108aaadf0bf341696e4009649cb775b2fa3af466939daaa1e1d0ddb85ee
    after: a62407fa5502cb1dd5771adc6ffd5f1695b464af15cbbc3fda98a4f18a173238
  - root: event:step/start
    before: 4b9f0843a13fabe9d7893b10c23e5cf8b661682004ac673fce98a3345aa4a350
    after: 75703eb560decf0ac1ac21e23c7e81a47f7563e12e55943e8207c5967d84925e
  - root: event:subagent/descriptor
    before: 653fc44d0e78a87ad8d5e4eb1591e00ffe56e435610cf205f3bf435eb32554c0
    after: 71ea32a30b83c14eb078faf58998b0cf53eb1276c375c4eb8414912b7263dac9
  - root: event:todo/write
    before: 3a51af196a9c3b5d5994c0091a6a9aa592864b293c3d1f15b1fa771c36519a09
    after: 4d416f8029171ec94969b49e1e005a1efdc32a0ff7917e3102be364a7fd758f8
  - root: event:tool-workflow/agent-end
    before: null
    after: d79b7e955a255d2099bbbbd01f4a4a3c611aa616272571cbae493abb970c70ac
  - root: event:tool-workflow/agent-start
    before: null
    after: 095b5754d63c8160a18b07a982a2478fe552efe56d68483b9f5a9481b753cc40
  - root: event:tool-workflow/run-end
    before: null
    after: ad31b24f5513db55a39e09d10784a0173d6a664e4c9bf90f22c32903c6a01b91
  - root: event:tool-workflow/run-start
    before: null
    after: 4db21577c1e7f76179989cfab7206069987c9fdff66e714c9062df8bb33ccc2e
  - root: event:tool/call
    before: 3ba963f8310e02e8d98bf94b4bd789c2f669ea1fef3dc8e1bf5296a6945e1540
    after: aa06dd6287342abc13e4bf118fac6cbf3d9b1eaf7579c0809f641c3e89633351
  - root: event:tool/code-dispatch
    before: 17b4d6ee5418c6e8f3134a76af1da0e5b7d1d5e091748b2456d9754ab476062b
    after: d1c6e3f7c2d88757ba229610b48e298f6c6760b23566c80a48427d81827d4b0a
  - root: event:tool/code-dispatch-start
    before: 8de3540d56ff87ffcbf67d630eeb73248fadd04dbac5bab69dde05d62340b528
    after: 8213273ec93e033e252ffc3c0e6d43ca4877247bdb9b8a052dc151ac2baa737b
  - root: event:tool/result
    before: eb5449b2b4561d0472eb77a4d791f57dfbbf7bcf7a09354683c09054c966a474
    after: ede3b35fff2fc1040dc8b08ee1bc98eedd868cec41e1078ce8f7684bb1bacf44
  - root: event:turn/end
    before: 568e0b89acfa1eb8dd094270ea06331567094544108dda193598cc629a189a2c
    after: f075f6683f9d7e9d199484c462b1a7e7769bc2efbfb45c0d62e5db67c631f0cc
  - root: event:turn/start
    before: daebbd08ef058621add19db71c746b2683e6ef057730229e307daefb3d990e67
    after: 64455f912ad2e99a049d015e3c585968fc58e5bd6a891527fc9f1f31dd6d594f
  - root: event:user/message
    before: fca10490469389854641fcd63b277eff3d311bb00496345c9edb41ad75e486c5
    after: a8d9513d06dd3b02f30ebff60cdd37747b21fe3df1bb2238255ca40be8115379
  - root: event:web/deepseek-search-llm-request
    before: 008d23506b190a830f9c366c2108e532bfd13404bac85f302e7a025a50a3cfa8
    after: 02d9dcc4442ed193a19e21ce35abdfea7c688a4557a5695f94a4a6fb0a078f77
```

<a id="changes"></a>
## Structural changes

<!-- persistence-release-changes:start -->

Detected 45 changed roots and 48 structural differences. The minimum below is calculated using current rules for comparison only; it does not assert historical compliance, migration correctness, or runtime compatibility.

| Path | Change | Current minimum |
|---|---|---|
| `SessionEventEnvelope` | `union-variants-changed` | `version-bump` |
| `event:agent-preset/selected.ignorable` | `optional-property-added` | `version-bump` |
| `event:agent/inbox/spliced.data.inserted[].source` | `union-variants-changed` | `version-bump` |
| `event:agent/inbox/spliced.ignorable` | `optional-property-added` | `version-bump` |
| `event:approval/asked.ignorable` | `optional-property-added` | `version-bump` |
| `event:approval/decided.ignorable` | `optional-property-added` | `version-bump` |
| `event:approval/policy.ignorable` | `optional-property-added` | `version-bump` |
| `event:assistant/chunk.ignorable` | `optional-property-added` | `version-bump` |
| `event:assistant/message.ignorable` | `optional-property-added` | `version-bump` |
| `event:command/done.ignorable` | `optional-property-added` | `version-bump` |
| `event:command/run.ignorable` | `optional-property-added` | `version-bump` |
| `event:compact/end.ignorable` | `optional-property-added` | `version-bump` |
| `event:compact/prune.ignorable` | `optional-property-added` | `version-bump` |
| `event:compact/start.ignorable` | `optional-property-added` | `version-bump` |
| `event:compact/summary.ignorable` | `optional-property-added` | `version-bump` |
| `event:feedback/record.ignorable` | `optional-property-added` | `version-bump` |
| `event:goal/change.ignorable` | `optional-property-added` | `version-bump` |
| `event:hook/invoked.ignorable` | `optional-property-added` | `version-bump` |
| `event:hook/result.ignorable` | `optional-property-added` | `version-bump` |
| `event:llm/retry.ignorable` | `optional-property-added` | `version-bump` |
| `event:llm/retry-started.ignorable` | `optional-property-added` | `version-bump` |
| `event:permission/preset.ignorable` | `optional-property-added` | `version-bump` |
| `event:plan/mode.ignorable` | `optional-property-added` | `version-bump` |
| `event:request/context.ignorable` | `optional-property-added` | `version-bump` |
| `event:request/header.ignorable` | `optional-property-added` | `version-bump` |
| `event:sandbox/mode.ignorable` | `optional-property-added` | `version-bump` |
| `event:schedule/change` | `root-added` | `same-version` |
| `event:session/end-seed.ignorable` | `optional-property-added` | `version-bump` |
| `event:session/title.ignorable` | `optional-property-added` | `version-bump` |
| `event:session/title-llm-request.data.messages[].source` | `union-variants-changed` | `version-bump` |
| `event:session/title-llm-request.ignorable` | `optional-property-added` | `version-bump` |
| `event:step/end.ignorable` | `optional-property-added` | `version-bump` |
| `event:step/start.ignorable` | `optional-property-added` | `version-bump` |
| `event:subagent/descriptor.ignorable` | `optional-property-added` | `version-bump` |
| `event:todo/write.ignorable` | `optional-property-added` | `version-bump` |
| `event:tool-workflow/agent-end` | `root-added` | `same-version` |
| `event:tool-workflow/agent-start` | `root-added` | `same-version` |
| `event:tool-workflow/run-end` | `root-added` | `same-version` |
| `event:tool-workflow/run-start` | `root-added` | `same-version` |
| `event:tool/call.ignorable` | `optional-property-added` | `version-bump` |
| `event:tool/code-dispatch.ignorable` | `optional-property-added` | `version-bump` |
| `event:tool/code-dispatch-start.ignorable` | `optional-property-added` | `version-bump` |
| `event:tool/result.ignorable` | `optional-property-added` | `version-bump` |
| `event:turn/end.ignorable` | `optional-property-added` | `version-bump` |
| `event:turn/start.ignorable` | `optional-property-added` | `version-bump` |
| `event:user/message.data.source` | `union-variants-changed` | `version-bump` |
| `event:user/message.ignorable` | `optional-property-added` | `version-bump` |
| `event:web/deepseek-search-llm-request.ignorable` | `optional-property-added` | `version-bump` |

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
