# Agent Note: Trajectory as a right-Sidebar tab

Status: implemented

English | [中文](2026-09-14-trajectory-sidebar-tab.zh.md)

## Problem

The conversation header carried a second navigation row: a Chat/Trajectory tab strip over the transcript. Trajectory is an inspection surface — a turn-aware event ledger with its own timeline — so hosting it in the conversation column forced two very different presentations into one scroll port and made the trajectory view compensate for the floating composer with `data-conversation-composer-overlay` rules in `ui-conversation`.

The same header carried a more-actions button whose only item downloaded the Session log, duplicating the `/export` command with a second entry path and a second piece of header chrome.

The right Sidebar already provides a docked, resizable, splittable, floatable, fullscreen-capable home for inspection surfaces, and its tab registry is the documented public way for a package to add one.

## Decision

`ui-trajectory` registers the ledger as a right-Sidebar page type. `trajectoryTabDefinition` declares kind `trajectory`, id `@qilin/client-ui-trajectory/trajectory`, band `builtin`, the localized `view.trajectory` chip title, and a guide entry at order 20. The body registers into the keyed `sidebar.right.pane.tab` seat under the same id, with `conversation.trajectory.images` as its declared child and an inject face supplying the paging loader, the image loader, and the duration preference. The registry captures the chip title when the tab opens, so no `sidebar.right.pane.tab.title` registration is needed for a title that never changes.

Focus travels through the tab navigation record rather than a conversation-store request. `TrajectoryTabParams` is `{ focus?: string }`, declared as the `trajectory` entry of `SidebarRightTabParamsMap`; `ctx.sidebarRight.openTab("trajectory", { params: { focus: callId } })` opens the tab, focuses the call, and expands the column in one step. The body reads `useTabInfo().tab.navigation`, applies the focus while `navigation.revision !== appliedRevision`, and records the applied revision, so one navigation never re-applies and a later inspect of the same call does.

`ui-chat` drops its `openView` owner prop for an injected `openTrajectory(callId)`; the tool card's inspect action opens the Sidebar tab instead of switching a conversation tab.

`ui-conversation` keeps the `conversation.view` slot, the view roster, and the tab strip — Chat is still a registered view — but loses the one-shot focus request channel: `ConversationViewRequest`, the store `viewRequest` field, and the `openView`/`completeViewRequest` actions have no producer or consumer once Trajectory leaves the ring. `ConvViewOwnerProps` becomes a marker interface.

`ConversationRoot.module.css` loses the `:has([data-conversation-composer-overlay])` rules and `TrajectoryView` stops emitting the attribute: the ledger owns its own scrollers inside a Sidebar pane, and the conversation column never hosts it. The `composer-tab-geometry` browser scenario and its expected file are deleted with them, because their subject — the input card staying put across the two conversation tabs — no longer exists.

`session-log-export` keeps the shared result modal mounted in the `conversation.session.header.utilities` seat but renders no button: `/export` is the only trigger, and the dialog still reports preparing, success, and failure states.

## Alternatives considered

**Keep the Chat/Trajectory tabs and add a Sidebar shortcut.** Rejected. Two navigations to the same surface, a cramped ledger inside the conversation column, and the composer-overlay compensation all survive; the Sidebar alone can already host, split, float, and fullscreen the ledger.

**Keep the header download button beside `/export`.** Rejected. The button offered nothing the command does not, and the two entry paths shared one dialog and one controller, so removing it removes chrome without removing capability.

**Keep `viewRequest`/`openView` in the conversation store as an extension point.** Rejected. With Trajectory gone, no view requests focus and no code completes a request; a channel with no producer or consumer is dead surface, not an extension point. The view roster and selection stay because Chat still uses them.

**Open the Sidebar tab from a new header button.** Rejected. The guide entry is the registry's designed discovery path and the tool-card inspect action covers the focused case; a third header control would rebuild the chrome this change removes.

**Declare `SidebarRightTabParamsMap.trajectory` in `ui-chat`.** Rejected. The kind owner declares its parameters; `ui-chat` imports the declaration with `import type` the same way it already reaches the `file` resource parameters.

## Consequences

The ledger gains the Sidebar's placement model: docked, split, floated, resized, and fullscreen, and it opens focused on a tool call from Chat. The conversation header returns to one row, and the conversation column only ever hosts Chat.

The right Sidebar now ships two guide entries, so a new pane seeds on the guide page instead of the sole entry — the seed rule in `contract/seed.ts` picks the only entry when exactly one exists and the guide otherwise.

Opening the ledger no longer requires the conversation view ring, so the trajectory body's focus, paging, and image loading all arrive through the Sidebar tab seat; a composition without `ui-sidebar-right` no longer shows the ledger at all.

Session-log download has one entry point. A browser client composes the package for its dialog and its `/export` observer, and the header contributes nothing.

## Verification

`pnpm exec vitest run packages/client/ui-trajectory/tests packages/client/ui-chat/tests packages/client/ui-conversation/tests packages/session-query/session-log-export/tests` covers the tab type and body registration, disposal, the focus-on-inspect path, the ledger behavior that moved, and the dialog-only export contribution. The keyless Web e2e lane and its expected accessibility trees need a `QILIN_SNAPSHOT=refresh pnpm run test:web` run, because the conversation header no longer renders the tab strip or the more-actions button and the scenarios that opened the ledger now go through the Sidebar. `app-frame` marks the layout grid root, so geometry specs address that element instead of any class containing `frame`.
