---
description: "QiLin occupants for the Web client sidebar and conversation-hero brand slots: the 麒麟 seal mark, drawn from embedded outlines."
kind: "package-reference"
---

# @qilin/client-ui-brand-qilin

English | [中文](README.zh.md)

## Summary

Mount this plugin beside [`ui-sidebar`](../ui-sidebar/README.md) and [`ui-conversation`](../ui-conversation/README.md) to replace the generic brand fallbacks with the QiLin seal: a rounded-square frame carrying 麒 above 麟. The seal is vector artwork embedded as path data, so it carries no runtime font dependency, and it inherits `currentColor` from whichever surface renders it. The sidebar brand name keeps the shell's own fallback, so the product label and its build-version badge stay owned by the shell.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The `qilin` profile mounts this package through its bundle patch, so no configuration is required. The plugin waits for both slot declarations before it occupies either, and unloading it restores the shell fallbacks.

| Slot | Occupant |
|---|---|
| `sidebar.brand.mark` | the seal at the sidebar's requested size |
| `conversation.hero.brand.mark` | the seal at the hero's requested size and placement class |

The two character outlines in [`glyphs.ts`](src/client/glyphs.ts) were extracted once from a system CJK face and normalized to a unit box; the component composes them into the frame at render time.

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
- The mark is monochrome: it inherits `currentColor` instead of carrying a vermilion seal field, so a colored seal would need a theme-token decision.
- No browser-level assertion covers these slots yet; the shipped spec exercises the slot registry, and the assembled-surface check is manual.

**Runtime invariant:** No companion is published. The seal component holds no durable state that two independent observations could disagree about.
