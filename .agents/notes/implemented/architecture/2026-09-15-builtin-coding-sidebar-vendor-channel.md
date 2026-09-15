# Agent Note: coding-sidebar is vendored as the built-in right Sidebar with a plugin-channel upgrade path

Status: implemented

English | [中文](2026-09-15-builtin-coding-sidebar-vendor-channel.zh.md)

## Problem

The web surface shipped two right-side surfaces that did not know about each other: the stock right Sidebar (`ui-sidebar-right` plus four tab-type rows in `qilin-web-app`) and the externally maintained `dsh-coding-sidebar` workbench, which targets the DSH package namespace (`@deepseek-ai/dsh-*`) and installs through the DSH plugin channel. QiLin's rebrand renamed every peer that plugin imports, `@qilin/*` is not on npm, and the repo's per-file coverage gate makes a hand-maintained copy under `packages/` unaffordable — so neither "depend on the npm package" nor "fork it into packages/" works.

## Decision

- **Vendor, don't fork.** `vendor/coding-sidebar` is a generated copy of the upstream `dsh-coding-sidebar` repository, produced by that repository's `scripts/sync-to-qilin.mjs` (`--check` verifies zero drift). The mechanical rewrite (import-specifier renames onto `@qilin/*`, identity strings, `DSH_NODE_PTY_RANGE` widening for this repo's patched `node-pty@1.2.0-beta.15`, generated package.json/tsconfig/tsdown/cordis.patch.yml) is logged exhaustively as vendor/README.md local-modification entry 10, per the vendoring policy.
- **Replacement rides the plugin's own bundle patch, not the web-app patch.** The channel patch disables the five stock rows (`ui-sidebar-right`, `ui-sidebar-documentpreview`, `ui-sidebar-files`, `ui-sidebar-tasks`, `ui-sidebar-plans`) and inserts one guarded row for `@qilin/coding-sidebar`. Because a patch layer above it can re-enable any stock row, replacement stays reversible per deployment, and an upgraded plugin version can change its own replacement set without a QiLin release.
- **Built-in means profile-template-seeded.** `PROFILE_TEMPLATES` for `web` and `qilin` append `@qilin/coding-sidebar`; `@qilin/web-app` depends on the package so the installation closure resolves it with no profile `pnpm install`. Existing profiles whose bundle list exactly matches the pre-sidebar tuple normalize to the current template (`INSTALLATION_OWNED_PROFILE_TUPLES`); a profile its owner already extended keeps its list and adds the sidebar through `qilin plugin` instead.
- **Online upgrade is the profile-owned override, not a second row.** `PROFILE_OWNED_BUNDLES` in `qilin-app-boot` reverses the two-anchor order for `@qilin/coding-sidebar` alone: a copy installed into `$QILIN_HOME/profiles/web` through `qilin plugin --profile web add @qilin/coding-sidebar@<spec>` resolves ahead of the installation seed, the single template entry mounts the newer copy, and the patch row's disabled expression backs off if any earlier enabled row already mounts the package (aggregate bundles). The channel package is published from the plugin repository under the same name; until the `@qilin` npm scope exists, git specs serve the channel. Source launches (tsx) pin the name to `vendor/coding-sidebar/src` through the `tsconfig.base.json` alias, so the dev workflow always exercises the vendored copy.
- **Host-agnostic optional services.** Upstream `dsh-coding-sidebar` stopped injecting the client `workspaces` service (its legacy `openPath` door is now an optional `ctx.get` wrap) and guards the sidechat transcript pull on carriers without `connection.api`, so one source serves both hosts; those edits landed upstream first and re-synced.

## Consequences

- `resolveBundleDir` carries a documented exception class (`PROFILE_OWNED_BUNDLES`): installation-first remains the contract for every in-box bundle, while members of this list seed from the installation and yield to a profile-installed copy — the exact lifecycle of a built-in plugin with an independent release line.
- The web composition keeps `ui-sidebar-right` mounted (its controller services have hard dependents), so the stock expand button and its empty panel remain reachable; the workbench owns the tab surface through interception rather than controller replacement. In the Settings shell the channel replaces the stock `sidebar-right` page instead: the plugin registers that section id at priority -1 and the shell projects winner cells ([mechanism](2026-09-15-settings-nav-winner-projection.md)).
- `qilin plugin --profile web remove @qilin/coding-sidebar` removes the dependency and the bundle-list entry together; restoring the built-in means re-adding the entry to `qilin.profile.bundles` (or recreating the profile), because the reconcile treats the entry as dependency-managed once a profile copy existed.

## Alternatives considered

- Depending on a published npm package: blocked pre-publication of the `@qilin` scope, and it would still strand upgrades behind QiLin releases under the installation-first contract.
- A hand-maintained `packages/` port: rejected on the per-file coverage gate and the sync cost against an independently released upstream.
- Disabling `ui-sidebar-right` outright: rejected because `ui-chat` and `ui-trajectory` hard-inject its services and would strand pending at boot, taking the conversation surface down.
- Flipping the two-anchor order for every bundle: rejected as a contract break for in-box bundles; the named list keeps the change scoped to bundles whose lifecycle is deliberately profile-owned.

## What was given up

- A `packages/` first-party port: rejected for the per-file coverage gate and the sync cost against an actively released upstream (14 releases on its own line).
- Keeping the stock right Sidebar mounted with dynamic avoidance (the DSH channel's coexistence behavior): under QiLin the workbench is the product's right Sidebar, and disable-not-delete rows make fallback a one-patch operation instead of a runtime dance.
- Sidechat transcript paging on QiLin until the plugin ports its history pull onto the Typert remote namespace; the pull degrades to the last cached rows instead of throwing.

## Required verification

- `node scripts/sync-to-qilin.mjs --check` in the plugin repository exits 0 (vendored copy in sync).
- `pnpm run build` passes both faces; the vendored package's tsconfig joins the host aggregate and its tsdown config emits the node half plus the `@qilin/coding-sidebar` client bundle and five lazy chunks.
- `packages/boot/app-boot/tests/profile.spec.ts` covers the pre-sidebar web tuple normalizing to the built-in template and an extended profile keeping its own list.
- Booting `qilin --profile web` with a scratch `$QILIN_HOME` mounts exactly one `coding-sidebar` row with the four stock tab-type rows disabled and `ui-sidebar-right` active; the profile-plugin upgrade simulation swaps the mounted copy without a second row (`packages/boot/app-boot/tests/profile.spec.ts` covers the resolution order both ways).
