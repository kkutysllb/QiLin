---
description: "Use and drive the experimental Web Agent Teams roster, shared task board, and teammate navigation panel, including browser task edits through the Team write bridge."
kind: "package-reference"
---

# @qilin-agent/client-ui-agent-team

English | [中文](README.zh.md)

## Summary

This package adds two Agent Teams actions to the Web conversation header: a roster popover, and a squad chip stating the agent formation and opening the Team tab. The tab draws the formation graph above the roster and shared task board, reads the Lead Session's `agentTeam` projection, and edits tasks through the Host's `agentTeams` write bridge — create, edit, complete, reopen, delete, and reassign travel as wire actions. Navigation stays on the stable addressed-subagent path. Choose it through the experimental Agent Teams Web profile. The projection does not extend the stable API Proxy, store Team state, or register model-facing input.

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

This package ships the Agent Teams Client plugin. No shipped bundle mounts it today; a custom Web profile can mount the `/client` export after the stable Web bundle and the Host-side Agent Teams profile. The root Host export is inert, and the package has no user configuration fields.

### Read the formation

The squad chip sits after the subagent-count chip. It states the Team size and the formation size — the Lead plus every delegated descendant the page can see — and opens this Team page for the conversation in the right sidebar. Opening performs no projection request beyond the page's own reads; the toolbar refresh re-reads the viewed conversation's projections.

The page opens with the formation graph. Every agent of the conversation's family takes one card: an ordinal avatar, the durable label, its activity, the model its Session selected and creation mode, cumulative tokens, active-turn time, started step count, and whole-percent context occupancy coloured by pressure. Under those facts a stacked bar splits the used share into the meter's system, tool, and message composition with the free window behind it, and the legend above the canvas names the four segments plus the running edge. The Lead card carries the Lead mark, the conversation on screen carries the Current mark, and a running card shows the ongoing loader. Edges run from a parent card down to its children in the child's branch colour, and a running child's edge animates.

A card's facts come from the Session list itself: every summary projection (usage, step totals, timing, model, creation mode, mailbox messages) rides each row, so an unopened agent still states them. Occupancy and composition are summary-excluded, so the page asks the Host for that Session's own cell once per drawn child, bounded to sixteen per mount, instead of opening the conversation.

The canvas follows the measured stage: the tree re-flows on every width change, and when the leaves outgrow one row the levels pack into bands instead of overflowing sideways. Hovering or focusing a card keeps that agent, its parent, and its children lit and fades the rest; clicking or pressing Enter opens that agent's conversation through its durable subagent address. A solo formation states that the graph fills in once the Lead delegates.

Beside the graph, the cross-agent collaboration panel rows the durable traffic the page holds, newest first: a parent handing a child its label (with the child's creation mode and step count), and every peer message an agent received (with its sender and a bounded preview, read from the recipient's `agentMessages` projection). The same column summarizes the shared tasks as read-only rows — status dot, subject, owner — while the editable board stays below. A wide pane seats graph and timeline side by side; a narrow one stacks them.

The board below shares the hovered owner with the graph: hovering a card tints the rows that agent owns, and hovering a row lights its owner's card.

### Inspect and navigate the roster

The panel shows the Lead Session's roster and task board from the shared Session store. Task and roster updates appear while the panel stays open. Opening the panel performs no projection requests. The panel shows a loading notice while the conversation or Session list is loading, and an unavailable notice when no Team value is present afterward.

Roster rows show durable names and phases. Provisioning and running members use the shared ongoing loader, inactive members use a person icon, and failed members use error. Live Session status supplies running activity; the shared `modelSelection` projection supplies a model when available. The current conversation carries a Current chat tag and cannot be selected. Selecting the Lead from a teammate conversation opens the Lead Session directly. Selecting an active teammate opens its ordinary continuable child address. The Host validates the parent, child, and mode when history opens; later human prompts use the same addressed-subagent conversation.

### Inspect the task board

Ready pending tasks use idle, blocked pending tasks use warning, in-progress tasks use ongoing, and completed tasks use done.

The task board shows task identity, owner, blockers, readiness, advisory write scopes, and overlap warnings. Section headings show member and task counts; an empty board shows a short description, and a lone member with no tasks uses a single-column panel. When the projection reports a rejected persisted Team record, the tab shows that failure above the last valid roster and tasks.

### Edit tasks from the browser

The toolbar refreshes the viewed conversation's projections and opens the create form. The create and edit forms take a subject, a description, blocked task ids, and advisory write scopes; the commit stays disabled until both texts are non-empty, and repeated list values collapse to one entry. Each task card offers complete on an in-progress task, reopen on a completed one, a two-step armed delete, and an owner selector over active members with an unowned option. Every control issues one typed wire action through the `agentTeams` bridge under the Lead's authority, so a teammate conversation performs its writes on the Lead Session.

While one write is in flight the page locks its controls and shows a busy notice. A stale-revision refusal records a conflict notice and refreshes the board so the next attempt starts from the committed revision; any other refusal records the wire diagnostic. A notice stays until dismissed, and an open form stays open beside a notice so the entered values survive a failed commit. Switching conversations resets the page state.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The Client export registers its locale dictionaries, two conversation-header slots, and the right-sidebar Team tab through Kylin effects; it mounts the `agentTeams` Remote namespace for its write bridge. Disposing the plugin fiber removes the registrations and withdraws the namespace.

The squad chip and the graph read the standing `useSessions` and `useSessionStatus` seats only. `squad-model.ts` resolves the family root by walking `parentId`, collects descendants in the parent's durable `subagentCatalog` order and appends rows the catalog does not know yet, then takes each agent's label, mode, running activity, ordinal, tokens, timing, occupancy, composition, and model from the projection values. `squadBarSegments` splits one card's occupancy into the reported composition plus the free remainder, and `layoutSquad` computes the tidy tree: leaves take slots on one row per depth level and each parent centers over its children, while a leaf count above the row capacity packs level bands instead. The chip opens the tab with `ctx.sidebarRight.openTabIn(sessionId, 'agent-team')`, so no page of its own is created. `SquadFormation` measures its stage, draws the edges as one SVG behind absolutely positioned cards, and reports the hovered owner name; `TeamBody` holds that name and passes it back down, which is how a board row and its card light each other.

The panel renders outside the conversation container and stays within the viewport. Member cards use the shared elevation stroke for their outlines in resting, selected, and hover states. Hovering the trigger opens the panel after 150ms; leaving both trigger and panel closes it after a 120ms grace period. Clicking the trigger pins the panel and moves focus into it. Outside clicks and Escape dismiss the panel; Escape returns focus to the trigger only when focus was inside the panel. In a narrow header, the trigger becomes an icon and opens only on click. The component derives every row from the `useSessions`, `useSessionStatus`, and `useSession` seats: the Lead identity comes from the current Session's subagent address, the Team view from `projectionsBySession[lead].values.agentTeam`, member activity from Session status with the list summary as fallback, and the model from `projectionsBySession[member].values.modelSelection.next`. Each roster row selects its own running state. The only injected callback opens a roster Session using the current and target Session ids. Switching conversations closes the panel and clears a navigation failure.

| File | Role |
|---|---|
| [`src/client/mount.ts`](src/client/mount.ts) | Locale, tab, navigation, slot, and Remote-namespace registrations |
| [`src/client/TeamAction.tsx`](src/client/TeamAction.tsx) | Projection-derived roster and task board popover with panel interaction state |
| [`src/client/SquadChip.tsx`](src/client/SquadChip.tsx) | Header chip stating the Team and formation sizes and opening the Team tab |
| [`src/client/SquadFormation.tsx`](src/client/SquadFormation.tsx) | Formation graph: agent cards, branch edges, hover neighbourhood, and card navigation |
| [`src/client/squad-model.ts`](src/client/squad-model.ts) | Pure family, count, layout, and formatting arithmetic for the chip and graph |
| [`src/client/TeamBody.tsx`](src/client/TeamBody.tsx) | Right-sidebar Team page: roster, board, forms, notices, and busy state |
| [`src/client/team-writes.ts`](src/client/team-writes.ts) | Write face over the `agentTeams` namespace with conflict and refusal handling |
| [`src/client/team-page-store.ts`](src/client/team-page-store.ts) | Page busy and notice state |
| [`src/client/team-model.ts`](src/client/team-model.ts) | Pure roster, board, and form helpers |
| [`src/client/definition.tsx`](src/client/definition.tsx) | Sidebar tab registration and guide entry |
| [`src/client/locales.ts`](src/client/locales.ts) | English and Chinese panel and page copy |
| [`src/index.ts`](src/index.ts) | Inert Host entry |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Agent Teams service](../../team/agent-team/README.md) — authoritative roster, task, and projection behavior.
- [Conversation UI](../../client/ui-conversation/README.md) — the stable header slot and addressed-subagent navigation surface.
- [Experimental packages](../README.md) — incubation status and publication policy.

-----

<a id="model-experience"></a>
## Model Experience

None, as this browser projection registers no model-facing input.

#### KV Cache effect

No direct effect; the Team tools and ordinary conversation submission own any later model-visible use.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **No mailbox timeline** — the projection view carries roster and tasks only; peer messages are not shown.
- **The formation draws what the page already holds** — a branch whose own catalog was never read shows as a leaf; the graph requests no projections of its own.
- **Facts stop at the last projection cut** — active-turn time and context occupancy do not tick while the page stays open; the next projection push or the toolbar refresh moves them.
- **No priced cost** — the page states no money. The host's `token-meter` carries route pricing, so a cost figure is one projection away; this package does not read it.
- **Messages are the recipient's own rows** — the timeline reads each agent's `agentMessages` projection, which folds the recipient's log. A deployment without the Agent Teams host service (which registers that unit) shows delegation rows only.
- **Late plugin activation** — after enabling Agent Teams in an already-open conversation, reload the page to receive its Team projection.
- **Model availability** — a model appears only when the shared store has a durable selection or request for that member. Missing cold-cache values stay absent until normal Session loading or a live update supplies them.
- **Ordinary child continuation** — a human message sent after navigation uses the stable addressed-subagent prompt path, not the Team peer mailbox.
- **No lifecycle or workspace controls** — the panel cannot spawn, rename, delete, or interrupt teammates, and write scopes remain advisory metadata.
- **Claim and release stay model-owned** — the browser edits tasks through edit, complete, reopen, delete, and reassign; claim and release remain Team-agent tool actions, and the board has no drag reordering or activity stream.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
