---
description: "Built-in optional bundle that ships dsh-kylin-images switched off and exposes it through the Plugins page."
kind: "package-bundle"
---

# @qilin-agent/kylin-images-bundle

English | [中文](README.zh.md)

## Summary

This bundle carries the Image Studio plugin into the QiLin installation. It owns no runtime code: its only row inserts `dsh-kylin-images`, the dependency that owns the image tools, routes, skills, and settings page. The package declares the display metadata and the `qilin.bundle.patch` the Plugins page reads, so the installation can offer one built-in card without making the feature part of every profile.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Enable the **Image Studio** card on the Plugins page's Built-in tab. The bundle is shipped switched off and never removable; enabling it appends this package to the profile's `qilin.profile.bundles`, which applies `cordis.patch.yml` and mounts the dependency. Disable it to remove the image tools, routes, skills, and the Image Studio settings entry from that profile without uninstalling the package.

## Understand the implementation

The patch has one row, `dsh-kylin-images`, with the plugin's non-sensitive defaults. The dependency's host half registers the `img_*` tools, its loopback routes, and its runtime skills; its client half registers the Image Studio section under Settings. Credentials stay in the plugin's own vault rather than the profile patch.

<a id="model-experience"></a>
## Model Experience

Indirectly, through the shipped `dsh-kylin-images` dependency: enabling the bundle mounts its tools and skills, and that dependency owns every model-visible contribution.

#### KV Cache effect

The mounted contribution changes the request prefix when the switch changes, which can reduce provider-side cache reuse for the next request.

## Known Limitations and Deferred Work

- **The dependency is a versioned npm package** — this bundle pins `dsh-kylin-images`; changing the plugin requires a dependency bump here, not a source copy.
- **The card describes the bundle, not the plugin UI** — enabling is all-or-nothing; the plugin's own Settings section owns model channels and credentials.
- **The dependency requires Node 24** — `dsh-kylin-images` declares Node >=24, so a source checkout running QiLin on Node 22 is outside its supported runtime.

<a id="dev-note"></a>
### Dev Note

The wrapper keeps QiLin's package metadata and admission lists independent from the third-party package manifest while reusing its host and client halves unchanged.
