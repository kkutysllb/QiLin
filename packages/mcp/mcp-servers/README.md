---
description: "MCP server settings service: list, add, edit, enable, disable, and remove the mcp-client entries of the user patch layer through the mcpServers Remote."
kind: "package-reference"
---

# @qilin/mcp-servers

English | [中文](README.zh.md)

## Summary

The settings page reads and writes the `mcp-client` entries of the home-level user patch layer through the `mcpServers` namespace. A snapshot lists every configured server with its transport, its command line or endpoint, its enablement, and the recommended server it matches, beside the recommended servers this deployment offers and whether each one's command resolves on the harness's own `PATH`. Saves, removals, enablement changes, and recommended-server additions rewrite only the patch nodes that address one server, so every other byte of the file — other patch entries, comments, quoting, and `!!js` expressions — survives unchanged.

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

Call `mcpServers/list` to render the server list, and the four mutations — `save`, `delete`, `setEnabled`, `addBuiltin` — to change it. Each mutation returns a fresh snapshot, so a client never needs a second read to see what its own write produced.

### What a snapshot contains

Each configured row carries the `serverName` the entry reserves (which is also the middle segment of the server's model-facing tool names), the Loader entry id `mcp-<serverName>`, the transport, a display detail — the resolved command line for a stdio server, the endpoint for a Streamable HTTP one — whether the entry is enabled, and the recommended-server id it matches, or null for a server the user configured. The `builtins` rows name each recommended server with the command it would run and whether that command resolves to an executable through the harness's subprocess provider. `patchPath` names the file every write goes to.

### When the file cannot be addressed

A patch layer that does not parse, or whose root is not an entry list, is reported in the snapshot's `error` field with no servers and no mutation offered. Every mutation refuses with the same reason and leaves the file untouched — overwriting hand-written configuration is worse than refusing the edit, so the user repairs the file by hand and reloads.

### What a save preserves

A save replaces only the config keys this service owns: `transport`, `serverName`, `command`, `args`, `cwd`, `url`, `headers`, `toolCallTimeoutMs`, and `failOnStartupError`, and drops the keys the other transport owns. Keys it does not own — `env`, `reconnect` — keep their own nodes, including `!!js` expressions, so a server whose credentials are environment expressions is not rewritten by an unrelated edit. Because the entry id is the server's identity, a save never renames one: an existing `serverName` is updated in place, and a new one is appended as a new entry.

## Understand the implementation

### Where the entries live

Each managed server is one entry inside a top-level `- insert:` item, which is how a patch layer adds rows the bundles below it never declared. `@deepseek-ai/cordis-plugin-include` indexes inserted rows, so this layer can address its own rows and later layers can address them too. Enablement is the entry's own `disabled` key, read by the same patch application, so a disabled server keeps its definition and returns on the next enablement without a second edit.

### Why the home layer

The service writes `<QILIN_HOME>/cordis.patch.yml`, the layer that sits above every profile, so a server configured in the web GUI is also there for a headless run. The launcher already watches that file, so a save joins the running tree through Cordis HMR without a restart.

### Writes

Mutations are serialized inside the service: two settings actions cannot interleave a read-modify-write and lose one of the two results. Each write replaces the file in one atomic step and stamps owner-only permission bits, because a server definition may carry credentials in its `env` map.

### The service is Remote-only

`McpServers` declares no same-process Cordis `Context` merge; the `mcpServers` namespace exists for the Remote client the settings page uses. It injects the subprocess provider because the availability probe must resolve a command exactly the way `@qilin/mcp-client` will.

## Further Exploration

- [`@qilin/mcp-client`](../mcp-client/README.md) — what each entry this service writes actually mounts, and the tool names its servers produce.
- [`@qilin/app-boot`](../../boot/app-boot/README.md) — profile composition, the patch layers, and the user-layer reload the launcher installs.
- [`@qilin/host-plugin-inventory`](../../host/plugin-inventory/README.md) — the read-only projection of what the Loader mounted from this file.

## Model Experience

### MCP tools the managed servers register

#### What the model sees

Nothing from this service: it writes a patch file and registers no prompt text, tool, or result of its own. The entries it writes are mounted by `@qilin/mcp-client`, whose servers register their advertised tools as `mcp__<serverName>__<rawName>`, so adding, enabling, or removing a server changes that tool list on the next reload.

#### Token effect

None by itself. Every enabled server's tool descriptions and input schemas enter every request while it is mounted, so each server the settings page adds or enables spends tokens on all requests until it is disabled or removed.

#### KV Cache effect

None by itself. Enabling, disabling, adding, or removing a server changes the tool-definition prefix and may invalidate reuse from the first changed definition onward.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits describe what this service cannot do and when it needs attention. They are current package constraints, not a comparison with other MCP server managers or a task backlog.

- **Recommended servers are offered, never installed on their own** — the settings page adds one only when the user asks. A first boot writes nothing, so a machine without `uvx` or `npx` never carries a server that cannot start, and no deployment pays for servers its user did not choose.
- **Environment and header maps are not editable from the settings page** — a save preserves existing `env`, `headers`, and `reconnect` nodes but cannot author new ones; adding a server that needs credentials means editing the patch file, which this service then leaves alone.
- **A configured server cannot be renamed in place** — `serverName` is the entry's identity; changing it means adding a differently named server, which is deliberate because a rename would silently discard the old entry's credentials.
- **Only the home-level layer is managed** — a profile's own `cordis.patch.yml` and any `--patch` overlay keep their entries read-only to this service; entries they declare still appear in the list, because reading walks the file the service writes and never the composed tree.
- **The availability probe needs the subprocess capability** — the service injects it and stays pending without it, so a deployment that mounts no subprocess provider exposes no MCP settings section at all.
- **Credentials written into a managed entry live in the patch file in clear text** — the file is owner-only, and no secret store is consulted.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open design questions and directions that are not decided. It is explicitly non-authoritative — shipped behavior, limits, and accepted rationale live in the sections above, the package code, and the linked Agent Notes.

- The entry id convention `mcp-<serverName>` is shared by this service and the settings page; a third consumer would make it a public contract.
- `SERVER_NAME_PATTERN` is restated here from `@qilin/mcp-client` because that package does not export it; exporting it would remove the duplicate.
- Whether the recommended set should be materialized on first boot — the shape KCoder uses — is open. Offering them keeps opt-ins out of shipped defaults, at the cost of one click per server.
- A read-only view of servers other layers insert would need the composed Loader tree rather than the file, which is a different service boundary.

</details>

**Runtime invariant:** No companion is published. The patch file this service writes is the only authoritative state, and re-reading it on every call is what keeps a snapshot current.
