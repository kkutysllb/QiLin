---
description: "QiLin brand color layer for the Web client: alias-token overrides stacked over the user's active light or dark palette."
kind: "package-reference"
---

# @qilin/client-ui-theme-qilin

English | [中文](README.zh.md)

## Summary

Mount this plugin beside [`ui-theme`](../ui-theme/README.md) to give the QiLin Web surface its own brand colors. The plugin registers one `ctx.theme` override layer: the user's `light`, `dark`, or `system` preference and every base token stay untouched, and only the tokens QiLin owns are replaced. Unloading the plugin restores the covered tokens because the layer is a Cordis effect.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The `qilin` profile mounts this package through its bundle patch, so no configuration is required. A deployment that wants the QiLin palette with a different base theme keeps its own `ui-theme` preference; this layer composes on top of it.

| Token | Light | Dark |
|---|---|---|
| `--dsw-alias-brand-primary` | `#0b7a5a` | `#3fd6a0` |
| `--dsw-specific-sidebar-fill` | `#f1f7f4` | `#0e1a16` |

Feature components consume these through the `--dsw-alias-*` aliases they already use, so the palette reaches the sidebar, composer, conversation, and deliverables without any component being aware of QiLin.

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

- The layer covers brand surfaces only. A complete QiLin palette needs the brand design's full token set, and the sidebar brand artwork is a separate client plugin.
- The shipped spec exercises the production theme runtime and its override stack. A booted-Web-surface assertion for this layer is not in place yet; the assembled-surface check is manual.
