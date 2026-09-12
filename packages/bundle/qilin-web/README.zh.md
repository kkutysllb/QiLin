---
description: "QiLin 在 dsh Web 表面之上的产品层：一个补丁 bundle，为 qilin profile 重述模型可见的产品身份。"
kind: "package-bundle"
---

# @deepseek-ai/dsh-qilin-web

[English](README.md) | 中文

## 摘要

用 `qilin` profile 运行 QiLin Web 表面，其 bundle 列表把本包叠加在 [`dsh-web-app`](../web-app/README.md) 之后。本包不含运行时 API：其实质是 `cordis.patch.yml`，在 `dsh-web-app` 组合之上重述承载 QiLin 产品身份的行。部署层或用户补丁层仍可替换它声明的每一行。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [开发说明](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把本包放在 profile 的 `dsh.profile.bundles` 列表最后，使其行覆盖 `dsh-base` 与 `dsh-web-app`：

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

随附的 `qilin` profile 模板已按该顺序列出这些 bundle。

## 模型体验

`system-prompt` 行决定每个模型请求携带的人格文本。本 bundle 将产品名声明为 QiLin，并保留 `dsh-web-app` 设定的工作目录语句，使模型看到一致的产品身份。

## 开发说明

无。
