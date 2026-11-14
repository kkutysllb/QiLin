---
description: "只读 Office 解析器之上的模型工具 office_read。"
kind: "package-reference"
---

# @qilin-agent/tool-office-read

[English](README.md) | 中文

## 概述

注册 `office_read`，让模型无需转换即可读取 DOCX、XLSX、PPTX：一次调用返回标题、段落、表格、工作表单元格或幻灯片文本的紧凑文本。工具经挂载的文件系统后端解析路径，在字节上限内读取，并把解析交给 [`office-read`](../office-read/README.zh.md)。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

在需要模型读取 Office 文档的组合中装载本插件。它需要 `tools` 注册表与 `fs` 后端；`maxBytes` 限制可打开的文档大小。一次调用接收 `file_path`、扩展名未命名格式时的可选 `format`，以及可选的 `limit`（段落数、每工作表行数或幻灯片数）。失败以工具错误返回模型：路径不存在、目标不是文件、文档超限，或字节不是可读的 Office 包。

<a id="understand-the-implementation"></a>
## 理解实现

`execute` 以调用会话的工作区解析路径，先 stat 再拒绝超过 `maxBytes` 的文档，随后经 `fs.readBytes` 读取字节、调用 `readOffice` 并渲染摘要：标题按层级转成 Markdown 前缀，表格保持制表符分隔，工作表与幻灯片带标签。读取器因上限中断时结果 `truncated` 置位，部分摘要与完整摘要可区分。

<a id="model-experience"></a>
## 模型体验

### 文档读取

#### 模型看到的内容

文档渲染后的文本：带标题层级的段落、表格行、逐行的工作表单元格，或按演示顺序排列的幻灯片文本。文档内容之外的任何信息都不会到达模型。

#### Token 影响

每次读取受 `maxBytes` 与读取器各格式上限约束，因此大文档花费有界 token；`truncated` 标记因上限而中断的摘要。

#### KV Cache 影响

无。工具只返回文档文本，不改变提示前缀，也不改变已记录的请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办工作

- **只有文本，没有页面**——工具报告内容，不报告版式、样式、字体或渲染页面；文档预览改由 `office-to-pdf` 渲染。
- **只读**——没有写入、编辑或另存操作。
- **尚未接入组合**——没有随包发布的预置装载本插件；S3 与预览路径一起接入，并补组合级测试。
- **不支持的文档部分**——批注、修订、图表、嵌入对象与条件格式不报告。

<a id="dev-note"></a>
### 开发备注

无。
