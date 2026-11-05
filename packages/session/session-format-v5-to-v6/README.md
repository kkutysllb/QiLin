---
description: "Restore released V5 Sessions as V6 by advancing the writer version literal, leaving every recorded field, row, and payload unchanged."
kind: "package-reference"
---

# @qilin-agent/session-format-v5-to-v6

English | [中文](README.zh.md)

## Summary

Restore released V5 Sessions as V6 without changing any recorded request. The successor generation moves the header version literal and nothing else: every event, every compact run, the inherited cut, and every payload byte reach the V6 artifact unchanged. The generation boundary records that the declared producer vocabulary lost its retired development fixture source, which is a declared-type change without a wire representation, so no body conversion exists to perform. The [catalog](../session-format-catalog/README.md) consumes this edge through the static migration declaration; the library itself reads and publishes no files.

## Table of Contents

- [Use this package](#use-this-package)
  - [When to use it](#when-to-use-it)
  - [Entry point](#entry-point)
- [V5-to-V6 specification](#v5-to-v6-specification)
  - [Header](#header)
  - [Events and inheritance](#events)
- [Native V6 admission](#native-v6-admission)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
  - [Historical restoration](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

<a id="when-to-use-it"></a>
### When to use it

Use the [catalog](../session-format-catalog/README.md) to restore a Session. Direct imports serve catalog assembly and tests; this library has no Kylin mount configuration. The [public exports](src/index.ts) provide the migration declaration, the released V5 source codec, the V6 target codec, the target header validator, and the target restorer.

<a id="entry-point"></a>
### Entry point

The header-only operation converts metadata without reading bodies:

```ts
import type { SessionFormatHeader } from '@qilin-agent/session-format'
import { sessionFormatV5ToV6 } from '@qilin-agent/session-format-v5-to-v6'

declare const sourceHeader: SessionFormatHeader
const migrated = sessionFormatV5ToV6.migrateHeader(sourceHeader)
```

`migrateHeader` validates the released V5 header and returns the same fields with `version: 6`. `createStage` produces one independent stage per source artifact and passes events and compact runs through `context.emitEvent` and `context.emitRun`.

-----

<a id="v5-to-v6-specification"></a>
## V5-to-V6 specification

<a id="header"></a>
### Header

The released V5 header fields carry over unchanged. The edge rewrites `version` from 5 to 6 and rejects a source header that fails the released V5 validation, so a malformed header never reaches the successor. `agentPreset` stays a free string: custom ids outside the shipped roster remain valid.

<a id="events"></a>
### Events and inheritance

Every event passes through unchanged, including ignorable records and the `session/end-seed` marker. Compact runs pass through unchanged because the packed framing is identical in both generations.

The inherited cut follows the source header. An unseeded source publishes a zero cut before end of file. A seeded source publishes the index of its last inherited `session/end-seed` marker, and a seeded artifact without that marker is refused rather than assigned a zero cut.

-----

<a id="native-v6-admission"></a>
## Native V6 admission

`restoreReleasedV6Artifact` validates the V6 header, dense sequence numbers, unknown required event types, retired syntax, native message admission, tool results, forked results, catalog children, lifecycle relationships, and delivery ownership. The rules are the released V5 rules at version 6: the only distinction is that a `session-log-deepseek/delivery-accepted` marker carrying generation 6 is checked against the owning Session id, while markers of other generations stay outside this reader's ownership checks.

The V6 codec reuses the released V5 physical rows and row admission. Packed headers, packed bodies, and recovery policies are therefore byte-identical across the two generations.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/migration.ts` owns the header transition and the pass-through stage. `src/validation.ts` owns the V6 header validator, the restoration check, and the delivery-generation check. `src/codec.ts` owns the physical framing, which wraps the released V5 codec with the V6 version literal. The [catalog](../session-format-catalog/README.md) composes the chain statically; mounting plugins does not decide historical readability.

-----

<a id="further-exploration"></a>
## Further Exploration

- [Session format catalog](../session-format-catalog/README.md)
- [The V4-to-V5 edge](../session-format-v4-to-v5/README.md)
- [Format reference for V5](../../../docs/persistence-changes/historical-formats/v5.md)
- [Adding a Session format version](../../../docs/cookbook/adding-a-session-format-version.md)

-----

<a id="model-experience"></a>
## Model Experience

### Historical restoration

#### What the model sees

Nothing changes. The edge performs no body conversion, so a restored V5 Session presents the same messages, tool results, and request headers — including `agentPreset` — as the V5 reader did.

#### Token effect

The edge inserts, removes, and rewrites no model-visible text, so a restored Session keeps the same request token budget.

#### KV Cache effect

The edge changes no recorded request, so restored prompt prefixes keep their bytes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Body-identity conversion** — the generation boundary exists because the declared producer vocabulary retired a development-only message source; no conversion can recreate a producer that no longer exists, and none is needed.
- **Retired kind stays uninterpreted** — historical records carrying the retired kind keep it under `unknownKinds: preserve`, and readers follow the merge-extensible default branch.
- **No stored-file rewrite** — persistence owns read preparation and publishing the immutable successor; this library reads and writes no file.

-----

<a id="dev-note"></a>
### Dev Note

None.
