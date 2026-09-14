---
description: "The right Sidebar's task-plan page for the qilin web client: the session workspace's plan documents, from the agreed conventions over the wire, opened into the Sidebar by resource address."
kind: "package-reference"
---

# @qilin/client-ui-sidebar-plans

English | [中文](README.zh.md)

## Summary

The right Sidebar's task-plan page: the plan documents of the session's workspace, found by convention and listed over the wire, opening into the Sidebar. It is a page type reached from the guide and claims no address; each row opens its document by address for the `qilin-resource://file` viewers to claim — nothing in `ui-sidebar-right` knows this package.

## Table of Contents

- [What it registers](#what-it-registers)
- [The plan list](#the-plan-list)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="what-it-registers"></a>
## What it registers

- **The type** — `ctx.sidebarRightTabs.register(...)` with kind `plans`, id `@qilin/client-ui-sidebar-plans`, band `builtin`, no patterns, `single`, and one guide entry (order 50, its title and description from the `sidebarPlans` namespace, its glyph the shared checklist icon) that opens the type.
- **The body** — the keyed `sidebar.right.pane.tab` seat under that id: a 38px search row under the strip — the shared `Input` with a search glyph, and the reload control at its end — then one row per plan document, its title over its workspace-relative path.

Seven source files under `src/client/`: `definition.tsx` (the type), `store.ts` (what it keeps), `plans.ts` (the convention and its pure rules), `face.ts` (how it reads, Remote binding included), `PlansBody.tsx` (what it draws, with its status-line helper), `locales.ts` (what it says), and `index.ts` (the wiring).

<a id="the-plan-list"></a>
## The plan list

A scan looks where agents already write plans: the top level of `plans/`, `docs/plans/`, and `.plans/` contributes its `*.md` files, and the root `plan.md`, `PLAN.md`, and `docs/plan.md` count whether or not any such directory exists. Deeper nesting is deliberately ignored — a plan tree is a convention, not a filesystem walk.

Identity is the document's absolute path, case-folded. The `workspaceFiles` wire reports no device or inode, so on a case-insensitive volume — where `plan.md` and `PLAN.md` are one file under two spellings — the folded path is what keeps it from being listed twice. The list is capped at 20.

Rows keep the order the convention declares: `plans/`, then `docs/plans/`, then `.plans/`, then the well-known documents. The wire carries no modification time — a file's `version` is an opaque freshness token the Client never parses — so there is no newest-first order to sort by, and the convention's own order is at least stable across polls.

A row's title is the document's first `#`–`###` heading, read from the first page of its lines (`remote.workspaceFiles.read(sessionId, path, { offset: 1, limit: 20 })`) and bounded to 512 characters of it; a head with no heading, an unreadable document, and a document past a heading fall back to the file name without its `.md`.

| Call | Answer |
|---|---|
| `list` on each convention directory | Its `*.md` files become candidates; a directory that is not there is the normal case. |
| `stat` on each well-known document | Present and a regular file becomes a candidate; a name that is absent or is not a regular file is skipped. |
| `read` on each surviving document | The title's head. A failure here is not the scan's: the file name is still a truthful row title. |

A failure that is not one of those absences — a transport failure, say — is carried out of the scan and takes the panel over, because reporting no plans when the workspace was never read would be a lie. Clicking a row opens `fileAddressFor(sessionId, root, path)` through `useTabInfo().tab.actions.openResource`, landing in the tab's own pane.

The root is the session's working directory, read from `useSessions().byId[sessionId].cwd`. A scan runs when the tab mounts, whenever the reload control is pressed, and every five seconds while the tab is visible; a hidden tab draws what it already scanned and polls nothing.

State lives in the type's own store, bucketed by tab id: the last scan's `rows`, whether a scan is `scanning`, and the `failure` that scan reported. A new scan of a tab retires the one in flight for it, and the owner's `signal` ends a bucket: on abort the tab is forgotten and a scan that settles afterwards writes nothing.

<a id="model-experience"></a>
## Model Experience

None, as this package draws a workspace's plan documents in the browser and registers nothing model-facing.

#### KV Cache effect

None; directory listings and document reads travel over the Remote and assemble no model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- **No modification time.** The wire reports no `mtime`, so the list cannot put the freshest plan first; it keeps the convention's order instead.
- **One bounded title read.** The heading search reads the first page of a document only, so a heading past that page falls back to the file name.
- **One root, read only.** The list is rooted at the session's working directory; there is no way to scan elsewhere, and the panel neither creates, renames, nor deletes a plan.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. The panel's only runtime state is one Slot store per tab, written by the face that owns the scan and forgotten on the tab's abort signal; there is no second observation of it to compare against.
