# Agent Note: registry bundle updates check every published version

Status: implemented

English | [中文](2026-10-14-registry-bundle-updates.zh.md)

## Problem

A third-party bundle installed from an npm registry has no in-product way to learn about a newer published version. The `Plugins` page shows the installed version and a Source spec, and an update means removing the package and installing a newer one by hand, which loses the layer selection and cannot report what failed.

Three facts make the naive implementation wrong. A registry spec saved as a range (`^1.0.0`) resolves to whatever the registry offers at install time, so re-installing the same spec is not an update and does not name a version. pnpm prints only the highest match of a range through `pnpm view <spec> --json`, so one lookup cannot enumerate the versions above the installed one. And a package that a newer version replaces can be left uninstalled when the newer version fails, which is exactly when the user has already lost the working plugin.

## Decision

1. **A version list is one range-free lookup plus one lookup per candidate.** `listVersions` asks `pnpm view <name> versions time dist-tags` for the published versions, keeps the `versionListLimit` newest above the installed one, then reads each candidate's `name version engines peerDependencies deprecated qilin` at most `versionLookupConcurrency` at a time. Only a per-version read can report a bundle declaration, a deprecation, and peer compatibility, and only it distinguishes a version that cannot replace a bundle from one that can.
2. **The update is check, remove, install, with the removed version reinstalled on failure.** `updateBundle` reads the target's facts before changing anything: a missing version, a version without `qilin.bundle`, or a version whose peers reject the running QiLin stops at `step: 'check'` with the profile untouched. With HMR it then removes the installed version, which stops its plugins, installs the exact target, and — when that installation fails, is cancelled, or installs without starting — removes the target if it stayed and installs the previous version again from the registry it came from. The reinstallation carries no request id, so cancelling the update cannot cancel the restore. Without HMR the target is installed over the running version and the result reports `restart-required`.
3. **Eligibility is derived, not stored.** `listBundles` marks a bundle `updatable` when it is a profile dependency saved as a registry spec under its own name (not an `npm:` alias, not a link or path), its installed manifest declares a semver version, and it carries no plugin management. The `plugin_manager` tool strips the field, because the tool offers no update action.

## Alternatives considered

**Fetch the abbreviated packument over HTTP.** One request returns every version's `peerDependencies` and `deprecated`, but the Host would have to resolve registry, scope, authentication, and proxy settings from the `.npmrc` chain itself and keep that resolution identical to pnpm's. A list from a registry pnpm would not install from shows versions that cannot be installed.

**`pnpm outdated`.** It reports current, wanted, and latest only, judges no QiLin peers, and with exact saves wanted equals current.

**Orchestrate removal and installation in the browser.** The Official update did so. A browser that closes or loses its connection between the two calls leaves the package removed with nobody to reinstall it, and the target check before removal would be a second, bypassable copy of the Host's rule.

**List versions while reading bundles.** `listBundles` is offline; adding registry lookups would make opening the plugin page a network operation with one subprocess per version.

## Consequences

- Checking a package costs one `pnpm view` plus one per listed version, each bounded by `inspectTimeoutMs`.
- A target saved by an update, and a reinstallation after a failed one, are exact versions even when the profile had saved a range; with HMR the bundle joins the end of the selection.
- Removal and installation take the profile lock separately, so another operation can run between them; an installation that rejects, for example on a lock timeout, still triggers the reinstallation.
- A version whose dependencies need a new build-script approval fails to install and is reinstalled at the previous version; its scripts are approved through an ordinary installation.
- A reinstallation that also fails leaves the package uninstalled, and the dialog says so.

## Verification

`packages/boot/plugin-manager/tests/manager.spec.ts` covers the downgrade refusal, the incompatible and non-bundle refusals, a failed installation restored to the previous version, a cancelled one, a rejected one, an installation that cannot start, a rejected removal, a failed reinstallation that leaves the package uninstalled, and the no-HMR path. `packages/client/ui-plugin-manager/tests/manager-store.client.spec.ts` covers the candidate choice, the once-per-package check, the check forgotten when another surface reinstalls the package, and the update's step and outcome reporting.
