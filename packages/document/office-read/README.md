---
description: "Read-only Office document reading for DOCX, XLSX, and PPTX without spawning a converter."
kind: "package-reference"
---

# @qilin-agent/office-read

English | [中文](README.zh.md)

## Summary

Read DOCX, XLSX, and PPTX content in process: body paragraphs with heading levels, table cells, worksheet values, and slide text. The reader opens the package with a bounded ZIP scan, parses the OOXML parts it needs, and returns a structured summary; it starts no converter, writes no file, and needs no LibreOffice. Use it where a model or a Host consumer needs document content rather than a rendered page.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Call `readOffice(bytes, { format?, limits? })` with the document bytes. The format is detected from the package parts unless the caller names it. The result is a discriminated summary: `docx` paragraphs and tables, `xlsx` sheets with row-major cells, or `pptx` slide size, order, text, and tables. Every bound in `DEFAULT_LIMITS` has a default; a caller narrows or widens one through `limits`. Failures raise `OfficeReadError` with a stable code (`not-a-package`, `unsupported`, `too-large`, `corrupt`), never a parser exception.

<a id="understand-the-implementation"></a>
## Understand the implementation

`zip.ts` scans the central directory and inflates stored or deflated entries while enforcing the entry count, per-entry and total byte caps, the inflation ratio, and entry-name safety. `xml.ts` and `entities.ts` read element text and decode entities without a DOM. Each format module walks only the parts its body needs: `word/document.xml`, `xl/workbook.xml` with its relationships and shared strings, or `ppt/presentation.xml` with its slide relationships. A limit that stops a walk sets `truncated` on the result instead of raising.

## Model Experience

### Document reading

#### What the model sees

The summary a tool built on this reader renders: paragraph text with heading levels, table cells, worksheet cells, slide text. It carries no rendered page, style, or layout.

#### Token effect

The summary is bounded by the caller's limits, so a large document costs a bounded number of tokens rather than the document's full size; `truncated` tells the model that more exists.

#### KV Cache effect

None. The reader returns data; it changes no prompt prefix and no recorded request.

## Known Limitations and Deferred Work

- **Structure only** — comments, tracked changes, charts, embedded objects, conditional formats, and drawing order are not read.
- **No rendering** — the reader reports text and cells, not pages, fonts, or layout; the preview path converts through `office-to-pdf` instead.
- **Read-only** — nothing here writes, edits, or re-saves a document.
- **Sheet dimensions come from cells** — a worksheet reports the rows and columns it actually contains, so a styled empty region adds no row.

<a id="dev-note"></a>
### Dev Note

None.
