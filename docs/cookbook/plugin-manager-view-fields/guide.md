# Cookbook: plugin manager view fields

English | [中文](guide.zh.md)

The **Plugins** page renders what the Host's `pluginManager` Remote answers; a field it never reads is dead weight in the wire payload. This page lists the fields the page consumes from [`plugin-manager`](../../../packages/boot/plugin-manager/README.md), so a change to one side is made against the other.

## Bundle rows

| Field | Where the page shows it |
|---|---|
| `name`, `version`, `source`, `installTarget` | Card title, the Source section's spec and current version, and the offered version of an on-demand Official bundle. |
| `meta.title`, `meta.description`, `meta.icon` | Card and page display text and artwork, in the active language. |
| `description` | The manifest one-liner when no localized display text exists. |
| `enabled`, `installed`, `optional`, `removable`, `readOnlyReason` | Switches, Remove, and the reason a control is locked. |
| `availability`, `official` | The Official and Installed tabs, the missing-files state, and whether the page reads the detail document from npm. |
| `updatable` | Whether the page reads `listVersions` and shows the Versions section and **Update**. |
| `error`, `rows`, `overrides` | The problem tag, the component rows, and the rows a bundle's patch changes without declaring. |
| `readDetail` (Remote) | The Markdown detail document and its images. |

## Version fields

`listVersions` answers a `PluginVersionList`. The page offers an update from the newest `versions` entry that declares a bundle, carries no `deprecated` message, is not a `prerelease`, and has no `incompatible` record; `tags`, `publishedAt`, `omitted`, and `attempts` explain the list, and `registry` is the registry an update must ask first.

## Update fields

`updateBundle` answers a `PluginUpdateResult`: `from` and `to` name the versions, `step` says which step stopped it, `result` carries that step's `ChangeResult`, and `restore` reports the reinstallation of the removed version. `plugin-manager/update-state` announces `checking`, `removing`, `installing`, and `restoring` for the dialog's step list.
