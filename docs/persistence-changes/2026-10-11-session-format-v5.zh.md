---
description: "记录持久化类型更改及其兼容性确认。"
kind: persistence-change
---

# 2026-10-11-session-format-v5

[English](2026-10-11-session-format-v5.md) | 中文

## 概述

将声明的 SessionHeader.version 从 4 推进到 5，作为把退役出厂预设词汇折叠到唯一出厂名册的 V5 写入方。相邻的 V4→V5 边界重写 SessionHeader.agentPreset 与 agent-preset/selected 事件载荷中的退役出厂 id；其余头字段、事件信封与载荷形状与已发布 V4 完全一致。

## 目录

- [声明](#declaration)
- [兼容性](#compatibility)
- [验证](#verification)
- [开发备注](#dev-note)

<a id="declaration"></a>
## 声明

```yaml persistence-change
schemaVersion: 1
id: 2026-10-11-session-format-v5
baseline: false
changes:
  - root: "SessionHeader"
    previous: "2026-09-16-session-format-v4"
    after: "bb80ce8b5ddb821676b3f2dce0f6abd94d4770595cdb35b407b45caecc24eeff"
    decision: version-bump
```

<a id="compatibility"></a>
## 兼容性

V5 原生准入在版本 5 上复用已发布的 V4 行准入与关系校验。头的 agentPreset 保持自由字符串：名册之外的自定义预设 id 仍然有效，迁移时只折叠退役出厂 id。投递水位保持按代次作用：为格式 4 记录的 session-log-deepseek/delivery-accepted 标记在 V5 下不再活跃。历史 V4 日志在读打开时于内存中准备迁移，在写打开时于未变更的前代文件旁发布当前后继；V4 读取方拒绝更新的代次。未知的可忽略插件记录原样透传。

<a id="verification"></a>
## 验证

新增的 session-format-v4-to-v5 边界通过 19 项单测，覆盖退役与自定义头的折叠、选择事件重写、种子与非种子的割点推导、自直接 V4 输入的严格链恢复、已发布 V5 codec 框架与未知事件拒绝。Session 与 core Session 全量通过 3,128 例；session-persistence-jsonl 通过 749 例（含历史 catalog 发布与退役内容准入）；writer 常量消费者（agent-presets、plugin-manager、tool-skill、sidebar-opens、shell-env、agent-loop、session-query、agent-team、worktree、llm-replay）通过 1,850 例。宿主与客户端两面 TypeScript 编译零错误，触及包 oxlint 零告警，gen-session-format-catalog 推导出止于 writer 的五段链。

<a id="dev-note"></a>
## 开发备注

无。
