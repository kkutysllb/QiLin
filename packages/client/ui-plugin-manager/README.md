---
description: "Manage the profile's plugin bundles, their rows, and the plugins' configuration from the Settings Plugins section."
kind: "package-reference"
---

# @qilin/client-ui-plugin-manager

English | [中文](README.zh.md)

## Summary

Use the **Manage plugins** view in the Settings **Plugins** section to manage the profile's installed bundles and the official bundles shipped switched off. Switch bundles and their rows on and off, install a bundle after the Host has read what the spec names, watch pnpm's output, stop a run, and enable what it added. **Check for updates** compares the manageable layers with their registry's latest versions; the **Plugin catalog** searches GitHub's plugin topic. Uninstalling asks for confirmation. A plugin that registers a configuration page is edited here, on its page; the section's Plugin list view keeps the read-only inventory.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Open Settings, select **Plugins**, and open the **Manage plugins** tab. The page reads the inventory and the bundles through `api-remotes` when first opened; a Host without a managed profile shows the page as unavailable. **Official** comes first and lists the bundles the installation ships for switching on — off until switched on, without an uninstall, and tagged **Beta** where the feature is one — followed by the official plugins that registered a configuration page; **Installed** lists the bundles the profile holds. Cards are listed by name, so switching a bundle on or off does not move its card. A dependency without a bundle patch is not a plugin and is not listed unless the profile selects it, in which case it carries a problem tag. Global configuration remains on the configuration pages this view hosts.

The Agent Teams, Agent Teams Web UI, and Auto Authorization Review packages have localized names and descriptions that follow the UI language. Their detail pages retain the full npm package name; other packages display their short package name and original description.

### Installing a bundle

**Add plugin** takes a package name with an optional version, a Git address, a tarball, or an absolute local path; the dialog says a package name is what follows `qilin plugin add` in a README. **Not sure what to enter?** under the field opens a guide that shows the three common forms with an example each; **Use example** drops one into the field. **Install** first asks the Host to read what the spec names (`pluginManager.inspect`): a name the list already shows, a name the registry does not have, a path without a package, a package without a bundle patch, or a spec pnpm would refuse comes back under the field as one sentence, with the spec kept for editing. An accepted spec opens the installing screen, which shows the package's name, one-liner, and version as the Host read them and folds pnpm's command and output behind **Show install details**. A finished install offers **Enable now**, which switches the new bundle on, closes the dialog, and scrolls the list to it; closing instead leaves it installed and off. A failed install says what went wrong in one line — the registry or network could not be reached, the package was not found, the disk is full, the profile is not writable, pnpm blocked a build script — with pnpm's output behind the details and **Retry** at hand; the Host has already put the profile files back. When pnpm blocked a dependency's install scripts, the failed screen lists the packages whose scripts wait for permission and offers **Allow these scripts and retry** in place of **Retry**; the Host saves the permission in the profile's `pnpm-workspace.yaml`, which a failed run leaves as pnpm wrote it, then runs pnpm again, and the installed screen names what was allowed. A successful installation does not certify that a module can activate.

During installation, **Cancel install** asks the Host to stop the run and shows **Stopping installation…** until the Host confirms. Loading the bundle cannot be cancelled. Once confirmed, the dialog returns to the spec, ready to install again, and a toast says the installation was cancelled; the manifest and lockfile are back as they were, while downloaded files can remain. Closing the dialog while the run is in progress asks the Host to stop it the same way, and the dialog closes once the Host confirms; while the Host prepares, stops, or loads, the dialog cannot be closed. A connection error does not confirm cancellation: the running screen says so and cancelling can be tried again.

### Checking for updates

The toolbar's check control asks the Host to compare every manageable layer — the installation's shipped bundles included — with its registry's latest version (`pluginManager.checkUpdates`) and reports each layer with a newer version as `current → latest`. **Update** upgrades that one through the Host's install path, which leaves the layer's place in the profile as it is; a change that waits for the next start says so in a toast. A layer the registry could not answer for offers nothing, and when no layer is behind the block says everything is up to date. The block closes with its own control; a check that fails reports the reason in the block and can be run again.

### Browsing the plugin catalog

The plugin catalog below the cards searches GitHub for the repositories the `dsh-plugin` topic tags (`pluginManager.catalog`), most starred first, and pages through the answer with **Load more**. Each result shows the repository, its description, and its star count, and opens it on GitHub. **Install** puts the repository address into the install dialog as the spec, so the Host reads it and the person approves the installation there, exactly as for a typed spec.

### Switching a bundle

A bundle's page shows its full package name under the title, the spec that installs it elsewhere. A bundle's switch changes its layer selection. A profile with HMR recomposes before the operation completes; one without HMR, and a bundle a higher layer overrides, say so in a toast. A bundle the Host cannot read carries a problem tag and its reason on its page and cannot be switched on; one that provides the management components stays locked. The Host answers with error codes, which the page's dictionary words; pnpm's and the Loader's own diagnostics are shown as they are. The page excludes built-in profile bundles from cards and counts even when the profile holds them as dependencies or the Host reports an error. The Host inventory remains complete; the Settings Plugins section's Plugin list tab inspects their plugins.

### Switching one row of a bundle

A row's switch on the bundle's page calls `pluginManager.setPluginEnabled`, which writes the row's `disabled` override into the profile's `cordis.patch.yml`. The tree recomposes at once on a profile with HMR, so the row's host half unmounts or mounts while the rest of the bundle keeps running, and the page follows the client module graph without reloading. Rows show their fiber phase as the Host runs them. The switch appears only on a bundle that is on; a row without a live entry, or one the Host will not address through the profile patch, is locked with the Host's reason. A list longer than ten rows gets a filter over the row ids.

### Configuration pages

A plugin that carries its own configuration renders it on this page through three slots the page declares: `plugins.item` (list) for an official plugin, listed in the Official group by its `label`; `plugins.bundle.config` (keyed by the bundle's package name) for a bundle's own configuration, shown on the bundle's page between its description and its rows; and `plugins.row.config` (keyed by `<package name>#<row id>`) for one row's configuration, which gives that row a **Configure** control opening the row's page. The page asks every entry for two views through its owner props: `view: 'summary'` for the one-liner under the title, `view: 'page'` for the form with its own save control. Only a save writes: the page draws the title, icon, and crumb, and the entry's form drops its staged edits when the page is left. The four host-plane pages the installation ships — the shell executor, the agent loop, subagent model selection, and the DeepSeek search provider — come from [ui-settings-plugins](../ui-settings-plugins/README.md), registered while the Host serves their namespaces. A bundle's browser half registers the same way:

```tsx ignore-check
ctx.slots.inject('plugins.row.config', () => ctx.slots.register({
  name: 'plugins.row.config',
  key: '@acme/qilin-sidebar#sidebar',
  locale: 'acmeSidebar',
}, ({ t, view }) => view === 'summary' ? t('summary') : <SidebarForm t={t} />))
```

The bundle's patch must declare the row under that id, and the registration exists while the bundle is on, so a bundle that is off shows no configure control.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

Package management uses the profile's dependency records: installed bundles can be toggled and removed; installation-owned bundles remain locked. This distinction does not select startup failure policy.

<details>
<summary>Implementation internals — click to expand</summary>

### Registration

The browser plugin registers the `manage` tab of the Settings Plugins section through `ctx.slots.inject()`, so the tab follows late slot declaration, locale changes and teardown. The page is global and belongs to no Session. Display text comes from package metadata and the page's dictionary.

### The store

`PluginManagerController` owns the bundle views, busy keys, notices, install progress and the uninstall confirmation. Each read asks the inventory whether the Host manages a profile, then joins `listBundles` with `listPlugins` into one view per bundle, whose rows carry the live entry's enablement and fiber phase. It coalesces overlapping reads, refreshes after operations, on `plugin-manager/changed`, and on reconnect, and ignores late results after disposal. Install output is grouped by job id. The install dialog moves `idle → checking → starting → running → done | failed`, with `cancelling` and `applying` as the Host reports them. The check runs under an `AbortController` that going back or closing aborts, and its settlement is dropped; a run is stopped only through `pluginManager.cancelInstall`, whose answer the dialog waits for. A change the Host could not apply, a restart it waits for, and an override by a higher layer become toasts that retire on their own. The update check and the catalog search are reads of their own: each keeps its status and its failure text in the block that asked, so a failed lookup leaves the cards as they were.

### Configuration slots

The page's `settings.plugins.tab` registration declares `plugins.item`, `plugins.bundle.config`, and `plugins.row.config` as its children, so the slots exist while the page does and a registrant's `ctx.slots.inject` waits for them. `configLedgerSource` projects the three ledgers into one observable — the official items in ledger order with their labels resolved in the active locale, and the bundle and row keys — cached until a ledger or the locale moves; the page binds it as `useConfigLedger` beside the store and never names a configurable plugin itself. Which page is open is page-local state: the cards, a bundle, an official plugin, or a row of a bundle. A registration lives with the browser half that made it. `qilin-client-modules` attaches a package's browser half to the Loader row whose specifier is the bare package name, so every page a bundle registers, for itself or for any of its rows, goes away when that row is switched off; a sub-plugin whose page must outlive the other rows ships as its own package.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These pages cover the Settings tab, the Remote calls, and the Host-side manager.

- [ui-settings](../ui-settings/README.md) — the tab list the page registers into; [ui-settings-plugins](../ui-settings-plugins/README.md) — the Plugins section that renders the tab.
- [api-remotes](../../api/remotes/README.md) — the Remote BFF surface behind `pluginManager.*` and `pluginInventory.*`.
- [plugin-manager](../../boot/plugin-manager/README.md) — the Host-side manager this page drives.
- [ui-settings-plugins](../ui-settings-plugins/README.md) — the official configuration pages that register into this page's slots.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side management surface that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define the reach of the management view; they are current package constraints.

- **Only bundles are managed** — a dependency without a bundle patch is refused before it installs; one the profile already holds is left off the page unless the profile selects it, and loading plain plugin modules stays a file operation.
- **Rows show a phase, not a reason** — a failed row reads as failed without the Host's error text; the Host log has it.
- **One install at a time** — the dialog runs one pnpm command; a second spec waits for the first to finish.
- **Updates follow the registry's `latest` tags** — the check offers the layers the profile manages and upgrades them to their latest version; pinning a specific version still means typing the spec.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>

**Runtime invariant:** No companion is published. This package owns a Settings Plugins tab over Host-owned facts.
