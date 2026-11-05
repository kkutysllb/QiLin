---
description: "把已发布的 V5 会话恢复为 V6：只推进写入方版本字面量，已记录字段、行与载荷一概不变。"
kind: "package-reference"
---

# @qilin-agent/session-format-v5-to-v6

[English](README.md) | 中文

## 概述

把已发布的 V5 会话恢复为 V6，不改动任何已记录的请求。后继代只推进头部版本字面量：每个事件、每个紧凑 run、继承切点与每一份载荷都原样进入 V6 产物。这条代次边界记录的是声明侧生产方词汇退役了开发用的 fixture 来源——这是一项没有 wire 表示的声明类型变化，因此不存在需要执行的正文转换。[catalog](../session-format-catalog/README.zh.md) 通过静态迁移声明消费本边；本库本身不读也不写任何文件。

## 目录

- [使用本包](#use-this-package)
  - [使用场景](#when-to-use-it)
  - [入口](#entry-point)
- [V5 到 V6 规范](#v5-to-v6-specification)
  - [头部](#header)
  - [事件与继承](#events)
- [原生 V6 准入](#native-v6-admission)
- [理解实现](#understand-the-implementation)
- [深入探索](#further-exploration)
- [模型体验](#model-experience)
  - [已发布会话恢复](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

<a id="when-to-use-it"></a>
### 使用场景

用 [catalog](../session-format-catalog/README.zh.md) 恢复会话。直接导入服务于 catalog 装配与测试；本库没有 Kylin 挂载配置。[公开导出](src/index.ts)提供迁移声明、已发布的 V5 源编解码器、V6 目标编解码器、目标头部校验器与目标恢复器。

<a id="entry-point"></a>
### 入口

仅头部的操作在不读正文的前提下转换元数据：

```ts
import type { SessionFormatHeader } from '@qilin-agent/session-format'
import { sessionFormatV5ToV6 } from '@qilin-agent/session-format-v5-to-v6'

declare const sourceHeader: SessionFormatHeader
const migrated = sessionFormatV5ToV6.migrateHeader(sourceHeader)
```

`migrateHeader` 校验已发布的 V5 头部，并返回同样字段、`version: 6` 的结果。`createStage` 为每个源产物创建独立阶段，通过 `context.emitEvent` 与 `context.emitRun` 原样发出事件与紧凑 run。

-----

<a id="v5-to-v6-specification"></a>
## V5 到 V6 规范

<a id="header"></a>
### 头部

已发布的 V5 头部字段原样保留。本边把 `version` 从 5 改写为 6，并拒绝任何无法通过已发布 V5 校验的源头部，因此畸形头部不会进入后继代。`agentPreset` 仍是自由字符串：出厂名册之外的自定义 id 保持有效。

<a id="events"></a>
### 事件与继承

每个事件原样透传，包括 ignorable 记录与 `session/end-seed` 标记。紧凑 run 也原样透传，因为两代的物理打包帧完全相同。

继承切点跟随源头部。未播种源在文件结束前发布零切点。已播种源发布其最后一个继承 `session/end-seed` 标记的下标；缺少该标记的已播种产物会被拒绝，而不是被赋予零切点。

-----

<a id="native-v6-admission"></a>
## 原生 V6 准入

`restoreReleasedV6Artifact` 校验 V6 头部、稠密序号、未知必需事件类型、退役语法、原生消息准入、工具结果、分叉结果、catalog 子项、生命周期关系与投递归属。规则就是 V6 上的已发布 V5 规则：唯一区别是携带第 6 代的 `session-log-deepseek/delivery-accepted` 标记会按所属会话 id 校验，其它代的标记不进入本读取方的归属检查。

V6 编解码器复用已发布的 V5 物理行与行准入。因此打包头部、打包正文与恢复策略在两代之间逐字节一致。

-----

<a id="understand-the-implementation"></a>
## 理解实现

`src/migration.ts` 负责头部转换与透传阶段。`src/validation.ts` 负责 V6 头部校验器、恢复校验与投递代次校验。`src/codec.ts` 负责物理帧，它用 V6 版本字面量包裹已发布的 V5 编解码器。[catalog](../session-format-catalog/README.zh.md) 静态组合整条链；挂载插件不决定历史可读性。

-----

<a id="further-exploration"></a>
## 深入探索

- [会话格式 catalog](../session-format-catalog/README.zh.md)
- [V4 到 V5 边](../session-format-v4-to-v5/README.zh.md)
- [V5 格式参考](../../../docs/persistence-changes/historical-formats/v5.zh.md)
- [新增会话格式版本](../../../docs/cookbook/adding-a-session-format-version.zh.md)

-----

<a id="model-experience"></a>
## 模型体验

### 已发布会话恢复

#### 模型看到什么

没有变化。本边不做正文转换，因此恢复出的 V5 会话呈现的消息、工具结果与请求头部（含 `agentPreset`）与 V5 读取方一致。

#### Token 影响

本边不插入、不删除、不改写任何模型可见文本，因此恢复出的会话保持同样的请求 token 预算。

#### KV Cache 影响

本边不改动任何已记录请求，恢复出的提示前缀保持原字节。

-----

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **正文恒等转换** —— 代次边界之所以存在，是因为声明侧生产方词汇退役了一个仅用于开发的未来源；转换无法重建已经不存在的生产方，也不需要重建。
- **退役 kind 保持未解释** —— 携带退役 kind 的历史记录按 `unknownKinds: preserve` 保留，读取方走 merge-extensible 默认分支。
- **不重写存储文件** —— 读取准备与后继发布属于持久化层；本库不读写任何文件。

-----

<a id="dev-note"></a>
### 开发备注

无。
