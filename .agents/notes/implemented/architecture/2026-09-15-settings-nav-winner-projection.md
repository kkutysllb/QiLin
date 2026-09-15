# Agent Note: the settings nav projects slot winner cells, so a shadowed section cannot leave a dead row

Status: implemented

English | [中文](2026-09-15-settings-nav-winner-projection.zh.md)

## Problem

The settings shell built its navigation rows from `ctx.slots.entries('settings.section')` — the raw ledger view — while the content column renders through the machinery's winner projection (`entriesOfSlot`: one cell per list id, the lowest-priority live entry wins). A registration that shadows another registrant's cell (same id, lower priority) therefore kept the stock row listed while the winner rendered in its place, and a winner that renders nothing still left a labeled dead row. The coding-sidebar integration hit exactly this: its QiLin channel replaces the stock `sidebar-right` settings page by registering the same id at priority -1, and until this change the nav listed the stock row it could no longer render.

## Decision

`ui-settings-general` projects both list ledgers it consumes — the section nav rows and the onboarding coordinator steps — through `ctx.slots.entriesOfSlot`, so the navigation lists exactly the cells the renderer would draw. No plugin awareness enters the shell: shadowing is the slots system's documented composition mechanism ("register at a different priority to shadow it — lowest renders"), and the shell now honors it on the same terms as the content column.

## Consequences

- A replacement settings page registers the stock id at a lower priority and disappears from nothing it should not: one nav row, one page, winner-owned label and order; disposing the shadow restores the stock row.
- Raw-ledger inspection stays available through `ctx.slots.entries` for tooling that wants every registration.
- `settings.onboarding` step selection follows the same winner projection, so a shadowed step can no longer be selected and then render nothing.

## Alternatives considered

- Filtering rows whose winner renders nothing: components are opaque to the shell; there is no honest predicate.
- A config knob on `ui-sidebar-right` to skip its settings registration: moves a composition decision into QiLin that the replacing plugin already owns, and adds the first client-plugin Config surface for one consumer.
- Deleting the stock registration outright: patch layers disable entries, not individual contributions, and `ui-sidebar-right` must stay mounted for its `sidebarRight` services.

## What was given up

The nav can no longer show a section whose registration exists but is shadowed — by design; anyone debugging composition reads the raw ledger through `slots.entries` or `slots.snapshot()`.

## Required verification

`packages/client/ui-settings-general/tests/shell.client.spec.ts` covers the winner-projection rows and onboarding steps, including shadow dispose-and-restore; the vendored plugin's live behavior was verified in the browser (single "Side card" nav row replacing the stock "Sidebar" row).
