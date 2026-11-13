---
description: "Restore released V6 Sessions as V7 by advancing the writer version literal and admitting the persisted Team-mode fact."
kind: "package-reference"
---

# @qilin-agent/session-format-v6-to-v7

English | [中文](README.zh.md)

## Summary

Restore released V6 Sessions as V7 without changing any recorded request. The successor generation moves the header version literal and adds one admitted fact: a Team Lead Session records its Team mode in `team/mode`. A V6 writer had no such vocabulary, so no V6 byte is converted; the target generation validates a Team-mode fact when one arrives and refuses a malformed or repeated transition. The [catalog](../session-format-catalog/README.md) consumes this edge through the static migration declaration; the library itself reads and publishes no files.

## Table of Contents

- [Use this package](#use-this-package)
  - [When to use it](#when-to-use-it)
  - [Entry point](#entry-point)
- [V6-to-V7 specification](#v6-to-v7-specification)
  - [Header](#header)
  - [Events and inheritance](#events)
  - [Team mode](#team-mode)
- [Native V7 admission](#native-v7-admission)
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

Use the [catalog](../session-format-catalog/README.md) to restore a Session. Direct imports serve catalog assembly and tests; this library has no Kylin mount configuration. The [public exports](src/index.ts) provide the migration declaration, the released V6 source codec, the V7 target codec, the target header validator, and the target restorer.

<a id="entry-point"></a>
### Entry point

The header-only operation converts metadata without reading bodies:

```ts
import type { SessionFormatHeader } from '@qilin-agent/session-format'
import { sessionFormatV6ToV7 } from '@qilin-agent/session-format-v6-to-v7'

declare const sourceHeader: SessionFormatHeader
const migrated = sessionFormatV6ToV7.migrateHeader(sourceHeader)
```

`migrateHeader` validates the released V6 header and returns the same fields with `version: 7`. `createStage` produces one independent stage per source artifact and passes events and compact runs through `context.emitEvent` and `context.emitRun`.

-----

<a id="v6-to-v7-specification"></a>
## V6-to-V7 specification

<a id="header"></a>
### Header

The released V6 header fields carry over unchanged. The edge rewrites `version` from 6 to 7 and rejects a source header that fails the released V6 validation, so a malformed header never reaches the successor. `agentPreset` stays a free string: custom ids outside the shipped roster remain valid.

<a id="events"></a>
### Events and inheritance

Every event passes through unchanged, including ignorable records and the `session/end-seed` marker. Compact runs pass through unchanged because the packed framing is identical in both generations.

The inherited cut follows the source header. An unseeded source publishes a zero cut before end of file. A seeded source publishes the index of its last inherited `session/end-seed` marker, and a seeded artifact without that marker is refused rather than assigned a zero cut.

<a id="team-mode"></a>
### Team mode

`team/mode` is a Session-scoped fact stored only in a Team Lead Session: `{ mode: 'on' | 'off', source?: 'composition' }`. Composition enables Team mode in this checkout, so the Team service records `{ mode: 'on', source: 'composition' }` before the first durable Team event and records `off` when a Session leaves Team mode. The payload carries no Team identity and no payload version: the Lead Session owns exactly one mode.

A V6 source cannot contain the fact, because the V6 writer declared no such event type and the V6 reader refuses an unknown event that is not ignorable. A V6 source that carries one anyway reaches the target unchanged and is validated there.

-----

<a id="native-v7-admission"></a>
## Native V7 admission

`restoreReleasedV7Artifact` validates the V7 header, dense sequence numbers, unknown required event types, retired syntax, native message admission, tool results, forked results, catalog children, lifecycle relationships, delivery ownership, and Team-mode transitions. Structure and admission follow the released V6 rules: a `session-log-deepseek/delivery-accepted` marker carrying generation 7 is checked against the owning Session id, while markers of other generations stay outside this reader's ownership checks.

`team/mode` admits exactly the two members `mode` and `source`, requires `mode` to be `off` or `on`, and admits only the `composition` source label. A Session starts outside Team mode, so a first `off`, a repeated mode, or a payload with another field is refused rather than ignored. The check covers only the payload and its transition order; a Team event other than `team/mode` is validated by the Team projection that owns roster and task semantics.

The V7 codec reuses the released V6 physical rows and row admission. Packed headers, packed bodies, and recovery policies are therefore byte-identical across the two generations.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

`src/migration.ts` owns the header transition and the pass-through stage. `src/validation.ts` owns the V7 header validator, the restoration check, the delivery-generation check, and the Team-mode transition check. `src/codec.ts` owns the physical framing, which wraps the released V6 codec with the V7 version literal. The [catalog](../session-format-catalog/README.md) composes the chain statically; mounting plugins does not decide historical readability.

-----

<a id="further-exploration"></a>
## Further Exploration

- [Session format catalog](../session-format-catalog/README.md)
- [The V5-to-V6 edge](../session-format-v5-to-v6/README.md)
- [Agent Teams service](../../team/agent-team/README.md)
- [Format reference for V6](../../../docs/persistence-changes/historical-formats/v6.md)
- [Adding a Session format version](../../../docs/cookbook/adding-a-session-format-version.md)

-----

<a id="model-experience"></a>
## Model Experience

### Historical restoration

#### What the model sees

Nothing changes. The edge performs no body conversion, so a restored V6 Session presents the same messages, tool results, and request headers — including `agentPreset` — as the V6 reader did. Team mode is log-only and never enters the model-visible surface.

#### Token effect

The edge inserts, removes, and rewrites no model-visible text, so a restored Session keeps the same request token budget.

#### KV Cache effect

The edge changes no recorded request, so restored prompt prefixes keep their bytes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Body-identity conversion** — the generation boundary exists because the writer began recording Team mode; a V6 log carries no Team-mode fact, and none is fabricated.
- **Team mode is composition-driven** — this checkout has no per-Session Team-mode switch, so only `on` is written today; the reader admits `off` for a Session that leaves Team mode later.
- **No stored-file rewrite** — persistence owns read preparation and publishing the immutable successor; this library reads and writes no file.

-----

<a id="dev-note"></a>
### Dev Note

None.
