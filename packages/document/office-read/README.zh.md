---
description: "不启动转换器的 DOCX、XLSX、PPTX 只读解析。"
kind: "package-reference"
---

# @qilin-agent/office-read

[English](README.md) | 中文

## 概述

在进程内读取 DOCX、XLSX、PPTX：带标题层级的正文段落与表格、工作表单元格值、幻灯片文本。读取器用有界的 ZIP 扫描打开文档，只解析需要的 OOXML 部件并返回结构化摘要；它不启动转换器、不写文件、不需要 LibreOffice。用于模型或宿主消费者需要文档内容而不是渲染页面的场景。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [模型体验](#model-experience)
- [已知限制与待办工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

调用 `readOffice(bytes, { format?, limits? })` 传入文档字节；除非调用方指定格式，否则从包内部件识别。结果是可判别摘要：`docx` 的段落与表格、`xlsx` 的工作表与行主序单元格、`pptx` 的幻灯片尺寸、顺序、文本与表格。`DEFAULT_LIMITS` 的每项都有默认值，调用方通过 `limits` 收窄或放宽。失败抛出带稳定错误码的 `OfficeReadError`（`not-a-package`、`unsupported`、`too-large`、`corrupt`），绝不抛解析器异常。

<a id="understand-the-implementation"></a>
## 理解实现

`zip.ts` 扫描中央目录并按存储或 deflate 解压，同时执行条目数、单条目与总字节上限、膨胀比与条目名安全。`xml.ts` 与 `entities.ts` 不依赖 DOM 读取元素文本并解码实体。每个格式模块只走它需要的部件：`word/document.xml`、带关系与共享字符串的 `xl/workbook.xml`，或带幻灯片关系的 `ppt/presentation.xml`。因上限而中断时，结果上的 `truncated` 置位而不是抛错。

<a id="model-experience"></a>
## 模型体验

### 文档读取

#### 模型看到的内容

由本读取器构建的工具所呈现的摘要：带标题层级的段落文本、表格单元格、工作表单元格、幻灯片文本。它不含渲染页面、样式或版式。

#### Token 影响

摘要受调用方上限约束，因此大文档花费有界的 token 而不是全文体量；`truncated` 告诉模型还有更多内容。

#### KV Cache 影响

无。读取器只返回数据，不改变提示前缀，也不改变已记录的请求。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办工作

- **只有结构**——批注、修订、图表、嵌入对象、条件格式与绘制顺序不读取。
- **不渲染**——只报告文本与单元格，不报告页面、字体或版式；预览路径改由 `office-to-pdf` 转换。
- **只读**——本包不写、不改、不另存文档。
- **工作表维度取自实际单元格**——只报告真正含有单元格的行列，带样式的空白区域不增加行。

<a id="dev-note"></a>
### 开发备注

无。
