# Cookbook: 新增设置卡片

[English](adding-a-settings-card.md) | 中文

插件如何把自己的配置放上 Web 设置页。Host 半侧是声明式的：settings 服务把每个活跃 profile entry 的 `Config` schema 投影成一个以 entry id 为键的 settings 命名空间，因此声明字段本身就是全部注册。浏览器半侧把卡片注册进插件管理页的 `plugins.item` slot，并只在 Host 服务该命名空间期间保持挂载。机制由[设置参考](../subsystems/settings.zh.md)负责；本页只讲路径。

两个半侧住在同一个包里——Host 半侧在 `src/`，浏览器半侧在 `src/client/`，以 `./client` 导出并用 `qilin.client` 声明。[`packages/client/ui-theme`](../../packages/client/ui-theme) 是这种打包方式的现成例子；本仓库自带的卡片在 [`packages/client/ui-settings-plugins`](../../packages/client/ui-settings-plugins)。

## 1. 声明 Config（Host 半侧）

命名空间就是该插件被组装出的 entry 的 `id:`，所以只挑一次，并在 `cordis.yml` 和浏览器半侧都写出它。设置页可在插件运行期间编辑的字段标 `.volatile()`；在 `apply` 里它的值是一个 `Volatile<T>` 引用，每一条被接受的表单编辑都会原地提交进它，插件不必重挂载。普通字段不进表单，走常规配置生命周期——改动一个普通字段会重挂载 entry——而标了 `role('secret')` 的字段永远不会出现在任何 settings 读取结果里。

```ts
import type { Context, Volatile } from '@qilin-agent/kylin'
import z from '@qilin-agent/schemastery'

declare function connectUpstream(endpoint: string | undefined, options: { retries: () => number }): void

export interface Config {
  endpoint: Volatile<string | undefined>
  retries: Volatile<number>
}

export const Config = z.object({
  endpoint: z.string().volatile(),
  retries: z.number().step(1).min(0).default(3).volatile(),
})

export function apply(ctx: Context, config: Config): void {
  // Ordinary config arrives resolved; a `.volatile()` field arrives as a live
  // reference, so handing a reader closure downstream survives every form edit.
  connectUpstream(config.endpoint.get(), { retries: () => config.retries.get() })
}
```

验证：在 `cordis.yml` 里以 `- id: my-plugin` 组装该 entry 并启动——[`ctx.settings`](../../packages/settings/settings) 的 `describe()` 现在会列出一个 `ns` 为该 entry id 的描述项。Config 没有任何 volatile 字段的 entry 不服务任何描述项。

想把页面发布在别处的插件可以把该实例的表单标为 `autoGenerate: false`：在 `apply` 里一个可选的 `ctx.inject(['settings'], ...)` 子上下文中，把 `settings.configure({ auto: false }, ctx.fiber)` 注册为 effect——[settings 包](../../packages/settings/settings/README.zh.md#use-this-package)记载了这项策略。

## 2. 注册卡片（浏览器半侧）

卡片拥有其中的一切——外观、控件与文案——并在 Host 服务其命名空间期间注册进插件管理页的 `plugins.item` slot。它通过 `ctx.configForms` 读写，后者用读取时的 revision 为每次写入设栅：

```ts ignore-check
import type { Context as ClientContext } from '@qilin-agent/kylin'
// Type-only: the Plugins page's SlotMap merge. Cross-plugin collaboration goes
// through cordis services; a value import fails the client bundle-purity gate.
import type {} from '@qilin-agent/client-ui-plugin-manager/client'

export const NS = 'my-plugin'

export const inject = ['slots', 'locale', 'configForms']

export function apply(ctx: ClientContext): void {
  const t = ctx.locale.bind('myPlugin')
  const card = new MyPluginCardController(ctx.configForms.get(NS))
  ctx.effect(() =>
    ctx.configForms.whileServed([NS], () =>
      ctx.slots.inject('plugins.item', () => ctx.slots.register({
        name: 'plugins.item', id: NS, order: 50, locale: 'myPlugin',
        label: () => t('cardTitle'), inject: () => card.inject(),
      }, MyPluginCard),
    )),
  )
}
```

表单快照携带卡片所需的一切：解析后的 `value`、组装层 `base`，以及原始的 `user` 层——字段是否被覆盖，取决于它在 `user` 层中是否**出现**，而非它的值。`form.set(field, value)` 存一个字段，`form.unset(field)` 把它清回组装层；被 Host 拒绝的写入不改动该分区，控制器会重新加载服务端状态。卡片赖以搭建暂存草稿的表单模型是 [`client-ui-primitives`](../../packages/client/ui-primitives) 的 `SettingsFormModel`；[`ui-settings-plugins/src/client`](../../packages/client/ui-settings-plugins) 下的各控制器是现成例子。

验证：`pnpm --filter <package> bundle`，重启 `qilin web`，打开 **设置 → 内置插件 → 管理插件**——卡片位于 Official 分组。保存一处编辑，运行中的插件会经它的 `Volatile` 引用读到新值，无需重启。

## 3. 标签页拿它做什么

**管理插件**标签页把每一个 `plugins.item` entry 渲染在 Official 分组里，按 `order` 排序。注册跟随 settings 文档：卡片在 Host 服务其命名空间时挂载，在 Host 停止时撤下——从未组装过 Host 半侧的部署不会留下这张卡片的任何痕迹。被服务却无人认领的命名空间在标签页上什么都不渲染，卡片属于其他分区的那些命名空间正是这样留在本标签页之外。每个被服务的表单还上报 `autoGenerate`，供从 schema 生成页面的客户端使用；目前没有随仓库发布的客户端这样做。

## 打包

浏览器半侧由[客户端模块系统](../../packages/client/modules)提供给页面：它扫描已启用的 Loader entries 中声明了 `qilin.client` 的包，并提供每个包构建出的 `./client` 导出。因此只要 `cordis.yml` 挂载了该插件，它就会出现在页面上——无需重新构建 Web 应用。

```jsonc
{
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" }
  },
  "qilin": { "client": { "platform": "web", "inject": ["@qilin-agent/client-ui-plugin-manager"] } }
}
```

bundle 必须是 loader 的 lazy-CJS factory 产物。在本仓库内，`tsdown.config.ts` 就是基于共享预设的三行：

```ts ignore-check
import { clientBundle } from '../tsdown.client.ts'

export default clientBundle('@qilin-agent/client-my-plugin', ['lib/types/index.js'])
```

没有已发布的预设暴露该包，因此本仓库之外的包得自行复刻同样的输出格式。bundle 纯净度门禁同时拒绝跨功能插件的值导入，所以卡片无法导入另一个插件的卡片外观——它渲染自己的那一份，并自行拥有暂存与 revision 设栅，只搭建在共享 primitives 与其他包为它声明的 slot 之上。这两条限制都记在[本分区的已知限制](../../packages/client/ui-settings-plugins/README.zh.md#known-limitations-and-deferred-work)里。
