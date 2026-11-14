---
description: "Session V7 到 V8 的格式边界：编码模式预置标签改名。"
kind: "package-reference"
---

# Session 格式 V7 到 V8

[English](README.md) | 中文

## 概述

V7→V8 边界只给存储的编码模式预置标签改名。V8 保留 V7 的全部结构规则：同样的头部字段、同样的事件信封、同样的 JSONL 物理分帧，因此该边界只改写一个头部字段和记录它的 `agent-preset/selected` 载荷。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)

-----

<a id="use-this-package"></a>
## 使用本包

Session 格式目录从本包的 `qilin.sessionFormatMigration` 清单读取并加载它，`7 → 8`。恢复 V7 日志时，每个头部与事件都经 `sessionFormatV7ToV8`：版本字面量移到 8，存储的 `coding` 预置改写为 `coding`；用户自建的预置 id 原样保留。随后 `restoreReleasedV8Artifact` 按 V8 校验各行。

<a id="understand-the-implementation"></a>
## 理解实现

`releasedV8SessionFormatCodec` 经已发布的 V7 编解码器分帧，只把版本字面量改名。`restoreReleasedV8Artifact` 以 V8 代重新执行已发布的 V7 结构校验，包括活动投递水位、团队模式与重试载荷规则。该边界不拥有自己的词汇：它读 V7 行、改写预置标签、校验结果。

## 模型体验

### 历史恢复

#### 模型看到的内容

只有一个标签不同。恢复的 V7 Session 与 V7 读取器一样呈现相同的消息、工具结果与请求头，区别在于存储的 `coding` 预置会报告为 `coding`，也就是当前预置清单发布的 id。

#### Token 影响

该边界只改写一个头部字段与记录它的那一条选择事件，因此恢复后的 Session 请求的 token 与其 V7 形态相同。

#### KV Cache 影响

在 V8 读取器看到这些行之前，没有任何请求是由它们重建的，因此这次改写不改变已记录的请求，恢复后的提示前缀保持原有字节。

## 已知限制与待办工作

- **只改一个字段**——编解码器沿用 V7 分帧，因此 V8 文件与 V7 文件只在头部版本字面量与迁移后的预置标签上不同，其余字节不动。
- **旧标签没有回落**——仍写着 `coding` 的 V8 头会被拒绝，因为预置清单不再发布该 id；V7 读取器会在 V8 校验之前完成改名。
- **不改写已存文件**——持久化层负责读取准备与发布不可变后继；本库不读写任何文件。

<a id="dev-note"></a>
### 开发备注

无。
