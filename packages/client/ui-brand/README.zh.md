---
description: "QiLin 在 Web 客户端侧边栏、会话 hero 与设置品牌槽位的占位实现：由内嵌轮廓绘制的朱红麒麟印章。"
kind: "package-reference"
---

# @qilin/client-ui-brand

[English](README.md) | 中文

## 概述

把本插件挂在 [`ui-sidebar`](../ui-sidebar/README.zh.md)、[`ui-conversation`](../ui-conversation/README.zh.md) 与 [`ui-settings-general`](../ui-settings-general/README.zh.md) 旁边，即可用麒麟印章替换通用回退：朱红圆角方框、金色圆环，以及暖白色并排的麒与麟轮廓。内嵌 SVG 无需字体，在浅色与深色表面保持清晰。侧边栏品牌名与版本徽章仍由外壳拥有；设置 About 页面与桌面摘要卡通过根作用域槽位收到同一枚印章。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

`qilin` profile 通过其 bundle 补丁挂载本包，无需配置。插件会等待每条声明链就绪后再占用对应的一组槽位，卸载后恢复外壳回退。设置标识链独立于侧边栏与会话 hero 链。

| 槽位 | 占用内容 |
|---|---|
| `sidebar.brand.mark` | 按侧边栏请求尺寸渲染的印章 |
| `conversation.hero.brand.mark` | 按 hero 请求尺寸与摆放类渲染的印章 |
| `settings.about.mark` | 外壳 About 页面中的印章 |

[`glyphs.ts`](src/client/glyphs.ts) 中的两个字形轮廓取自系统 CJK 字体并归一化到单位框；[`seal-geometry.ts`](src/client/seal-geometry.ts) 持有印身、圆环与字形格子的几何，[`Seal.tsx`](src/client/Seal.tsx) 在渲染时把它们组合成一个 SVG，并为每个实例生成独立的渐变 id。

<a id="dev-note"></a>
## 开发备注

无。

<a id="model-experience"></a>
## 模型体验

无；印章属于浏览器呈现，不进入模型请求或会话日志。

#### KV Cache 影响

无；印章不贡献任何提示文本。

## 已知限制与待办

<a id="known-limitations-and-deferred-work"></a>

- 印章取自正文字体轮廓，而非设计师的篆书稿。委托绘制的篆书标记只需替换两个路径常量，无需改动组件。
- 印身渐变、字形填充与圆环颜色是固定常量而非主题令牌：品牌印章必须在浅色与深色表面上读起来一致，因此主题化变体需要一份刻意的第二版图形，而不是替换令牌。
- 完整组装的设置表层尚无浏览器级断言；随附规格分别覆盖槽位注册、标识渲染和设置外壳。

**运行时不变式：** 不发布伴生入口。印章组件不持有任何可能被两次独立观察读偏的持久状态。
