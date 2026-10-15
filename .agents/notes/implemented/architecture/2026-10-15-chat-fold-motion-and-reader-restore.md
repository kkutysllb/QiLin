# Agent Note: One fold motion with the fork's reader restore kept

Status: implemented

English | [中文](2026-10-15-chat-fold-motion-and-reader-restore.zh.md)

## Problem

When a Turn's work details close on the next message, the Chat scroll layer ran two fold paths. The input path measured the closing rows and moved those rows and the scrollport on one frame clock to a single landing. The generic path kept scrollTop, reserved the whole closing height as bottom room in one block, and followed once after the fold ended, which holds only when the fold happens below the reader. Every human input without a transcript echo on this page took the generic path — a send from another tab, a queued message delivered after the previous Turn, a subagent child's composer in the right Sidebar — so a reader at the bottom watched the reserved room fill the viewport and a reader in the middle watched their content move up.

## Decision

`packages/client/ui-chat` carries upstream DSH's single fold motion. [flow-motion.ts](../../../../packages/client/ui-chat/src/client/chat/flow-motion.ts) hands every batch of closing rows to the `InputFoldDriver` the viewport supplies, whose four steps are begin (measure the boxes and choose the landing), prepare (grow the room before box writes so no intermediate frame is clamped), frame (write box heights and scrollTop together), and finish (install the final room). [use-chat-viewport.ts](../../../../packages/client/ui-chat/src/client/chat/use-chat-viewport.ts) chooses one of two landings when a batch begins: the tail for this client's own input or a reader already following, and a reader-content-still landing that takes the first visible top-level row outside the batch as its reference and offsets scrollTop by that row's measured displacement. Both landings install only the deficit as room, `max(0, target + viewport height - folded height)`. The generic path is gone, and `reserveBelow`, `pendingReserve`, `pendingGrowth`, and `followAfterFold` with it.

The fork's own reader restore stays on top, because it answers a different question. [ChatViewport.restoreReaderRow](../../../../packages/client/ui-chat/src/client/chat/use-chat-viewport.ts) returns a settled reader's row to its sampled offset after a layout change that no fold caused — a loaded image, grown content — and `consumeResize`/`consumeReaderIntent` let [ChatReading](../../../../packages/client/ui-chat/src/client/chat/use-chat-reading.ts) tell a reader's scroll from the browser's reflow compensation. Upstream's mechanism measures displacement inside a fold batch only, so both run: folds land through the driver, and non-fold layout shifts return the reader's row through `restoreReaderRow`. The two meet in `ChatReading.flushSample` and `commit`, which record the reader's position for whichever path runs next.

Wiring needed no change. `createFlowMotion` is called only by the viewport, so the driver is self-contained; `apply.ts`, `contract/slots.ts`, `ChatView.tsx`, and `ChatFlow.tsx` keep their fork structure.

## Alternatives considered

**Keep the generic path and fix only the own-input detection.** Upstream rejected this before this fork did: the two paths keep diverging geometry rules, and input that is not own input still leaves a following reader on the reserved room.

**Compensate the generic path by reader position without the driver.** The compensation and the room arithmetic would exist twice and could diverge again, and without the frame clock the browser clamps an intermediate frame between the room and the box writes.

**Drop the fork's reader restore in favour of the folded mechanism.** The specs below assert it for layout changes that no fold causes; upstream's landing measures inside a batch only, so dropping it would regress content growth and image loads while the reader is parked away from the tail.

## Consequences

A following reader lands at the floor on any input, and a reader in the middle keeps their content still; the room installed is only what the landing lacks, so a short body can leave a deficit until new content fills it. Two mechanisms now write the scroll position, so a change to either must pass through the same reading sample.

## Testing

[`fold-follow.client.spec.ts`](../../../../packages/client/ui-chat/tests/fold-follow.client.spec.ts) covers the batches, both landings, and the room arithmetic; [`chat-scroll.client.spec.tsx`](../../../../packages/client/ui-chat/tests/chat-scroll.client.spec.tsx) covers the wiring through `useChatScroll`; `flow-motion.client.spec.tsx` covers the motion; `chat-viewport.client.spec.ts`, `chat-reading-navigation.client.spec.ts`, and `chat-view.client.spec.tsx` cover the reader restore across a layout change. `pnpm run test:gui` runs them.

## Related

- [Upstream 0.2.1-alpha.3 alignment plan](../../../../plans/2026-10-15-upstream-0.2.1-alpha.3-alignment.md) — the window this port belongs to, and what it deferred (the browser blank matrix and the subagent echo plumbing).
