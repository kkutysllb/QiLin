---
description: "把已发布的 V4 会话恢复为 V5：将已退役的出厂预设词汇折叠到唯一出厂名册，不改动其它任何已记录字段。"
kind: "package-library"
---

# @qilin-agent/session-format-v4-to-v5

[English](README.md) | 中文

## 概述

在不改动任何已记录请求的前提下，把已发布的 V4 会话恢复为 V5。这条相邻迁移边除出厂预设词汇外是恒等转换：已退役标识 `standard`、`cordis`、`minimal` 在逻辑头部与每个 `agent-preset/selected` 载荷中变为 `ptc`，自定义标识与其它字段原样通过。[目录](../session-format-catalog/README.zh.md)通过静态迁移声明使用本库；本库自身不读取、不发布文件。

## 目录

- [使用本包](#use-this-package)
- [V4 到 V5 规范](#v4-to-v5-specification)
  - [头部与预设折叠](#header-and-presets)
  - [选择事件与继承](#selection-and-inheritance)
  - [投递代次](#delivery-generations)
- [原生 V5 准入](#native-v5-admission)
- [理解实现](#understand-the-implementation)
- [深入探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

### 使用场景

使用[目录](../session-format-catalog/README.zh.md)恢复会话。直接导入用于目录组装和测试；本库没有 Kylin 挂载配置。[公共导出](src/index.ts)提供迁移声明、已发布 V4 源编解码器、V5 目标编解码器、目标头校验器和目标恢复器。

### 入口

仅头部操作不会转换或校验事件正文：

```text
const targetHeader = sessionFormatV4ToV5.migrateHeader(sourceHeader)
```

完整恢复将解码后的事件送入新的阶段，并校验目标产物。本迁移边不插入、不删除任何事件，因此继承切点一一对应，部分输出遵循与其它迁移边相同的规则：错误可能出现在后续事件或 `finish()`。[格式协议](../session-format/README.zh.md)负责阶段调度与目录错误处理；[JSONL 持久化](../session-persistence-jsonl/README.zh.md)负责读取准备和不可变后继代的发布。

-----

<a id="v4-to-v5-specification"></a>
## V4 到 V5 规范

本迁移边保留每个源事件及其顺序、时间戳和稠密序列位置：不插入、不删除、不重排事件，因此消息身份、本地引用、运行边界与紧凑运行成员都保持各自坐标。只有下文两个承载预设的词汇位置发生变化，且仅限出厂名册已退役的标识。

<a id="header-and-presets"></a>
### 头部与预设折叠

逻辑头部将 `version: 4` 改为 `version: 5`。它保留 `id`、`createdAt`、`isSeeded`、`delegationDepth` 以及已接纳的可选 `cwd`、`parentSession`、`origin`。出厂标识 `standard`、`cordis`、`minimal` 在 `header.agentPreset` 中变为 `ptc`；预设缺席则保持缺席，自定义标识保持原样。格式非法的源头部在重写之前即被拒绝。

`header.agentPreset` 仍是自由字符串，因此本迁移边不按已安装名册校验它，也不改名其它出现位置。预设解析器对已退役标识仍保持失败即报的语义：迁移改写的是已存储的选择，绝不充当名册已不再提供该标识时的运行时别名。

<a id="selection-and-inheritance"></a>
### 选择事件与继承

每个 `agent-preset/selected` 事件都会被检查，包括继承段与本地段的选择。当 `data.agentPreset` 是已退役出厂标识时变为 `ptc`；否则原样输出源事件对象。`agentPreset` 非字符串的选择载荷按记录输出而不修复，其它事件类型一律原样通过，不复制也不重新封装。

对于种子会话，最后一个 `data.inherited: true` 的 `session/end-seed` 确定切点：它自身的索引即继承事件计数，从当前位置起闭合继承前缀。种子源缺少该标记时直接拒绝，而不是猜测切点；非种子源在 EOF 之前暴露 `headerInheritedEventCount: 0`，结束时切点为零。

<a id="delivery-generations"></a>
### 投递代次

`session-log-deepseek/delivery-accepted` 载荷的 `sessionFormatVersion` 为 4 时保留其已记录坐标，但在 V5 下不再生效，因为上传水位线按代次区分；只有指明第 5 代的标记才断言一次投递。当前代标记仍须位于自身信封之前并指明该会话，处于带 `parentSession` 的会话继承前缀内时除外。

-----

<a id="native-v5-admission"></a>
## 原生 V5 准入

已标记 V5 的输入不运行本迁移边。`assertReleasedV5Header` 在版本 5 上接受与已发布 V4 完全相同的头部字段集，`restoreReleasedV5Artifact` 原样沿用已发布 V4 的行准入、退役语法、消息来源、开发者字段、生命周期、目录与投递规则。唯一差别是词汇：仍记录已退役出厂标识的 V5 产物会被接纳，因为该字段是自由字符串；未知事件类型除非信封标记为可忽略，否则一律拒绝。

物理编解码器复用已发布 V2 的行封装与已发布 V4 的行准入。V5 不新增物理编码：封装、恢复与 JSONL 头部行保持已发布形态。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现内部细节 — 点击展开</summary>

[迁移](src/migration.ts)折叠两个词汇位置并推导种子切点；[编解码器](src/codec.ts)复用冻结封装；[校验器](src/validation.ts)在版本 5 上镜像已发布 V4 的结构。[迁移测试](tests/migration.spec.ts)固定头部与选择折叠、原样通过、种子与非种子切点、从直接 V4 输入开始的严格链路恢复，以及未知事件拒绝。[已发布格式决策](../../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.zh.md)说明为何相邻组合与原生准入分开测试。

</details>

-----

<a id="further-exploration"></a>
## 深入探索

- [已发布 V3 到 V4](../session-format-v3-to-v4/README.zh.md) — 冻结的前代转换，也是本迁移边导入的已发布 V4 源编解码器。
- [会话格式目录](../session-format-catalog/README.zh.md) — 组装恢复过程的静态迁移边链路。
- [格式发布状态](../../../docs/session-format-status.zh.md) — 写入器常量与发布证据。

-----

<a id="model-experience"></a>
## 模型体验

### 已发布会话恢复

#### 模型看到什么

每个历史请求保留其已记录提示词、消息内容与模型配置。被折叠的 `agentPreset` 标识改变恢复后会话所报的预设；该预设自身拥有它注册的每一项模型可见贡献。

#### Token 影响

本迁移边不插入、不删除、不改写任何模型可见文本，因此迁移后会话携带的请求 token 预算不变。

#### KV Cache 影响

本迁移边保留已记录的请求含义与配置；它不保证提供方缓存命中，也不保证与原生 V5 录制字节相同。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- **不改写已存储文件** — 读取准备与发布不可变后继代由持久化负责；本库不读写任何文件。
- **无运行时别名** — 已退役标识在 `resolve()` 处仍然失败；只折叠已存储会话，见[头部与预设折叠](#header-and-presets)。
- **不校验名册** — `header.agentPreset` 仍是自由字符串，因此没有任何已安装预设提供的标识在此被接纳，并由预设解析器拒绝。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文 — 点击展开</summary>

无。

</details>
