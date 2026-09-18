---
description: "回溯 qilin-v0.1.1-rc.2 的已声明 Session 持久化类型及相邻版本变化。"
kind: persistence-release
---

# 持久化版本回溯: qilin-v0.1.1-rc.2

[English](qilin-v0.1.1-rc.2.md) | 中文

## 概述

permission/preset 删除 origin；附件记录新增可选字段 originalDimensions，影响引用附件的消息及工具载荷。写入格式仍为 0。

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
| 源码 tag | `qilin-v0.1.1-rc.2` |
| 源码日期 | 2026-08-21T12:03:37.000Z |
| 发行记录 | 有 release 对象。 |
| 前一版本 | [qilin-v0.1.1-rc.1](qilin-v0.1.1-rc.1.zh.md) |
| Session 写入版本 | 0 |
| 完整重建清单 | <!-- persistence-release-inventory:start -->51 个根类型 / 404 种类型<!-- persistence-release-inventory:end --> |
| 本条快照 | [qilin-v0.1.1-rc.2.schema.json](qilin-v0.1.1-rc.2.schema.json) |

写入版本常量在该 tag 中的源码证据：

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## 声明

```yaml persistence-release
schemaVersion: 1
tag: qilin-v0.1.1-rc.2
previous: qilin-v0.1.1-rc.1
sessionFormatVersion: 0
changes:
  - root: event:agent/inbox/spliced
    before: 5b505aed059ac2e938678358778fa5e98bdecb6f783155dba9bfd8a77d2a75d8
    after: c8b3c784fc3b35c56bb826a6b8097ae0a035ff02b3826fb48a950b252f285de6
  - root: event:assistant/chunk
    before: 830ad53e5752464f5611450214facbe285da768d4de9f923ad35d275beaa3331
    after: d92a9da84c7c85ddf6b9935cb6e7de3698ce8e3dfd4f3df73b768bcc9f3f2e8e
  - root: event:assistant/message
    before: 7c9bc8eda30de7e12d13dbb5558c63d9479ae4a67dd66ac72c1c39368f081989
    after: d5958c8c5fb94559486149a11359ec3a17ea5a3c72c96a47d8f89bf5fbcaeb8f
  - root: event:compaction/summary
    before: 2e4b9d8c21f8cb8407ac9ef831714a3e820cdbc481a517f55541aa7361a6f08f
    after: bebad67f287de54d5e61f8af5f2bb96973d27129c5a781ac9674a2a18e603b9c
  - root: event:permission/preset
    before: 6f413b3e7c8f1d9ba249cc32799ffde6fe70ffbe78aa331555fced12c778e519
    after: 3f71fdbd8291b0be2279d2862dd340ee4650a21ebb1b9418911d6df5a04a7dc9
  - root: event:session/title-llm-request
    before: 23e5e30e4a1689ef78588840c79feb5d923ddb0bbdc13afd0c022a9ac95d2051
    after: 623da285f9fad092fe3ebeec2979bcb81416c88585695a9dfcc45e21133af5f7
  - root: event:team/message/queued
    before: b6558edfed1a45fed7bfd8bc8b65da322d5a2a6f62244d9adc85435fe870dd1b
    after: 39a43e22e6beb772461df9f4e44847be7b927bb40302ad3cbeaac387714c0e41
  - root: event:tool/code-dispatch
    before: d1c6e3f7c2d88757ba229610b48e298f6c6760b23566c80a48427d81827d4b0a
    after: a33b54e2e423eff71fb5614f366152db3d4b3e2752294c47e0ede3dcf43f770a
  - root: event:tool/result
    before: ede3b35fff2fc1040dc8b08ee1bc98eedd868cec41e1078ce8f7684bb1bacf44
    after: 66bee4199609086bd783e3efac66e1cfb93600262eb22115d714685730cf3a66
  - root: event:user/message
    before: a4d6fedc6db7d7d23b5731e427996113ea31cf5ba3947d664fc5b6f017cc5bd7
    after: a898723ab22e6af82568867d3d6aa0dd1419023757d5bfb429dc4325be1ede51
```

<a id="changes"></a>
## 结构变化

<!-- persistence-release-changes:start -->

检测到 10 个根类型变化、11 项结构差异。下表的最低要求按当前规则计算，只用于比较；不表示旧版本曾遵守这些规则，也不证明迁移或运行时兼容性。

| 路径 | 变化 | 当前最低要求 |
|---|---|---|
| `event:agent/inbox/spliced.data.inserted[].content[].attachment.originalDimensions` | `optional-property-added` | `same-version` |
| `event:assistant/chunk.data.chunk.block.attachment.originalDimensions` | `optional-property-added` | `same-version` |
| `event:assistant/message.data.message.content[].attachment.originalDimensions` | `optional-property-added` | `same-version` |
| `event:compaction/summary.data.rawOutput[].attachment.originalDimensions` | `optional-property-added` | `same-version` |
| `event:compaction/summary.data.summary[].attachment.originalDimensions` | `optional-property-added` | `same-version` |
| `event:permission/preset.data.origin` | `property-removed` | `version-bump` |
| `event:session/title-llm-request.data.messages[].content[].attachment.originalDimensions` | `optional-property-added` | `same-version` |
| `event:team/message/queued.data.message.content[].attachment.originalDimensions` | `optional-property-added` | `same-version` |
| `event:tool/code-dispatch.data.content[].attachment.originalDimensions` | `optional-property-added` | `same-version` |
| `event:tool/result.data.message.content[0].content[].attachment.originalDimensions` | `optional-property-added` | `same-version` |
| `event:user/message.data.content[].attachment.originalDimensions` | `optional-property-added` | `same-version` |

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
