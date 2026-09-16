# Agent Note: DSH plugin compatibility and profile-scoped user plugins

Status: implemented

English | [中文](2026-09-15-dsh-plugin-ecosystem-compat.zh.md)

## Problem

QiLin must load DSH-era packages whose manifests use dsh.bundle and dsh.client, whose browser factories request @deepseek-ai/dsh-* module names, and whose host packages import legacy peer names. Settings also needs a user-facing way to install, update, and remove profile plugins without confusing profile changes with live Loader state.

## Decision

QiLin reads qilin metadata first and falls back to dsh metadata. The app-boot module fallback canonicalizes DSH dependency names to installed QiLin package directories and publishes both names, preserving one shared QiLin engine instance for legacy host imports. A translated name reuses the directory already selected for its QiLin counterpart — in the installation traversal and in the bundle traversal, which receives the installation's selections — because resolving the counterpart again from the declaring anchor can reach a second copy of the same package and defeat the shared instance. Client module graph and static seed aliases use the same compatibility mapping.

`loadLayeredEnv` also pins `DSH_HOME` to the resolved Harness home, as a `dsh-compat` layer that outranks the inherited environment and both `.env` layers. A plugin written for DSH resolves its own data directories through that variable, and the value a co-installed DSH process exports names a home this harness neither reads nor owns — a plugin publishing presets there would be invisible to the preset roster, which scans the Harness home. `QILIN_HOME` remains the user's own root override.

Reconciling a profile's installed dependencies refuses one that installed an upstream DSH-era engine package. Such a copy resolves from the profile ahead of the compatibility fallback, so activating it would load a second engine instance and plugin registrations would fail with errors such as `cannot get property "skills" without inject`. The CLI and the Web plugin manager reach that refusal through the one shared reconcile, so neither can activate a second engine copy; the diagnostic names each colliding package, the QiLin package it maps onto, and the `qilin plugin remove` command, and the bundle list is left unchanged. A resolution failure for a renamed engine name reports the same mapping where the plugin imports it, because the launcher publishes the old name only for names a selected plugin declares.

The manageable plugin rows are one function (`readProfilePluginRows`): `qilin plugin list` prints them and the Settings manager projects them, so the two surfaces cannot disagree about layer order, installed version, source, or removability. `qilin plugin doctor` answers the same compatibility questions one package at a time without executing anything — it reports a package that builds the DSH-era home while never reading `DSH_HOME`/`QILIN_HOME`, installs an engine package (an upstream DSH name, or a name this installation already provides), imports an engine name it never declares as a peer, or injects client module names the compatibility layer does not map. The report is advisory and exits nonzero only when a finding blocks activation.

Profile mutations are owned by @qilin/host-plugin-manager. Its pluginManager Remote runs pnpm in the launch profile, reconciles bundle layers after success, bounds retained output, and returns restartRequired because the running launch has a frozen bundle composition.

Each row's permissions follow its resolution channel. Shipped layers are never removable. A shipped layer the profile owns (PROFILE_OWNED_BUNDLES) resolves the profile copy first, so it upgrades in place through `add <name>@latest` — the same in-box-but-upgradable case a desktop plugin manager carries; every other shipped layer moves with the running installation and is neither upgradable nor removable. Remote method names stay clear of the Client namespace service's own surface, which reserves its fields and members such as `install` and `remove`; the Manager exports `Install` semantics as `installPlugin`, `updatePlugin`, and `uninstallPlugin`, and `isRemoteMethodNameAvailable` is the shared predicate that pins the rule.

The Settings Plugins section receives a separate user-plugins tab through settings.plugins.tab. It consumes only the generated manager Remote, localizes all UI copy, lists versions and sources, supports registry update checks, package installation, GitHub topic:dsh-plugin discovery, update, and uninstall.

## Alternatives considered

- Expanding plugin-inventory was rejected because inventory is a read-only Loader projection and mutation would mix ownership.
- Hot-mounting newly installed bundles was rejected because composeLive reuses startup bundle patches and would create a second composition authority.
- Keeping only client aliases was rejected because DSH host packages also import legacy names through Node resolution.
- Leaving the inherited `DSH_HOME` alone was rejected because plugin data directories and published presets would land in a co-installed DSH installation's home instead of the one this harness reads.
- Rewriting the profile's dependency edges after a polluted install was rejected because the profile is the user's own project: a silent edit would hide the conflict rather than report it, and a later install would reintroduce it.
- Computing the CLI's plugin rows beside the manager's was rejected because the two surfaces would drift on version resolution, source, and removability; the rows live in app-boot and both consumers project them.
- Loading a plugin to decide whether it is compatible was rejected because the report must run before an install or a boot, and executing third-party code to judge it would defeat that.

## Consequences

DSH packages that rely on renamed QiLin APIs, Electron bridges, or incompatible resource schemes still require per-plugin validation. A `.env` that declares `DSH_HOME` is recorded in its layer but never wins; relocating the root is `QILIN_HOME`'s job. A refused install leaves the offending engine package on disk until the operator runs the printed removal command, because the launcher never rewrites the profile's dependencies. The doctor reads source text rather than executing the plugin, so a package can pass it and still fail against renamed APIs; and its engine-duplication warning covers the installation's own tree only, not packages reachable through `NODE_PATH`. Package operations require pnpm and a writable profile, and a successful change requires a process restart before activation. Browser-level install/restart acceptance remains deployment-dependent.

## Verification

Compatibility, profile, manager, and client module tests pass; host and client TypeScript aggregates, client package checks, localization checks, export JSDoc checks, package path checks, GUI tests, generated artifacts, and whitespace checks pass. The launch-environment specification covers the pin's rank over the layers it replaces, and the DSH-home pin specification fails when the pin is removed. The profile specification covers the collision list, the refusal, and the unchanged bundle list, and the plugin manager specification covers the same refusal through the Web path. The resolution specification covers the DSH-era name diagnostic in ESM and CommonJS and keeps an untranslated miss on Node's own error; removing the diagnostic fails it. The doctor specification covers all four checks, the source-scanning exclusions, and the verdict for each severity. The profile-level compatibility specification installs a DSH-shaped plugin into a profile, boots it through the Loader, and asserts the published legacy name is the installation's copy; it failed before the shared-directory rule above and passes after it. It also runs the doctor against locally mirrored real plugins when `QILIN_DSH_PLUGIN_FIXTURES` names their directory, and skips that block everywhere else. The dependency policy retains one pre-existing unrelated @qilin/fs#FsVersion classification violation.
