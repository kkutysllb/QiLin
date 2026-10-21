---
description: "QiLin 在 Web 客户端上的品牌配色包：以别名令牌覆盖叠加在用户当前浅色或深色配色之上。"
kind: "package-reference"
---

# @qilin-agent/client-ui-theme-brand

[English](README.md) | 中文

## 概述

把本插件挂在 [`ui-theme`](../ui-theme/README.zh.md) 旁边，即可让 QiLin Web 表面拥有自己的品牌配色。插件注册一个名为 `qilin` 的可选 `ctx.theme` 配色包：用户的 `light`、`dark` 或 `system` 偏好与全部基础令牌保持不变，选中该包时才替换 QiLin 拥有的令牌。由于注册是 Kylin effect，卸载插件即恢复平台调色板，而持久的配色选择会随提供方一并保留，下次加载再恢复用户的选择。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

`qilin` profile 通过其 bundle 补丁挂载本包，无需配置；同一补丁给 `ui-theme` 行设下 `skin: qilin`，使玄金配色成为产品默认。若部署方希望在同一基础主题上使用其他配色，自带一个配色包提供方并在外观行选中即可，浅色/深色/跟随系统偏好仍在其下叠加。用户改选其他已注册配色包即离开本包，选择跨重启持久化。

配色为「玄金」暗金 landing VI 的双 scheme 版本：深色值逐字移植 landing 令牌，浅色值推导暖纸对应版（[决策笔记](../../../.agents/notes/implemented/architecture/2026-09-14-xuanjin-dual-scheme-palette.zh.md)）。[tokens.ts](src/client/tokens.ts) 按族分组覆盖五十五个令牌：品牌金、表面与侧栏、墨阶文字、细线与悬停、次级按钮族、代码与滚动条阅读面。

| 角色 | 令牌 | 浅色 | 深色 |
|---|---|---|---|
| 强调色 | `--qilin-alias-brand-primary` | `#8f6f2e`（gold-700） | `#c9a24a`（gold-500） |
| 画布 | `--qilin-alias-bg-base` | `#f8f5ee`（纸白） | `#0d0b09`（landing 底色） |
| 侧栏 | `--qilin-specific-sidebar-fill` | `#f1ece0` | `#0d0b09` |
| 链接 | `--qilin-alias-link` | `#7d6126`（纸面 5.3:1） | `#f3dc9e`（14.5:1） |
| 印章 | `--qilin-specific-brand-seal-fill` | `#c3402f` | `#d4503d` |

功能组件通过既有的 `--qilin-alias-*` 别名消费这些令牌，因此配色可到达侧边栏、输入框、会话与交付物，而任何组件都无需感知 QiLin。悬停遵循各平台惯例（深色向 gold-300 变亮，浅色向链接金加深），状态色与进行中蓝保留基础配色，`--qilin-specific-brand-seal-fill` 则为需要与印记一致的表面携带印章自身的朱砂；它的两个取值都是 `ui-brand` 中印章渐变的色标。

<a id="dev-note"></a>
## 开发备注

无。

<a id="model-experience"></a>
## 模型体验

无；颜色属于浏览器呈现，不进入模型请求或会话日志。

#### KV Cache 影响

无；主题不贡献任何提示文本。

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>

- 无当前组件消费者的令牌留在基础配色；未来需要暖色值的消费者应并入本包，而不是重新推导。
- 随附规格跑在生产主题运行时及其配色包注册表上。针对本包的启动后 Web 表面断言尚未建立，组装面的检查目前为手工执行。
- 插件前引导先按明暗方案绘制基础底色，配色包提供方注册后才生效，因此页面加载可能先显示一帧平台纸色再切到本配色。
