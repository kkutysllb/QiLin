# Agent Note: Squad chip and formation graph in the Team page

Status: implemented

English | [中文](2026-11-14-squad-formation-graph.zh.md)

## Problem

The conversation header names the Team and counts subagents in separate chips, and the Team page was a flat roster plus shared task board. Neither showed how the conversation's agents relate: which branch a running agent belongs to, who delegated to whom, and what each agent carries. A user coordinating ten subagents read a list of names and statuses.

## Decision

- **One chip, one page.** A squad chip (队伍) sits after the subagent-count chip. It states the Team size and the formation size and opens the existing Team tab with `ctx.sidebarRight.openTabIn(sessionId, 'agent-team')`. It owns no popover and no second page: the tab is the surface.
- **Steps come from a host fold, not from replay.** A new `turnStats` unit in `session-turn-outline` counts one turn per `turn/start` and one step per `step/start` over the whole log, and is small enough to ride every Session summary. A client therefore states every agent's step count without reading that agent's log. The count is deliberately a projection rather than a client-side fold: the browser only holds the events it loaded, so a fleet-wide figure cannot be derived there.
- **The Team page opens with the formation graph.** `SquadFormation` draws one card per agent of the conversation's family over one SVG of parent-to-child edges. A card states an ordinal avatar, the durable label, activity, the model and creation mode, cumulative tokens, active-turn time, the started step count, and whole-percent occupancy coloured by pressure; a stacked bar splits the used share into the meter's system, tool, and message composition with the free window behind it, and a legend above the canvas names those segments and the running edge. The Lead and the on-screen conversation carry marks. Edges take the child's branch colour and animate while that child runs. Hover or focus keeps the agent, its parent, and its children lit and fades the rest; click or Enter opens that agent through its durable subagent address.
- **The canvas is width-measured.** The stage reports its client width through a `ResizeObserver`, so the tree re-flows on every sidebar resize, and a leaf count above the row capacity packs the levels into bands instead of overflowing sideways.
- **A collaboration timeline sits beside the graph.** `SquadTimeline` rows the durable delegations the page holds — the parent's catalog `createdAt`, the parent's label, the child's creation mode, and its step count — newest first, a compact read-only task summary follows it in the same column, and a wide pane seats the column beside the graph. Message traffic comes from a second unit, `agentMessages`, registered beside the Team projection: it folds the inbound peer messages one Session received — Team mailbox deliveries and adjacent-Agent relays — with the receiving log's time, the durable sender, and a bounded preview. Both paths land in the recipient's own log, so merging the drawn agents yields cross-Agent traffic from projections alone, with no host service scan and no third-party plugin key.
- **The board shares the hovered owner.** `TeamBody` holds one owner name; a hovered card tints the rows that owner holds and a hovered row lights its owner's card.
- **Cards read the summary first.** Every summary projection rides the Session list row, so a child that was never opened still states tokens, steps, timing, and model. Occupancy and composition are summary-excluded, so the graph asks the Host for that Session's own cell once per drawn child (bounded to sixteen per mount) rather than opening the conversation; the merge order is summary values first, cell values second.
- **Reads stay pure.** `squad-model.ts` resolves the family root by walking `parentId`, orders children by the parent's durable `subagentCatalog` and appends rows the catalog does not know yet, then derives label, mode, activity, ordinal, tokens, timing, occupancy, composition, and model from the projection values. `squadBarSegments` partitions occupancy into the reported composition and the free remainder, and `layoutSquad` computes the tidy tree, banding levels when one row cannot hold the leaves. The graph performs no projection request of its own.
- **Colour comes from the token scale.** Branch hues are a six-entry palette of existing `--qilin-*` tokens (brand, green, amber, violet, error, blue), cycled by top-level branch index; the Lead uses the brand accent. No HSL literal enters the client.
- **Coverage.** A `squad-model` unit spec (family order, label precedence, activity, timing, occupancy, layout, formatting), a `SquadFormation` component spec (chips, card facts, occupancy bands, hover neighbourhood, board-driven lighting, pointer and keyboard navigation, stage measurement), a `SquadChip` spec (both chip forms, running mark, navigation), Team page specs for hover linking and card navigation, and the browser-plugin spec asserting the second header seat and `openTabIn`.

## Alternatives considered

- **A separate formation popover or page.** Rejected: the Team tab already owns roster and board, so a second surface would duplicate the page and split ownership of the same projection.
- **Reading every child's catalog when the page opens.** Rejected: one Host read per child for a picture the page can draw from what it already holds; a branch whose catalog was never read stays a leaf until the normal read supplies it.
- **dsh-context's rotated HSL hues.** Rejected: this client styles through `--qilin-*` tokens, and a six-token palette keeps colour inside the theme instead of adding a second colour source.
- **Live ticking durations.** Rejected: active-turn time and occupancy are read as of the last projection cut, so the same projection state always renders the same text and the page needs no timer.
- **Deriving steps from loaded events.** Rejected: the browser sees only the events it paged in, so a per-agent figure would silently shrink for unopened agents. The projection is the single source.
- **Priced cost on a card.** Rejected for now: the client holds no priced-cost projection, and adding one is a pricing feature rather than a formation concern.

## Consequences

- A board surface that wants the hover link takes the owner name `TeamBody` holds; it does not subscribe to the graph.
- A new fact on a card needs a read in `squad-model.ts`, keeping every derived value in one pure function.
- The graph is an absolutely positioned card canvas with no virtualization; a formation wider than one band row scrolls vertically inside the stage, and a stage narrower than one card scrolls horizontally.
