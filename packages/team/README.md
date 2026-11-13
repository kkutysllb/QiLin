---
description: "The team package group: durable shared task coordination across a subagent tree and its model-facing tools."
kind: "package-group"
---

# team/ — shared Team coordination

English | [中文](README.zh.md)

## Summary

The team group owns durable Team coordination across a subagent tree: each root Session saves its Team mode selection and one shared task board, and a tool package exposes that surface to the model. Subagent creation, discovery, messaging, and interruption stay in the subagent family.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`agent-team`](agent-team/README.md) | Team domain: mode, roster, durable messages, and the shared task board | `ctx.agentTeams` |
| [`tool-agent-team`](tool-agent-team/README.md) | Nine tools that let the model create, message, and coordinate teammates | scoped registration on `ctx.tools` |
| [`agent-team-profile`](agent-team-profile/README.md) | Opt-in profile layer wiring the domain, tools, and Web UI | — |

-----

<a id="related-documentation"></a>
## Related documentation

- [Agent Teams subsystem](../../docs/subsystems/agent-team.md) — durable Team types and the `ctx.agentTeams` service API.
