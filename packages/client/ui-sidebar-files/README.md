---
description: "The right Sidebar's file-tree and file-editor tab types for the qilin web client: the session workspace root listed one level at a time over the wire, files opened by resource address, and text or code files edited and saved back with version-checked writes."
kind: "package-reference"
---

# @qilin/client-ui-sidebar-files

English | [中文](README.zh.md)

## Summary

The right Sidebar's navigator: the session's workspace root as a tree, listed one level at a time over the wire, plus a workbench that edits text and code files in place. Two tab types ship from this package. The `files` page is reached from the guide and claims no address; it opens files by address for the `qilin-resource://file` viewers to claim — nothing in `ui-sidebar-right` knows this package. The `file` type claims session file addresses with editable extensions, shows the same tree in a side pane, saves through the `workspaceFiles` write, and hands files to the preview viewer.

## Table of Contents

- [What it registers](#what-it-registers)
- [The tree](#the-tree)
- [The editor](#the-editor)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="what-it-registers"></a>
## What it registers

- **The `files` type** — `ctx.sidebarRightTabs.register(...)` with kind `files`, id `@qilin/client-ui-sidebar-files`, band `builtin`, no patterns, and one guide entry (order 10, its title and description from the `sidebarFiles` namespace, its glyph the shared folder icon) that opens the type. One workspace tree per surface: it declares `single: true`.
- **The `file` type** — kind `file`, id `@qilin/client-ui-sidebar-files/file`, band `builtin`, patterns `qilin-resource://file/**`. Its `canOpen` takes only session-scoped addresses whose path carries a known text or code extension (the shared editable set in `@qilin/util-workspace-path`), so images, PDFs, unknown extensions, and bare absolute addresses fall through to the `text` fallback viewer; an absolute address is refused because saving it has no authorizing Session. It declares no `single` (one tab per address, the registry's default), no guide entry, and no static `icon` — the chip's sheet is the open file's own, drawn by the title slot. The tab title is the address's decoded basename.
- **The `files` body and chip title** — the keyed `sidebar.right.pane.tab` and `sidebar.right.pane.tab.title` seats under `@qilin/client-ui-sidebar-files`: the header row and the tree. The header row is the document preview's (`ui-sidebar-documentpreview`): the root path, its directories greyed and its last segment in full ink, never ellipsized (a path wider than the row keeps its end and fades its start), with the one control, reload, at its right. The row is copied rather than shared because a plugin bundle shares runtime code only through the platform modules; once the artifact and slot surfaces settle, one copy in `ui-primitives` could serve every pane header.
- **The `file` body and chip title** — the same two seats under `@qilin/client-ui-sidebar-files/file`: the workbench (tree pane left at a fixed width, collapsible; editor right) and the per-file `FileTypeIcon` sheet before the captured basename.

Both seats share one store instance per session, bucketed by tab id: the tree buckets and the editor buckets never mix.

The browser half lives under `src/client/`: `definition.tsx` and `file-definition.ts` (what each type is), `store.ts` (what they keep), `face.ts`, `file-face.ts`, and `file-pages.ts` (how they list, read, and save, Remote binding included), `file-preview.ts` (the preview open), `file-editor.ts` (the CodeMirror adapter), `file-guard.ts` (the claim gate and naming), `file-lang.ts` (grammar per extension), `file-failure.ts` (the editor's failure lines), `FileTree.tsx` (the shared tree), `FilesBody.tsx`, `FilesTitle.tsx`, `FileBody.tsx`, `FileTitle.tsx` (what they draw), `locales.ts` (what they say), and `index.ts` (the wiring).

<a id="the-tree"></a>
## The tree

The root is the session's working directory, read from `useSessions().byId[sessionId].cwd`, and split for the header row by `pathPartsOf` from `@qilin/util-workspace-path`. Every level is keyed by absolute path; a child's path is its parent's joined with the entry name by `/`. A level is listed when it is first expanded, through `remote.workspaceFiles.list(sessionId, absolutePath)` on the `@qilin/api-workspace-files` namespace; the adapter keeps the listing's entries and truncation flag and drops its workspace-relative path. Rows are ordered directories first, then by natural, case-insensitive name; dotfiles are shown like any other entry.

| Entry type | Row |
|---|---|
| `directory` | Toggles; the level is fetched the first time it opens and kept while collapsed. |
| `file` | Opens `qilin-resource://file/session/<sessionId>/<encoded path relative to the root>`, built by `fileAddressFor` from `@qilin/util-workspace-path`, through `useTabInfo().tab.actions.openResource`, landing in the tab's own pane. From the editor's tree the open lands on the `file` type itself and de-duplicates by address, so the open file never switches in place. |
| `other` | Shown greyed and not clickable, so the directory is reported whole. |

A level cut by the endpoint's entry cap ends with a marker; an empty level says so; a level that failed shows one line per code — `workspace-file/not-found`, `outside-workspace`, `not-directory` — and the transport's own message otherwise. Reload drops every listed level and asks again for the expanded ones; collapsed levels are fetched again when they next open. A session without a working directory shows a single line instead of a tree.

<a id="the-editor"></a>
## The editor

The tab's address names its whole file identity: `file-guard.sessionFileOf` decodes it once per render into the session and path the endpoints receive, and the address's session — not the slot's — authorizes both. The file is read whole on mount through `workspaceFiles.read`, one page of lines at a time until `eof`; the page walk assembles the exact disk text, restoring a file-final newline through the reported byte size, and the first page's byte size refuses anything past the editor's 2 MB cap with the endpoint's own `workspace-file/too-large` code. The grammar comes from `file-lang.ts`: the installed `@codemirror/lang-*` packages plus legacy modes for the shell family and config files; anything else edits as plain text.

The surface is CodeMirror 6 behind one adapter (`file-editor.ts`): line numbers, undo history, bracket matching, a wrap compartment, and a theme plus a syntax `HighlightStyle` (comment, string, keyword, number, function, type, property) colored only through `--dsw-*` tokens, so the token cascade carries light and dark schemes without a second style. A navigation carrying `{ line }` — a tool card's line reference — selects and scrolls to that line, clamped into the file, once per navigation revision; the answered revision is remembered in the bucket, so a remount keeps the reader where they were. Saving runs through `workspaceFiles.write(sessionId, path, text, { baseVersion }, signal)`, where `baseVersion` is the last version a read or save reported; `Mod-s` and the toolbar button both save, controls disable while a save is in flight, and a finished save becomes the new clean content with its version. The draft lives in the package store, so it survives the body's unmounts; the surface remounts only when a load changes the file (the store's `loadSeq`), never for a draft or a save.

The toolbar's preview control (`file-preview.ts`) opens the tab's own address on the `text` type by naming that kind through the Sidebar controller with the tab's session as scope — the tab's own ranked open would land back on this type, which outranks the viewer. The preview shows the disk content, so an unsaved draft stays here untouched, and the viewer's matching edit control opens the ranked claim, which is this type. A save the disk refuses with `workspace-file/stale` keeps the draft intact and raises the conflict banner, whose two actions are the escape hatch: load the disk copy (a plain re-read that discards the draft) or overwrite with the editor's version (a forced write without `baseVersion`). Reload with unsaved changes asks first, for the same reason. Read and save failures show one line per code — `not-found`, `too-large` (sized), `not-text`, `not-regular-file`, `outside-workspace`, `stale` — and the transport's message otherwise.

<a id="model-experience"></a>
## Model Experience

None, as this package draws a workspace file tree and an editor in the browser and registers nothing model-facing.

#### KV Cache effect

None; directory listings and file content travel over the Remote and assemble no model request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>
- **Listing only.** No search, artifact filter, drag-and-drop, rename, context menu, current-file highlight, or filesystem watching; a level changes only through reload.
- **One root.** The tree is rooted at the session's working directory; there is no way to browse above it, and the Host refuses paths outside the workspace root anyway.
- **Editor caps.** A file past 2 MB does not open (the Host's own per-page caps bound each read); there is no search panel and no column selection.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The two tab kinds share one store factory (`createFilesStore`) and one registration-time handle, split into `byTab` (tree) and `edits` (editor) buckets keyed by tab id. The `files` page never seeds an `edits` bucket and the `file` tab renders the same tree component, so a file tab's tree and the page's tree stay independent buckets of one instance.

</details>

**Runtime invariant:** No companion is published. The package's only runtime state is one Slot store per session, bucketed by tab id, written by the bodies and faces that own their buckets and forgotten on each tab's abort signal; there is no second observation of it to compare against.
