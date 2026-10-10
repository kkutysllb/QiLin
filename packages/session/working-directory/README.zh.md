---
description: "在既有进程保持各自目录的前提下变更单个 Session 的工作目录。所选目录在回放后依然保留，并出现在用户上下文中；目录缺失时，若原始项目仍可用则恢复它。"
kind: "package-reference"
---

# @qilin-agent/working-directory

[English](README.md) | 中文

## 概述

在既有进程保持各自目录的前提下变更单个 Session 的工作目录。所选目录在回放后依然保留，并出现在用户上下文中；目录缺失时，若原始项目仍可用则恢复它。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [延伸阅读](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延后工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

与 `fs`、`sessionProjections`、`systemPrompt` 一同挂载。`defaultDirectory` 为没有原始目录的 Session 指定绝对回退路径，省略则使用启动目录。参见[配置目录](../../../docs/config-catalog.zh.md)。

```yaml
- name: '@qilin-agent/working-directory'
```

-----

<a id="understand-the-implementation"></a>
## 理解实现

Session 投影持有生效目录并在 Session 观察中暴露它，因此冷读无需激活 Agent 即可使用；header 继续标识原始项目。变更按 Session 串行：经文件系统提供者校验、检查取消与 Agent 生命周期、提交事件、并入队一条用户上下文通知。若提交后入队失败，操作仍返回已提交的目录并记录警告；下一次请求或恢复仍会收到所需的目录上下文。提示词组装会在发布其上下文条目之前校验当前目录。既有进程与沙箱授权保持各自归属。[服务实现](src/index.ts)定义了 API。

-----

<a id="further-exploration"></a>
## 延伸阅读

- [Session 组](../README.zh.md) — 持久 Session 服务。
- [工具目录](../../../docs/tool-catalog.zh.md) — 面向模型的工具 schema。
- [测试](../../../docs/testing.zh.md) — 组合与回放验收。

-----

<a id="model-experience"></a>
## 模型体验

### 工作目录上下文

#### 模型看到什么

当前值形如 `Current working directory: <JSON 引号包裹的绝对路径>.`。该贡献以 required 且 literal 方式注册：即使可选运行时上下文被关闭或抑制也仍然保留，其文本不会被当作提示词变量插值，且 `refreshContext()` 会在请求准入时重新解析它，因此装配之后发生的变更同样能在同一次请求内到达模型。每次提交的变更（含自动恢复）都会尝试通过常规 Agent inbox 排入一条用户上下文通知；取消或销毁可能丢弃尚未接纳的通知，但持久目录对下一次请求仍然可用。

#### token 影响

首次快照与变更值会新增用户上下文 token；未变化的快照不会重复。

#### KV Cache 影响

目录切换以追加方式进入上下文，不替换稳定的系统提示前缀；目录变化或恢复会在保留历史之后产生新上下文。

## 已知限制与延后工作

<a id="known-limitations-and-deferred-work"></a>

- **原始项目缺失** —— 当前目录与原始项目都不可用时，提示词组装会拒绝每一次模型回合（包括纯聊天回合）。本服务不会挑选或重建仓库。请先恢复原目录，或通过 SDK `setWorkingDirectory`（或 `ctx.workingDirectory.set`）指定一个存在的绝对目录后重试。既有 shell 仍保有各自的进程内目录。

<a id="dev-note"></a>
### 开发备注

无。
