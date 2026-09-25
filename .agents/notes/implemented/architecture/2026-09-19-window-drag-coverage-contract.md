# Agent Note: Window drag coverage as a contract

Status: implemented

English | [中文](2026-09-19-window-drag-coverage-contract.zh.md)

## Problem

The macOS desktop window's draggable area is authored twice. The layout decides where chrome rows are — their heights and what they contain — while hand-written app-region declarations decide what drags: one row declaration per chrome row plus per-box subtractions spread across feature sheets. The two descriptions are kept in step by hand, so they drift: a row whose box does not match the band leaves chrome outside the drag surface, or puts content inside it — a press that misses a control by a few pixels drags the window, and a double click there runs the system's title-bar action.

## Decision

Coverage becomes a contract with four executed parts:

1. ui-web's `window-drag/regions.ts` publishes the composition rule as an executable model — a point is draggable when the last collected app-region box containing it declares `drag`, the geometry-in-DOM-order composition the native window applies — together with `INTERACTIVE_SELECTOR`, the single source for the interactive subtraction ui-web base.css declares. The base-styles spec asserts the sheet declares exactly that list, so the two cannot drift.
2. The shell declares the darwin drag surface exactly once: `html[data-platform='darwin'] [data-window-drag]` in ui-web base.css. Every chrome row marks its own element in markup, so the row's box is the window's draggable geometry and no fixed band has to match any row's height. The ui-theme app-region gate holds a manifest that pairs each row's markup mark with its sheet, its class selector and its authored height, and refuses a mark on any element the manifest does not name. QiLin's manifest: the sidebar's top strip (ui-sidebar; the logo row stays content so the brand button keeps its New Session shortcut on darwin), the Conversation header (ui-conversation), the right sidebar's dockkit strip (ui-dockkit), and the plugin manager's page head plus shared detail head (ui-plugin-manager).
3. The browser lane gains `window-drag-coverage`, which boots the shipped composition in Chromium with `data-platform='darwin'` and asserts, through the model, that no interactive box lies inside the drag surface, plus per-row probes for the chrome rows. QiLin renders the plugin manager inside the portalled settings modal, so the lane has no entry-page walk; it asserts instead that a covering overlay subtracts the whole window while open.
4. The shell owns the one recollection watcher — ui-web's `window-drag/recall.ts`, installed by the boot kernel. It measures every marked row once per frame while the surface can be moving, sets `data-window-drag-recall` on the body for each frame whose geometry changed, and clears it once the geometry holds still through a short grace window. It reports every reason the surface can move: a DOM change touching a marked row or the container holding one, a marked row's box resizing, and a transition or animation starting on an element that holds a marked row. No chrome row carries a pulse of its own.

The native half — whether a press really drags or reaches the page — stays a checklist, because no keyless CI lane reaches the window server: the state matrix below is run for any change to this layer.

## Alternatives considered

**Publishing measured rectangles from JavaScript as synthetic drag boxes.** Geometry would have to be re-derived at pointer cadence, and one stale frame is exactly the swallow class this work removes; CSS-derived regions cannot be stale by construction.

**A global background drag (the `movableByWindowBackground` reading).** Dragging anywhere that is not a control would break text selection and blank-area clicks.

**One drag declaration per row in each row's own sheet.** Every sheet then restates the window's geometry, and a row whose box moves in layout alone still has to be re-declared in CSS; one shell rule over a markup mark keeps the declaration count at one, and the manifest pairs the marks with the geometry that the gate can still check.

**Pinning current coverage as one golden snapshot.** That would freeze the two failure classes next to the correct behaviour; the manifest separates the invariant (no swallowed control) from row geometry that follows layout.

## Consequences

- A new control needs no drag declaration: the interactive selector subtracts it. A new chrome row marks its element `data-window-drag` and adds a manifest entry pinning its height, so no band arithmetic and no other sheet changes.
- A row's own box is the whole draggable geometry, and a content container is never one. The plugin manager's detail views mark the head row they share, not the detail container they are rendered in: marking the container would drag the window over its text and form labels.
- The whole package tree declares the drag surface in exactly two places — the shell's mark rule and the Windows caption row (AppFrame's `[data-windows-titlebar]` `::before`, that platform's own chrome).
- The settings overlay portals beside `#root` and carries no per-sheet `no-drag` rule: a covering surface inside the root precedes the columns' chrome, so a drag row declared later would override its subtraction, and ui-web base.css's `body > :not(#root)` rule subtracts a portalled one wherever it overlaps a drag row. The browser lane asserts that placement with the overlay open.
- A row that slides across a hidden/visible edge cannot rely on the layout change alone: Electron recollects the window's drag rects only when a computed app-region value changes (electron#32341), and Blink skips hidden boxes when it collects them. The watcher closes that gap for every row at once, so the right panel carries no pulse of its own.

## Testing

- `packages/client/web/tests/window-drag-regions.client.spec.ts` — the composition rule, including order sensitivity and box edges.
- `packages/client/web/tests/base-styles.client.spec.ts` — base.css declares the model's interactive selector, the one darwin drag rule, and the recall mark's subtraction.
- `packages/client/ui-theme/tests/app-region-styles.client.spec.ts` — drag ownership, the row manifest, and each row's mark; a mark outside the manifest or a changed row height fails.
- `packages/client/ui-dockkit/tests/app-region-styles.client.spec.ts` — the strip row's own subtraction; its drag is the markup mark's, so the sheet declares none.
- `packages/client/web/tests/window-drag-recall.client.spec.ts` — the watcher through its two seams: what re-arms it, what it ignores, the settle loop, the shell defaults, and disposal.
- `apps/web/tests/window-drag-coverage.e2e.ts` — real Chromium: no swallowed control, per-row probes for the panel strip, the Conversation header, and the sidebar top strip, the collapsed-state header run, the portalled overlay, and the recall pulse the shell fires while the right panel slides.
- Real-machine verification remains a manual matrix (below); the automated lane proves geometry through the shared model, not HID input.

## Manual state matrix

Run on the packaged macOS app for any change to this layer. Each cell means both halves: drag the row's blank run (the window must move) and click the row's controls (they must act rather than drag).

| State | Rows to walk |
| --- | --- |
| Sidebar expanded, Conversation selected, view tabs shown | sidebar top strip, conversation title row, conversation tab-strip row, every control in those rows |
| Sidebar expanded, Conversation selected, single view (no tabs) | same rows, plus the transcript's first rows below the header |
| Sidebar collapsed | Conversation header over the centre, its leading-seat reopen controls, New Session |
| Right sidebar pushed | panel strip row and its controls, the pane body run below the strip, the pane divider's top run |
| Right sidebar fullscreen | panel strip row at the traffic lights, first pane's strip inset, its controls |
| Settings modal open | no row drags anywhere in the window; every control inside the modal keeps its clicks |
| Window fullscreen on/off | every row above with the traffic lights hidden, in both sidebar states |
| Double click in a chrome row's blank run | on Windows the caption row takes the system title-bar action (maximize/restore); on macOS the darwin rows are app-region areas rather than a title bar, so no system action is expected there — only the controls keep their own double click |
