---
description: "把已发布的 V6 会话还原为 V7：只推进写入版本字面量，并接纳持久化的 Team 模式事实。"
kind: "package-reference"
---

# @qilin-agent/session-format-v6-to-v7

[English](README.md) | 中文

## 概述

在不改动任何已记录请求的前提下，把已发布的 V6 会话还原为 V7。后继代推进表头版本字面量，并接纳一个新事实：Team Lead 会话用 `team/mode` 记录自己的 Team 模式。V6 写入方没有这套词汇，因此不存在需要转换的 V6 字节；目标代在 Team 模式事实出现时校验它，非法或重复的切换一律拒绝。[catalog](../session-format-catalog/README.zh.md) 通过静态迁移声明消费本边；本库自身不读也不写任何文件。

## 目录

- [Use this package](#use-this-package)
  - [When to use it](#when-to-use-it)
  - [Entry point](#entry-point)
- [V6-to-V7 specification](#v6-to-v7-specification)
  - [Header](#header)
  - [Events and inheritance](#events)
  - [Team mode](#team-mode)
- [Native V7 admission](#native-v7-admission)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
  - [Historical restoration](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

<a id="when-to-use-it"></a>
### 使用场景

还原会话请使用 [catalog](../session-format-catalog/README.zh.md)。直接导入只服务于目录组装和测试：本库没有 Kylin 挂载配置。[公开导出](src/index.ts)提供迁移声明、已发布的 V6 源编解码器、V7 目标编解码器、目标表头校验器和目标还原器。

<a id="entry-point"></a>
### 入口

只读表头的操作不读正文即可转换元数据：

```ts
import type { SessionFormatHeader } from '@qilin-agent/session-format'
import { sessionFormatV6ToV7 } from '@qilin-agent/session-format-v6-to-v7'

declare const sourceHeader: SessionFormatHeader
const migrated = sessionFormatV6ToV7.migrateHeader(sourceHeader)
```

`migrateHeader` 校验已发布的 V6 表头，返回同样的字段并把 `version` 设为 7。`createStage` 为每个源制品创建独立阶段，通过 `context.emitEvent` 与 `context.emitRun` 传递事件和紧凑运行。

-----

<a id="v6-to-v7-specification"></a>
## V6 到 V7 规范

<a id="header"></a>
### 头部

已发布的 V6 表头字段原样保留。本边把 `version` 从 6 改写为 7，并拒绝未通过已发布 V6 校验的源表头，因此非法表头不会进入后继代。`agentPreset` 仍是自由字符串：随包名单之外的自定义 id 保持有效。

<a id="events"></a>
### 事件与继承

每个事件原样通过，包括可忽略记录与 `session/end-seed` 标记。紧凑运行原样通过，因为两代的打包分帧完全相同。

继承截断跟随源表头。未播种的源在文件结束前发布零截断。已播种的源发布最后一个继承 `session/end-seed` 标记的下标；缺少该标记的已播种制品一律拒绝，而不是赋零截断。

<a id="team-mode"></a>
### Team 模式

`team/mode` 是只存放在 Team Lead 会话里的会话级事实：`{ mode: 'on' | 'off', source?: 'composition' }`。本检出用组合启用 Team 模式，因此 Team 服务在首个持久 Team 事件之前记录 `{ mode: 'on', source: 'composition' }`，会话离开 Team 模式时记录 `off`。该负载不含 Team 身份，也不含负载版本：Lead 会话只拥有一个模式。

V6 源不可能包含该事实，因为 V6 写入方没有声明这一事件类型，V6 读取方会拒绝不可忽略的未知事件。若 V6 源仍带有它，事件会原样到达目标代并在那里校验。

-----

<a id="native-v7-admission"></a>
## 原生 V7 准入

`restoreReleasedV7Artifact` 校验 V7 表头、稠密序号、未知必需事件类型、已退役语法、原生消息接纳、工具结果、分叉结果、catalog 子级、生命周期关系、投递归属与 Team 模式切换。结构与接纳沿用已发布的 V6 规则：携带第 7 代的 `session-log-deepseek/delivery-accepted` 标记与本会话 id 比对，其他代的标记不进入本读取方的归属校验。

`team/mode` 只接纳 `mode` 与 `source` 两个成员，要求 `mode` 为 `off` 或 `on`，并且只接纳 `composition` 来源标签。会话初始不在 Team 模式，因此首个 `off`、重复模式或含其他字段的负载一律拒绝而不是忽略。校验只覆盖负载与切换顺序；`team/mode` 之外的 Team 事件由拥有名册与任务语义的 Team 投影校验。

V7 编解码器复用已发布的 V6 物理行与行接纳。打包表头、打包正文与恢复策略在两代之间因此逐字节相同。

-----

<a id="understand-the-implementation"></a>
## 理解实现

`src/migration.ts` 拥有表头转换与透传阶段。`src/validation.ts` 拥有 V7 表头校验器、还原校验、投递代际校验与 Team 模式切换校验。`src/codec.ts` 拥有物理分帧，用 V7 版本字面量包装已发布的 V6 编解码器。[catalog](../session-format-catalog/README.zh.md) 静态组装整条链；挂载插件不决定历史可读性。

-----

<a id="further-exploration"></a>
## 深入探索

- [Session 格式目录](../session-format-catalog/README.zh.md)
- [V5-to-V6 边](../session-format-v5-to-v6/README.zh.md)
- [Agent Teams 服务](../../team/agent-team/README.zh.md)
- [V6 格式参考](../../../docs/persistence-changes/historical-formats/v6.zh.md)
- [新增会话格式版本](../../../docs/cookbook/adding-a-session-format-version.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

### 已发布会话恢复

#### 模型看到什么

没有变化。本边不做正文转换，因此还原后的 V6 会话呈现与 V6 读取方相同的消息、工具结果与请求表头（含 `agentPreset`）。Team 模式只进日志，从不进入模型可见面。

#### Token 影响

本边不插入、删除或改写任何模型可见文本，还原后的会话保持相同的请求 token 预算。

#### KV Cache 影响

本边不改动任何已记录请求，还原后的提示前缀字节保持不变。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **正文等同转换**：代际边界来自写入方开始记录 Team 模式；V6 日志不携带 Team 模式事实，本边也不伪造。
- **Team 模式由组合驱动**：本检出没有逐会话的 Team 模式开关，因此目前只写 `on`；读者接纳 `off`，供以后离开 Team 模式的会话使用。
- **不改写存储文件**：读取准备与发布不可变后继由持久化拥有；本库不读也不写文件。

-----

<a id="dev-note"></a>
### 开发备注

None.
