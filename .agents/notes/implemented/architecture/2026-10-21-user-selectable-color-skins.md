# Agent Note: User-selectable color skins as a second palette axis

Status: implemented

English | [中文](2026-10-21-user-selectable-color-skins.zh.md)

## Problem

QiLin shipped exactly one brand palette and applied it unconditionally: `ui-theme-brand` called `ctx.theme.overrideTokens` on load, so every profile that mounted the package was repainted whether or not the user wanted it. The only user choice was `light`, `dark`, or `system`.

Adding palettes had no correct home. A second brand package that also overrode tokens would stack in plugin-load order with no way to un-select a palette, and reusing `ctx.theme.register()`/`setTheme()` was worse: a `ThemeDefinition` carries a fixed `colorScheme`, and only the three built-in preferences cross the settings schema, so a custom id was process-local and reset on reload.

## Decision

**A skin is a separate axis from the light/dark preference.** `ThemeSkin` is `{ id, label, tokens }`; `ThemeRuntime.registerSkin` and `setSkin` own it, and the durable choice lives in a new `skin` field of the `ui-theme` namespace instead of `preference`. Every token states both palette modes, so one skin composes with whichever scheme the user picked.

**Composition order is scheme palette, then skin, then explicit override layers.** A skin is always the lowest overlay; `overrideTokens` layers keep winning, so a deployment that forces tokens is not defeated by a user's choice. Without a skin or layers the active definition passes through by identity, which the runtime spec pins.

**Disposal keeps the durable selection.** Disposing a provider removes its registration and republishes; an unregistered selection resolves to the platform palette while the persisted id stays, so re-enabling the plugin restores the user's pick. Only `setSkin` writes the field, the same single-write-entry rule as `setTheme` and the font setters.

**Labels are provider-owned localized text.** `label` is `LocalizedText`, resolved through the active language chain when the row mirror syncs and re-resolved when the language changes, so product names never become copy ui-theme has to own.

**A skin's node half supplies its pre-plugin canvas colors.** `ui-theme` provides a Host `themeBoot` registry; a provider registers its light and dark background there, and the index render paints the selected skin's canvas before any browser plugin loads. A selection whose provider is disabled falls back to the platform canvas, which the existing bootstrap colors already state.

**The appearance row lists registered skins only when two or more exist.** A single skin is the product's own palette, so there is nothing to choose and the row stays out. QiLin keeps today's visuals by setting `skin: qilin` on the `ui-theme` row in the [web-brand patch](../../../../packages/bundle/web-brand/cordis.patch.yml), which builds on the setting's schema default rather than on a code path.

## Verification

`pnpm run test:gui` covers registration, selection, persistence, the unregistered-provider fallback, layering under an explicit override, inspection, the row's hidden/shown states, and label re-resolution; per-file coverage stays at the 100% gate for both theme packages. The brand spec re-pins the Xuanjin tokens through registration and unload, and the appearance-row spec proves the chip row's selection and write path. `pnpm run typecheck` and `QILIN_SNAPSHOT=replay pnpm run test:web` cover the client tree and the replayed browser scenarios.

## Alternatives considered

**Reuse `register()` and `setTheme()` with one id per skin.** The theme axis carries `colorScheme` and only built-in preferences persist, so the choice would reset on reload and every skin would need light and dark variants as separate ids.

**Stack one override layer per skin in registration order.** The user could never un-select a palette, and which colors win would depend on plugin load order rather than on the stored choice.

**Persist the skin in a namespace owned by each provider.** The appearance row would have to read every provider's namespace, and the choice would disappear with the provider instead of surviving a disable.

**Make the skin a build-time product choice with one bundle per product.** That answers a different requirement: different installers with fixed palettes. It cannot give one product several selectable palettes, and the product default is already expressible as one patch row.

## Consequences

- The settings surface gains a chip row once a composition registers two or more skins; QiLin, with one skin, is unchanged until another skin ships.
- First paint follows the selected skin when its provider is mounted; a skin selected while its provider is disabled paints the base scheme background for that frame.
- Third-party theme ids stay an in-process extension; skins are the axis that persists.
