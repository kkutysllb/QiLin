---
description: "回溯 qilin-v0.1.5-alpha.1 的已声明 Session 持久化类型及相邻版本变化。"
kind: persistence-release
---

# 持久化版本回溯: qilin-v0.1.5-alpha.1

[English](qilin-v0.1.5-alpha.1.md) | 中文

## 概述

写入格式从 2 升至 3：新增 system/message，EpochHeader 删除 system。SurfaceOp 替换操作的字段从 start/end 改为 startSeq/endSeq，tool/code-dispatch 事件键改为 tool/ptc-dispatch 事件键。

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
| 源码 tag | `qilin-v0.1.5-alpha.1` |
| 源码日期 | 2026-09-08T15:25:45.000Z |
| 发行记录 | 有 release 对象。 |
| 前一版本 | [qilin-v0.1.3-alpha.2](qilin-v0.1.3-alpha.2.zh.md) |
| Session 写入版本 | 3 |
| 完整重建清单 | <!-- persistence-release-inventory:start -->57 个根类型 / 443 种类型<!-- persistence-release-inventory:end --> |
| 本条快照 | [qilin-v0.1.5-alpha.1.schema.json](qilin-v0.1.5-alpha.1.schema.json) |

写入版本常量在该 tag 中的源码证据：

- `packages/core/session/src/types.ts`: `export const SESSION_FORMAT_VERSION = 3`

<a id="declaration"></a>
## 声明

```yaml persistence-release
schemaVersion: 1
tag: qilin-v0.1.5-alpha.1
previous: qilin-v0.1.3-alpha.2
sessionFormatVersion: 3
changes:
  - root: SessionEventEnvelope
    before: e6e099e8c5577906208ed3beb2f76dd9566be2e6a3418c3ffc8d8ffd824a692e
    after: 6bd1fd7d981e2438db01a76dd08fd21f6fe1062cc435b54f9c12a5044def9dba
  - root: SessionHeader
    before: 57a2af826cbae9281e0c361afc57236011158f3a603f64f3a247c51182b45e5c
    after: 712af19bc288a9573370a3ac84d80fb0b512dc9ccfe27fdf057c79e133787441
  - root: event:assistant/message
    before: 5fdc9586028272d102af906a74e4e8c248ff88cc8d5ef6cd34dc19fedf68aa30
    after: 314eaf2529e873d0d3e0b063e772fea9c8a5ed8da4123c95616431c88be6643d
  - root: event:request/context
    before: 9dd86eb9031423c4f625884b7583cf7b59e08a4679abd2b32a3a3c0bb7c920b2
    after: 53dfbec638d2f3a375e83baf7f32bb8011814d41e4591235efd1ac9499e510d7
  - root: event:request/header
    before: 89540e2e4e4d80a6a0c1b79812d2c14f76bd21f2d4a71d5619d0b4af48cf1c8d
    after: 6c4cfa567b5233f1578b9d75081b32c2fd8818a93a1e1f58655eeb654354c764
  - root: event:system/message
    before: null
    after: e1d3751a8589457543f8d784b30405dfc65d091888ab6aae000dacf8df581297
  - root: event:tool/code-dispatch
    before: e23ccdd396bb096b110310d0b36ce68c41d717f05eb43e8006c012903f4ebeca
    after: null
  - root: event:tool/code-dispatch-start
    before: 8213273ec93e033e252ffc3c0e6d43ca4877247bdb9b8a052dc151ac2baa737b
    after: null
  - root: event:tool/ptc-dispatch
    before: null
    after: 79b2cc7627cda6169d963e55956639b66f45104f3833f180abaecaef20d5466b
  - root: event:tool/ptc-dispatch-start
    before: null
    after: 3a7c59a2828b3a88e55af4ddc15ac63a58fb89855be52610bfba32bd8919f192
  - root: event:tool/result
    before: 253a12354ef873465b8f7706cd81e178e1cee2f48bf1de04c76546ff15e5bb68
    after: a3a30e7aa21b7d5b5ff2682658a6da8925128a1746c908a156449d4988cfa8ab
  - root: event:user/message
    before: 30a5aea28d034c6bdb6ebf7906b68a705ab3f479a9934e790bec1ea11915982c
    after: 82fea288b3d82719e47cfc14ac9caa7d8cdadda8bbe10fb2decd4add27670148
```

<a id="changes"></a>
## 结构变化

<!-- persistence-release-changes:start -->

检测到 12 个根类型变化、25 项结构差异。下表的最低要求按当前规则计算，只用于比较；不表示旧版本曾遵守这些规则，也不证明迁移或运行时兼容性。

| 路径 | 变化 | 当前最低要求 |
|---|---|---|
| `SessionEventEnvelope` | `union-variants-changed` | `version-bump` |
| `SessionHeader.version` | `type-changed` | `version-bump` |
| `event:assistant/message.sourceEventSeqs` | `property-removed` | `version-bump` |
| `event:assistant/message.surfaceOp` | `property-made-required` | `version-bump` |
| `event:assistant/message.surfaceOp.end` | `property-removed` | `version-bump` |
| `event:assistant/message.surfaceOp.start` | `property-removed` | `version-bump` |
| `event:assistant/message.surfaceOp.endSeq` | `required-property-added` | `version-bump` |
| `event:assistant/message.surfaceOp.startSeq` | `required-property-added` | `version-bump` |
| `event:request/context.data.systemPromptUpdate` | `optional-property-added` | `same-version` |
| `event:request/header.data.header.system` | `property-removed` | `version-bump` |
| `event:system/message` | `root-added` | `version-bump` |
| `event:tool/code-dispatch` | `root-removed` | `version-bump` |
| `event:tool/code-dispatch-start` | `root-removed` | `version-bump` |
| `event:tool/ptc-dispatch` | `root-added` | `same-version` |
| `event:tool/ptc-dispatch-start` | `root-added` | `same-version` |
| `event:tool/result.surfaceOp` | `property-made-required` | `version-bump` |
| `event:tool/result.surfaceOp.end` | `property-removed` | `version-bump` |
| `event:tool/result.surfaceOp.start` | `property-removed` | `version-bump` |
| `event:tool/result.surfaceOp.endSeq` | `required-property-added` | `version-bump` |
| `event:tool/result.surfaceOp.startSeq` | `required-property-added` | `version-bump` |
| `event:user/message.surfaceOp` | `property-made-required` | `version-bump` |
| `event:user/message.surfaceOp.end` | `property-removed` | `version-bump` |
| `event:user/message.surfaceOp.start` | `property-removed` | `version-bump` |
| `event:user/message.surfaceOp.endSeq` | `required-property-added` | `version-bump` |
| `event:user/message.surfaceOp.startSeq` | `required-property-added` | `version-bump` |

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
