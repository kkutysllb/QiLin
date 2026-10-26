# Cookbook: adding a settings card

English | [中文](adding-a-settings-card.zh.md)

How a plugin puts its own configuration on the web settings page. The Host half is declarative: the settings service projects every active profile entry's `Config` schema into a settings namespace keyed by the entry id, so declaring fields is the whole registration. The browser half registers a card into the Plugins page's `plugins.item` slot and keeps it mounted only while the Host serves that namespace. The [settings reference](../subsystems/settings.md) owns the mechanism; this page is the path.

The two halves live in one package — the Host half under `src/`, the browser half under `src/client/`, exported as `./client` and declared with `qilin.client`. [`packages/client/ui-theme`](../../packages/client/ui-theme) is a worked example of that packaging; the cards this repository ships live in [`packages/client/ui-settings-plugins`](../../packages/client/ui-settings-plugins).

## 1. Declare the Config (Host half)

The namespace is the `id:` of the plugin's composed entry, so pick it once and spell it in `cordis.yml` and in the browser half. A field the settings page may edit while the plugin runs carries `.volatile()`; inside `apply` its value is a `Volatile<T>` reference, and every accepted form edit commits into it without remounting the plugin. Ordinary fields stay out of the form and follow the normal config lifecycle — changing one remounts the entry — and a field marked `role('secret')` never rides a settings read.

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

Verify: compose the entry as `- id: my-plugin` in `cordis.yml` and boot — `describe()` on [`ctx.settings`](../../packages/settings/settings) now lists a descriptor whose `ns` is that entry id. An entry whose Config has no volatile field serves no descriptor.

A plugin that publishes its own page elsewhere can mark the instance's form `autoGenerate: false` with `settings.configure({ auto: false }, ctx.fiber)` registered as an effect inside an optional `ctx.inject(['settings'], ...)` child from `apply` — the [settings package](../../packages/settings/settings/README.md#use-this-package) documents the policy.

## 2. Register the card (browser half)

The card owns everything inside it — chrome, controls, and copy — and registers into the Plugins page's `plugins.item` slot while the Host serves its namespace. It reads and writes through `ctx.configForms`, which fences each write with the revision it read:

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

The form snapshot carries what a card needs: the resolved `value`, the composition `base`, and the raw `user` layer, whose key **presence** — not its value — is what marks a field overridden. `form.set(field, value)` stores one field and `form.unset(field)` clears it back to the composition layer; a write the Host refuses leaves the section unchanged and the controller reloads the served state. The staged-draft form model cards build on is `SettingsFormModel` in [`client-ui-primitives`](../../packages/client/ui-primitives); the controllers under [`ui-settings-plugins/src/client`](../../packages/client/ui-settings-plugins) are the worked examples.

Verify: `pnpm --filter <package> bundle`, restart `qilin web`, and open **Settings → Built-in plugins → Manage plugins** — the card sits in the Official group. Save an edit and the running plugin reads the new value through its `Volatile` reference without a restart.

## 3. What the tab does with it

The **Manage plugins** tab renders every `plugins.item` entry in the Official group, ordered by `order`. Registration follows the settings document, so a card mounts when the Host serves its namespace and withdraws when the Host stops — a deployment that never composes the Host half shows no trace of the card. A served namespace no card claims renders nothing there, which is how the namespaces whose cards live on other sections stay off this tab. Each served form also reports `autoGenerate` for clients that build a page from the schema; no shipped client does so today.

## Packaging

The browser half is served to the page by the [client module system](../../packages/client/modules), which scans the enabled Loader entries for packages declaring `qilin.client` and serves each one's built `./client` export. So the plugin appears on the page as soon as a `cordis.yml` mounts it — no rebuild of the web application.

```jsonc
{
  "exports": {
    ".": { "types": "./lib/types/index.d.ts", "default": "./lib/index.js" },
    "./client": { "types": "./lib/types/client/index.d.ts", "default": "./lib/client.js" }
  },
  "qilin": { "client": { "platform": "web", "inject": ["@qilin-agent/client-ui-plugin-manager"] } }
}
```

The bundle must be the loader's lazy-CJS factory artifact. Inside this repository `tsdown.config.ts` is three lines over the shared preset:

```ts ignore-check
import { clientBundle } from '../tsdown.client.ts'

export default clientBundle('@qilin-agent/client-my-plugin', ['lib/types/index.js'])
```

No published preset exposes this package, so a package outside this repository has to reproduce the same output format itself. The bundle-purity gate also rejects value imports across feature plugins, so a card cannot import another plugin's card chrome — it renders its own and owns its staging and revision fencing, building only on the shared primitives and the slots another package declares for it. Both limits are recorded under [the section's known limitations](../../packages/client/ui-settings-plugins/README.md#known-limitations-and-deferred-work).
