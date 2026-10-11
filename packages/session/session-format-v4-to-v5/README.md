---
description: "Restore released V4 Sessions as V5 by folding the retired shipped preset vocabulary onto the single shipped roster, without changing any other recorded field."
kind: "package-library"
---

# @qilin-agent/session-format-v4-to-v5

English | [中文](README.zh.md)

## Summary

Restore released V4 Sessions as V5 without changing any recorded request. This adjacent edge is an identity conversion except for the shipped preset vocabulary: the retired ids `standard`, `cordis`, and `minimal` become `ptc` in the logical header and in every `agent-preset/selected` payload, while custom ids and every other field pass through unchanged. The [catalog](../session-format-catalog/README.md) consumes it through the static migration declaration; the library itself reads and publishes no files.

## Table of Contents

- [Use this package](#use-this-package)
- [V4-to-V5 specification](#v4-to-v5-specification)
  - [Header and preset fold](#header-and-presets)
  - [Selection events and inheritance](#selection-and-inheritance)
  - [Delivery generations](#delivery-generations)
- [Native V5 admission](#native-v5-admission)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

### When to use it

Use the [catalog](../session-format-catalog/README.md) to restore a Session. Direct imports serve catalog assembly and tests; this library has no Kylin mount configuration. The [public exports](src/index.ts) provide the migration declaration, the released V4 source codec, the V5 target codec, the target header validator, and the target restorer.

### Entry point

The header-only operation does not convert or validate an event body:

```text
const targetHeader = sessionFormatV4ToV5.migrateHeader(sourceHeader)
```

Full restoration feeds decoded events through a fresh stage and validates the target artifact. This edge inserts and removes no event, so the inherited cut maps one-to-one and partial emissions follow the same rule as every other edge: an error can occur at a later event or at `finish()`. The [format protocol](../session-format/README.md) owns stage scheduling and catalog error handling; [JSONL persistence](../session-persistence-jsonl/README.md) owns read preparation and immutable successor publication.

-----

<a id="v4-to-v5-specification"></a>
## V4-to-V5 specification

This edge preserves every source event, its order, its timestamp, and its dense sequence position: no event is inserted, removed, or reordered, so message identities, local references, run boundaries, and compact-run members keep their coordinates. Only the two preset-carrying vocabulary positions below change, and only for ids the shipped roster retired.

<a id="header-and-presets"></a>
### Header and preset fold

The logical header changes `version: 4` to `version: 5`. It retains `id`, `createdAt`, `isSeeded`, `delegationDepth`, and admitted optional `cwd`, `parentSession`, and `origin`. The exact shipped ids `standard`, `cordis`, and `minimal` become `ptc` in `header.agentPreset`; an absent preset stays absent, and a custom id stays unchanged. A malformed source header is rejected before any rewrite.

`header.agentPreset` remains a free string, so this edge does not validate it against the installed roster and does not rename other occurrence sites. The preset resolver keeps its fail-loud behavior for a retired id: migration rewrites a stored choice, and is never a runtime alias for a roster that no longer ships it.

<a id="selection-and-inheritance"></a>
### Selection events and inheritance

Every `agent-preset/selected` event is inspected, including inherited and local selections. When `data.agentPreset` is a retired shipped id it becomes `ptc`; otherwise the source event object is emitted unchanged. A selection payload whose `agentPreset` is not a string is emitted as recorded rather than repaired, and every other event type passes through without copying or re-framing.

For a seeded Session, the last `session/end-seed` with `data.inherited: true` identifies the cut: its own index is the inherited event count, closing the inherited prefix from the first current position. A seeded source without that marker is refused instead of guessing a cut, and an unseeded source exposes `headerInheritedEventCount: 0` before EOF and finishes with a zero cut.

<a id="delivery-generations"></a>
### Delivery generations

A `session-log-deepseek/delivery-accepted` payload whose `sessionFormatVersion` is 4 keeps its recorded coordinates but is no longer active under V5, because the upload watermark is generation-scoped; only a marker naming generation 5 asserts a delivery. A current-generation marker must still precede its own envelope and name the Session, except inside the inherited prefix of a Session with `parentSession`.

-----

<a id="native-v5-admission"></a>
## Native V5 admission

Input already marked V5 does not run this edge. `assertReleasedV5Header` accepts exactly the released V4 header field set at version 5, and `restoreReleasedV5Artifact` applies the released V4 row admission, retired-syntax, message-source, developer-field, lifecycle, catalog, and delivery rules unchanged. Vocabulary is the only difference: a V5 artifact that still records a retired shipped id is admitted, because the field is a free string, and an unknown event type is refused unless its envelope marks it ignorable.

The physical codec reuses the released V2 row framing with the released V4 row admission. V5 adds no physical encoding: framing, recovery, and the JSONL header line keep the released shapes.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The [migration](src/migration.ts) folds the two vocabulary positions and derives the seeded cut; the [codec](src/codec.ts) reuses frozen framing; the [validator](src/validation.ts) mirrors released V4 structure at version 5. [Migration tests](tests/migration.spec.ts) pin the header and selection folds, pass-through identity, seeded and unseeded cuts, strict chain restoration from direct V4 input, and unknown-event refusal. The [released-format decision](../../../.agents/notes/implemented/architecture/2026-08-31-released-session-format-migrations.md) owns why adjacent composition is tested separately from native admission.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Released V3 to V4](../session-format-v3-to-v4/README.md) — the frozen preceding conversion and the released V4 source codec this edge imports.
- [Session format catalog](../session-format-catalog/README.md) — the static edge chain that assembles restoration.
- [Format release status](../../../docs/session-format-status.md) — the writer constant and release evidence.

-----

<a id="model-experience"></a>
## Model Experience

### Historical restoration

#### What the model sees

Each historical request keeps its recorded prompt, message content, and model configuration. A folded `agentPreset` id changes which preset a restored Session reports; the preset itself owns every model-visible contribution it registers.

#### Token effect

The edge inserts, removes, and rewrites no model-visible text, so a restored Session carries the same request token budget after migration.

#### KV Cache effect

The edge preserves recorded request meaning and configuration; it does not guarantee provider cache hits or byte-identical native V5 recordings.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No stored-file rewrite** — persistence owns read preparation and publishing the immutable successor; this library reads and writes no file.
- **No runtime alias** — a retired id still fails at `resolve()`; only stored Sessions are folded, as described under [header and preset fold](#header-and-presets).
- **No roster validation** — `header.agentPreset` stays a free string, so an id no installed preset provides is admitted here and rejected by the preset resolver.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
