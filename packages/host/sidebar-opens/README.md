---
description: "Model-facing requests to open a file or an http(s) page in the Session's Sidebar."
kind: "package-reference"
---

# @qilin/sidebar-opens

English | [中文](README.zh.md)

## Summary

`sidebar_open` lets the model show something instead of describing it: one existing file, or one http(s) page. The request travels as a Host Remote stream (`sidebarOpens.watch`) to [`@qilin/client-ui-agent-opens`](../../client/ui-agent-opens/README.md), which opens the Session's own Sidebar on it. Delivery is transient: a request is consumed on send while a view is attached, and otherwise waits in a bounded per-Session queue a later attachment replays.

## Table of Contents

- [The tool](#the-tool)
- [Delivery](#delivery)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

## The tool

Exactly one of `path` or `url` is required.

- `path` accepts an absolute path or one relative to the Session working directory, and is verified through the Session filesystem before the request is made: a path that does not resolve, or that names something other than a regular file, fails the call rather than opening a broken tab.
- `url` accepts `http://` and `https://` only. Anything else is refused, so a `file://` the model composed cannot reach the browser's opener.
- The title is the file's basename or the page's host.

The result reports the resolved target and whether an attached view took it now. The Host-minted request identity stays internal.

## Delivery

`watch(sessionId, signal)` yields what queued while nothing was attached and then every request as it arrives. A second watcher for the same Session takes over: the newest view is the one the user is looking at. `enqueue` answers whether an attached view consumed the request; with none it queues, dropping the oldest request past `maxQueued` so a Session nobody watches cannot accumulate requests without end.

## Model Experience

### sidebar_open

#### What the model sees

The [sidebar_open schema](../../../docs/tool-catalog.md#sidebar_open) offers one file or one http(s) page: "Open one file or one http(s) page in the Sidebar the user is viewing this Session in. Use it when the user asked to see something: a file you produced, a file worth reading beside the conversation, or a page you found. Pass exactly one of `path` (a file that already exists) or `url`. The file opens in the document preview and the page in the built-in browser; both appear beside the conversation rather than leaving the application." Results are one line — the target opened, or the target waiting for the Session's Sidebar — with `kind`, `target`, `title`, and `delivered`.

#### Token effect

Two parameters and one small result per call. Nothing here is added to the system prompt.

#### KV Cache effect

None directly. A call and its result append to the Session like any other tool turn; the cache moves the way it does for any tool call.

## Known Limitations and Deferred Work

- **Folders are not openable.** The Sidebar's file tree is rooted at the workspace, so "show me this directory" has no tab to reach; only a regular file or a page can be opened. A folder path fails the call.
- **A page is only as good as the composing browser tab type.** With `@qilin/client-ui-sidebar-browser` composed out, the consumer falls back to a new browser tab, which leaves the application.
- **Requests do not survive a reload.** A request made while no view was attached waits only in the Host process's memory for that Session; restarting the Host or disposing the Session drops it.
- **The queue is bounded and drops oldest-first.** A Session whose sidebar is never shown keeps only its most recent `maxQueued` requests.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. `SidebarOpens` is the sole writer of its per-Session queues and watchers, and the package's own spec drives enqueue, take-over, abort, and disposal directly.
