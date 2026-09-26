---
description: "设置领域底座插件：共享配置表单、schema 服务，以及 qilin Web 客户端的规范设置 slot 类型约定。"
kind: "package-reference"
---

# @qilin/client-ui-settings

[English](README.md) | 中文

## 概述

本包使 Web 客户端功能能够公开由宿主设置文档支持的可编辑偏好设置，而无需自行实现传输或 schema 处理。每项功能都可按命名空间读写、原子更新多个字段、校验 schema，并避免静默覆盖并发更改。它还为设置界面框架、页面、标题栏操作、插件标签页和引导流程提供标准扩展点，但自身不渲染任何界面。任何持有偏好设置的功能都可在不依赖呈现包的情况下使用它；设置外壳由单独的包提供。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

功能插件用本包存储与编辑自己的偏好设置，而无需重新实现传输层或 schema 处理。每个组合挂载一次即可；它注入 `remote` 服务及其 `settings` 命名空间，并持有浏览器中唯一的 `settings.describe` 读取方。

### 配置表单

`ctx.configForms.developerTools` 管理代码工作工具开关，背后是共享的 `ui-settings.enabled` 偏好，默认为 `true`。其 `enabled` 可观察值发布已接受的选择，`setEnabled` 经同一有序写入；loopback 客户端写入 Host 文档，远程浏览器则把该选择保存在单个浏览器本地可观察值中，刷新后重置。使用 Host 偏好的客户端在首个经过 schema 解析并接受的值到达前保持开发者功能关闭。[ui-settings-general](../ui-settings-general/README.zh.md#use-this-package) 渲染该开关。

功能适配器用 `ctx.configForms.get(entryId)` 取得已接受的值，以及该 Host 条目上所有编辑器共用的写入队列。快照携带解析后的 `value`、继承的 `base`、原始 `user`、revision、可写性与持久化模式；字段只要出现在 `user` 中即视为覆盖，即使其值与 `base` 相等，`unset` 会恢复继承。`set` 与 `unset` 提交一个操作，并以 Host 是否接受作为返回值，`mutate` 则原子提交多个有序操作。每次写入都以命名空间 revision 作为 `expectedRevision` 围栏，因此来自另一界面的并发写入会被拒绝，而不是被静默覆盖。暂存编辑器可以把开始草拟时读取的 revision 作为固定围栏传入；否则表单使用最新排队或镜像 revision。

### 跟随被服务的命名空间

编辑另一个插件所拥有命名空间的页面通过 `ctx.configForms.whileServed(namespaces, register)` 注册：只要所列命名空间中的任一个进入共享镜像，`register` 就运行一次，收到 Host 当前服务的命名空间集合，并返回该注册的 disposer；当它们全都不再被服务，或 `whileServed` 返回的 disposer 被调用时，这个 disposer 就运行。调用方持有返回的 disposer 并把它包进 `ctx.effect`；与 `get` 不同，服务不会在调用方的 context 上注册任何东西。因此从未组合过所有者的部署看不到该页面的任何痕迹，Host 停止服务的命名空间会撤下它。[ui-settings-plugins](../ui-settings-plugins/README.zh.md) 用它承载插件页上的四个官方页面。

### 填充设置 slot

设置界面会注册进本包声明的 slot 类型。外壳（`sidebar.settings` 占位方、导航、界面框架）位于 ui-settings-general；功能页面注册 `settings.section` 贡献；「插件」分区承载 `settings.plugins.tab` 页面；首次使用引导步骤注册 `settings.onboarding`。外壳自有的「关于」页面渲染 `settings.about.mark`；QiLin 品牌包为该标识席位提供印章。跨命名空间的表面（schema 内省、已服务命名空间目录、`hasDocument`）通过 `ctx.configForms.describe()` 读同一面镜像。

### 可观察的成功与失败

共享表单会立即反映当前文档 revision；提交成功的写入把应答折回镜像、不再重读。被拒绝或失败的最新写入触发一次镜像恢复读取；被取代的写入把恢复留给后继者。分区不是普通对象或未通过 schema 重建时一律不发布任何值，于是行渲染自己的缺失状态，而不是一份半解码的值。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节——点击展开</summary>

本包实现一条归属规则：浏览器保留设置文档的一面共享镜像，每个派生表面都读这同一真源，因此任一时刻看到的都是同一份文档 revision。

### Describe 镜像

插件注入 `remote` 及其 `settings` 命名空间，从固定的 `remote.$host` 事实一次性解析 Host 持久化模式，并持有浏览器中唯一的 `settings.describe` 读取方：一面共享镜像，在每次转发的 `settings/document-updated` 事件与 `connection/reset` 时刷新（首次连接也包含在内，关闭「提交落在急切读取与 SSE 订阅之间」的窗口）。跨命名空间表面通过 `ctx.configForms.describe()` 读它，这是一个读取/折叠面（`getSnapshot`/`subscribe`/`ensure`，另有把写应答折入的 `acceptView`）。

### 共享条目表单

`ctx.configForms.get(entryId)` 返回该 Host 条目唯一的一份表单，并用提供方插件自己的 context 构造：声明 `remote.settings` 的是服务而不是调用方，重复调用返回同一份表单。表单由镜像派生，因此不新增任何线路读取，某一行的激活绝不会阻塞在设置传输层上。写入仍归各条目：`set` 与 `unset` 是 `mutate` 的单操作形式，后者会复制操作列表，并把多个有序字段操作排在同一个作为 `expectedRevision` 的命名空间 revision 之后。提交成功的 mutation 把应答折回镜像，被拒绝或失败的最新 mutation 触发一次恢复读取，被取代的 mutation 把恢复留给后继者。冷启动读取次数由 `../../../apps/web/tests/startup-rpc-budget.e2e.ts` 钉住；客户端代码中新增直连 `settings.describe` 调用即是对它的回归。

### Schema 服务

`ctx.settingsSchema` 为设置插件执行同步 schema 重建、校验与不可变路径编辑。分区不是普通对象、未通过其重建后的 schema 校验、或携带本客户端无法重建的 schema 信封时，一律不发布任何值。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

以下页面覆盖设置界面家族及其背后的持久化 seam。

- [ui-settings-general](../ui-settings-general/README.zh.md)——设置外壳：面板界面框架、导航、「通用」分区、引导投影。
- [ui-settings-plugins](../ui-settings-plugins/README.zh.md)——「插件」分区及其可配置宿主平面卡片。
- [ui-settings-models](../ui-settings-models/README.zh.md)——建立在本底座之上的 Models 页面与 DeepSeek 引导。
- [settings](../../settings/README.zh.md)——持久化用户设置 seam 及其文件提供方。
- [ui-sidebar](../ui-sidebar/README.zh.md)——底部席位承载设置面板占位者的侧边栏外壳。

-----

<a id="model-experience"></a>
## 模型体验

无。该包是浏览器端 UI 插件层，不注册任何面向模型的内容。

#### KV Cache 影响

无；该包既不组装也不发送提供方请求。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>


这些限制说明设置传输层够不到的地方；它们是当前包约束。

- **非 loopback 页面没有持久化设置**：本 Client 在那里禁用 Host 持久化，因此 scope 以 `unavailable` 起步且从不跨线路；尽管 Connection 认证覆盖 API，它支撑的每一行仍在那里无效。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>维护者的工作上下文——点击展开</summary>

无。

</details>

**运行时不变式：** 不发布伴生入口。本包只把 `settings.section` ledger 投影为导航，不发出 Kylin 事件，也不持有跨插件可变关系；slot core 会在加载时拒绝冲突。
