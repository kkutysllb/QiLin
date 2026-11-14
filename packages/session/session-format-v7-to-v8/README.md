---
description: "Session V7 to V8 format edge for the coding preset label."
kind: "package-reference"
---

# Session Format V7 to V8

English | [中文](README.zh.md)

## Summary

The V7-to-V8 edge renames the stored coding preset label. V8 keeps every V7 structural rule: the same header fields, the same event envelopes, and the same physical JSONL framing, so the edge rewrites one header field and the `agent-preset/selected` payload that records it.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)

-----

<a id="use-this-package"></a>
## Use this package

The session format catalog loads this package from its `qilin.sessionFormatMigration` manifest, `7 → 8`. Restoring a V7 log passes every header and event through `sessionFormatV7ToV8`, which moves the version literal to 8 and rewrites a stored `ptc` preset to `coding`; a user-authored preset id is kept verbatim. `restoreReleasedV8Artifact` then validates the rows as V8.

<a id="understand-the-implementation"></a>
## Understand the implementation

`releasedV8SessionFormatCodec` frames rows through the released V7 codec and renames the version literal. `restoreReleasedV8Artifact` repeats the released V7 structural checks for V8 generation, including the active delivery watermark, and Team-mode and retry payload rules. The edge owns no vocabulary of its own: it reads V7 rows, rewrites the preset label, and validates the result.

## Model Experience

### Historical restoration

#### What the model sees

One label differs. A restored V7 Session presents the same messages, tool results, and request headers as the V7 reader did, except that a stored `ptc` agent preset is reported as `coding`, which is the id the current roster publishes.

#### Token effect

The edge rewrites one header field and the single selection event that records it, so a restored Session requests the same tokens as its V7 form.

#### KV Cache effect

Nothing rebuilt a request from these rows before the V8 reader saw them, so the rewrite changes no recorded request and restored prompt prefixes keep their bytes.

## Known Limitations and Deferred Work

- **One field, no rewrite** — the codec keeps the V7 framing, so a V8 file differs from a V7 file only in the header version literal and a migrated preset label; no other byte moves.
- **The retired label has no fallback** — a V8 header that still names `ptc` is refused, because the roster no longer publishes it; the V7 reader migrates it before V8 validation runs.
- **No stored-file rewrite** — persistence owns read preparation and publishing the immutable successor; this library reads and writes no file.

<a id="dev-note"></a>
### Dev Note

None.
