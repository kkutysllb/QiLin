---
description: "Built-in optional bundle that ships dsh-animations switched off and exposes it through the Plugins page."
kind: "package-bundle"
---

# @qilin-agent/animations-bundle

English | [中文](README.zh.md)

## Summary

This bundle carries the Animation Studio skill pack into the QiLin installation. It owns no runtime code: its only row inserts `dsh-animations`, the dependency that registers eight HTML animation skills and one system-prompt capability notice. The package supplies the card metadata and `qilin.bundle.patch`; the Plugins page offers one built-in switch instead of requiring an install.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Enable the **Animation Studio** card on the Plugins page's Built-in tab. The bundle is shipped switched off and never removable; enabling it appends this package to the profile's `qilin.profile.bundles`, which applies `cordis.patch.yml` and mounts the dependency. Disabling it removes the eight runtime skills and the capability notice from later sessions.

## Understand the implementation

The patch has one row, `dsh-animations`, with `announceToAgent: true`. The dependency reads its packaged `skills/manifest.json`, registers each skill with its own resource directory, and adds the routing notice to the system prompt. It has no client half.

<a id="model-experience"></a>
## Model Experience

Indirectly, through the shipped `dsh-animations` dependency: enabling the bundle mounts its skills and routing notice, and that dependency owns every model-visible contribution.

#### KV Cache effect

The skill catalog and prompt notice change the request prefix when the switch changes, which can reduce provider-side cache reuse for the next request.

## Known Limitations and Deferred Work

- **The dependency is a versioned npm package** — this bundle pins `dsh-animations`; upgrading the skill pack requires a dependency bump here.
- **All eight skills ship together** — the card is one switch, so a profile cannot select an individual animation skill.

<a id="dev-note"></a>
### Dev Note

The wrapper keeps QiLin's card metadata and admission lists independent from the upstream package manifest while reusing its host half unchanged.
