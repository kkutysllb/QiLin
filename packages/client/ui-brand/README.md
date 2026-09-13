---
description: "QiLin occupants for the Web client sidebar, conversation-hero, and settings brand slots: the cinnabar 麒麟 seal stamp, drawn from embedded outlines."
kind: "package-reference"
---

# @qilin/client-ui-brand

English | [中文](README.zh.md)

## Summary

Mount this plugin beside [`ui-sidebar`](../ui-sidebar/README.md), [`ui-conversation`](../ui-conversation/README.md), and [`ui-settings-general`](../ui-settings-general/README.md) to replace generic fallbacks with the QiLin seal: a cinnabar rounded square, gold ring, and warm-white 麒 and 麟 outlines. The embedded SVG needs no font and keeps the stamp legible on light and dark surfaces. The sidebar name and version badge remain shell-owned; the settings About page receives the same seal through a root-scoped slot.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The `qilin` profile mounts this package through its bundle patch, so no configuration is required. The plugin waits for each declaring chain before it occupies its paired slots, and unloading it restores the shell fallbacks. The settings marks are registered independently from the sidebar and conversation hero chain.

| Slot | Occupant |
|---|---|
| `sidebar.brand.mark` | the seal at the sidebar's requested size |
| `conversation.hero.brand.mark` | the seal at the hero's requested size and placement class |
| `settings.about.mark` | the seal in the shell-owned About page |

The two character outlines in [`glyphs.ts`](src/client/glyphs.ts) were extracted once from a system CJK face and normalized to a unit box; [`seal-geometry.ts`](src/client/seal-geometry.ts) holds the body, ring, and glyph-cell geometry, and [`Seal.tsx`](src/client/Seal.tsx) composes them at render time into one SVG with its own gradient id per instance.

<a id="dev-note"></a>
## Dev Note

None.

<a id="model-experience"></a>
## Model Experience

None, as the seal is browser presentation and never enters a model request or the session log.

#### KV Cache effect

None; the seal contributes no prompt text.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The seal is authored from a text-face outline, not from a designer's seal-script drawing. A commissioned 篆书 mark would replace the two path constants without touching the component.
- The seal's body gradient, glyph fill, and ring colour are fixed constants rather than theme tokens: the brand stamp must read identically on a light and a dark surface, so a themed variant needs a deliberate second artwork instead of a token swap.
- No browser-level assertion covers the fully assembled settings surface yet; the shipped specs exercise the slot registry, mark rendering, and the settings shell separately.

**Runtime invariant:** No companion is published. The seal component holds no durable state that two independent observations could disagree about.
