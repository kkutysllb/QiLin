# Agent Note: Native product subagent backends removed from the product

Status: implemented

English | [中文](2026-10-11-remove-native-product-subagent-backends.zh.md)

## Problem

The harness shipped two optional Profile Bundles — `@qilin-agent/subagent-codex` and `@qilin-agent/subagent-claude-code` — that ran a real Codex or Claude Code product as a one-shot subagent, per [the backends Agent Note](2026-08-04-claude-code-and-codex-subagent-backends.md). They were the only entries in the Official on-demand catalog, so every Profile's plugin page listed them as installed plugins, and the shipped preset carried two disabled rows naming their delegation tools.

A backend that needs another product's CLI, that product's authentication store, and its own settings screen is a per-deployment choice, not a shipped default: the product asked for both to leave.

## Decision

Both packages, their Profile Bundle patches, their locale resources, their icons, and the disabled preset rows that named their tools are gone from this repository. `ON_DEMAND_BUNDLES` is empty, the generated `OFFICIAL_ON_DEMAND_CATALOG` is an empty list, and the catalog generator accepts an empty admission list as a shipping state instead of refusing it.

The `ctx.subagents` seam, `tool-subagent`, `tool-subagent-control`, and the in-process, ACP, and Harness-SDK providers are unchanged. A deployment that wants a Codex or Claude Code child mounts its own host-plane provider row on `ctx.subagents` and adds the matching preset tool row; the composition rules for that are unchanged.

## Alternatives considered

**Keep the packages and empty only the catalog.** The bundles would still ship as installable layers, so the plugin page would list them and the preset rows would still name tools no release supplies. That is the state the removal was asked to end.

**Disable the rows and keep the packages.** A shipped row a user can enable only with a package the release no longer publishes is a dead end; the removed comment already told the reader to install the matching Bundle first.

**Keep a catalog entry without its package.** The catalog is generated from package-owned locale metadata and validated against the workspace manifests, so an entry without its package cannot be generated at all.

## Consequences

**Bought:** the product no longer ships an integration that depends on another product's CLI, authentication, and settings. The plugin page lists what the deployment installs, and the shipped preset carries no row for a provider the release cannot supply.

**The seam keeps its remaining providers.** In-process spawn and fork, ACP, and the Harness SDK are unchanged, so delegation, one-shot and continuable modes, and their model-facing tools behave as before.

**Reintroducing either backend is a new decision, not a restore.** Nothing in this repository registers `codex` or `claude-code` on `ctx.subagents`; a future first-party integration would document its own ownership, evidence tiers, and teardown contract.

**Catalog-driven coverage has no shipped example until the next advertised bundle.** The release-ordering rule is covered with an injected list and the generator validates whatever it is given, but no shipped package exercises the plugin page's on-demand path while the admission list is empty.
