---
description: "Opens what the model asked to see in the Session's own Sidebar."
kind: "package-reference"
---

# @qilin-agent/client-ui-agent-opens

English | [中文](README.zh.md)

## Summary

The browser half of `sidebar_open`: it follows `ctx.remote.sidebarOpens.watch` for the Session the user is viewing and opens each request there. A page opens in the built-in browser when `@qilin-agent/client-ui-sidebar-browser` is composed and in a new browser tab otherwise; a file opens through its resource address, because which tab type claims an address is the Sidebar's decision. While the coding workbench tag is active, the coding sidebar's own tabs claim the open (and auto-expand the collapsed column); the native Sidebar takes it under the general tag or without the coding stack. The plugin keeps no state: a request is delivered once and never replayed.

## Table of Contents

- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- **No folder targets.** A directory has no Sidebar surface to open (the file tree is rooted at the workspace), so the host tool refuses one before it reaches here.
- **One viewer per Session.** Two browser views of one Session share one Host stream: the newest attachment takes it over, and the older view stops receiving opens.
- **A carrier failure ends the watch silently.** The next Session switch opens a fresh stream; a request made while the stream was down and no view was attached still waits in the Host queue until then.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
