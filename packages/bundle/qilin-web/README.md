---
description: "The QiLin product layer over the dsh Web surface: a patch bundle that restates the model-facing product identity for QiLin profiles."
kind: "package-bundle"
---

# @qilin/qilin-web

English | [中文](README.zh.md)

## Summary

Run the QiLin Web surface with a `qilin` profile whose bundle list stacks this package after [`dsh-web-app`](../web-app/README.md). The package carries no runtime API: its substance is `cordis.patch.yml`, which restates the rows that carry QiLin product identity over the `dsh-web-app` composition. A deployment or user patch layer still replaces every row it declares.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Name the package last in a profile's `dsh.profile.bundles` list so its rows win over `dsh-base` and `dsh-web-app`:

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

The shipped `qilin` profile template lists those bundles in that order, and `dsh qilin` boots it.

<a id="model-experience"></a>
## Model Experience

The `system-prompt` row decides the persona text every model request carries. This bundle names QiLin as the product and keeps the working-directory sentence `dsh-web-app` set, so one product identity reaches the model in every QiLin session.

<a id="known-limitations-and-deferred-work"></a>
## Known Limitations and Deferred Work

- The layer restates product identity only. QiLin-branded client presentation — the sidebar brand artwork, composer, message rendering, and deliverables surfaces — is not part of this bundle yet, so a QiLin profile renders the `dsh-web-app` presentation under QiLin identity.

<a id="dev-note"></a>
## Dev Note

None.
