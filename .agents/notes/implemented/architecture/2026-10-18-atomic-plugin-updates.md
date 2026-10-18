# Agent Note: Update installed plugins in place

Status: implemented

English | [中文](2026-10-18-atomic-plugin-updates.zh.md)

## Problem

The plugin page refused to install a package the profile already declared. Plugin Manager raised `already-installed` before pnpm ran, the field explained that the package had to be uninstalled first, and the only upgrade path was a removal followed by an installation: two publications, and every plugin of the package stopped twice. The refusal existed because [profile resolution generations](2026-09-09-profile-resolution-generations.md) rejected any successor that changed the directory of a retained mapping, and a reinstallation from another location is exactly that change. A profile running HMR can already adopt a successor after stopping the plugins it replaces, so the refusal turned an upgrade the runtime could apply into a restart or a two-step replacement.

## Decision

`installBundle()` installs over an installed dependency whose name the spec resolves to before pnpm runs: a registry name, a local directory, or the git or tarball spec its dependency was saved with. pnpm replaces that dependency's files in place, the saved spec moves to the resolved version, the bundle stays selected, and the caller publishes one successor after the run. With HMR the recomposition replaces the running plugins whose loaded files changed, so the new version runs without a restart; without HMR the running plugins keep the previous version until the restart the result reports. A run that resolves the spec and version the profile already saved changes nothing and answers `upToDate`, which selects, reloads, and restarts nothing. A failed, cancelled, or bundle-less installation still restores `package.json` and `pnpm-lock.yaml` as it did.

`ResolutionRouter.replace()` adopts a retained profile mapping whose real directory changed: it records the previous directory in `MovedDirectories`, redirects the files Node selected through that directory to the current one, and publishes the successor. Node keeps the real path of what it resolved first, so the recorded move is what makes the current files load.

The safety boundary stays. An installation mapping that changes its directory, declarer, version, or scope, or leaves the table, still raises `ResolutionRestartRequired`: the QiLin installation's own copy is what loads, and no plugin-level change may replace it. A new local package name that overrides an existing mapping is still refused. `inspect()` and `installBundle()` refuse a name the QiLin installation or a selected local bundle provides before pnpm runs, in both HMR and startup-only profiles.

## Alternatives considered

**Keep the refusal and make the Web page's Update the only upgrade path.** The Update action already removed and reinstalled, so every other caller had to do the same or fail. It costs two publications and two plugin stops for one version change, and a package that cannot be removed, such as a bundle carrying plugin management, could not be upgraded at all.

**Adopt every mapping directory change, including installation mappings.** A QiLin-provided package that resolves elsewhere is either a broken installation or an attempt to replace shipped files. Neither is a change a running process should adopt.

**Answer a repeated installation with a failure.** Reporting the same version as an error keeps callers writing version comparisons and treats an idempotent request as a mistake. `upToDate` states the fact without an error path.

**Detect the no-change case by comparing files.** Comparing package files before and after the run duplicates what the recomposition already does for loaded modules, and it cannot tell whether the saved dependency moved.

## Consequences

One call upgrades an installed plugin: the person installs the same package name again, and a live profile runs the new version without restarting. The cost is that a reinstallation from another location silently becomes a directory move, so a file only the previous directory held stays as Node selected it and a module that a plugin imported earlier keeps its identity until the plugin restarts. `inspect()` now asks the registry for a name the profile declares, so an offline profile gets the registry's failure instead of an immediate refusal.

## Testing

`packages/boot/plugin-manager/tests/package-reload.spec.ts` installs version 1 of a bundle and then installs version 2 over it through the real Loader and HMR, asserting one publication, the new version running, the dependency and selection saved, and no restart reason; it also asserts that reinstalling the saved version publishes nothing. `packages/boot/app-boot/tests/profile-resolution.spec.ts` publishes a profile mapping that moved to another directory and then resolves files through the previous one, and asserts that an installation mapping move and a local override still raise `ResolutionRestartRequired`.
