---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-09-14-image-offload

[English](2026-09-14-image-offload.md) | 中文

## 概述

用 image/offload 事件记录选中的图片出现位置，通过所属插件的消息投影派生 offloaded 标记。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-09-14-image-offload
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-11-initial"
    after: "c3cfdd2d78b0c2cc680b644a69a6e12f05002913f7b855d3c94751fdae5640f8"
    decision: same-version
  - root: "event:assistant/attempt"
    previous: "2026-09-11-initial"
    after: "18a61929b36e5bc871c4debaefbe6be286f7bee402b78929da2315e4745c58db"
    decision: same-version
  - root: "event:assistant/message"
    previous: "2026-09-11-initial"
    after: "e9453df05fc72268ed70a87beb6578ea7baf56124efe6a619c7085a9f30c8ca4"
    decision: same-version
  - root: "event:compaction/summary"
    previous: "2026-09-11-initial"
    after: "dd90a30b4b7efdada540930175a8b049a4e1ae090d8b74e32c76567b98219dcd"
    decision: same-version
  - root: "event:image/offload"
    previous: null
    after: "b3900b03cb3655d5d79aa218dc317524376b4a5b90c384992d4cf28d739daa8d"
    decision: same-version
  - root: "event:llm/retry"
    previous: "2026-09-11-initial"
    after: "5091606edcdd57939448749165081c29015ebedc207baa1db7e95a3e8702d6ad"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-09-11-initial"
    after: "460044ac814deacd9418d290fb3f5a203bded2944cfffe2fe16b48e1224b0eb3"
    decision: same-version
  - root: "event:system/message"
    previous: "2026-09-11-initial"
    after: "e26ab2f16b1132a7ca9a6ccb725597ef036b4ac68eeee0f47cb6bd6b0460bc71"
    decision: same-version
  - root: "event:team/message/queued"
    previous: "2026-09-11-initial"
    after: "47c83c534e7bb2a4eaf87a2bbbbcc0c6af029ff6373c5dd1619a77d8e5ea98a2"
    decision: same-version
  - root: "event:tool/ptc-dispatch"
    previous: "2026-09-12-auto-review-error-metadata"
    after: "bc4aefe3925b0128a3a718920bca82b1cc39f51dba7c47c18282e3706fe33302"
    decision: same-version
  - root: "event:tool/result"
    previous: "2026-09-12-auto-review-error-metadata"
    after: "8e60772aefe9f46db2c49f03ca84d1a34f03788691e68c9fd67de7f5b64f828b"
    decision: same-version
  - root: "event:turn/end"
    previous: "2026-09-11-initial"
    after: "8ac389ce0c52c6c8da26722334939532e95e8bae96ceaa3bc5bc81bdedb5098b"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-09-11-initial"
    after: "616a7e4d67bf1c7ea56e921ff49db74cd80822c944f609bc8007b93a5ef654a9"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

现有日志仍可读取。可选的图片字段 offloaded 使未标记的出现位置保持保留状态。新事件在读取时必须被识别：不认识 image/offload 的旧版本拒绝读取这些日志，当前读取器需要对应的消息投影。事件信封和结构性的 Session 格式版本不变。

<a id="verification"></a>
## 验证

Session 和图片省略测试覆盖事件校验、不可变消息投影、缺少处理器、恢复和重试。所选的 1,144 项测试和两项 TypeScript 图片快照通过。Python advanced SDK 录制已通过构建后的 qilin profile 刷新，包含独立的 image/offload 事件。

<a id="dev-note"></a>
## 开发备注

无。
