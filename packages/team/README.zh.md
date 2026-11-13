---
description: "Team 包组：跨 subagent 树的持久共享任务协调及其面向模型的工具。"
kind: "package-group"
---

# team/ —— 共享 Team 协调

[English](README.md) | 中文

## 摘要

Team 包组负责 subagent 树中的持久 Team 协调：每个根 Session 保存自己的 Team 模式选择与一块共享任务板，另有工具包把该能力暴露给模型。subagent 的创建、发现、消息与中断仍留在 subagent 家族。

## 目录

- [包](#packages)
- [相关文档](#related-documentation)

-----

<a id="packages"></a>
## 包

| 包 | 职责 | ctx 键 |
|---|---|---|
| [`agent-team`](agent-team/README.zh.md) | Team 领域：模式、roster、持久消息与共享任务板 | `ctx.agentTeams` |
| [`tool-agent-team`](tool-agent-team/README.zh.md) | 让模型创建、发消息与协调 teammate 的九个工具 | 按作用域注册到 `ctx.tools` |
| [`agent-team-profile`](agent-team-profile/README.zh.md) | 接入领域、工具与 Web UI 的 opt-in profile 层 | — |

-----

<a id="related-documentation"></a>
## 相关文档

- [Agent Teams 子系统](../../docs/subsystems/agent-team.zh.md)——持久 Team 类型与 `ctx.agentTeams` 服务 API。
