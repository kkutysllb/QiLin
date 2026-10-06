# Agent Note: Deployment-side placement owns the sidebar panel run

Status: implemented

English | [中文](2026-10-06-deployment-side-sidebar-panel-placement.zh.md)

## Problem

Global panel positions in the sidebar are plugin-authored. A plugin registers its icon row into the root-scoped `sidebar.panellist` list with an optional `order`, `ui-sidebar` projects those registrations in ascending `order` with registration order breaking ties, and the shell renders them in that sequence. Any package installed on top of a deployment therefore chooses where it appears: a panel shipping `order: 120` renders inside a deployment whose own menus occupy 100 to 150, between the rows at 120 and 130. The deployment can label a row it does not register itself through `sidebar.section.assignments`, but it cannot place one — the section seat maps row ids to labels and leaves the sequence to `order`, and nothing in the contract distinguishes the deployment's own menus from a panel installed on top of it. A product that wants its menu run contiguous, with the panels a user added afterwards following it, has no seat to say so.

## Decision

`sidebar.panel.placement` is a root-scoped list, declared by this package's `sidebar` entry beside `sidebar.panellist` and `sidebar.section.assignments`. Each occupant's inject face returns `rows` — the row ids the deployment lays out itself, in display order — and an optional `trailingSection` label. Projection then orders the list in two runs: the named rows first, in the order the seat names them, with their own `order` no longer applying; every row the seat does not name behind them in ascending `order`, registration order breaking ties. Unnamed rows take `trailingSection` as their section when the seat supplies one, winning over the row's own `section` exactly as a section assignment does, so one header opens the whole trailing run. Occupants merge in entry order and the first occurrence of an id wins. With no occupant, projection is the previous behaviour: ascending `order`, ties by registration order.

The seat is new rather than a widening of `sidebar.section.assignments`, because that seat's name states its one job and a sibling deployment already contributes to it; a rename would fail that contribution at load rather than at review. Placement is deployment-declared, not origin-detected: the sidebar never asks which bundle registered a row, so it takes on no dependency on the client's plugin inventory, and the policy a deployment actually states is "these are my menus, everything else follows".

`tests/panel-list.client.spec.tsx` pins the rendered sequence and the single trailing header against a real renderer, with the unnamed row deliberately shipping `order: 0` and a section of its own; `tests/apply.client.spec.tsx` pins the projection, the merge rule, and the seat that carries no inject face. Reverting projection to the previous ordering turns exactly those cases red. `packages/extensions/kylin-client-runner/src/client/slot-catalog.ts` is regenerated for the new seat.

## Consequences

- A deployment keeps its own menu run contiguous and its menu order independent of every installed plugin's chosen `order`; installed panels collect in one trailing run under the deployment's label.
- The deployment must name its rows, including the engine panels it does not own (`plugins`, `schedules`). A row it forgets is not lost or misplaced silently — it renders in the trailing run, where a missing name is visible in the same glance as the feature it hides.
- A named row's own `order` stops deciding its position, so a deployment that wants a plugin's panel inside its run must name it; plugins can no longer move themselves by shipping a different number.
- Merging stays first-occurrence-wins across occupants, which keeps one deployment's list authoritative while letting a second occupant add rows it owns.
- `packages/client/ui-sidebar/src/client/index.ts` sits outside the per-file coverage gate (the shell entry needs a browser-grade harness), so the behaviour is pinned by the two component specs above rather than by coverage.

## Related

[Global main panels](2026-09-08-global-main-panels.md) owns the list's existence, its id-to-main-panel pairing, and its empty-list behaviour; [Plugin management moves to the Web sidebar](2026-09-09-plugin-management-in-the-web-sidebar.md) owns the first shipped row. Neither states a row sequence, so this decision adds a seat rather than replacing one.

## Alternatives considered

**Order rows by section and give the trailing run a section label.** Rejected: section assignments are keyed by row id, and the ids of installed panels are exactly what a deployment cannot know ahead of time. The sequence would still come from plugin-authored `order`, which is the defect.

**Treat a missing or default `order` as last.** Rejected: it reads an absent value as a policy and breaks every plugin that deliberately ships `order: 0` to sit at the top — the sidebar's own engine rows use 0 and 10.

**Detect the registrant's bundle and demote rows from user-installed bundles.** Rejected: it couples the sidebar to a plugin inventory the client half does not own, and it answers a question the deployment never asks. "My menus first, everything else after" needs no origin fact, and it stays correct for panels a deployment installs deliberately.

**Require installed plugins to ship a larger `order`.** Rejected as a product rule: correctness would depend on every third-party author's cooperation, and the layout would revert silently on their next release.

**Make the deployment register the trailing section through `sidebar.section.assignments` for every installed row id.** Rejected: it needs the same unknowable id list, and it still cannot order the rows it manages to name.
