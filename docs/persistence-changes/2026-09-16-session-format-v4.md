---
description: "Records a persistence type transition and its compatibility acknowledgement."
kind: persistence-change
---

# 2026-09-16-session-format-v4

English | [中文](2026-09-16-session-format-v4.zh.md)

## Summary

Advances the declared SessionHeader.version from 3 to 4 for the finalized V4 writer, records first-class tool-role results and producer-owned sources, and adds the forked variant to turn/end.reason. Adds developer-role Session changes with name-only tool additions bound to historical request headers, tool removals, and deferred-loading schema markers.

## Table of Contents

- [Declaration](#declaration)
- [Compatibility](#compatibility)
- [Verification](#verification)
- [Dev Note](#dev-note)

<a id="declaration"></a>
## Declaration

```yaml persistence-change
schemaVersion: 1
id: 2026-09-16-session-format-v4
baseline: false
changes:
  - root: "SessionHeader"
    previous: "2026-09-11-initial"
    after: "d720be5aedaf6d8b499d467d6e03f98b0dfcdc4f0da95373985e290f9cb3e136"
    decision: version-bump
  - root: "event:agent/inbox/spliced"
    previous: "2026-09-14-image-offload"
    after: "6d7bb8945b1e5f8620a0f28d8a69d6cd247660c2ae6d206a8e5170f72dae0f20"
    decision: version-bump
  - root: "event:assistant/attempt"
    previous: "2026-09-14-image-offload"
    after: "3391199b615a3894a26212960f4a90350bcbdb2c0e504b2dc96548e1aa166466"
    decision: version-bump
  - root: "event:assistant/message"
    previous: "2026-09-14-image-offload"
    after: "525c28020c0927822a4739bdc5c45db2e29e1f5b7610667f5548b989e0c67b51"
    decision: version-bump
  - root: "event:compaction/summary"
    previous: "2026-09-14-image-offload"
    after: "e9a96852fab5c19342b80eaad9206540bfc0b9de9199ab9e3a2306e0cb671f0a"
    decision: version-bump
  - root: "event:developer/message"
    previous: null
    after: "92117940b84e5e29e4e4d8dd58f6dc191853a43d59f3e4337a5dd4a49f0cc460"
    decision: version-bump
  - root: "event:request/header"
    previous: "2026-09-11-initial"
    after: "e00a308b34eb536c318879aaddfa38f27c434995735ab1c58eab784ea4b5bd36"
    decision: version-bump
  - root: "event:session/title-llm-request"
    previous: "2026-09-14-image-offload"
    after: "5f5dbdcc172f780f31d7017fd78bc7f96b2882abcae62e0fd6ea9f507f2b48f1"
    decision: version-bump
  - root: "event:system/message"
    previous: "2026-09-14-image-offload"
    after: "23efb2a10dc8eca78577f2a053b13428b1939e147d6041ea27e4634ac5e6bf6f"
    decision: version-bump
  - root: "event:team/message/queued"
    previous: "2026-09-14-image-offload"
    after: "24e955ab9d60476bfe12e020778b49a98d55d92239699f65b2b7db6901f6d891"
    decision: version-bump
  - root: "event:tool/ptc-dispatch"
    previous: "2026-09-14-image-offload"
    after: "ab8968660be6347aede1bf83706e921cd836a16a77e8b1627672044cd76e7239"
    decision: version-bump
  - root: "event:tool/result"
    previous: "2026-09-14-image-offload"
    after: "83abeec3277753cb702296a3497f61047eb17dcb20e5c809cafc473d2279720e"
    decision: version-bump
  - root: "event:turn/end"
    previous: "2026-09-14-image-offload"
    after: "4e75896cec18fef7578ee36658dc6f53b58eb455c298fbd2cc531f87ca13d484"
    decision: version-bump
  - root: "event:user/message"
    previous: "2026-09-14-image-offload"
    after: "c3476ce746996e6fb7a281fe5920a4df3298a8a597fff19490fbd43641f1b870"
    decision: version-bump
```

<a id="compatibility"></a>
## Compatibility

The tool-role declaration changes ten event roots because inbox entries, message events, compaction summaries, title requests, team messages, and PTC dispatches embed the shared `Message` or `ContentBlock` declarations. Removing `tool-result` from that union and specializing message roles changes those reachable schemas without adding ten independent event protocols. The `turn/end` change separately records the forked reason; `SessionHeader` records the version increase.

The [native V4 validation decision](../../.agents/notes/implemented/architecture/2026-09-17-native-v4-read-validation.md) owns the reader admission required by these current fields.

The V3-to-V4 migration lifts released user-role tool results into tool-role messages with a required toolCallId and optional isError. Tool-result wrappers leave the content-block union. The migration preserves every admitted source event and inherited cut, and appends missing parent subagent/catalog records from retained direct-child logs in the same persistence root. Historical body restoration requires an explicit child-evidence set, including an empty set when no children are available to backfill. Missing, multiple, or unknown-version child descriptors skip that child’s backfill; conflicting identities, timestamps, or modes refuse migration without publication. Existing catalog facts remain. Historical read opens prepare the result in memory. Write opens revalidate child membership and revisions before publishing the current successor beside unchanged predecessor files. Delivery-generation checks keep historical acknowledgements from becoming active V4 watermarks. V3 readers refuse the newer generation. The finalized transition adds forked to turn/end.reason; exact-cut forks append child-owned error results and closers after the inherited marker. V4 admits checked not-started fork results with deterministic branch-specific IDs and wording; released V0–V3 validators and recorded predecessor generations remain unchanged.

The `request/header` schema also records the retired `system` key as forbidden. This declaration captures the existing native-reader refusal without changing stored data or prompt reconstruction; later permitting a value requires a version bump instead of being classified as an ordinary optional-field addition.

Producer-owned sources replace released plugin wrappers through the [V3-to-V4 migration](../../packages/session/session-format-v3-to-v4/README.md#v3-to-v4-specification). The frozen rename table and collision rules preserve source fields and event coordinates; unknown producer attribution retains every own JSON property. Native read and write opens validate source fields before exposing the Session. Existing V4 files do not rerun the incoming migration edge.

The core-owned user source property records the attribution-preservation policy; tmux-context qualifies its location attribution while retaining producer-local duplicate suppression. Auto Review and the compaction summarizer use request-only user inputs, removing their active source registrations without removing historical migration support. These inputs cannot be written as durable Session messages. Catalog formatVersion 2 stores the policy metadata; it does not change the Session version or rewrite frozen schema records. System, model, and tool sources retain their strict semantic rules.

Developer events retain their original role and require an open step. Each addition stores toolName; developer/message.headerSeq identifies an earlier known request/header containing exactly one complete matching ToolSchema. All additions in one event share that historical header revision, while removal-only and other developer messages omit headerSeq. Native and Session admission reject absent, forward, non-header, unknown-header, ambiguous, incomplete-definition and retired inline-definition forms without interpreting unknown ignorable records or dropping unrelated JSON metadata. Same-name replacement, restart, fork, surface replacement and compaction retain historical schema identity without consulting the latest header or registry. Generic sourceEventSeqs remains independent. Developer sources use the same recorded attribution-preservation policy as user sources. The optional deferLoading marker is independent of addition history. No shipped profile emits developer records; provider serialization, automatic emission and UI support remain deferred.

The PTC producer writes `source.kind: 'ptc-mode'`. The V3-to-V4 edge retains `tools-code-mode` and `tools-ptc` as historical plugin lookup keys and maps both to that current kind. The source policy reserves `ptc-mode` against attribution-only qualification.

<a id="verification"></a>
## Verification

The focused Session, agent-loop, Session Controller, V4, chat-view, and compaction suites passed 1,523 tests across 63 files after integration of exact-cut forks. V4 fork tests retain original IDs and text across encoding, decoding, and restoration, reject malformed results, and validate nested inherited cuts. The tool-role migration tests and SDK snapshot refresh also passed in the originating change; the built Python runtime sdk-snapshot scenario passed, and focused pi-ai and auto-review coverage passed 351 tests with 100% coverage of the three affected modules.

The generated request-header reservation regression and existing retired-syntax and Session surface tests pass 65 tests across three files. The generated field retains optional `never`; permitting an optional string produces a version-bump diagnostic while the native reader still refuses the retired key.

The producer-source and request-input checks pass 447 tests across 12 files, including provider equality, request-only type rejection, user-attribution retention, source migration, and native source admission. Comparing the generated inventories with the tool-role parent reports four changed roots and 447 unchanged type fingerprints.

The focused Session, V4 and request-input suite passes 884 tests across 38 files, with 100% statements, branches, functions and lines for the complete V3-to-V4 package and Session surface. Coverage includes historical same-name schema binding, compound additions/removals, malformed references and definitions, unknown-header refusal, opaque unknown records, metadata preservation, forks, replacements, compaction references, and native plain/zstd read/write admission without rewriting the generation.

<a id="dev-note"></a>
## Dev Note

None.
