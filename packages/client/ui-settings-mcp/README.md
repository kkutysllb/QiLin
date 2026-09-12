---
description: "MCP servers page in Web Settings: lists, adds, edits, enables, disables, and deletes the servers the user patch layer declares, through the mcpServers Remote."
kind: "package-reference"
---

# @qilin/client-ui-settings-mcp

English | [中文](README.zh.md)

## Summary

The MCP servers page is one Settings section. It renders the servers the home-level user patch layer declares — each with its transport, command line or endpoint, and enablement — beside the recommended servers this deployment offers and whether each one's command resolves on the harness PATH. Adding, editing, enabling, disabling, and deleting all write through the \`mcpServers\` Remote, which rewrites only the patch nodes that address one server; the page never composes a patch file itself and never re-derives what the Host answered with.

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

Open Settings and choose MCP servers. The page loads one snapshot on mount and renders three areas: the configured servers, the recommended servers, and the editor for the server being added or changed.

### Configured servers

Each row names the server, its transport, and the command line or endpoint the entry runs, marks a server that matches one of the recommended definitions, and carries a switch, Edit, and Delete. The switch writes enablement immediately; Delete asks for confirmation first, because removing an entry is the one action the editor cannot undo. Edit opens the same form as adding, with the name field locked: a saved entry is addressed by its name, so changing it would silently drop that entry's settings.

### Recommended servers

Each recommended server shows the command it would run and, when the harness cannot resolve that command, says so instead of offering an unusable entry. Adding one writes it to the patch layer; its tools appear once the entry is enabled and the layer reloads, which the launcher does without a restart.

### Refusals

Two failures have their own presentation. A patch layer that cannot be read is reported with the file's path and disables every mutation until the user repairs it by hand. A refused write — a name outside the accepted pattern, a stdio server without a command, an endpoint that is not an HTTP URL — keeps its editor open with the Host's message, so the draft is never lost to a validation error.

## Understand the implementation

One store instance is created in \`apply\` and handed to the section through its inject face; every mount shares it, and the page reads it through the \`useSnapshot\` hook the UI renderer binds from the store's bare observable. Each mutation replaces the whole snapshot from the Host's answer, so no local state is ever the source of a row.

A superseded read is cancelled and its answer discarded: the store keeps a generation counter and an \`AbortController\` per call, so a slow first load can never land after a newer one.

Form fields are plain strings. The submitted draft is built at the boundary: arguments become one entry per non-blank line, and the fields belonging to the other transport are dropped rather than sent as empty strings.

## Further Exploration

- [\`@qilin/mcp-servers\`](../../mcp/mcp-servers/README.md) — the Host service this page reads and writes, and the patch-layer fidelity rules a write follows.
- [\`@qilin/mcp-client\`](../../mcp/mcp-client/README.md) — what each written entry mounts, and the tool names its servers produce.
- [\`@qilin/client-ui-settings\`](../ui-settings/README.md) — the settings shell that declares the section slot this page registers into.

## Model Experience

None, as this page writes the user patch layer through the mcpServers Remote and contributes no prompt text, tool, or session event of its own.

#### KV Cache effect

None of its own. Enabling, disabling, adding, or removing a server changes the tool definitions of the sessions that mount the patched layer, which may invalidate reuse from the first changed definition onward.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits describe what this page cannot do and when it needs attention. They are current constraints, not a comparison with other MCP server managers or a task backlog.

- **Environment and header maps are not editable here** — a saved server keeps whatever \`env\`, \`headers\`, and \`reconnect\` nodes the patch file already holds, but the form cannot author new ones; a server that needs credentials is edited in the file.
- **A configured server cannot be renamed in place** — the name is the entry's identity; adding a differently named server is the deliberate replacement, because a rename would silently drop the old entry's settings.
- **Only the home-level patch layer is listed** — servers a profile's own \`cordis.patch.yml\` or a \`--patch\` overlay inserts do not appear, because the page reads the file this deployment's section writes rather than the composed Loader tree.
- **Tool availability is not shown per server** — a server that starts but advertises no tools renders like any other enabled row; diagnosing it belongs to the plugin inventory and the session log.
- **No browser-level end-to-end assertion covers the write path** — the shipped specs drive the store and the section with stubbed props, and the assembled-surface check is manual.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open design questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above, the package code, and the linked Agent Notes.

- Whether the recommended set should be materialized on first boot, the shape KCoder uses, is open on the Host side; this page only offers them.
- Editing \`env\` and \`headers\` needs a key/value editor decision (repeated rows, a JSON block, or a file hand-off) before it can ship.
- The page could subscribe to a patch-layer change event instead of reloading after its own writes; there is no such event today, so an edit made in a terminal shows up only after the next load.

</details>

**Runtime invariant:** No companion is published. The Host service is the only authority over the patch layer, and this page renders what each answer reported.
