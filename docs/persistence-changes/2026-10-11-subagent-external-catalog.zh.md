---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-11-subagent-external-catalog

[English](2026-10-11-subagent-external-catalog.md) | 中文

## 概述

为父级持有的 subagent 目录事件新增「外部执行」变体。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-11-subagent-external-catalog
baseline: false
changes:
  - root: "event:subagent/catalog"
    previous: "2026-09-20-unknown-child-catalog"
    after: "979bda52f82c57aed40934394184e1aecaba0dd1fb6ca5cfe9b348b215d02187"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

已有的 v0 与 v1 记录含义不变：v0 记录本地的创建模式，v1 另外保留旧写入方无法归类的子级。新的 v2 负载记录没有本地子会话的外部执行，因此早于它的读取方会在分块列表中遇到未识别的版本；此时应跳过该条目，而不是拒绝整份日志。无需递增会话格式版本，目录投影的状态版本递增，使缓存视图依据追加的事件重建。

<a id="verification"></a>
## 验证

pnpm exec vitest run packages/subagent/subagent/tests/catalog.spec.ts：10 个测试通过。

<a id="dev-note"></a>
## 开发备注

无。
