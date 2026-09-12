---
description: "QiLin 在 Web 客户端上的品牌配色层：以别名令牌覆盖叠加在用户当前浅色或深色配色之上。"
kind: "package-reference"
---

# @qilin/client-ui-theme-qilin

[English](README.md) | 中文

## 概述

把本插件挂在 [`ui-theme`](../ui-theme/README.md) 旁边，即可让 QiLin Web 表面拥有自己的品牌配色。插件注册一个 `ctx.theme` 覆盖层：用户的 `light`、`dark` 或 `system` 偏好与全部基础令牌保持不变，只替换 QiLin 拥有的令牌。由于该层是 Cordis effect，卸载插件即恢复被覆盖的令牌。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

`qilin` profile 通过其 bundle 补丁挂载本包，无需配置。若部署方希望保留其他基础主题并使用 QiLin 配色，保留自己的 `ui-theme` 偏好即可；本层叠加在其上。

| 令牌 | 浅色 | 深色 |
|---|---|---|
| `--dsw-alias-brand-primary` | `#0b7a5a` | `#3fd6a0` |
| `--dsw-specific-sidebar-fill` | `#f1f7f4` | `#0e1a16` |

功能组件通过既有的 `--dsw-alias-*` 别名消费这些令牌，因此配色可到达侧边栏、输入框、会话与交付物，而任何组件都无需感知 QiLin。

<a id="model-experience"></a>
## 模型体验

无。颜色属于浏览器呈现，不进入模型请求或会话日志。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办

- 本层只覆盖品牌表面。完整的 QiLin 配色需要品牌设计给出的完整令牌集，侧边栏品牌美术字是另一个客户端插件。
- 随附规格跑在生产主题运行时及其覆盖栈上。针对本层的启动后 Web 表面断言尚未建立，组装面的检查目前为手工执行。

<a id="dev-note"></a>
## 开发备注

无。
