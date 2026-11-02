# Agent Note: MCP servers are user-configured; the deployment ships no recommended set

Status: implemented

English | [中文](2026-11-03-mcp-servers-user-configured.zh.md)

## Problem

The MCP servers settings page shipped a recommended catalog — fetch, context7, sequential-thinking, playwright — that it could add on one click, with a per-command availability probe over `uvx` and `npx` deciding which rows were offerable. That catalog is product copy about third-party servers the deployment does not control: the launch arguments rot with the upstream packages, the probe made the settings service depend on the subprocess provider, and a machine without those commands still carried the copy. Users who know which server they want write the entry by hand anyway.

## Decision

- The deployment ships no MCP server definition. [`@qilin-agent/mcp-servers`](../../../../packages/mcp/mcp-servers/README.md) offers CRUD over the entries a user writes and nothing else: `addBuiltin`, the snapshot's `builtins` field, the recommended-server badge, and the command-availability probe are gone, and the service no longer injects the subprocess provider.
- The settings page keeps the manual editor — transport, command, arguments, working directory, endpoint URL, fail-on-startup, enablement, and delete. A configured server is an ordinary patch-layer entry; the page does not classify it.
- Every MCP server comes from user configuration, through [the settings page](../../../../packages/client/ui-settings-mcp/README.md) or the home-level `cordis.patch.yml`. The subsystem reference states the same fact beside the client configuration.

## Alternatives considered

**Keep the catalog but require confirmation before writing.** The command strings and the availability probe still rot with upstream packages, and the page still carries product copy about servers the deployment does not support.

**Move the catalog to the Host as data.** The same maintenance burden moves one layer down without removing it, and no consumer reads it besides the page.

**Hide the catalog behind a setting.** A shipped opt-in still has to be kept current, and the page's empty list is the honest default.

## Consequences

- A new machine carries no MCP server until its user adds one; the page's empty configured list is the default state.
- The settings service activates wherever it is mounted, with no subprocess dependency and no pending state.
- Adding context7, playwright, or any other server is now a manual entry with whatever `command`, `args`, `env`, and `cwd` the user supplies.
- The page's locale dictionaries no longer carry per-server descriptions, and the recommended-server copy leaves both languages together.
