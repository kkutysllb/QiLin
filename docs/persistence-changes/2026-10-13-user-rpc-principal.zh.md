---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-13-user-rpc-principal

[English](2026-10-13-user-rpc-principal.md) | 中文

## 概述

为 user-rpc 消息来源新增可选 principal，记录非 owner 调用方提交的 prompt。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-13-user-rpc-principal
baseline: false
changes:
  - root: "event:agent/inbox/spliced"
    previous: "2026-10-10-source-attribution-and-ptc-metadata"
    after: "66e80c3282948757de1314b4bd83a3ca62ad4245893360e4dcdd96a08faad697"
    decision: same-version
  - root: "event:developer/message"
    previous: "2026-10-10-source-attribution-and-ptc-metadata"
    after: "8036634e542c25943579666649fa861b500370757705f8b3fa1f5fda05d3aa2f"
    decision: same-version
  - root: "event:session/title-llm-request"
    previous: "2026-10-10-source-attribution-and-ptc-metadata"
    after: "2346ab99de277c49ce2d3285e924019598099cc9c78d04d17b9554afe5f34455"
    decision: same-version
  - root: "event:user/message"
    previous: "2026-10-10-source-attribution-and-ptc-metadata"
    after: "262e529437c928f8f44b4403fd01a44c5b85582b378f9bd35b85932c54b01258"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

owner 的 prompt 不写该字段，其来源与全部既有 Session 日志保持不变；缺省 principal 即 owner。早于该字段的读取方会忽略它，并按普通 user 消息处理，因为 kind 仍为 'user'。新版读取方读旧日志时找不到 principal，会把每条消息视为 owner 所发。该字段不进入任何模型请求：provider 适配器只读模型可见的消息内容。SESSION_FORMAT_VERSION 不变。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/api/session-controller/tests/commands-upload-file.host.spec.ts packages/api/session-controller/tests/time-zone.client.spec.ts packages/subagent/subagent/tests/control.spec.ts：owner prompt 的来源字节不变，非 owner 调用方在 follow-up 来源上持久化 source.principal，owner 不记录；43 个测试通过。

<a id="dev-note"></a>
## 开发备注

无。
