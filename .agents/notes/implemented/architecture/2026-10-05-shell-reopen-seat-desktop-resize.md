# Agent Note: Shell reopen seat and desktop resize affordance

Status: implemented

English | [中文](2026-10-05-shell-reopen-seat-desktop-resize.zh.md)

## Problem

Three product-visible gaps in the web client's desktop presentation, reported against a product desktop shell running this web client:

- Global-panel pages (for example the Plugins page) unmount the conversation header, which is the only mount of the reopen controls (`HeaderLeadingControls`). With the macOS-desktop fully-hidden collapse, such a page offers no way to reopen the sidebar or start a Session.
- Column drag handles are invisible 8px strips by cross-platform contract. In a desktop shell — with no rail and no chrome edge to hint at them — an invisible strip reads as no resize affordance at all.
- The first-open right panel takes 45% of the frame (`RIGHTBAR_DEFAULT_RATIO`), crowding the centre on wide windows.

## Decision

- New frame-owned child slot `'shell.reopen'`, rendered by a `ReopenSeat` that subscribes to the main key itself (the same isolation as `MainPanel`: panel switches must not re-render the column frame). It mounts only while a global panel is active, so the seat and the conversation header's leading controls never coexist; ui-sidebar registers the same occupant on both seats. The host is click-through and declares no drag row of its own — the page head beneath already owns that band, and the app-region manifest gate rejects unpinned chrome rows.
- The handle pill (`::after`, visible on hover and while dragging) is gated to `[data-platform='darwin']` / `[data-windows-titlebar]`; web keeps the upstream invisible-strip contract.
- `RIGHTBAR_DEFAULT_RATIO` drops to 0.32. Only the first open rides it: the resolved width is saved and later opens reuse the saved preference (stores.ts).

## Consequences

- A global-panel page now carries the reopen and New Session controls through the frame-owned `shell.reopen` seat. The seat and the conversation header's leading controls never coexist, so a page shows the controls once, and the sidebar registers one occupant shared by both seats instead of two.
- The seat owns no drag row: the page head beneath it keeps that band, which is what the app-region manifest gate requires of pinned chrome rows.
- The visible resize affordance reaches desktop carriers only; a plain web client keeps the upstream invisible 8px strip, so this branch changes no web-side drag behaviour.
- The narrower first-open right panel (0.32) applies where no saved width exists; every later open reuses the saved preference, so the change is a one-time default rather than a forced width.
- The pre-existing reds listed under Notes stay unaddressed here; they are separate from this change.

## Alternatives considered

**Give the `shell.reopen` host its own window-drag row.** Rejected: the page head beneath already owns that band, and the app-region manifest gate rejects chrome rows that are not pinned by the manifest — a drag row here would be unpinned chrome.

**Keep the conversation header mounted on global-panel pages.** Rejected: those pages unmount the conversation surface by design; keeping its header would carry conversation-scoped props and hooks into pages that have no conversation.

**Show the handle pill on every platform.** Rejected: the invisible 8px strip is the cross-platform contract, and only a desktop shell lacks the chrome edge that hints at it. Gating the pill to `[data-platform='darwin']` / `[data-windows-titlebar]` keeps the web presentation unchanged.

**Apply the 0.32 ratio to every right-panel open.** Rejected: the resolved width is a user preference once saved, and overriding it on each open would discard a deliberate drag.

## Notes

- The `ui-theme` app-region and scrollbar reds, the `pdf-license-bundle` pack-budget red, and the `ui-chat` sidebar-browser link red all reproduce at the pre-change commit of this branch; they are pre-existing and are not addressed here.
