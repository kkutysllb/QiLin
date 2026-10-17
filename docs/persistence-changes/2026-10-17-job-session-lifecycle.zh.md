---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-17-job-session-lifecycle

[English](2026-10-17-job-session-lifecycle.md) | 中文

## 概述

以唯一的 JobId、原始时间戳、创建用工具调用与生产方完成报告，记录有所有者 job 的注册与结算。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-17-job-session-lifecycle
baseline: false
changes:
  - root: "event:job/registered"
    previous: null
    after: "9eaf18d12d45a42fc6bf1f57f84a67e7cb3360800818a4317a9ba4bb5a520805"
    decision: same-version
  - root: "event:job/settled"
    previous: null
    after: "7c2fb6f1c5264fda5cb330b30743218ed6578e6b6044bab3f767e0c6dcabab3d"
    decision: same-version
```

<a id="compatibility"></a>
## 兼容性

新增两个必需的 job 事件种类，不改变 Session 信封。新 JobId 对运行期控制与持久配对统一使用 kind 前缀短 UUID；历史 Session 不会获得虚构的 job 历史。更旧的构建会拒绝未知的必需事件。producerReported 描述完成承诺是否兑现，不代表资源释放已核实。

<a id="verification"></a>
## 验证

pnpm vitest run packages/jobs packages/sdk packages/api/job-controller：分别有 178、142、54 个测试通过。注册表生命周期用例覆盖先于 hub 反应的因果顺序、唯一的短 UUID JobId，以及追加失败包容。

<a id="dev-note"></a>
## 开发备注

无。
