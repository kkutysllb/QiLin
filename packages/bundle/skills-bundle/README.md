---
description: "Built-in optional bundle that ships dsh-skills-bundle switched off and exposes it through the Plugins page."
kind: "package-bundle"
---

# @qilin-agent/skills-bundle

English | [中文](README.zh.md)

## Summary

This bundle carries the methodology skill pack into the QiLin installation. It owns no runtime code: its only row inserts `dsh-skills-bundle`, which registers 31 core runtime skills on activation and exposes 40 optional long-tail skills through its settings section. The package supplies the card metadata and `qilin.bundle.patch`; the Plugins page offers one built-in switch instead of requiring a separate install.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Enable the **Methodology skills** card on the Plugins page's Built-in tab. The bundle is shipped switched off and never removable; enabling it appends this package to the profile's `qilin.profile.bundles`, which applies `cordis.patch.yml` and mounts the dependency. The 31 core skills register immediately; open Settings → **Optional Skills** to turn the 40 long-tail skills on or off per profile. Disable the bundle to remove both batches and the settings section from later sessions.

## Understand the implementation

The patch has one row, `kcoder-skills`, targeting `dsh-skills-bundle`. The dependency reads its packaged `skills/manifest.json`, registers core skills with their resource directories, and serves a loopback-only catalog/set-enabled API for the settings section. The optional set persists in the plugin's own data directory, not in the profile patch.

<a id="model-experience"></a>
## Model Experience

Indirectly, through the shipped `dsh-skills-bundle` dependency: enabling the bundle registers its core skills, and the dependency owns every model-visible skill description and body.

#### KV Cache effect

Adding or removing skills changes the assembled skill surface and request prefix, which can reduce provider-side cache reuse for the next request.

## Known Limitations and Deferred Work

- **The dependency is a versioned npm package** — this bundle pins `dsh-skills-bundle`; upgrading the skill pack requires a dependency bump here.
- **Core skills are all-or-nothing** — the card enables or disables the whole pack; individual choices exist only for the optional long-tail batch.
- **The settings section owns optional state** — enabling a long-tail skill changes the plugin's own persisted set, not the profile's bundle list.

<a id="dev-note"></a>
### Dev Note

The wrapper keeps QiLin's card metadata and admission lists independent from the upstream package manifest while reusing its host and client halves unchanged.
