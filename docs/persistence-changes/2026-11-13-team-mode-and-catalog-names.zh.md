---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-11-13-team-mode-and-catalog-names

[English](2026-11-13-team-mode-and-catalog-names.md) | 中文

## 概述

把 Team 模式与重试控制输入记录为必需的会话事实，并把具名 subagent catalog 事实纳入同一写入代。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-11-13-team-mode-and-catalog-names
baseline: false
changes:
  - root: "SessionHeader"
    previous: "2026-11-05-retired-fixture-source"
    after: "3ba034e9590c2ef5f57dbde1742846b7c3776f89aa9285fe6682bf98d6963f18"
    decision: version-bump
  - root: "event:subagent/catalog"
    previous: "2026-10-11-subagent-external-catalog"
    after: "e6adc9de30d7261b9ea463145f7e52a7cf0e28c75086db2d0858386eab45dd96"
    decision: version-bump
  - root: "event:team/mode"
    previous: null
    after: "a3c2d8bf46d07299ae6a8ffc0b3762a66e0b0c33210a2d7fcb481f9ceb745275"
    decision: version-bump
  - root: "event:turn/retry"
    previous: null
    after: "8b4eb3a7b4d7ba2881c46d0a4529c38a10907c93ef35f886f96b7b606cf29563"
    decision: version-bump
```

<a id="compatibility"></a>
## 兼容性

写入方把 SessionHeader.version 记为 7。V6 读取方会拒绝含 team/mode 或 turn/retry 的日志（两者都不可忽略），而不是重建一个静默忽略 Team 模式、或把重试算成新输入的会话。V7 读取方仍能读取每个 V6 日志：V6-to-V7 边只推进表头版本，catalog 事实保持版本 0 到 2 的含义，版本 3 增加 name 字段。Team 模式只进日志；重试不接纳任何用户消息，因此重放时被重跑的那一轮仍只有一条人类输入。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/session/session-format-v6-to-v7/tests：38 个测试通过。pnpm exec vitest run packages/team/agent-team/tests：85 个测试通过。pnpm exec vitest run packages/core/agent-loop/tests/retry.spec.ts：3 个测试通过。pnpm run verify-persistence-formats：v0 到 v7 校验通过（8 份完整参考）。

<a id="dev-note"></a>
## 开发备注

无。
