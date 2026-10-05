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

## Notes

- The `ui-theme` app-region and scrollbar reds, the `pdf-license-bundle` pack-budget red, and the `ui-chat` sidebar-browser link red all reproduce at the pre-change commit of this branch; they are pre-existing and are not addressed here.
