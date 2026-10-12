# Agent Note: Developer tools bundle removed from the product

Status: implemented

English | [中文](2026-10-12-remove-developer-tools-bundle.zh.md)

## Problem

The Official group shipped the Developer tools optional bundle (`@qilin-agent/experimental-inspector-profile`): raw session logs, chat-group and message two-way navigation, and embedded Host debugging across three packages (`experimental-inspector-profile`, `experimental-inspector`, `experimental-session-inspector`). The Owner does not want a debugging surface in the product.

## Decision

The Owner removed the bundle from the product (2026-10-12). `experimental-inspector-profile` left `OPTIONAL_BUNDLES` and the apps/cli runtime closure; all three packages are deleted with the `ctx.inspector` service, the session-inspector client page, and the vendored DevTools frontend. This supersedes the Inspector parts of [shipping experimental capabilities as optional bundles](../architecture/2026-09-21-experimental-capabilities-as-optional-bundles.md).

## Alternatives considered

**Keep the packages and drop only the bundle row.** The plugin page would stop listing the entry, but three published experimental packages and their dependency closure would keep riding every release for a product nobody ships.

**Disable the row and keep the packages.** A shipped switch whose package the release no longer carries is the dead end the subagent removal already ended for the same reason.

## Consequences

**Bought:** the plugin page no longer lists Developer tools, `qilin plugin add` no longer resolves it, and no release carries the session raw-log browsing or chat-group navigation surface. `OPTIONAL_BUNDLES` carries eleven entries.

**Cost:** restoring the capability requires restoring the deleted packages from history and re-adding the catalog, tsconfig, and docs wiring.
