---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-10-source-attribution-and-ptc-metadata

[English](2026-10-10-source-attribution-and-ptc-metadata.md) | 中文

## 概述

新增三个仅用于归属的消息来源种类，记录持久的 working-directory 变更事件，并持久化可选的嵌套 PTC 展示元数据。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-10-source-attribution-and-ptc-metadata
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-21-user-question-reply"
    after: "ffd19ae3eae1824d99dee649722fe6a35a6266816fdb3dbf6d45eade921f2b8b"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-09-21-user-question-reply"
    after: "c369a3b962a941958b768ca01ceba38e97417e1b45a21bcd4cd24371ccfa5334"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-09-21-user-question-reply"
    after: "f2c80c5726975ce263227fe63277825dfba9a90a989704e613759861aee10d1c"
    decision: same-version
  - root: "event:tool/ptc-dispatch"
    previous: "2026-09-16-session-format-v4"
    after: "154d6c6e9c3bdbeb174f6b3f1ebe95c403b75d11e163aa2236864040635d3cfc"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-09-21-user-question-reply"
    after: "6fc04c7ad381dd1550c230f30350e5688c2390c5a027a68f2d8565c465278dc8"
    decision: same-version
  - root: "event:working-directory/change"
    previous: null
    after: "92594da0c837153cd3f5619774508d72c1a3b1450217b970b4aa37b6c9b17e2b"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有记录仍然有效。fixture、sidechat-boundary 与 working-directory 都是仅用于归属的来源种类：已声明的来源策略在不解释未知归属的前提下保留它，因此缺少该生产者的一方仍然保留消息内容。tool/ptc-dispatch 上的可选展示元数据位于模型内容之外，不改变规范程序值、消息顺序或工具身份。新增的 working-directory/change 事件在读取时必需，因此旧构建会拒绝包含它的日志；词汇表扩展而不改变结构化 Session 格式。写入方与已接受的基线仍为 V4。

<a id="verification"></a>
## 验证

四个聚焦文件共 396 个测试通过（packages/core/tools/tests 266、packages/client/ui-chat/tests/conversation-node-definitions.client.spec.ts 与 packages/client/ui-trajectory/tests/conversation-definitions.client.spec.ts 共 85、packages/sdk/client/tests/sdk-client.spec.ts 45）；pnpm run typecheck 退出码 0；python/sdk 在 uv run --with pytest 下 29 个测试通过。

<a id="dev-note"></a>
## 开发备注

无。
