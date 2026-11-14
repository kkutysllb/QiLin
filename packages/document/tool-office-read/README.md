---
description: "Model-facing office_read tool over the read-only Office document reader."
kind: "package-reference"
---

# @qilin-agent/tool-office-read

English | [中文](README.zh.md)

## Summary

Register `office_read` so a model can read a DOCX, XLSX, or PPTX document without converting it: one tool call returns headings, paragraphs, tables, worksheet cells, or slide text as compact text. The tool resolves the path through the mounted filesystem backend, reads bytes under a size cap, and delegates parsing to [`office-read`](../office-read/README.md).

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Compose the plugin where models should read Office documents. It requires the `tools` registry and an `fs` backend; `maxBytes` bounds the documents it opens. One call takes `file_path`, an optional `format` when the extension does not name it, and an optional `limit` on paragraphs, rows per sheet, or slides. Failures reach the model as tool errors: a missing path, a non-file target, an oversized document, or bytes that are not a readable Office package.

<a id="understand-the-implementation"></a>
## Understand the implementation

`execute` resolves the path against the calling session's workspace, stats it, and refuses a document larger than `maxBytes` before reading. It then reads bytes through `fs.readBytes`, calls `readOffice`, and renders the summary: headings keep their level as Markdown prefixes, tables stay tab-separated, sheets and slides are labelled. A limit that stops the reader sets `truncated` on the result, so a partial summary is distinguishable from a complete one.

## Model Experience

### Document reading

#### What the model sees

The rendered text of the document: paragraph text with heading levels, table rows, worksheet cells row by row, or slide text in presentation order. Nothing outside the document's content reaches the model.

#### Token effect

Every read is bounded by `maxBytes` and by the reader's per-format caps, so a large document costs a bounded number of tokens; `truncated` marks a summary that stopped at a limit.

#### KV Cache effect

None. The tool returns document text; it changes no prompt prefix and no recorded request.

## Known Limitations and Deferred Work

- **Text, not pages** — the tool reports content, never layout, styling, fonts, or a rendered page; the document preview renders through `office-to-pdf` instead.
- **Read-only** — there is no write, edit, or re-save operation.
- **Preview cache identity** — the document preview keeps its own conversion cache keyed by file identity; sharing the reader's metadata as that key needs a Host–Client method, which this release does not add.
- **Unsupported document parts** — comments, tracked changes, charts, embedded objects, and conditional formats are not reported.

<a id="dev-note"></a>
### Dev Note

None.
