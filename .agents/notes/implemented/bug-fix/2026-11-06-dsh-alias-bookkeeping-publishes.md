# Agent Note: Publishing a DSH-era alias whose bookkeeping changed

Status: implemented

English | [中文](2026-11-06-dsh-alias-bookkeeping-publishes.zh.md)

## Problem

Plugin Manager reported `restart-required` with `package-moved` for installing, enabling, disabling, and removing any bundle that declares a pre-rescope `@deepseek-ai/*` name, so every such operation told the user to restart QiLin although the plugin was ready to run.

[The runtime generation](../architecture/2026-09-09-profile-resolution-generations.md) publishes one alias entry per scope. The installation publishes the alias of a QiLin package it ships (`scope: 'installation'`, declared by the installation manifest), and every selected bundle whose manifest declares the DSH-era spelling republishes it over the same directory (`scope: 'profile'`, declared by that bundle). Selecting or deselecting the bundle therefore changed the entry that answers the name — the last entry of a name wins — between those two scopes, and `ResolutionRouter.replace()` rejected any retained mapping whose directory, declarer, scope, or version moved. `app-boot`'s publication turned that rejection into `package-moved`, so the change waited for a restart even though the same directory served the same version before and after.

## Decision

- `ResolutionRouter.replace()` compares a retained mapping by its real package directory and recorded version. When both stay, the mapping publishes whatever its scope and declarer become: one physical package answers either bookkeeping form, so no loaded module, cache entry, or object reference changes.
- A retained mapping whose real directory changed still requires a restart, as does an installation mapping whose version changed. So does removing a mapping that is not profile-scoped, and so does a new profile-local name that overrides a package the installation provides. Those changes decide which files the process would load next, and a newly installed plugin that brings its own copy of a shipped package forms the second instance that a restart prevents.
- A profile mapping that resolves to another directory keeps being adopted as a move, so files Node selected through the previous directory load from the current one.

## Alternatives considered

**Stop publishing the alias at profile scope when the installation publishes it.** One entry per name removes the flip. It also removes the record of which manifest declared the name, which anchors native resolution for that package's own dependencies and drives the profile's owned links, so the materializer and HMR's mapped directories would have to change with it. Deciding that one directory and version identify one package belongs in the comparison rule, not in the traversal.

**Record the scope change as a directory move.** `MovedDirectories` relocates files Node selected below a previous directory to the current one. The directory did not change, so there is no relocation to record.

**Keep comparing whole entries.** That is the reported behavior: a difference that no loaded module can observe still costs a restart, and any bundle declaring a pre-rescope name can never be switched on in the running session.

## Testing

| Evidence | Behaviour |
|---|---|
| [profile-resolution.spec.ts](../../../../packages/boot/app-boot/tests/profile-resolution.spec.ts) | A generation without the bundle books the alias as installation-provided and one with it books it as a profile mapping over the same directory and version; both successors publish and still resolve the alias to that directory. A bundle that republishes the alias from another directory is rejected. |
| [package-reload.spec.ts](../../../../packages/boot/plugin-manager/tests/package-reload.spec.ts) | Installing, disabling, enabling, and removing a bundle that declares the pre-rescope name each report `applied`, with the alias moving between the two scopes and the plugin starting and stopping in the same session. |

## Consequences

- A DSH-era bundle installs, enables, disables, and removes without a restart; the plugin runs in the session that changed the profile.
- Two bundles that declare the same alias with different declarers still compare by directory and version, so the entry that wins decides the anchor used to resolve that package's own dependencies. Every anchor of an alias that passes this comparison resolves that package to the same directory.
- The published generation lists a name in both scopes; the entry table keeps the last one, as it did before this change.

## Related

- [Immutable profile resolution generations](../architecture/2026-09-09-profile-resolution-generations.md) owns the publication rule; its additive-changes section states this comparison.
- [Updating installed plugins in place](../architecture/2026-10-18-atomic-plugin-updates.md) owns the profile-mapping move that a reinstallation produces.
