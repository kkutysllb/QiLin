---
description: "配置编辑器背后的 schema 与草稿模型层：还原序列化的 schemastery 封装、校验草稿，并按路径以不可变方式编辑。"
kind: "package-library"
---
# @qilin-agent/client-schema-form

[English](README.md) | 中文

## 概述

Web 客户端各配置编辑器共用的 schema 内省与不可变草稿编辑。Host 行把自身声明的 schemastery `Config` 以序列化的 `schema.toJSON()` 封装发布出来，`rehydrateSchema` 把该封装还原成活的节点树，因此宿主机上校验某一行的那份 schema，就是浏览器里校验草稿的那份 schema。`setPath`、`deletePath`、`nodeAtPath` 与 `validateDraft` 按路径施加或拒绝草稿；该包不含任何 React，也不做任何渲染。

使用方：`@qilin-agent/client-ui-settings` 以 `ctx.settingsSchema` 提供这批辅助函数，`@qilin-agent/client-ui-plugin-manager` 在其之上构建行的配置表单。

## 目录

- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="model-experience"></a>
## 模型体验

无。该包支撑的是浏览器配置编辑器；这里没有任何内容进入模型请求。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与暂缓事项

<a id="known-limitations-and-deferred-work"></a>

- **重建 schema 会执行所收到的封装**——`rehydrateSchema` 会重建一个活的 schemastery 校验器，而 schemastery 通过 `new Function` 复活序列化过的回调函数，因此 schema 信封是可执行内容，而不是不可执行数据。只有该封装来自提供该页面的同一受信任宿主时才安全；该协议没有跨信任边界使用的不可执行表示。
- **校验是草稿级的，而非逐字段的**——`validateDraft` 报告 schemastery 的第一条失败消息及其 `$.path`；它不会把错误映射到各个控件。
- **没有通用渲染器**——消费方在这些辅助函数之上构建自己的控件。本仓库的每个配置界面都自行决定布局；[Web 配置面 Agent Note](../../../.agents/notes/archived/architecture/2026-07-30-web-config-plane.md) 记录了完全通用渲染器产出的 schema 转储为何被否决。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者工作上下文——点击展开</summary>

该包以 `staticLinked` 预设构建，并在 [`tsdown.client.ts`](../tsdown.client.ts) 的 `INLINE_SAFE` 中登记：它的导出是无运行期身份可共享的纯函数折叠，因此动态浏览器包内联自己的副本，而不申请模块表行。

</details>
