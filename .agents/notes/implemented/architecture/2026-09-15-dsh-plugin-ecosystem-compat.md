# Agent Note: DSH plugin compatibility and profile-scoped user plugins

Status: implemented

English | [中文](2026-09-15-dsh-plugin-ecosystem-compat.zh.md)

## Problem

QiLin must load DSH-era packages whose manifests use dsh.bundle and dsh.client, whose browser factories request @deepseek-ai/dsh-* module names, and whose host packages import legacy peer names. Settings also needs a user-facing way to install, update, and remove profile plugins without confusing profile changes with live Loader state.

## Decision

QiLin reads qilin metadata first and falls back to dsh metadata. The app-boot module fallback canonicalizes DSH dependency names to installed QiLin package directories and publishes both names, preserving one shared QiLin engine instance for legacy host imports. Client module graph and static seed aliases use the same compatibility mapping.

Profile mutations are owned by @qilin/host-plugin-manager. Its pluginManager Remote runs pnpm in the launch profile, reconciles bundle layers after success, bounds retained output, and returns restartRequired because the running launch has a frozen bundle composition.

Each row's permissions follow its resolution channel. Shipped layers are never removable. A shipped layer the profile owns (PROFILE_OWNED_BUNDLES) resolves the profile copy first, so it upgrades in place through `add <name>@latest` — the same in-box-but-upgradable case a desktop plugin manager carries; every other shipped layer moves with the running installation and is neither upgradable nor removable. Remote method names stay clear of the Client namespace service's own surface, which reserves its fields and members such as `install` and `remove`; the Manager exports `Install` semantics as `installPlugin`, `updatePlugin`, and `uninstallPlugin`, and `isRemoteMethodNameAvailable` is the shared predicate that pins the rule.

The Settings Plugins section receives a separate user-plugins tab through settings.plugins.tab. It consumes only the generated manager Remote, localizes all UI copy, lists versions and sources, supports registry update checks, package installation, GitHub topic:dsh-plugin discovery, update, and uninstall.

## Alternatives considered

- Expanding plugin-inventory was rejected because inventory is a read-only Loader projection and mutation would mix ownership.
- Hot-mounting newly installed bundles was rejected because composeLive reuses startup bundle patches and would create a second composition authority.
- Keeping only client aliases was rejected because DSH host packages also import legacy names through Node resolution.

## Consequences

DSH packages that rely on renamed QiLin APIs, Electron bridges, or incompatible resource schemes still require per-plugin validation. Package operations require pnpm and a writable profile, and a successful change requires a process restart before activation. Browser-level install/restart acceptance remains deployment-dependent.

## Verification

Compatibility, profile, manager, and client module tests pass; host and client TypeScript aggregates, client package checks, localization checks, export JSDoc checks, package path checks, GUI tests, generated artifacts, and whitespace checks pass. The dependency policy retains one pre-existing unrelated @qilin/fs#FsVersion classification violation.
