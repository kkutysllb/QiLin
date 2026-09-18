---
description: "回溯 qilin-v0.1.2-alpha.4 的已声明 Session 持久化类型及相邻版本变化。"
kind: persistence-release
---

# 持久化版本回溯: qilin-v0.1.2-alpha.4

[English](qilin-v0.1.2-alpha.4.md) | 中文

## 概述

逻辑 SessionHeader 以必需字段 isSeeded 替代可选字段 seedLength，但物理 JSONL 头仍声明 seedLength。用户消息来源变体 subagent-report 和 coordinator 改为 agent-message。写入格式仍为 0。

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
| 源码 tag | `qilin-v0.1.2-alpha.4` |
| 源码日期 | 2026-09-01T15:37:26.000Z |
| 发行记录 | 有 release 对象。 |
| 前一版本 | [qilin-v0.1.2-alpha.3](qilin-v0.1.2-alpha.3.zh.md) |
| Session 写入版本 | 0 |
| 完整重建清单 | <!-- persistence-release-inventory:start -->54 个根类型 / 415 种类型<!-- persistence-release-inventory:end --> |
| 本条快照 | [qilin-v0.1.2-alpha.4.schema.json](qilin-v0.1.2-alpha.4.schema.json) |

写入版本常量在该 tag 中的源码证据：

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 0`

<a id="declaration"></a>
## 声明

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
## 结构变化

<!-- persistence-release-changes:start -->

检测到 4 个根类型变化、5 项结构差异。下表的最低要求按当前规则计算，只用于比较；不表示旧版本曾遵守这些规则，也不证明迁移或运行时兼容性。

| 路径 | 变化 | 当前最低要求 |
|---|---|---|
| `SessionHeader.seedLength` | `property-removed` | `version-bump` |
| `SessionHeader.isSeeded` | `required-property-added` | `version-bump` |
| `event:agent/inbox/spliced.data.inserted[].source` | `union-variants-changed` | `version-bump` |
| `event:session/title-llm-request.data.messages[].source` | `union-variants-changed` | `version-bump` |
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
