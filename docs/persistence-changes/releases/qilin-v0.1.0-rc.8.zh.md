---
description: "回溯 qilin-v0.1.0-rc.8 的已声明 Session 持久化类型及相邻版本变化。"
kind: persistence-release
---

# 持久化版本回溯: qilin-v0.1.0-rc.8

[English](qilin-v0.1.0-rc.8.md) | 中文

## 概述

新增四种 team/* 事件及用户消息来源变体 team-message；assistant/message 新增可选字段 interrupted。写入格式仍为 0。

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
| 源码 tag | `qilin-v0.1.0-rc.8` |
| 源码日期 | 2026-08-19T15:11:50.000Z |
| 发行记录 | 有 release 对象。 |
| 前一版本 | [qilin-v0.1.0-rc.7](qilin-v0.1.0-rc.7.zh.md) |
| Session 写入版本 | 0 |
| 完整重建清单 | <!-- persistence-release-inventory:start -->51 个根类型 / 403 种类型<!-- persistence-release-inventory:end --> |
| 本条快照 | [qilin-v0.1.0-rc.8.schema.json](qilin-v0.1.0-rc.8.schema.json) |

写入版本常量在该 tag 中的源码证据：

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## 声明

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
## 结构变化

<!-- persistence-release-changes:start -->

检测到 8 个根类型变化、8 项结构差异。下表的最低要求按当前规则计算，只用于比较；不表示旧版本曾遵守这些规则，也不证明迁移或运行时兼容性。

| 路径 | 变化 | 当前最低要求 |
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
## 校验

提取结果已通过规范图、根摘要和全部可达类型摘要校验；仅对历史 surface 事件允许源码原有的可选 `surfaceOp`。仓库内检查从前驱重建每个 tag，核对 before/after、快照覆盖和双语机器声明。

```sh
pnpm run verify-persistence-releases
```

<a id="dev-note"></a>
## 开发备注

无。
