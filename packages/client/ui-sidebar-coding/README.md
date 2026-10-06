---
description: "The coding workbench content body of the dual workbench for the qilin web client: the VSCode-like right Sidebar — file workbench, code editor, real terminal, Git panel, sandboxed browser, trajectory, plans, jobs and team pages, and the side chat — rendered by ui-sidebar-right while the workbench coding tag is active, with the fenced /sidebar host routes, the terminal WebSocket, and six lazy preview chunks served from the package's own bundle route. Ported from dsh-coding-sidebar 1.0.39."
kind: "package-reference"
---

# @qilin/client-ui-sidebar-coding

English | [中文](README.zh.md)

## Summary

The coding workbench content body of the dual workbench: the ported VSCode-like right Sidebar — file workbench, code editor, real terminal, Git panel, sandboxed browser, trajectory, plans, jobs and team pages, and the side chat — all scoped to the calling session's workspace. ui-sidebar-right renders this package's body in the right column while the workbench coding tag is active, and the general tag never sees it. The host half mounts the fenced /sidebar routes and the terminal WebSocket behind the same browser-trust fence as /api, and six lazy preview chunks load on first use.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The body is the ported coding workbench: a file workbench with a lazy directory tree, uploads, drag-and-drop, and global name search; a CodeMirror editor with per-language syntax modes and save; real terminals on node-pty with reconnect, transcript replay, and park-across-conversations semantics; a Git panel covering status, per-file staging, inline diffs, history, branches, upstream push, and GitHub pull requests and issues; a sandboxed multi-tab browser; the trajectory page replaying the session's event ledger; the plans, jobs, subagent, and team pages; and a side chat that continues the session's context in a child thread.

ui-sidebar-right renders this body under `rightbar.session.coding` while the workbench coding tag is active and keeps its native dockkit body under the general tag; the column chrome — width, collapse, the expand gesture — never changes. The ported interception faces are guarded by the same tag: the turn-tail produced-files row, the open-path doors that catch chat-side file opens into the sidebar editor, and the external http(s) links that open the sidebar browser engage only under coding; under general the native faces act. The IME composition guard is the one ungated registration — it has no native counterpart to yield to.

The web-app bundle's patch row (`ui-sidebar-coding`) mounts the package, and that one row activates both halves: the Node half registers the /sidebar routes and WebSocket upgrades on the host web server, and the client half registers the slot body and the interception faces in the browser. The root entry publishes the Node contract, the `./client` entry publishes the registry types a consumer's `registerTab` / `registerFileViewer` arguments are typed from, and the `./invariant` entry publishes the package's invariant companion — a no-op install that records package ownership, because the sidebar owns no service state or event protocol of its own.

The Settings shell carries the package's own Side card section: the per-tab enable switches, the terminal shell and font rows, the open-by-default and auto-open behaviors, and the two model-facing switches — agent terminal tools and the sidebar open tool — both off by default and dormant until the user turns them on. Preferences persist through the engine's config editor into the profile patch row and apply without a plugin remount.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

One method table behind one fence. The Node half answers POST /sidebar/api/<method> — the fs tree, read, write, rename, remove, and search operations; the git and GitHub command families; the plans scan; background-job output replay and kill; the subagent live and workflow previews; the archive builder; the Agent-Teams bridge; the side-chat thread routes; and the side-card settings reads and writes — plus raw /sidebar/upload, range-streamed /sidebar/file media, the CSP-sandboxed /sidebar/html preview, the /sidebar/bundle chunk route, and three WebSocket upgrades: the terminal socket serving both UI tabs (`?tab=`) and agent-owned terminals (`?uuid=`), the agent-terminals list push, and the agent-opens push. Every route passes the same browser-trust fence as the /api gateway — Host-header loopback or the web runtime's `trustedHosts`, read per request from the live service value — and every operation is conversation-scoped: the session's authoritative cwd resolves through the session header, then the client summary, then the persistence index, so a detached first request still lands in the right workspace.

The browser half boots as one module-table row: the core client bundle registers through `window.__ModuleLoader__.load` with externals resolved from the platform module table, and six lazy chunks — terminal, editor, locale, trajectory, mermaid, office — never touch the module table: each assigns its factory to the package-owned `__qilinChunks__` registry, and the chunk loader fetches it on first use through /sidebar/bundle, whose ETag revalidation keeps unchanged chunks cached across page refreshes and HMR re-activations. The `betterSidebar` registry service is the package's internal extension point (dual-workbench plan §2.2): external plugins register tab types, file icons, and file previewers through `ctx.betterSidebar`, and the built-in pages register through the same service. One snapshot store per activation feeds the body, the registry, and the interception registrations, and React reads it without tearing through `useSyncExternalStore`.

</details>

-----

<a id="model-experience"></a>
## Model Experience

### Agent terminal tools

#### What the model sees

With the side card's agent-terminal switch on, eight tools join the calling agent's tool list: `terminal_create` (spawn a persistent sidebar terminal and run a first command), `terminal_send` (write keystrokes, with a submit flag for Enter), `terminal_read` (page the retained output), `terminal_wait_for` (block on a transcript pattern, a timeout, terminal exit, or a user skip from the sidebar banner), `terminal_resize`, `terminal_signal` (POSIX signals such as `SIGINT`), `terminal_list`, and `terminal_close`. Each tool binds to the calling agent's session — the model never passes a session id — and every uuid argument is ownership-checked, so one session's agent cannot reach another session's terminals. The tools register at runtime behind the switch, which is why the generated tool catalog, booted from shipped tool packages at their default config, does not list them.

#### Token effect

Nothing until the switch is on (the shipped default). Enabled, the eight descriptions and their parameter fields ride every request the agent makes, and each call appends its tool-call and tool-result pair to the session log. `terminal_read` returns at most 500 lines and 256 KiB per call, and the host keeps about 1 MiB of scrollback per terminal — the full transcript replays to the browser view, never to the model. Turning the switch off removes the tools from the list and releases every agent-created terminal.

#### KV Cache effect

Enabling or disabling the switch rewrites the tool section of the next request, so the reusable prefix is rebuilt from that point; tool calls and results themselves append to the transcript and preserve whatever prefix the harness already holds. No system-prompt prose and no package-owned routing change ride the tools.

### Sidebar open tool

#### What the model sees

With the side card's open switch on, one `sidebar_open` tool joins the list: the model names a local file, a local folder, or an http(s) URL, and the open lands in the calling session's sidebar — an editor tab, a file window rooted at the folder, or the sandboxed browser tab. The result reports `kind`, `target`, `title`, and `delivered`, the last saying whether a connected view received the open now or it stays queued until that session's sidebar is next shown; a target whose tab type the user disabled is refused with an error naming the setting. It registers at runtime like the terminal tools, so the generated catalog omits it too.

#### Token effect

Nothing until the switch is on (the shipped default). Enabled, one tool description joins every request, and each call appends one small four-field JSON result; the queued-undelivered case still returns immediately.

#### KV Cache effect

The same shape as the terminal tools: the switch flip rewrites the tool section of the next request, calls and results append, and nothing else in the request changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **A wholesale port, not a rewrite.** The tree keeps its internal component style — components that reach the cordis context directly and one shared per-activation store — instead of the props discipline of the newer client packages; the debt is recorded, not hidden.
- **No in-repo unit suite yet.** The ported src sits outside the per-file coverage gate as recorded port debt; behavior is exercised through the web e2e lanes and the upstream repository's own test suite.
- **`sidebar_open` collides with the native tool.** The base bundle mounts `@qilin/sidebar-opens`, whose tool carries the same name; a composition that turns this package's open switch on while the native tool is mounted fails the second registration loudly — the tool registry refuses a duplicate name.
- **The title-bar/desktop-shell compat subsystem is dormant.** The overlay-era toggle cluster is hidden in the in-column layout; the subsystem rides along with the port until the column layout needs it or the debt is retired.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open design questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above, the package code, and the linked Agent Notes.

#### Build faces

One source tree builds four artifact families: `lib/index.js` plus `lib/invariant.js` (the Node half, ESM, with tsc declarations under `lib/types`), `lib/client.js` (the core browser bundle — a CJS closure factory registered through the module table, externals from the platform table), and the six `lib/client-<name>.js` lazy chunks (one script each, because code splitting stays off; the core bundle never statically imports a chunk entry).

#### Sourcemap rebasing and the purity gate

Browser sourcemaps rebase lib-relative sources back onto the package's `../src` tree, so an editor lands on source instead of build output. The build-time purity gate fails any Node builtin or non-inline-safe `@qilin/*` value import in a browser face — cross-plugin collaboration goes through cordis services, and type-only imports are erased before the gate sees them.

#### Port provenance

Ported from dsh-coding-sidebar 1.0.39 (MIT; the KCoder fork of DSH-better-sidebar): specifiers and identity rewritten to `@qilin/client-*`, the body-level self-mount replaced by the `rightbar.session.coding` slot registration, and the settings takeover plus nav-icon marker deleted (D11), leaving the declarative Side card section as the only settings face.

</details>
