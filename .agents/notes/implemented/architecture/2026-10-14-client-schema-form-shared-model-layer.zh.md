# Agent Note: One schema/draft model layer for configuration editors

Status: implemented

[English](2026-10-14-client-schema-form-shared-model-layer.md) | 中文

## Problem

Plugins 页会为任何导出了 schemastery `Config` 的组合包行渲染配置表单。该表单 `RowConfigForm` 自带一套 schema 遍历器：本地 `SchemaNode` 接口、手工重建记录的 `assign()`、按 `typeof` 判定联合分支的选择器，以及对 `node.role` 的 textarea 判断——而 schemastery 节点的角色存放在 `meta.role`，因此这个属性读取永远是 undefined，每个 textarea 都渲染成了单行输入。

同一套草稿操作还存在于 `@qilin-agent/client-ui-settings` 中，即动态客户端插件获取它们的 `ctx.settingsSchema` 服务。于是同一份约定的两套实现被并行维护，并且已经出现分歧（服务从 `meta` 读取角色，表单从节点根读取）。

两套实现都不校验草稿。`pluginManager.setBundleConfig` 会原样把调用方给出的完整映射写入 profile patch，不做任何 schema 检查，因此表单可能落盘一份该行自身 `Config` 在下次启动时会拒绝的配置，而用户看到的是一个"已保存"却无法运行的状态。

## Decision

`@qilin-agent/client-schema-form` 以纯浏览器库的形式拥有 schema／草稿模型层：`rehydrateSchema`、`validateDraft`、`nodeAtPath`、`getPath`、`hasPath`、`setPath`、`deletePath` 以及 `SchemaNode` 别名。该模块是上游 DSH `packages/client/schema-form` 源码的重作用域版本；上游删除该包时把同一批辅助函数移入了 `packages/client/ui-settings/src/client/schema.ts`，而 QiLin 早已把它移植为其 settings 服务。

两个使用方现在都读这一份实现。`SettingsSchemaService` 保留其 Cordis 身份与 `ctx.settingsSchema` 约定，每个方法都委派给它；`RowConfigForm` 直接导入这些辅助函数。只面向动态插件的使用方仍然不需要导入（它们拿到的是服务），而随包发布的编辑器不需要服务往返。

`RowConfigForm` 通过该层渲染。草稿按路径编辑（值为 `setPath`，数组条目为 `deletePath`），嵌套控件只上报自己的路径，没有任何分支再手工重建记录。`validateDraft` 在调用 `save` 之前针对重建出的节点运行；被拒绝的草稿显示校验器自己的消息，且不写入任何内容。

**控件。** 表单渲染共享的 `ui-primitives` 原子控件——`Input`（文本与数字）、`Checkbox`、`Button`——只有在目录里没有对应物时才保留本地控件：`meta.role` 为 `'textarea'` 的节点用 `textarea`，联合类型的分支选择器用原生 `select`。该包的 CSS module 仍然只负责布局，而不是控件外观。

**构建通道。** 该包以 `staticLinked` 预设构建——`verify-client-packages` 要求任何未声明 `qilin.client` 行的 `packages/client/*` 包如此——并在 [`tsdown.client.ts`](../../../../packages/client/tsdown.client.ts) 的 `INLINE_SAFE` 中登记：它的导出是无可共享运行期身份的纯函数折叠，因此每个消费它的浏览器包内联自己的副本，而不申请模块表行。

**不受支持的节点。** `dict`、`intersect` 或 schema 扩展类型在这里没有控件；它们走叶子回退控件渲染，随后校验器拒绝装不下它们的草稿，而不是让表单静默存入一个错误的值。

## Alternatives considered

**照字面 vendor `schemastery-vue` / `schemastery-react` 栈。** 触发这项工作的请求点了这两个包名。`schemastery-vue@7.3.15` 是一套 Vue 3 组件，其 peer 是 `vue@^3`、`@vueuse/core` 与 `element-plus@^2`；`schemastery-react@0.1.5` 根本不是 React 实现，而是一个把它们挂载起来的 `veaury` 桥，它在单个 1.7 MB 的 ESM 文件加 348 KB CSS 里内联了 Vue 3.5.22 与 Element Plus 2.11.3，peer 指向未加作用域的 `schemastery@^3.16.1` 而非 `@qilin-agent/schemastery`。采用它会把第二套组件框架与一个组件库塞进 React 外壳，并同时打破三条客户端规则——禁止组件库、文案归 locale 字典、颜色只用 `--qilin-*` token。值得取的是模型层，不是它的渲染器。

**把该库放进模块表基线。** `PLATFORM_MODULES` 会让每个动态包共享同一个实例，代价是为一个导出纯函数、没有任何东西可共享的包追加一行 shell 种子表与一个 `apps/web` 输入。`INLINE_SAFE` 通道正是为此存在的：一个允许包私有携带的折叠。

**把辅助函数只留在 `ctx.settingsSchema` 里。** 那样随包发布的编辑器每次渲染都要通过注入的服务去拿 schema 遍历器，而该服务的约定——为无法跨包导入值的动态插件提供的投递通道——就背上了它并不需要的第二项职责。包纯度闸门同样禁止一个功能插件导入另一个功能插件的值，所以即使那是唯一的存放处，`ui-plugin-manager` 也无法从 `ui-settings` 取得这些辅助函数。

**把所有设置界面都通用化渲染。** 这在配置面设计时就被否决，这里再次否决：完全通用的表单会把精心设计的卡片压平成 schema 转储。[Web 配置面 Agent Note](../../archived/architecture/2026-07-30-web-config-plane.md) 记录了该决定，随包发布的设置卡片（`ui-settings-plugins`）也仍然基于 `SettingsFormModel` 与同一批原子控件手写。行的表单之所以通用，只是因为第三方行的 schema 没有卡片可手写。

## Consequences

现在有一份实现同时支撑 settings 服务、行表单以及未来所有编辑器；`meta.role` 与节点根读取之间的分歧消失了，textarea 角色也能真正生效。校验首次出现在这个界面上：无效草稿会在浏览器端被 schemastery 自己的消息拒绝，且发生在任何写入之前——这也是唯一能拒绝它的地方，因为 Host 会原样写入收到的映射。

代价是一个代码会按消费方包内联的工作区浏览器库，以及客户端依赖图里多出的一个包。重建仍然会执行所收到的封装（schemastery 通过 `new Function` 复活序列化回调），这只在封装来自提供该页面的同一受信任宿主时才安全。

行表单不是通用 schema 表单：嵌套的 `dict` 与扩展类型节点不可编辑，而 `Config` 要求其中之一的行在这里根本无法编辑——校验器会说明这一点，而不是写入一份不兼容的映射。

## Testing

[`packages/client/schema-form/tests/model.client.spec.ts`](../../../../packages/client/schema-form/tests/model.client.spec.ts) 覆盖重建、校验失败文本以及不可变路径操作，包括经由数组中间节点的数组删除。[`schema.client.spec.ts`](../../../../packages/client/ui-settings/tests/schema.client.spec.ts) 覆盖同一批操作在设置文档草稿上的表现。`pnpm run test:gui` 同时运行两者。

## Related

- [Web configuration plane](../../archived/architecture/2026-07-30-web-config-plane.md)——settings wire 面、`ctx.settingsSchema` 服务，以及通用渲染器被否决的原因。
