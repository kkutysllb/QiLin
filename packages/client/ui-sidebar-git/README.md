---
description: "The right Sidebar's Git panel tab type for the qilin web client: branch status with upstream position, changes grouped unstaged, staged, and untracked with per-file staging and an inline diff, the commit box with stage-all semantics, a lazily paged commit history whose rows expand into their patches, the local branch list with checkout and create, and the GitHub pull-request section over the workspaceGit Remote namespace."
kind: "package-reference"
---

# @qilin/client-ui-sidebar-git

English | [中文](README.zh.md)

## Summary

The right Sidebar's source-control panel: one `git` page, reached from the guide, showing the repository at the workspace root. The header carries the branch and its upstream position beside pull, push, and refresh; changes are grouped unstaged, staged, and untracked with a per-file context menu; a row click opens that file's inline diff; the commit box commits with stage-all semantics; the history pages commits newest first and expands a row into its patch; the branch list checks out and creates; and the GitHub section lists, creates, and merges pull requests when `gh` answers. Everything travels over the `@qilin/api-workspace-git` Remote namespace.

## Table of Contents

- [What it registers](#what-it-registers)
- [The panel](#the-panel)
- [The history section](#the-history-section)
- [The GitHub section](#the-github-section)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="what-it-registers"></a>
## What it registers

- **The `git` type** — `ctx.sidebarRightTabs.register(...)` with kind `git`, id `@qilin/client-ui-sidebar-git`, band `builtin`, no patterns, and one guide entry (order 20, its title and description from the `sidebarGit` namespace, its glyph the shared branch icon) that opens the type. One panel per surface: it declares `single: true`.
- **The body and chip title** — the keyed `sidebar.right.pane.tab` and `sidebar.right.pane.tab.title` seats under `@qilin/client-ui-sidebar-git`: the panel itself, and the branch glyph before the tab's title in the chip.

Both seats share one store instance per session, bucketed by tab id; the browser half lives under `src/client/`: `definition.tsx` (what the type is), `store.ts` (what it keeps), `face.ts` (how it asks the `workspaceGit` namespace, generation-guarded), `git-model.ts` (the pure grouping, badge, diff-line, commit-time, and failure arithmetic), `GitBody.tsx` and `GitTitle.tsx` (what they draw), `locales.ts` (what they say), and `index.ts` (the wiring).

<a id="the-panel"></a>
## The panel

On mount the panel probes `workspaceGit.isRepo`: a workspace without a repository draws the empty state, a probe that cannot answer draws its failure line, and a repository reads its first status. The header names the branch (or the no-branch wording on an unborn or detached `HEAD`) with the upstream position beside it — ahead in success ink, behind in error ink, the no-upstream wording otherwise — then pull (rested without an upstream), push, and refresh. Push offers the set-upstream variant when no upstream is configured, which is also what its Remote call passes.

The changes are grouped by the entry's own flags — unstaged, staged, untracked; an entry both staged and unstaged sits in both groups — each section with its count and a whole-section stage/unstage action. A row carries its `XY` letter as the badge; a click opens that path's inline diff below the sections, on the side the row's group reads. The context menu offers stage (or unstage), discard for tracked entries only — discarding restores from the index, so an untracked path is refused — and copying the repo-relative path. One mutation flies at a time: every control rests while `busy` stands, each success is followed by a status read, and one shared failure strip words the code — `not-a-repo`, `bad-branch`, `bad-message`, `bad-path`, `too-large`, `command-failed` (its invocation and stderr under a tooltip), and the transport's own message otherwise.

The inline diff renders the unified text line by line: headers and hunks dim, additions in success ink, deletions in error ink. The staged toggle re-reads the same path's other side; the copy control writes the whole diff text; close takes it down. A diff the Host refuses whole by its byte cap says so, and an empty diff says so too.

The commit box trims before anything: an empty trim rests the button under the empty hint, and the button also rests on a clean tree. Committing an untouched index with a dirty tree stages everything first — the auto-stage hint names it — and never overrides a selective index. Success empties the box; `Ctrl-Enter` submits.

<a id="the-history-section"></a>
## The history section

The history section is collapsible; expanding it reads the first page of the repository's commits, newest first, one `workspaceGit.log` call asking for 30. Each row carries its abbreviated object name and subject over its decorated ref names, its author, and the author time in the panel's own clock convention: today's clock alone, this year's date and clock, an older commit's full date and clock. A later page appends on demand behind a load-more control, which disappears once a page comes back short of the read's own size — the log is exhausted. A later page that cannot answer keeps the rows already read and words its failure; a first page that cannot takes the section over.

A row click reads that commit's patch — `workspaceGit.commitDiff`, the commit against its first parent — and draws it through the same line-by-line renderer as the working diff, indented under the row; a second click, or the close control, takes it down. A patch the Host refuses whole by its byte cap says so, and a commit that introduced no text says so. Expanding a patch leaves a working diff open beside it.

The branches section is collapsible; expanding it reads the local branch list, whose cap says so when it cuts. The current branch is marked and rests its row; a click on another checks out and re-reads the list. The inline create form takes a name and an optional start point (empty starts at `HEAD`) and closes on submit, so a refused name — `bad-branch` — surfaces with its own name in the shared failure strip.

<a id="the-github-section"></a>
## The GitHub section

The section lights only when the mount's `ghAvailable` probe answers a plain yes; any other answer hides it. Expanding it probes the login: signed out, it shows the sign-in hint with gh's own status message and a recheck control; signed in, it reads the pull-request list under a filter — open, closed, all — and re-reads on every filter change. A row shows its number, title, draft mark, and its head → base refs; its merge control opens the method chooser (the repository default, merge, squash, rebase) with the merge action. The create form takes a title, a body, and a base branch prefilled with the current branch; a created pull request stands a notice with its number and a copy-URL control. A refused title or body words the `bad-pr-title` code with its field and length.

<a id="model-experience"></a>
## Model Experience

None, as this package draws a source-control panel in the browser and registers nothing model-facing.

#### KV Cache effect

None; status, diffs, branch lists, commit history, and pull requests travel over the Remote and assemble no model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- **Push's upstream hardcodes `origin`.** The Host's `push` Remote sets the upstream to `origin` when asked; a remote named otherwise is not offered. Pull rests without an upstream and the panel says so.
- **Diff whole or refused.** A diff past the Host's byte cap is refused whole (`too-large`), never shortened; there is no per-hunk paging and no filesystem watching, so the panel changes only through its own reads and mutations.
- **History pages lazily.** The section reads one page per ask and appends only what it read; it draws no branch graph and no per-file commit list, decorates a row only with the ref names `log` reports, and offers no action on a commit beyond its patch.
- **Branch list capped, pull requests one filter at a time.** The branch list says when the Host's list cap cut it; the pull-request rows carry no open/closed column of their own (the wire type has none), so the filter is the only state view.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

One store factory (`createGitStore`), one registration-time handle, buckets keyed by tab id. The face (`face.ts`) is the Slot `inject` shape: session id and bound actions in, one entry per ask, nothing awaited in a component. Six reads carry a per-tab generation — status, branches, history, the commit patch still open, diff, pull requests — so the latest request wins whichever settles first; the tab record's abort listener is armed once per tab and forgets the bucket with its generations. Mutations ride one `mutate` path: busy, the call, its failure recorded or its success followed by a status read (checkout and create also re-read the branch list; pull-request create and merge re-read the list under the filter the section shows).

</details>
