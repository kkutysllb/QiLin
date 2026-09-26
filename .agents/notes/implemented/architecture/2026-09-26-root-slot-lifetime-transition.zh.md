# Agent Note: root slot 的注册生命周期过渡渲染 crash face 而非抛错

Status: implemented

[English](2026-09-26-root-slot-lifetime-transition.md) | 中文

## 问题

Web 客户端只在启动内核确认每个 client entry 均为 active 之后才挂载组装好的应用，而 [scoped-slots.tsx](../../../../packages/client/ui-renderer/src/client/scoped-slots.tsx) 里的 `RootOutlet` 把渲染时为空的 `'root'` 注册集合当作启动顺序故障：它抛 `SlotAssemblyError`，而不是渲染空白。在名册稳定期间，[client 启动审计](../../../../packages/client/web/src/boot-client.ts)与 ctx 级 `renderSlot('root')` 守卫使该状态不可达，因此这次抛错描述的是一种挂载序列无法产生的状态。

[client-hmr](../../../../packages/client/hmr/src/index.ts) 里的宿主 bundle 传输每 500 ms stat-poll 图里每一行的 client bundle，并通过 `clientModules.rebuilt(id)` 报告变化的 bundle；该热重载传输归 [client 插件装载模型](2026-07-23-client-plugin-loading-model.zh.md) 所有。`/plugins/events` 通道把由此产生的帧交给每个打开的页面，页面的 entry 控制器原地替换该 client entry（[entries.ts](../../../../packages/client/modules/src/client/entries.ts)）。替换一个 entry 会 dispose 其 fiber 持有的所有 effect。当被替换的 entry 是 `'root'` 占位者，或处在它注入链上的服务提供者时，这次 dispose 会在 React 根仍挂载的情况下清空 `'root'`，而订阅了该 slot 版本的 outlet 便重渲染进入这个空档并抛错。

结果是页面上出现一条未捕获的渲染错误，而替换完成后界面自行恢复。它天然是偶发的：需要页面挂载期间恰好发生一次重建——在有其它工作重建 client bundle 时，`file-upload-round` 五次运行命中一次；在安静的代码树上未命中过。

## 决策

- `RootOutlet` 记录某次提交是否真的渲染出了占位者；此后再遇到空的 `'root'` 便渲染该 slot 的 crash face（`<div data-slot-error="root" />`），不再抛错。
- 启动顺序故障在可达之处仍然大声：`SlotRegistry.renderSlot('root')` 拒绝没有任何注册的渲染，而从未产出过占位者的首次渲染仍抛启动顺序 `SlotAssemblyError`。
- 替换占位者会重新注册该 slot，版本订阅重渲染 outlet，新占位者随之渲染。这个空档无需人工干预即自行闭合。

## 触发链

宿主 HMR stat 轮询、`clientModules.rebuilt(id)`、SSE `rebuilt` 帧、页面的 `entries.reload` 与 `replace(entry)` 依次 dispose 该 entry fiber 的 effect。由此产生的级联清空 `'root'`，已挂载的 outlet 渲染 crash face，替换重新注册 `'root'`，占位者再次渲染。

## 备选方案

**在把挂载点交给应用之前等待 `'root'` 注册。** 这只覆盖首次渲染，之后清空该 slot 的替换仍会到达 outlet。它还会把缺少布局注册变成永久等待的页面，并在每次替换时闪回启动页。

**修正挂载顺序或重复挂载。** 挂载路径是名册审计之后的一次调用，为本次排查插桩的启动过程显示挂载时注册已经存在。没有可重排的过早挂载或重复挂载。

**保留抛错。** client entry 替换必然在占位者 dispose 与重新注册之间清空 `'root'`，因此保留抛错就是让该 entry 或其注入链上提供者的每次替换都炸掉 React 根。

**让注册比它的 fiber 活得更久。** 注册的生命周期就是所属 fiber 的 effect，而 Cordis 在卸载时 dispose fiber 的 effect。让它在替换期间存活，等于把 `'root'` 注册的所有权移出占用该 slot 的插件。

**在该 slot 为空时卸载 React 根。** 每次插件替换都重新挂载组装好的应用，会丢弃 live entry 替换本来要保留的页面状态——草稿、滚动位置、已打开的对话框。

## 测试

| 证据 | 行为 |
|---|---|
| [ui-renderer.client.spec.tsx](../../../../packages/client/ui-renderer/tests/ui-renderer.client.spec.tsx) | 在已挂载应用下 dispose 占位者并注册替身，替身渲染且没有未捕获错误；本变更之前该用例以 `SlotAssemblyError` 失败。 |
| [client-plugin-live.e2e.ts](../../../../apps/web/tests/client-plugin-live.e2e.ts) | 一次替换 root 占位者所在链的 bundle 重建会发布新修订号，页面没有页面错误，frame 保持渲染。 |
| [scoped-slots.client.spec.tsx](../../../../packages/client/ui-renderer/tests/scoped-slots.client.spec.tsx) | 没有任何 `'root'` 注册的全新渲染仍抛启动顺序错误。 |
| [registry.client.spec.ts](../../../../packages/client/ui-renderer/tests/registry.client.spec.ts) | ctx 级 `renderSlot('root')` 仍拒绝没有任何注册的渲染。 |

## 后果

- 清空 `'root'` 的 client entry 替换不再产生未捕获的渲染错误；在 dispose 与重新注册之间的空档里，外壳显示 crash face。
- 启动顺序缺陷在 ctx 级入口与首次渲染无占位者时仍是大声失败。
- 布局从未注册的组合会在 `renderSlot('root')` 处失败，而不是在 React 树内部失败。
- 该空档渲染一个空 div，因此在替身到达之前外壳的列与 overlay 都不存在；这段时间本来也没有占位者来绘制它们。
