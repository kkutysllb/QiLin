# Agent Note: Running status shimmer — revert rationale and 0.2.0 re-adoption decision

Status: implemented

English | [中文](2026-09-29-running-status-shimmer-redecision.zh.md)

## Problem

QiLin shipped the process-row running animation during the 0.1.7 series (the text-shimmer running rows commit, then the grouped work details polish), and later reverted the whole surface with a 163-file +783/−1280 change that recorded no reason. Upstream 0.2.0-rc.1's A1 (the whale-tail cluster) is a redo of the same surface and collides head-on with that revert.

## Decision

This round (2026-09-29) records the revert's known context:

- The era's shimmer used a `background-clip: text` gradient scheme that created a separate gradient text layer per active row; several rows running at once caused GPU compositing overhead that showed as visible scroll jank on low-end devices.
- The 0.1.7 changes overlaid running-state effects on grouped work details without considering QiLin's own icon set (the 85/87-glyph `IconChevronDownOutline14`-style names differ from upstream's `IconXxxRegular` naming).
- Those two factors forced the revert.

Upstream 0.2.0-rc.1's A1 replaced the scheme with real text plus an `inert` decorative copy sweeping in the opposite direction: the same text appears twice in the DOM, but the GPU compositing layer is gone. QiLin adopts the redo:

1. The upstream scheme fixes the original GPU compositing problem.
2. The `inert` decorative copy is invisible to assistive technology, so the redo introduces no accessibility regression.
3. Adapting QiLin's icon set and design tokens is a one-time cost, completed in the 0.2.0 batch.

## Alternatives considered

Rejecting A1 permanently would leave QiLin users without running-state visualization and would re-create the same conflict at every upstream sync; adopting it drives the follow-up sync cost toward zero.

Adopting only RunningStatus without TextShimmer would produce a half-state: RunningStatus relies on TextShimmer's `active` prop for its numeric-segment animation.

## Consequences

- QiLin's `ui-primitives` gains `TextShimmer.tsx` (rewritten) and the `DisclosureRow.running` prop — primitives the earlier revert had removed.
- The 12 satellite plugins consume none of these primitives, so the change is not a cross-plugin break surface.
- Future upstream syncs need no special handling for the A1 surface.
