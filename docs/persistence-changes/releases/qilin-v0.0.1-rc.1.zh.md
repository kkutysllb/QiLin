---
description: "回溯 qilin-v0.0.1-rc.1 的已声明 Session 持久化类型及相邻版本变化。"
kind: persistence-release
---

# 持久化版本回溯: qilin-v0.0.1-rc.1

[English](qilin-v0.0.1-rc.1.md) | 中文

## 概述

这是现有 QILIN alpha/rc 标签中最早的版本，作为历史基线：包含 42 个持久化根类型，写入格式为 0。

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
| 源码 tag | `qilin-v0.0.1-rc.1` |
| 源码日期 | 2026-08-10T19:25:09.000Z |
| 发行记录 | 只有 tag，没有 release 对象。 |
| 前一版本 | 最早可用的预发行 tag；没有更早的比较输入。 |
| Session 写入版本 | 0 |
| 完整重建清单 | <!-- persistence-release-inventory:start -->42 个根类型 / 341 种类型<!-- persistence-release-inventory:end --> |
| 本条快照 | [qilin-v0.0.1-rc.1.schema.json](qilin-v0.0.1-rc.1.schema.json) |

写入版本常量在该 tag 中的源码证据：

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## 声明

```yaml persistence-release
schemaVersion: 1
tag: qilin-v0.0.1-rc.1
previous: null
sessionFormatVersion: 0
changes:
  - root: JsonlHeaderLine
    before: null
    after: e80e639fc3801d351f28f95b8fa9247d00e15af0e65bd980cd376f12443ffe70
  - root: SessionEventEnvelope
    before: null
    after: 81063655072483a8fabf4f8efd962402d0feb1d40304e9e131c71d7c6afbfdbd
  - root: SessionHeader
    before: null
    after: ad0970b1b63709bb65b27c32b70ce7e4aec4930f24eff568345f06de08176c85
  - root: event:agent-preset/selected
    before: null
    after: 6aa3b3d1c46e5c4adae62629a0591f190f8c45ddf7e7a5ced63d3702b76e5b40
  - root: event:agent/inbox/spliced
    before: null
    after: 9b82f548a606fd073a3e91297071317d0c0690df204cdd2a15825f778e2f3a74
  - root: event:approval/asked
    before: null
    after: 094cf8c8e61b1b2021498bef277e89270ddc403fbe080c9b5a6bcf18e6ced3ee
  - root: event:approval/decided
    before: null
    after: 027ed2c93dfee4842819b572fe5457e162234dbe28e389542a50f2f7b4ccbce7
  - root: event:approval/policy
    before: null
    after: b21d32a01214bc57635d0e4f7ce6adfcc9ffcbf538799f21b071eaf773d2bc14
  - root: event:assistant/chunk
    before: null
    after: 490fa112686738d83b1803923087812938f7c36313481178955d2a14226cf45a
  - root: event:assistant/message
    before: null
    after: d0100704bceb777fe4b63f00ba9347d57d381ca8d71ad49d1c54bf1e1745ecd1
  - root: event:command/done
    before: null
    after: 4b70f0194b05fe0025c358d4194a25f5e0876b08390039adb3d617abd05f0df4
  - root: event:command/run
    before: null
    after: f337368b47ccdcaf00ae8855808f57fd218d2a21d66c88ae2cc98ef719834b52
  - root: event:compact/end
    before: null
    after: 7e93110a0aedbc6e2a2851e876e0ce2fd02d191cb66729b52769950c72d6b6ef
  - root: event:compact/prune
    before: null
    after: 918817b7962cc177fac2c011cadc74f92d5927711ed0d17a2dbf4c400faf6cf5
  - root: event:compact/start
    before: null
    after: df0a7b06c4efd1a94ac267fa0e1c32248eddd6e92df2c52cf44ab392c0d0ed9e
  - root: event:compact/summary
    before: null
    after: 08a63b0e45c7d7a12dd2642025c832340b12d799161bc406379745115c48d633
  - root: event:feedback/record
    before: null
    after: f73fa292a3dee44a49683d30ab4a6483e71024f4009581d35fb1fabdacf41778
  - root: event:goal/change
    before: null
    after: 5e3d8d89b2c05ad14e4989ab69d4ef5c88449059d3e77ad8cf7555e23e4c994f
  - root: event:hook/invoked
    before: null
    after: 0245d3882db18e492d4a6c346a1e398c29b8004d397ed868a3522b1b077e68ad
  - root: event:hook/result
    before: null
    after: 0cb59e15943bff2cffdb7c6cedfe105a53fab19a9fb58c037d6bc5aa6aeefa50
  - root: event:llm/retry
    before: null
    after: c0a7a2323f8449ac4e9073c4c97caf179a813da505bade1fba63b25e614a3c7b
  - root: event:llm/retry-started
    before: null
    after: 90935820524182d6c2af21f56750e562e33137ca79d2e31a82742cfd564a7dee
  - root: event:permission/preset
    before: null
    after: 25b77d741d65f07c387cdb90f42a79b2f9aad4dffed53400bd9c4d9a45d04e89
  - root: event:plan/mode
    before: null
    after: 062321652e0dd2d24850d7d2f9c2bad348cfeb3d49c75330606315c5959a3018
  - root: event:request/context
    before: null
    after: 5d5b5774187ac60bc9031c670f87dc64db1a17d1b53e25c3b3484d16902b134e
  - root: event:request/header
    before: null
    after: b0f1f8ccd6ba3de14df09ab8c3fab636e4ec7920d808a9035d489ffae1ac4e32
  - root: event:sandbox/mode
    before: null
    after: adad71a3e46cf34ba5658e5170d2bc4ad08cee8dd29d6a015469018187981870
  - root: event:session/end-seed
    before: null
    after: d373a740b167f65e04b2111d971873fe3a07784882b1c750fc57c43667dd381a
  - root: event:session/title
    before: null
    after: 787eb0e0056d1fadbae05414578f12ef869ed6656267bc8f2ea73c714c3a06ac
  - root: event:session/title-llm-request
    before: null
    after: 8d57be25fa32383ad81472100e4311f1273b3610d43c6c4856be4d907a6cf3d9
  - root: event:step/end
    before: null
    after: 0728d108aaadf0bf341696e4009649cb775b2fa3af466939daaa1e1d0ddb85ee
  - root: event:step/start
    before: null
    after: 4b9f0843a13fabe9d7893b10c23e5cf8b661682004ac673fce98a3345aa4a350
  - root: event:subagent/descriptor
    before: null
    after: 653fc44d0e78a87ad8d5e4eb1591e00ffe56e435610cf205f3bf435eb32554c0
  - root: event:todo/write
    before: null
    after: 3a51af196a9c3b5d5994c0091a6a9aa592864b293c3d1f15b1fa771c36519a09
  - root: event:tool/call
    before: null
    after: 3ba963f8310e02e8d98bf94b4bd789c2f669ea1fef3dc8e1bf5296a6945e1540
  - root: event:tool/code-dispatch
    before: null
    after: 17b4d6ee5418c6e8f3134a76af1da0e5b7d1d5e091748b2456d9754ab476062b
  - root: event:tool/code-dispatch-start
    before: null
    after: 8de3540d56ff87ffcbf67d630eeb73248fadd04dbac5bab69dde05d62340b528
  - root: event:tool/result
    before: null
    after: eb5449b2b4561d0472eb77a4d791f57dfbbf7bcf7a09354683c09054c966a474
  - root: event:turn/end
    before: null
    after: 568e0b89acfa1eb8dd094270ea06331567094544108dda193598cc629a189a2c
  - root: event:turn/start
    before: null
    after: daebbd08ef058621add19db71c746b2683e6ef057730229e307daefb3d990e67
  - root: event:user/message
    before: null
    after: fca10490469389854641fcd63b277eff3d311bb00496345c9edb41ad75e486c5
  - root: event:web/deepseek-search-llm-request
    before: null
    after: 008d23506b190a830f9c366c2108e532bfd13404bac85f302e7a025a50a3cfa8
```

<a id="changes"></a>
## 结构变化

<!-- persistence-release-changes:start -->

本条记录建立历史比较起点。机器声明列出所有提取的根类型，不对更早版本作兼容性判断。

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
