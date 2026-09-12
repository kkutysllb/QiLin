---
description: "The QiLin product layer over the dsh Web surface: a patch bundle that restates the model-facing product identity for QiLin profiles."
kind: "package-bundle"
---

# @deepseek-ai/dsh-qilin-web

English | [中文](README.zh.md)

## Summary

Run the QiLin Web surface with a `qilin` profile whose bundle list stacks this package after [`dsh-web-app`](../web-app/README.md). The package carries no runtime API: its substance is `cordis.patch.yml`, which restates the rows that carry QiLin product identity over the `dsh-web-app` composition. A deployment or user patch layer still replaces every row it declares.

## Table of Contents

- [Use this package](#use-this-package)
- [Model Experience](#model-experience)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Name the package last in a profile's `dsh.profile.bundles` list so its rows win over `dsh-base` and `dsh-web-app`:

```json
{
  "dsh": {
    "profile": {
      "bundles": [
        "@deepseek-ai/dsh-base",
        "@deepseek-ai/dsh-web-app",
        "@deepseek-ai/dsh-qilin-web"
      ]
    }
  }
}
```

The shipped `qilin` profile template already lists those bundles in that order.

## Model Experience

The `system-prompt` row decides the persona text every model request carries. This bundle states QiLin as the product name and keeps the working-directory sentence `dsh-web-app` set, so the model sees one consistent product identity.

## Dev Note

None.
