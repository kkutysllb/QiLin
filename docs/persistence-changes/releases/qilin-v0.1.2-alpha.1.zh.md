---
description: "回溯 qilin-v0.1.2-alpha.1 的已声明 Session 持久化类型及相邻版本变化。"
kind: persistence-release
---

# 持久化版本回溯: qilin-v0.1.2-alpha.1

[English](qilin-v0.1.2-alpha.1.md) | 中文

## 概述

事件信封删除 ignorable，request/header 新增可选字段 startsSeries 及原因值 series，并新增模型选择、子 Agent 模型策略和投递确认事件。尽管存在这些结构变化，写入格式仍为 0。

## 目录

- [发行来源](#evidence)
- [声明](#declaration)
- [结构变化](#changes)
- [校验](#verification)
- [开发备注](#dev-note)

-----

<a id="evidence"></a>
## 发行来源

这是供阅读和格式校验的近似回填，不是当时的兼容性确认。提取方法和覆盖限制见[归档说明](README.zh.md)。

| 项目 | 记录值 |
|---|---|
| 源码 tag | `qilin-v0.1.2-alpha.1` |
| 源码日期 | 2026-08-27T16:57:43.000Z |
| 发行记录 | 有 release 对象。 |
| 前一版本 | [qilin-v0.1.1-rc.2](qilin-v0.1.1-rc.2.zh.md) |
| Session 写入版本 | 0 |
| 完整重建清单 | <!-- persistence-release-inventory:start -->54 个根类型 / 417 种类型<!-- persistence-release-inventory:end --> |
| 本条快照 | [qilin-v0.1.2-alpha.1.schema.json](qilin-v0.1.2-alpha.1.schema.json) |

写入版本常量在该 tag 中的源码证据：

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## 声明

```yaml persistence-release
schemaVersion: 1
tag: qilin-v0.1.2-alpha.1
previous: qilin-v0.1.1-rc.2
sessionFormatVersion: 0
changes:
  - root: SessionEventEnvelope
    before: e6e099e8c5577906208ed3beb2f76dd9566be2e6a3418c3ffc8d8ffd824a692e
    after: 81063655072483a8fabf4f8efd962402d0feb1d40304e9e131c71d7c6afbfdbd
  - root: event:agent-preset/selected
    before: c9abeb1be878617b6c35dc0403ad78c6f946d5681e65258b2309c739a9a929c2
    after: 6aa3b3d1c46e5c4adae62629a0591f190f8c45ddf7e7a5ced63d3702b76e5b40
  - root: event:agent/inbox/spliced
    before: c8b3c784fc3b35c56bb826a6b8097ae0a035ff02b3826fb48a950b252f285de6
    after: fffa82723462e196716b17ec1f723c79f47a83331d5f56ccacdfcb6f2573f14f
  - root: event:approval/asked
    before: 127da95e367415d130f3bb3dadb4c39f466692c42cde7e756b90e50cf8ef78cb
    after: 094cf8c8e61b1b2021498bef277e89270ddc403fbe080c9b5a6bcf18e6ced3ee
  - root: event:approval/decided
    before: 3f6f01c3e1b9863677825517dbed5719adf9b6c955e01fa90938f054c4641e00
    after: 027ed2c93dfee4842819b572fe5457e162234dbe28e389542a50f2f7b4ccbce7
  - root: event:approval/policy
    before: 00bf8297527398ea3c0a497354f4d029be4075cc7dc0149fcec75bd548b4b064
    after: b21d32a01214bc57635d0e4f7ce6adfcc9ffcbf538799f21b071eaf773d2bc14
  - root: event:assistant/chunk
    before: d92a9da84c7c85ddf6b9935cb6e7de3698ce8e3dfd4f3df73b768bcc9f3f2e8e
    after: f714afa6312e9f9ca57187d106b85003848b9fa8851af5ab5ef2c85ddf38aea5
  - root: event:assistant/message
    before: d5958c8c5fb94559486149a11359ec3a17ea5a3c72c96a47d8f89bf5fbcaeb8f
    after: 571f73005523340868e6151cd268a4a1b14c1ba3bd48d70cc7a68a21001f9da1
  - root: event:command/done
    before: e1b13c658b7137e6b7dc49245eb945333668db649842f02c8fd71feb0bbbcbe1
    after: 4b70f0194b05fe0025c358d4194a25f5e0876b08390039adb3d617abd05f0df4
  - root: event:command/run
    before: 39e2925d1e624df4e386d062874927e4a4073466a89324945b8f71859f96ab5a
    after: f337368b47ccdcaf00ae8855808f57fd218d2a21d66c88ae2cc98ef719834b52
  - root: event:compaction/end
    before: 3d013d512b88ab163cd7724f3d7bc0c827a4fbb9496e5feecb510333d8b5d7b5
    after: a5b7a9e12a9d291de6375a78a302c5a66b35ef444105b5c697323d2b701ec67e
  - root: event:compaction/prune
    before: 0e945bd0de4230a4a89a53d521df897420cdce723246f8d0122d880e556f27a8
    after: b8dccb584001999d60ffde5799ce2c31390cce87d4004a402e96ca6eb1b7fd1e
  - root: event:compaction/start
    before: 8ba607ceecaaa5ec0dd6bf7d02c27fe96ea108a78b676a7878bdb3d9fe5fc636
    after: b7aba06b9092128a775405903345877668aaab2a1d2c571472bf75219ba9c458
  - root: event:compaction/summary
    before: bebad67f287de54d5e61f8af5f2bb96973d27129c5a781ac9674a2a18e603b9c
    after: f80cf2c3ff5492be132099d0902b24064885937511d7b3604a17afedf9c647f8
  - root: event:feedback/record
    before: 5f9163423d1d2e9c027c80e49ccf99f96909789930fe207f6c93ac0afad75b57
    after: f73fa292a3dee44a49683d30ab4a6483e71024f4009581d35fb1fabdacf41778
  - root: event:goal/change
    before: bc20c8f52caf0089fa7bbf4cb663cee6bc5ef5385b98f2d8251893559c96ac0f
    after: 5e3d8d89b2c05ad14e4989ab69d4ef5c88449059d3e77ad8cf7555e23e4c994f
  - root: event:hook/invoked
    before: b80b7e0307e20392445b88da64b5d4df063f367d7833d53a8e3f98d7505b0bde
    after: b5db2aac0484ba9c61c9c700b323326b769e1a9eca4859cdd40466acef7e5daf
  - root: event:hook/result
    before: a36fcb09e29a69783260c94084c6d9d38053c5c704fdd09ad481e71aff402b24
    after: 0cb59e15943bff2cffdb7c6cedfe105a53fab19a9fb58c037d6bc5aa6aeefa50
  - root: event:llm/retry
    before: 6db3c5383551b3bdd07234418cffc4eb7a88eba20558e1cbf497b856057901ec
    after: c0a7a2323f8449ac4e9073c4c97caf179a813da505bade1fba63b25e614a3c7b
  - root: event:llm/retry-started
    before: 98e3f7c0a4a706b4aa6a6578f8cdca9be12c1c58e36a79d1a73a6a0602baf32a
    after: 90935820524182d6c2af21f56750e562e33137ca79d2e31a82742cfd564a7dee
  - root: event:model/selection
    before: null
    after: 83cd5b1f5965dc4fc2bc61863a237812635c8aa2debf9bd09c054e25f7dc9949
  - root: event:permission/preset
    before: 3f71fdbd8291b0be2279d2862dd340ee4650a21ebb1b9418911d6df5a04a7dc9
    after: 25b77d741d65f07c387cdb90f42a79b2f9aad4dffed53400bd9c4d9a45d04e89
  - root: event:plan/mode
    before: 4b7103b8b80225722b2f718709a04a850495a3bcdd9ba7ba6ae07f3fb10de17a
    after: 062321652e0dd2d24850d7d2f9c2bad348cfeb3d49c75330606315c5959a3018
  - root: event:request/context
    before: 9dd86eb9031423c4f625884b7583cf7b59e08a4679abd2b32a3a3c0bb7c920b2
    after: 5d5b5774187ac60bc9031c670f87dc64db1a17d1b53e25c3b3484d16902b134e
  - root: event:request/header
    before: cfe1fbe1166a7224ab0f690449ef703bd49751f27590d7dd073463af65188516
    after: df5b2886e7f12f8d0d098a03b34e6bf0747144358cdfd86ae30cb39ee48bfd1c
  - root: event:sandbox/mode
    before: 7c9e7e4c21bf05c13ce9b80f23f8c531dcb7a87fbdb5a7272236e3b7002512e1
    after: adad71a3e46cf34ba5658e5170d2bc4ad08cee8dd29d6a015469018187981870
  - root: event:schedule/change
    before: 9e3efc7bd63f2c8ac6f7ff4014155fec818d9959f2f0bbab733c5c2bfee58785
    after: d56a9d5497c68cfdbcf58b7bc1a807cd36bd04837d4d339491209b548e1d0b70
  - root: event:session-log-deepseek/delivery-accepted
    before: null
    after: 1ef866387f38b176ce8cce7bb7416d6cf75626b7478d5c6d5bfb662212e54bc9
  - root: event:session/end-seed
    before: 82660567837aac6aa0cb4012a1e84fb4311483704cefbc7fbf4d368bfd808ead
    after: d373a740b167f65e04b2111d971873fe3a07784882b1c750fc57c43667dd381a
  - root: event:session/title
    before: 01fca362a0bfa138953d584ed4d534dae52ddb160c3b42833285fbcd7efbf078
    after: 787eb0e0056d1fadbae05414578f12ef869ed6656267bc8f2ea73c714c3a06ac
  - root: event:session/title-llm-request
    before: 623da285f9fad092fe3ebeec2979bcb81416c88585695a9dfcc45e21133af5f7
    after: 90f9a8e2313273835d778fe8ae29cc338a967d9cbcda14b84b94845dc9e869c9
  - root: event:step/end
    before: a62407fa5502cb1dd5771adc6ffd5f1695b464af15cbbc3fda98a4f18a173238
    after: 0728d108aaadf0bf341696e4009649cb775b2fa3af466939daaa1e1d0ddb85ee
  - root: event:step/start
    before: 75703eb560decf0ac1ac21e23c7e81a47f7563e12e55943e8207c5967d84925e
    after: 4b9f0843a13fabe9d7893b10c23e5cf8b661682004ac673fce98a3345aa4a350
  - root: event:subagent/descriptor
    before: 71ea32a30b83c14eb078faf58998b0cf53eb1276c375c4eb8414912b7263dac9
    after: 543a7e31f1dbfd9ff26af62032cc464966c183ff6c102f325814a610ab3b5044
  - root: event:subagent/model-selection-policy
    before: null
    after: c98babc22cc0fcaad07d82dc9711acbb2714132b27cad293230b31a6cdfe1ca5
  - root: event:team/member
    before: 63bed23b0a3a1687977d86baee8ac743fede402cd819a8fc0efa0dfb61717da8
    after: 6a8e753058b7ed3e17df1564b277794a75fe24f7832b459cfff0d4870335416c
  - root: event:team/message/delivered
    before: 7fe9be37b832dd7c94365fb67765f582ecd65512bf01f0b68f995252a3fda596
    after: 70db29f721e76c7fa4d26f2e8ef245989be56da583b752e969c5803c6b961efc
  - root: event:team/message/queued
    before: 39a43e22e6beb772461df9f4e44847be7b927bb40302ad3cbeaac387714c0e41
    after: 0b7994f956133c082969e3670ea4eea5402196f3457e5024e897654b6ead8e5f
  - root: event:team/task
    before: dc5948fd11768c22da34cfc48fa24dac1ff5f15640343e7d1991ac8f39c4169d
    after: 8c59aa3983b2a343dc84653dac5729f974028f35662f0099e50969e9639d0530
  - root: event:todo/write
    before: 4d416f8029171ec94969b49e1e005a1efdc32a0ff7917e3102be364a7fd758f8
    after: 3a51af196a9c3b5d5994c0091a6a9aa592864b293c3d1f15b1fa771c36519a09
  - root: event:tool-workflow/agent-end
    before: d79b7e955a255d2099bbbbd01f4a4a3c611aa616272571cbae493abb970c70ac
    after: 57559eefd3d0b67e91439e372aef766f438ee29a5e2cf0411fef127ec5993948
  - root: event:tool-workflow/agent-start
    before: 095b5754d63c8160a18b07a982a2478fe552efe56d68483b9f5a9481b753cc40
    after: 424c10c227e7492a7e6f9a989ee76984ec6b9384934bca98ff1b6f6ccfd599bc
  - root: event:tool-workflow/run-end
    before: ad31b24f5513db55a39e09d10784a0173d6a664e4c9bf90f22c32903c6a01b91
    after: e4bf15bd759dee9a296c9d74f2498c76c9ca0ca929051d63cb1f924635732e14
  - root: event:tool-workflow/run-start
    before: 4db21577c1e7f76179989cfab7206069987c9fdff66e714c9062df8bb33ccc2e
    after: ddcbdb504b33aaff81d33ccb04323886b2b84897b95c0851516eed9cd049a74d
  - root: event:tool/call
    before: aa06dd6287342abc13e4bf118fac6cbf3d9b1eaf7579c0809f641c3e89633351
    after: 3ba963f8310e02e8d98bf94b4bd789c2f669ea1fef3dc8e1bf5296a6945e1540
  - root: event:tool/code-dispatch
    before: a33b54e2e423eff71fb5614f366152db3d4b3e2752294c47e0ede3dcf43f770a
    after: 1baba49f060858839073d7de56d0881975f3fad15a8d778aa082355d83553ce5
  - root: event:tool/code-dispatch-start
    before: 8213273ec93e033e252ffc3c0e6d43ca4877247bdb9b8a052dc151ac2baa737b
    after: 8de3540d56ff87ffcbf67d630eeb73248fadd04dbac5bab69dde05d62340b528
  - root: event:tool/result
    before: 66bee4199609086bd783e3efac66e1cfb93600262eb22115d714685730cf3a66
    after: 31b8fffd0e9bb4fdf80e61a7b7b025127a56dbd6839ac912affc8a6742af223b
  - root: event:turn/end
    before: f075f6683f9d7e9d199484c462b1a7e7769bc2efbfb45c0d62e5db67c631f0cc
    after: 568e0b89acfa1eb8dd094270ea06331567094544108dda193598cc629a189a2c
  - root: event:turn/start
    before: 64455f912ad2e99a049d015e3c585968fc58e5bd6a891527fc9f1f31dd6d594f
    after: daebbd08ef058621add19db71c746b2683e6ef057730229e307daefb3d990e67
  - root: event:user/message
    before: a898723ab22e6af82568867d3d6aa0dd1419023757d5bfb429dc4325be1ede51
    after: 62409837006dd6f9fbbfec458b4060ffb2880a8420f02d235f0520773cc1adf9
  - root: event:web/deepseek-search-llm-request
    before: 02d9dcc4442ed193a19e21ce35abdfea7c688a4557a5695f94a4a6fb0a078f77
    after: 008d23506b190a830f9c366c2108e532bfd13404bac85f302e7a025a50a3cfa8
```

<a id="changes"></a>
## 结构变化

<!-- persistence-release-changes:start -->

检测到 52 个根类型变化、61 项结构差异。下表的最低要求按当前规则计算，只用于比较；不表示旧版本曾遵守这些规则，也不证明迁移或运行时兼容性。

| 路径 | 变化 | 当前最低要求 |
|---|---|---|
| `SessionEventEnvelope` | `union-variants-changed` | `version-bump` |
| `event:agent-preset/selected.ignorable` | `property-removed` | `version-bump` |
| `event:agent/inbox/spliced.data.inserted[].source` | `union-variants-changed` | `version-bump` |
| `event:agent/inbox/spliced.ignorable` | `property-removed` | `version-bump` |
| `event:approval/asked.ignorable` | `property-removed` | `version-bump` |
| `event:approval/decided.ignorable` | `property-removed` | `version-bump` |
| `event:approval/policy.ignorable` | `property-removed` | `version-bump` |
| `event:assistant/chunk.data.chunk.usage.totalTokens` | `optional-property-added` | `same-version` |
| `event:assistant/chunk.ignorable` | `property-removed` | `version-bump` |
| `event:assistant/message.data.usage.totalTokens` | `optional-property-added` | `same-version` |
| `event:assistant/message.ignorable` | `property-removed` | `version-bump` |
| `event:command/done.ignorable` | `property-removed` | `version-bump` |
| `event:command/run.ignorable` | `property-removed` | `version-bump` |
| `event:compaction/end.ignorable` | `property-removed` | `version-bump` |
| `event:compaction/prune.ignorable` | `property-removed` | `version-bump` |
| `event:compaction/start.ignorable` | `property-removed` | `version-bump` |
| `event:compaction/summary.data.usage.totalTokens` | `optional-property-added` | `same-version` |
| `event:compaction/summary.ignorable` | `property-removed` | `version-bump` |
| `event:feedback/record.ignorable` | `property-removed` | `version-bump` |
| `event:goal/change.ignorable` | `property-removed` | `version-bump` |
| `event:hook/invoked.ignorable` | `property-removed` | `version-bump` |
| `event:hook/result.ignorable` | `property-removed` | `version-bump` |
| `event:llm/retry.ignorable` | `property-removed` | `version-bump` |
| `event:llm/retry-started.ignorable` | `property-removed` | `version-bump` |
| `event:model/selection` | `root-added` | `same-version` |
| `event:permission/preset.ignorable` | `property-removed` | `version-bump` |
| `event:plan/mode.ignorable` | `property-removed` | `version-bump` |
| `event:request/context.ignorable` | `property-removed` | `version-bump` |
| `event:request/header.data.reason` | `union-variants-changed` | `version-bump` |
| `event:request/header.data.startsSeries` | `optional-property-added` | `same-version` |
| `event:request/header.ignorable` | `property-removed` | `version-bump` |
| `event:sandbox/mode.ignorable` | `property-removed` | `version-bump` |
| `event:schedule/change.ignorable` | `property-removed` | `version-bump` |
| `event:session-log-deepseek/delivery-accepted` | `root-added` | `same-version` |
| `event:session/end-seed.ignorable` | `property-removed` | `version-bump` |
| `event:session/title.ignorable` | `property-removed` | `version-bump` |
| `event:session/title-llm-request.data.messages[].source` | `union-variants-changed` | `version-bump` |
| `event:session/title-llm-request.ignorable` | `property-removed` | `version-bump` |
| `event:step/end.ignorable` | `property-removed` | `version-bump` |
| `event:step/start.ignorable` | `property-removed` | `version-bump` |
| `event:subagent/descriptor.data.agentReasoningEffort` | `optional-property-added` | `same-version` |
| `event:subagent/descriptor.ignorable` | `property-removed` | `version-bump` |
| `event:subagent/model-selection-policy` | `root-added` | `same-version` |
| `event:team/member.ignorable` | `property-removed` | `version-bump` |
| `event:team/message/delivered.ignorable` | `property-removed` | `version-bump` |
| `event:team/message/queued.ignorable` | `property-removed` | `version-bump` |
| `event:team/task.ignorable` | `property-removed` | `version-bump` |
| `event:todo/write.ignorable` | `property-removed` | `version-bump` |
| `event:tool-workflow/agent-end.ignorable` | `property-removed` | `version-bump` |
| `event:tool-workflow/agent-start.ignorable` | `property-removed` | `version-bump` |
| `event:tool-workflow/run-end.ignorable` | `property-removed` | `version-bump` |
| `event:tool-workflow/run-start.ignorable` | `property-removed` | `version-bump` |
| `event:tool/call.ignorable` | `property-removed` | `version-bump` |
| `event:tool/code-dispatch.ignorable` | `property-removed` | `version-bump` |
| `event:tool/code-dispatch-start.ignorable` | `property-removed` | `version-bump` |
| `event:tool/result.ignorable` | `property-removed` | `version-bump` |
| `event:turn/end.ignorable` | `property-removed` | `version-bump` |
| `event:turn/start.ignorable` | `property-removed` | `version-bump` |
| `event:user/message.data.source` | `union-variants-changed` | `version-bump` |
| `event:user/message.ignorable` | `property-removed` | `version-bump` |
| `event:web/deepseek-search-llm-request.ignorable` | `property-removed` | `version-bump` |

<!-- persistence-release-changes:end -->

<a id="verification"></a>
## 校验

提取结果已通过规范图、根摘要和全部可达类型摘要校验；仅对历史 surface 事件允许源码原有的可选 `surfaceOp`。仓库内检查从前驱重建每个 tag，核对 before/after、快照覆盖和双语机器声明。

```sh
pnpm run verify-persistence-releases
```

<a id="dev-note"></a>
## 开发备注

无。
