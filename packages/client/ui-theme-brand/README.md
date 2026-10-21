---
description: "QiLin brand color skin for the Web client: alias-token overrides layered over the user's active light or dark palette."
kind: "package-reference"
---

# @qilin-agent/client-ui-theme-brand

English | [中文](README.zh.md)

## Summary

Mount this plugin beside [`ui-theme`](../ui-theme/README.md) to give the QiLin Web surface its own brand colors. The plugin registers one selectable `ctx.theme` skin named `qilin`: the user's `light`, `dark`, or `system` preference and every base token stay untouched, and only the tokens QiLin owns are replaced while the skin is selected. Unloading the plugin restores the platform palette because the registration is a Kylin effect, and the durable skin choice survives its provider so a later load restores the user's pick.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The `qilin` profile mounts this package through its bundle patch, so no configuration is required; the same patch sets `skin: qilin` on the `ui-theme` row, making the Xuanjin palette the product default. The package's node half registers the skin's canvas colors (`#f8f5ee` light, `#0d0b09` dark) with the Host boot registry, so the first paint already uses the skin's background. A deployment that wants another palette with the same base theme ships its own skin provider and selects it through the appearance row; the light/dark/system preference keeps composing underneath. Any user who picks a different registered skin switches away from this one, and the choice persists across restarts.

The palette is the "Xuanjin" dark-gold landing VI in both schemes: the dark values transplant the landing tokens verbatim, the light values derive the warm-paper counterpart ([decision note](../../../.agents/notes/implemented/architecture/2026-09-14-xuanjin-dual-scheme-palette.md)). Fifty-five tokens are grouped by family in [tokens.ts](src/client/tokens.ts): brand gold, surfaces and sidebar, ink labels, hairlines and hovers, the secondary button family, and the code/scrollbar reading surfaces.

| Role | Token | Light | Dark |
|---|---|---|---|
| Accent | `--qilin-alias-brand-primary` | `#8f6f2e` (gold-700) | `#c9a24a` (gold-500) |
| Canvas | `--qilin-alias-bg-base` | `#f8f5ee` (paper) | `#0d0b09` (landing bg) |
| Sidebar | `--qilin-specific-sidebar-fill` | `#f1ece0` | `#0d0b09` |
| Link | `--qilin-alias-link` | `#7d6126` (5.3:1 on paper) | `#f3dc9e` (14.5:1) |
| Seal | `--qilin-specific-brand-seal-fill` | `#c3402f` | `#d4503d` |

Feature components consume these through the `--qilin-alias-*` aliases they already use, so the palette reaches the sidebar, composer, conversation, and deliverables without any component being aware of QiLin. Hover keeps each platform's convention (dark brightens toward gold-300, light deepens toward the link gold), state colors and the ongoing blue stay with the base palettes, and `--qilin-specific-brand-seal-fill` carries the seal's own cinnabar for surfaces that must match the stamp; its two values are stops of the seal gradient in `ui-brand`.

<a id="dev-note"></a>
## Dev Note

None.

<a id="model-experience"></a>
## Model Experience

None, as colors are browser presentation and never enter a model request or the session log.

#### KV Cache effect

None; the theme contributes no prompt text.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Tokens without a current component consumer stay with the base palettes; a future consumer that needs the warm values joins this skin rather than re-deriving them.
- The spec mounts the production theme runtime and a real boot registry, and the bundle spec asserts the product patch sets `skin: qilin`. A browser-rendered assertion for the assembled surface is still manual.
- A skin the user selects but whose provider is disabled keeps the base scheme background for the pre-plugin frame, because the boot registry only knows colors from mounted providers.
