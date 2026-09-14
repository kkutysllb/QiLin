# Agent Note: QiLin brand surfaces and the single Settings entry point

Status: implemented

English | [中文](2026-09-13-qilin-brand-surfaces-and-settings-entry-point.zh.md)

## Problem

Six defects in how the QiLin Web GUI presents its own identity.

The build-version chip never appeared beside the product name, from two independent causes. The chip was absolutely positioned against the seal mark's 24px box with a negative top offset, and the brand button clips its overflow, so the chip was cut off by the row it hung outside of; and the artifacts the running GUI served had been produced without the build-environment injection, so `process.env.QILIN_CLIENT_VERSION` compiled to `undefined` and the chip's own guard rendered nothing at all. Fixing either cause alone still shows no usable chip.

The account control at the sidebar foot was a bare 32px glyph pinned to the column's right edge. It carried no identity of the account it opened, and the alignment made it read as a stray icon rather than the footer's own account row.

The sidebar foot carried two Settings affordances. The account menu owns a Settings row, and [ui-settings-general](../../../../packages/client/ui-settings-general/README.md) additionally drew a bottom-pinned trigger row of its own below it — the entry point the [accounts and landing migration](../feature/2026-09-12-qilin-local-accounts-and-landing.md) already moved into the account menu. Two entry points to one panel is a composition leftover, not a feature.

Both palettes resolved the sidebar to a brand tint: `#0e1a16` on dark, which read as dark green beside a neutral near-black centre, and `#f1f7f4` on light, which read as pale green on a white surface.

The settings page's navigation rail was fixed at 188px. The main window's sidebar has a pointer-drag handle; the settings rail had none, so a reader with long section labels could not widen it.

The running-turn status line shimmered in vendor blue and read `深度求索中...` / `Deep diving...`. The label named the model vendor rather than the product it belongs to, and its blue matched neither the seal nor any other part of the brand.

## Decision

**The version chip is an in-flow superscript of the wordmark it names.** [SidebarRoot.tsx](../../../../packages/client/ui-sidebar/src/client/SidebarRoot.tsx) renders the chip as a sibling of the `sidebar.brand.name` occupant inside `.brandName`, and [SidebarRoot.module.css](../../../../packages/client/ui-sidebar/src/client/SidebarRoot.module.css) gives it `align-self: flex-start` with a 1px top offset inside that flex row. It holds no absolute positioning, so the brand button's `overflow: hidden` has nothing to clip. The chip shows the bare version and keeps the full `version[-commit][-dirty]` string as its tooltip.

**The build metadata the chip reads is a property of the complete build.** `pnpm run build` resolves the public client environment from the repository (`QILIN_CLIENT_VERSION` from `package.json`, the short commit, and a dirty marker) and hands it to every bundler stage, so a complete build inlines it and the chip renders. A package-level bundler invocation that bypasses [build.ts](../../../../scripts/build.ts) embeds no metadata and correctly renders no chip; the artifact is incomplete rather than the chip being broken.

**The account control is the footer's account row.** [AccountMenu.tsx](../../../../packages/client/ui-account/src/client/AccountMenu.tsx) renders a full-width row: a 22px avatar carrying the signed-in address's first letter, then the address itself, both inside the row's own hover box. The wide row is named by the account it shows, so voice control can address it by the visible text; with no identity known the row falls back to the localized account label and the avatar to a user glyph. The collapsed rail keeps a 36px round control holding the avatar alone and names it with that label.

**The account menu is the only Settings entry point.** [ui-settings-general](../../../../packages/client/ui-settings-general/src/client/index.ts) no longer declares a `settings.trigger` child slot and no longer registers trigger content; [chrome.tsx](../../../../packages/client/ui-settings-general/src/client/chrome.tsx) keeps only the panel title and close label. `sidebar.settings` still mounts the panel and the connection-recovery row, so the seat survives as the panel's mount point while the visible entry point lives with the account. The shell renders that recovery row only while the panel is closed and only in the wide column, because the collapsed rail has no room for it.

**The sidebar joins the surface family of each palette.** `--dsw-specific-sidebar-fill` resolves with the canvas family of the active scheme — originally the platform neutrals (`#ffffff` light, `#0f0f0f` dark), and since the [Xuanjin dual-scheme palette](../architecture/2026-09-14-xuanjin-dual-scheme-palette.md) the warm VI fills (`#f1ece0` light, `#0d0b09` dark) — so the column reads as part of the same surface as the centre instead of as a tinted panel. The brand color stays with the seal, the accent token, and the status label.

**The settings navigation rail is pointer-resizable.** `SettingsPanel` seeds the rail at 188px and renders a vertical `role="separator"` on its right edge. The handle captures the pointer, reports rAF-throttled absolute widths computed from the drag-start origin, and clamps to 160–360px; the accessible name comes from the `settings` locale namespace. Width is the occupant's own viewing state, so it resets when the panel unmounts and never reaches the settings document.

**The running-turn label is product-branded and carries the seal's cinnabar.** The `chat.deepDiving` copy reads `QiLin...` in both locales, and `.turnStatus` colors it with `--dsw-specific-brand-seal-fill` instead of the gradient text-clip shimmer, which the stylesheet drops along with its keyframes.

**The seal color is one theme token with the seal as its source.** [tokens.ts](../../../../packages/client/ui-theme-brand/src/client/tokens.ts) adds `--dsw-specific-brand-seal-fill` to the QiLin override layer. Its two values are stops of the seal body gradient in [Seal.tsx](../../../../packages/client/ui-brand/src/client/Seal.tsx) — the mid stop for light surfaces and the lit upper stop for dark ones, each clearing 4.5:1 against the surface it renders on. The seal keeps its own literals because it is a brand stamp rather than a themed icon, and a spec reads that source to prove the token still mirrors it.

## Alternatives considered

**Keep the chip absolutely positioned and only widen the box that holds it.** The chip is what overflows the row; widening the seal mark or the wordmark does not move the clip boundary of the button that owns `overflow: hidden`. An in-flow chip has no negative offset to clip and no glyph to cover.

**Widen the brand button so the absolutely positioned chip stops being clipped.** The clipping is a symptom of placing the chip outside the row; the button's `overflow: hidden` exists to contain the wordmark during the collapse crossfade and is not the defect.

**Keep the bare glyph and only move it to the left edge.** Alignment was half the complaint; the other half is that the control named no account. A row that shows the address also removes the need for a tooltip in the wide column.

**Make the chip tolerate a missing build environment by falling back to a placeholder.** A chip that reports a version the artifact does not carry is worse than no chip: it would print a repository version that need not match the bytes the browser runs. The build record and `verify-client-build-record` already treat a metadata-less artifact as incomplete.

**Keep a Settings button beside the account row.** It duplicates the account menu's own row, and the two disagree the moment one grows a section deep-link. One owner for the entry point keeps the open path single.

**Keep the brand tint on the sidebar as differentiation.** The brand color is carried by the seal, the accent token, and now the status label and the avatar; the sidebar is a large surface whose job is to recede, which a neutral fill does and a tint does not.

**Put the settings rail width in a declared store or the settings document.** Rail width is viewing state for one mounted panel: it survives neither a reload nor a section change, and no other entry reads it. A declared store would outlive the panel it describes, and the settings document is for durable preferences the host owns.

**Derive the nav width from the pointer's absolute `clientX`.** The rail's origin moves with the window, so a drag that begins after a window resize would jump. The handle reports an origin-relative width instead.

**Hardcode the seal cinnabar in the chat stylesheet.** Literal colors belong to the token layer, and the status label must follow the seal if the seal ever changes. A token also lets the two palette modes pick different stops of the same gradient.

**Keep the shimmer and change only the words.** The shimmer's gradient is vendor blue; the request was a label in the seal's color, and a solid fill is what "same color as the seal" can mean.

## Consequences

A build that skips `build.ts` now visibly lacks the version chip, which makes the incomplete-artifact state legible in the product instead of silent. The GUI still serves whatever artifacts were last built, so the chip appears only after a complete `pnpm run build`.

`settings.trigger` is gone from the settings slot map, from the shell's child declarations, and from the generated client slot catalog, so a package that contributed trigger content would fail at load rather than render into a seat nobody paints. The slot map, the shell spec, the apply spec, the chrome spec, the sidebar README, the settings READMEs, and the subsystem slot tree all move with it.

The settings rail's width is unpersisted: a reader who widens it loses the width when the panel closes. That is the deliberate trade for keeping the width out of the settings document; a durable preference would need a host-owned field and a settings row of its own.

`--dsw-specific-brand-seal-fill` is override-only: the platform palette does not define it, so a bundle without `ui-theme-brand` leaves the running-turn label inheriting its surrounding label color. The `qilin` profile mounts the brand bundle, so the shipped GUI resolves the token.

Coverage: the sidebar suite pins the chip as an in-flow flex item of the wordmark row and updates the two expanded-column snapshots; the account suite pins the wide row's account name and avatar letter, the no-identity fallback, the rail's icon-only shape and accessible name, and the footer row's own geometry; the brand-token suite pins both seal values against the seal source and asserts the sidebar fills of the active palette layer (originally the platform neutrals, later the Xuanjin VI fills); the settings-root suite pins the absence of a second Settings button, the open channel, and a pointer-resize gesture that moves the rail from 188px to 248px; the chat suite pins the `QiLin...` copy and the status token, and the web replay fixtures carry the new label.
