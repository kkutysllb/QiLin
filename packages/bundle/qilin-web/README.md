---
description: "The QiLin product layer over the qilin Web surface: a patch bundle that restates the model-facing product identity for QiLin profiles."
kind: "package-bundle"
---

# @qilin/qilin-web

English | [中文](README.zh.md)

## Summary

Run the QiLin Web surface with a `qilin` profile whose bundle list stacks this package after [`qilin-web-app`](../web-app/README.md). The package carries no runtime API: its substance is `cordis.patch.yml`, which restates the rows that carry QiLin product identity over the `qilin-web-app` composition. A deployment or user patch layer still replaces every row it declares.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Name the package last in a profile's `qilin.profile.bundles` list so its rows win over `qilin-base` and `qilin-web-app`:

```json
{
  "qilin": {
    "profile": {
      "bundles": [
        "@qilin/base",
        "@qilin/web-app",
        "@qilin/qilin-web"
      ]
    }
  }
}
```

The shipped `qilin` profile template lists those bundles in that order, and `qilin qilin` boots it.

<a id="dev-note"></a>
## Dev Note

None.

<a id="model-experience"></a>
## Model Experience

### Product identity

#### What the model sees

The `system-prompt` row contributes the QiLin product identity and the working-directory sentence `qilin-web-app`, so every QiLin session request carries one product identity.

#### Token effect

One identity paragraph per session; constant per process.

#### KV Cache effect

The identity section follows first-party reusable instructions, so a different working-directory path leaves the preceding prefix unchanged.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The layer restates product identity only. QiLin-branded client presentation — the sidebar brand artwork, composer, message rendering, and deliverables surfaces — is not part of this bundle yet, so a QiLin profile renders the `qilin-web-app` presentation under QiLin identity.
