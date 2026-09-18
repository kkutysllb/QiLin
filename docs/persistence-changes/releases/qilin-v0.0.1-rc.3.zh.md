---
description: "回溯 qilin-v0.0.1-rc.3 的已声明 Session 持久化类型及相邻版本变化。"
kind: persistence-release
---

# 持久化版本回溯: qilin-v0.0.1-rc.3

[English](qilin-v0.0.1-rc.3.md) | 中文

## 概述

四个 compact/* 事件键改为 compaction/*；用户消息来源的 kind 从 workspace-instructions 改为 agent-instructions，hook 方言从 claude 改为 claude-code。这些字面量及事件键发生变化时，写入格式仍为 0。

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
| 源码 tag | `qilin-v0.0.1-rc.3` |
| 源码日期 | 2026-08-12T20:18:26.000Z |
| 发行记录 | 只有 tag，没有 release 对象。 |
| 前一版本 | [qilin-v0.0.1-rc.2](qilin-v0.0.1-rc.2.zh.md) |
| Session 写入版本 | 0 |
| 完整重建清单 | <!-- persistence-release-inventory:start -->47 个根类型 / 374 种类型<!-- persistence-release-inventory:end --> |
| 本条快照 | [qilin-v0.0.1-rc.3.schema.json](qilin-v0.0.1-rc.3.schema.json) |

写入版本常量在该 tag 中的源码证据：

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## 声明

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
## 结构变化

<!-- persistence-release-changes:start -->

检测到 12 个根类型变化、12 项结构差异。下表的最低要求按当前规则计算，只用于比较；不表示旧版本曾遵守这些规则，也不证明迁移或运行时兼容性。

| 路径 | 变化 | 当前最低要求 |
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
## 校验

提取结果已通过规范图、根摘要和全部可达类型摘要校验；仅对历史 surface 事件允许源码原有的可选 `surfaceOp`。仓库内检查从前驱重建每个 tag，核对 before/after、快照覆盖和双语机器声明。

```sh
pnpm run verify-persistence-releases
```

<a id="dev-note"></a>
## 开发备注

无。
