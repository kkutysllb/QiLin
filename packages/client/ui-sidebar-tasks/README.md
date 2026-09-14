---
description: "The right Sidebar's tasks page for the qilin web client: the session's subagent topology and its background jobs, read from the Session list the page already holds."
kind: "package-reference"
---

# @qilin/client-ui-sidebar-tasks

English | [中文](README.zh.md)

## Summary

The right Sidebar's tasks page: this Session's subagent topology and its background jobs in one column. It is a page type reached from the guide and claims no address. Everything drawn is read from the Session list snapshot — the page issues no read of its own — and every action travels through the Session service or the subagent Remote. Nothing in `ui-sidebar-right` knows this package.

## Table of Contents

- [What it registers](#what-it-registers)
- [The two sections](#the-two-sections)
- [The chip badge](#the-chip-badge)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="what-it-registers"></a>
## What it registers

- **The type** — `ctx.sidebarRightTabs.register(...)` with kind `tasks`, id `@qilin/client-ui-sidebar-tasks`, band `builtin`, no patterns, `single`, and one guide entry (order 40, its title and description from the `sidebarTasks` namespace, its glyph the shared checklist icon) that opens the type.
- **The body** — the keyed `sidebar.right.pane.tab` seat under that id.
- **The chip badge** — the keyed `sidebar.right.pane.tab.badge` seat under the same id.

Seven source files under `src/client/`: `definition.tsx` (the type), `rows.ts` and `lineage.ts` (pure projections of the two snapshots), `face.ts` (the actions and their Remote binding), `TasksBody.tsx` and `TasksBadge.tsx` (what is drawn), `locales.ts` (what it says), and `index.ts` (the wiring).

<a id="the-two-sections"></a>
## The two sections

**Subagents** flattens the direct-child catalogs the Session list holds, depth-first: a level is one parent's catalog, siblings are newest-first because the Host orders a catalog by durable creation time, and the walk descends only into a child whose own catalog has been read — an unopened branch contributes its row and nothing below it. A row the Host could not describe is drawn as a diagnostic and never counted. The section's stated total is the greater of the children the catalogs report and the descendants the summary lineage records (`indexSubagentDescendants` over the Session summaries), so the header never undercounts while the lineage is still converging.

**Background jobs** keeps live jobs first in start order, then settled jobs newest-first, a finish-time tie falling back to the later start. A live row's duration ticks against a one-second clock; a settled row measures its own span.

Both sections open on arrival. A section past its preview count — five subagent rows, three job rows — folds the rest behind one control. Section and fold state is the body's own and never leaves it.

Three actions exist, each performed by the injected face at call time: reveal a child as the current Session, re-read one parent's catalog, and stop a continuable child through `subagents.interruptByParent`.

<a id="the-chip-badge"></a>
## The chip badge

The badge is how much work this Session has running: direct-child catalog rows whose activity is `running`, plus jobs the registry still holds open. A running grandchild implies its parent is running too, so the direct children already account for work below them, and the badge reads the two snapshots straight through the standard `useSessions` hook rather than walking the lineage. Zero is the idle state, not a count: the chip draws no empty pill for it.

<a id="model-experience"></a>
## Model Experience

None, as this package draws Session-side work in the browser and registers nothing model-facing.

#### KV Cache effect

None; both snapshots arrive on the Session list the client already holds, and the page assembles no model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- **No job output.** The job snapshot carries status, timing, and detail — not a stream — so a running job's output is not shown here; reading it is a tool's job, and the page performs no tool call.
- **One-shot children cannot be stopped here.** The interrupt action addresses a continuable child through its durable parent; a one-shot child is drawn and openable, and nothing more.
- **Depth stops at read catalogs.** The page issues no catalog read of its own, so a branch the Session list has never read contributes one row and no rows below it; the refresh action is how a branch opens up.
- **The badge counts direct children only**, for the same reason it does not walk the lineage: a strip render must not.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The page holds no state outside its body — the projections are pure over the Session list's snapshots and asserted by unit specs, so there is no second observation of them to diverge.
