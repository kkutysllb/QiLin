---
description: "QiLin 在 Web 客户端侧边栏与会话 hero 品牌槽位的占位实现：由内嵌轮廓绘制的麒麟印章标记。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-brand-qilin

[English](README.md) | 中文

## 摘要

把本插件挂在 [`ui-sidebar`](../ui-sidebar/README.md) 与 [`ui-conversation`](../ui-conversation/README.md) 旁边，即可用麒麟印章替换通用品牌回退：圆角方框内上麒下麟。印章是以路径数据内嵌的矢量图，不依赖运行时字体，并从渲染它的表面继承 `currentColor`。侧边栏品牌名保留外壳自身的回退，因此产品标签与构建版本徽章仍由外壳拥有。

## 目录

- [使用本包](#use-this-package)
- [模型体验](#model-experience)
- [已知限制与待办](#known-limitations-and-deferred-work)
- [开发说明](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

`qilin` profile 通过其 bundle 补丁挂载本包，无需配置。插件会等待两个槽位都被声明后才占位，卸载后恢复外壳回退。

| 槽位 | 占用内容 |
|---|---|
| `sidebar.brand.mark` | 按侧边栏请求尺寸渲染的印章 |
| `conversation.hero.brand.mark` | 按 hero 请求尺寸与摆放类渲染的印章 |

[`glyphs.ts`](src/client/glyphs.ts) 中的两个字形轮廓取自系统 CJK 字体并归一化到单位框；组件在渲染时把它们组合进方框。

<a id="model-experience"></a>
## 模型体验

无。印章属于浏览器呈现，不进入模型请求或会话日志。

<a id="known-limitations-and-deferred-work"></a>
## 已知限制与待办

- 印章取自正文字体轮廓，而非设计师的篆书稿。委托绘制的篆书标记只需替换两个路径常量，无需改动组件。
- 标记是单色的：它继承 `currentColor`，没有朱红印章底色；若要彩色印章需要先定主题令牌。
- 这两个槽位尚无浏览器级断言；随附规格覆盖的是槽位注册，组装面的检查目前为手工执行。

<a id="dev-note"></a>
## 开发说明

无。
