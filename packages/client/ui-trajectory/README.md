---
description: "Trajectory pages for the qilin web client right Sidebar: a turn-aware event ledger with an interactive timing overview, and the graph view that draws the same ledger as a live node and edge flow."
kind: "package-reference"
---

# @qilin/client-ui-trajectory

English | [中文](README.zh.md)

## Summary

The Trajectory tab in the right Sidebar inspects activity as a turn-aware ledger and timing overview; the Trajectory graph tab draws the records as a live node and edge flow. The ledger groups User, Assistant, Tool, nested Subtool, and compaction records, marks turn and step boundaries, and opens a record inspector for token usage, duration, input, output, timing, images, and attachments. Long histories open at the tail, load older pages on demand, and render visible rows only. While streaming, it follows the tail until you scroll upward, and in-flight records show a start marker without inventing elapsed time.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Open the Trajectory tab from the right Sidebar's guide — or from a Chat tool card's inspect action, which focuses that call — to inspect agent activity as an event ledger and timeline. The ledger covers records with an explicit loading row until the initial tail is positioned; while an older prefix remains unloaded, a first-row control loads one earlier page on click and shows a disabled loading status while that page is pending.

### Inspecting records

Selection, timeline navigation, folding, and search cover the React-visible window. Request numbers and cumulative usage cover the complete resident snapshot. Selecting a record opens a local inspector for token usage, duration, Input, Output, Timing, and durable images. Image URLs use the Conversation-owned per-session cache, so Chat and Trajectory share one authorized read per attachment. A user record shows the generic-file count beside its text, while a record without text shows its image and file counts. A standalone compaction request appears chronologically in its own `Between turns` section, while a numbered compaction remains inside its owning turn.
Calls are identified by their recorded tool name. For `run_code`, the row shows the program description and the inspector opens numbered, highlighted source. The Code tab provides wrapping, a `{}` toggle for the original JSON arguments, and exact source copying, including trailing newlines. Copying the original arguments retains their recorded JSON whitespace. Each newly opened code view takes the last wrapping choice; changing it leaves other open views as they are. Output preserves the recorded text, using a tree for complete JSON objects or arrays. Highlighting uses only an unambiguous TypeScript or Python hint in the recorded tool schema; missing or conflicting hints leave plain source. See the [PTC inspection decision](../../../.agents/notes/implemented/feature/2026-09-09-ptc-trajectory-code-inspection.md) for replay constraints.

Selection, timeline navigation, folding, and search cover the React-visible window. Request numbers and cumulative usage cover the complete resident snapshot. Selecting a record opens a local inspector for token usage, duration, Input, Output, Timing, and durable images. Image URLs use the Conversation-owned per-session cache, so Chat and Trajectory share one authorized read per attachment. A user record shows both nonzero image and ordinary-file counts beside its text, including attachment-only records. A standalone compaction request appears chronologically in its own `Between turns` section, while a numbered compaction remains inside its owning turn.

Summary and Preview share one ordered attachment list after the message text, preserving repeated references. Each row shows a contained image thumbnail or file-type icon, the recorded filename (a localized numbered label for unnamed images), and recorded size, type, and image dimensions where available. Zero-byte files retain their size, and truncated filenames expose the full name in a tooltip. Images open the existing lightbox. Raw keeps content-block order and unrendered text, with images and files in initially collapsed disclosures containing their complete recorded fields.

Thinking in the inspector uses compact Markdown at the inspector's fixed 13px size and 20px line height, independent of the content-size setting. Headings add bold weight without increasing size or line height. Assistant output keeps its regular Markdown typography.

### The timing overview

A fixed Overview above the ledger projects real record start/duration timing from left to right; Assistant spans divide recorded TTFT from decoding, and a 500 ms hover reveals exact clock and duration details. Dragging an interval focuses the ledger on every record active at any point in that inclusive range; wheel gestures zoom the time domain; a right-button click clears the selected interval, and a right-button drag pans an already zoomed viewport. The initial view and streaming updates stay at the tail; scrolling upward suspends following so new records do not interrupt inspection of earlier rows.

### The graph view

The Trajectory graph page opens from the same guide box — its entry sits at order 21, directly below the ledger's — opens by the `trajectory-graph` kind, seats one graph per surface beside the ledger, and takes the same keyed tab-body seat under its own id. Both pages read the same `useTrajectory` projection of the Trajectory target, so the graph adds no session request of its own: the ledger presents the records as rows, and the graph draws them as chips in the input, model, and tool swimlanes inside numbered turn bands, chained by the edges the ledger itself records — the prompt that fed each request, the result it produced, the calls each assistant dispatched, the sub-calls a tool dispatched, and the loop back to the next request. The streaming prefix and in-flight calls render as live records whose edges animate; the toolbar pauses the flow and toggles fit and tail following; selecting a chip opens an inspector with the record's arguments, result, and timing.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The view is a pure projection: Trajectory-owned Definitions assemble business records from the shared Session window — including durable cancellation-finalized prefixes, chunk-only interruption fallbacks, and interrupted Tool records — so Trajectory neither reads nor changes the Chat conversation snapshot. Its steering classifier retains only next-step Inbox IDs through persistent splice state and shares each current claimed batch across later Contexts.

A complete appended prompt without a loaded request header appears as a standalone system row; only its known text is available, with no inferred request options or tool catalog. Prepending its request history replaces that standalone presentation without duplicating the prompt. In-history system prompt changes compare against the most recent request state, including earlier prompt updates without a new request header. Each request retains the prompt and change that applied at its own position. Surface replacements, including compaction, restore the last nonempty surviving system prompt even without a new system event; an unloaded prompt remains unavailable until its page arrives.

### The graph projection

The graph page is a pure projection of the same snapshot: one node per ledger record plus the streaming prefix and every unsettled call, and only the edges the ledger itself records — nothing invented. A React-free layout module gives ledger order the vertical axis and the actor lane the horizontal one, and the render window keeps the most recent 400 records together with the edges between them.

### Virtual rows

Long ledgers initially derive React data from 50 target Nodes ending at the mount-time tail. Later Nodes extend that anchored window without evicting its prefix, and the existing load control reveals earlier resident Nodes before requesting another Session page. Virtualization mounts only the visible row window plus a small overscan; request-only separators share the next measurable virtual item, while semantic row keys and ARIA indexes survive prepends. The virtualizer owns bottom following for structural appends; non-virtual ledgers use a direct tail-position write. Content-only stream frames preserve virtual row keys and heights, reuse measurements, and do not issue repeated tail-scroll writes. Completed replies retain assembled blocks, timing, and usage in Trajectory target State, while the shared Session window keeps the raw Events.

### Layout

The ledger fills its Sidebar pane and owns its own vertical scrollers, with no reserved space for the conversation's floating composer. Scrollable Summary regions keep their scrollbar thumbs transparent until hovered or focused, without changing the scroll geometry. The package provides no service and declares no Context merge.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These pages cover the conversation host and the session data this view projects.

- [ui-sidebar-right](../ui-sidebar-right/README.md) — the Sidebar whose tab registry and keyed body seat this package registers into.
- [session-projection](../../session/session-projection/README.md) — the projection registry serving client-facing read models of session state.
- [session](../../core/session/README.md) — the session seam whose window holds the raw events.
- [compaction](../../compaction/compaction/README.md) — the compaction seam whose requests appear in the ledger.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side UI plugin layer that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define what the view can show while work is in flight; they are current package constraints.

- **In-flight Time stays blank** — `partial` and `runningCalls` rows show their running state without a fabricated duration, so the Overview renders a start marker rather than inventing a live span. Record and timeline selection are local to Trajectory, with no anchor deep links.
- **The graph renders a tail window** — the graph page keeps the most recent 400 records and the edges between them and reports the dropped count, so a very long ledger shows its recent flow rather than the complete session.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. A pure-consumer plugin — it emits no cordis events and owns no mutable cross-plugin state; its tab-type and tab-body registrations are plain effects whose disposal this package's behavior specs observe directly.
