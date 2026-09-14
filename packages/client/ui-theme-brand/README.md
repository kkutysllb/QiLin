---
description: "QiLin brand color layer for the Web client: alias-token overrides stacked over the user's active light or dark palette."
kind: "package-reference"
---

# @qilin/client-ui-theme-brand

English | [中文](README.zh.md)

## Summary

Mount this plugin beside [`ui-theme`](../ui-theme/README.md) to give the QiLin Web surface its own brand colors. The plugin registers one `ctx.theme` override layer: the user's `light`, `dark`, or `system` preference and every base token stay untouched, and only the tokens QiLin owns are replaced. Unloading the plugin restores the covered tokens because the layer is a Kylin effect.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The `qilin` profile mounts this package through its bundle patch, so no configuration is required. A deployment that wants the QiLin palette with a different base theme keeps its own `ui-theme` preference; this layer composes on top of it.

The palette is the "Xuanjin" dark-gold landing VI in both schemes: the dark values transplant the landing tokens verbatim, the light values derive the warm-paper counterpart ([decision note](../../../../.agents/notes/implemented/architecture/2026-09-14-xuanjin-dual-scheme-palette.md)). Fifty-five tokens are grouped by family in [tokens.ts](src/client/tokens.ts): brand gold, surfaces and sidebar, ink labels, hairlines and hovers, the secondary button family, and the code/scrollbar reading surfaces.

| Role | Token | Light | Dark |
|---|---|---|---|
| Accent | `--dsw-alias-brand-primary` | `#8f6f2e` (gold-700) | `#c9a24a` (gold-500) |
| Canvas | `--dsw-alias-bg-base` | `#f8f5ee` (paper) | `#0d0b09` (landing bg) |
| Sidebar | `--dsw-specific-sidebar-fill` | `#f1ece0` | `#0d0b09` |
| Link | `--dsw-alias-link` | `#7d6126` (5.3:1 on paper) | `#f3dc9e` (14.5:1) |
| Seal | `--dsw-specific-brand-seal-fill` | `#c3402f` | `#d4503d` |

Feature components consume these through the `--dsw-alias-*` aliases they already use, so the palette reaches the sidebar, composer, conversation, and deliverables without any component being aware of QiLin. Hover keeps each platform's convention (dark brightens toward gold-300, light deepens toward the link gold), state colors and the ongoing blue stay with the base palettes, and `--dsw-specific-brand-seal-fill` carries the seal's own cinnabar for surfaces that must match the stamp; its two values are stops of the seal gradient in `ui-brand`.

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

- Tokens without a current component consumer stay with the base palettes; a future consumer that needs the warm values joins this layer rather than re-deriving them.
- The shipped spec exercises the production theme runtime and its override stack. A booted-Web-surface assertion for this layer is not in place yet; the assembled-surface check is manual.

**Runtime invariant:** No companion is published. The theme runtime that owns the override stack is the observed authority; this layer only contributes entries to it.
