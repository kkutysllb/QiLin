---
description: "QiLin 在 dsh Web 表面之上的产品层：一个补丁 bundle，为 qilin profile 重述模型可见的产品身份。"
kind: "package-bundle"
---

# @qilin/qilin-web

[English](README.md) | 中文

## 摘要

用 `qilin` profile 运行 QiLin Web 表面，其 bundle 列表把本包叠加在 [`dsh-web-app`](../web-app/README.md) 之后。本包不含运行时 API：其实质是 `cordis.patch.yml`，在 `dsh-web-app` 组合之上重述承载 QiLin 产品身份的行。部署层或用户补丁层仍可替换它声明的每一行。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

把本包放在 profile 的 `dsh.profile.bundles` 列表最后，使其行覆盖 `dsh-base` 与 `dsh-web-app`：

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

随附的 `qilin` profile 模板按该顺序列出这些 bundle，`dsh qilin` 即启动它。

<a id="model-experience"></a>
## 模型体验

`system-prompt` 行决定每个模型请求携带的人格文本。本 bundle 将产品名声明为 QiLin，并保留 `dsh-web-app` 设定的工作目录语句，使 QiLin 会话中每个模型请求都收到同一产品身份。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办

- 本层只重述产品身份。QiLin 品牌的客户端呈现——侧边栏品牌美术字、输入框、消息渲染与交付物界面——尚未纳入本 bundle，因此 qilin profile 目前以 QiLin 身份渲染 `dsh-web-app` 的呈现。

<a id="dev-note"></a>
## 开发说明

无。
