---
description: "Settings domain base plugin: shared configuration forms, schema service, and the canonical settings slot-type contract for the qilin web client."
kind: "package-reference"
---

# @qilin/client-ui-settings

English | [中文](README.zh.md)

## Summary

This package lets web-client features expose editable preferences backed by the Host settings document without implementing their own transport or schema handling. Each feature gets namespace-scoped reads and writes, atomic multi-field updates, schema validation, and protection against silently overwriting concurrent changes. It also provides the standard extension points for settings chrome, pages, header actions, plugin tabs, and onboarding while rendering no interface itself. Any preference-owning feature can use it without depending on a presentation package; a separate package provides the settings shell.

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

Feature plugins use this package to store and edit their preferences without re-implementing transport or schema handling. Mount it once per composition; it injects the `remote` service with its `settings` namespace and owns the single `settings.describe` reader in the browser.

### Configuration forms

`ctx.configForms.developerTools` owns the Coding Tools switch over the shared `ui-settings.enabled` preference, defaulting to `true`. Its `enabled` observable publishes accepted choices and `setEnabled` uses the same ordered writes; loopback clients persist to the Host document while a remote browser keeps the choice in one browser-local observable until reload. Host-backed clients keep developer features disabled until the first accepted schema-resolved value arrives. [ui-settings-general](../ui-settings-general/README.md#use-this-package) renders the switch.

Feature adapters use `ctx.configForms.get(entryId)` to obtain accepted values and the write queue shared by every editor of that Host entry. A snapshot carries the resolved `value`, the inherited `base`, the raw `user`, revision, writability, and persistence mode; a field is overridden when it is present in `user`, even when its value equals `base`, and `unset` restores inheritance. `set` and `unset` submit one operation and resolve to whether the Host accepted it, while `mutate` submits several ordered operations atomically. Each write is fenced by the namespace revision as `expectedRevision`, so a concurrent write from another surface is refused instead of silently overwritten. A staged editor can supply the revision where its draft began as a fixed fence; otherwise the form uses the latest queued or mirrored revision.

### Following served namespaces

A page that edits a namespace another plugin owns registers through `ctx.configForms.whileServed(namespaces, register)`: `register` runs once any listed namespace is in the shared mirror, receives the set of namespaces the Host serves, and returns the registration's disposer, which runs when none of them is served any more or when the disposer `whileServed` returns runs. The caller owns that returned disposer and wraps it in `ctx.effect`; unlike `get`, the service registers nothing on the caller's context. A deployment that never composed the owner therefore shows no trace of the page, and a namespace the Host stops serving withdraws it. [ui-settings-plugins](../ui-settings-plugins/README.md) rides it for the four official pages of the Plugins page.

### Filling the settings slots

A settings surface registers into the slot types this package declares. The shell (`sidebar.settings` occupant, navigation, chrome) lives in ui-settings-general; feature pages register `settings.section` contributions; the Plugins section hosts `settings.plugins.tab` pages; onboarding steps register `settings.onboarding`. The shell-owned About page renders `settings.about.mark`; the QiLin brand package supplies the mark occupant. Cross-namespace surfaces (schema introspection, the served-namespace directory, `hasDocument`) read the same mirror through `ctx.configForms.describe()`.

### Observable success and failures

A shared form reflects the current document revision immediately; a committed write folds its answer back into the mirror with no re-read. A rejected or failed latest write triggers one mirror recovery read; a superseded write leaves recovery to its successor. A section that is not a plain object or fails schema rehydration publishes no value, so a row renders its own absent state instead of a half-decoded one.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package realizes one ownership rule: the browser keeps one shared mirror of the settings document, and every derived surface reads that single source, so any moment in time shows the same document revision.

### The describe mirror

The plugin injects `remote` with its `settings` namespace, resolves Host persistence once from the fixed `remote.$host` facts, and owns the one `settings.describe` reader in the browser: a shared mirror refreshed on every forwarded `settings/document-updated` event and on `connection/reset` (the first connection included, closing the window where a commit lands between the eager read and the SSE subscription). Cross-namespace surfaces read it through `ctx.configForms.describe()`, a read/fold face (`getSnapshot`/`subscribe`/`ensure`, plus `acceptView` folding a write answer in).

### Shared entry forms

`ctx.configForms.get(entryId)` returns the one form for that Host entry, built with the providing plugin's own context: the service, not the caller, declares `remote.settings`, and repeated calls return the same form. The form derives from the mirror, so it adds no wire read and a row's activation never blocks on the settings transport. Writes stay per-entry: `set` and `unset` are single-operation forms of `mutate`, which copies and queues several ordered field operations behind one namespace revision as `expectedRevision`. A committed mutation folds its answer in, a rejected or failed latest mutation triggers one recovery read, and a superseded one leaves recovery to its successor. The cold-boot read count is pinned by `../../../apps/web/tests/startup-rpc-budget.e2e.ts`; a new direct `settings.describe` caller in client code is a regression against it.

### Schema service

`ctx.settingsSchema` performs synchronous schema rehydration, validation, and immutable path editing for settings plugins. A section that is not a plain object, fails its rehydrated schema, or carries a schema envelope this client cannot rehydrate publishes no value at all.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

These pages cover the settings surface family and the durable seam behind it.

- [ui-settings-general](../ui-settings-general/README.md) — the settings shell: panel chrome, navigation, General section, onboarding projection.
- [ui-settings-plugins](../ui-settings-plugins/README.md) — the Plugins section and its configurable host-plane cards.
- [ui-settings-models](../ui-settings-models/README.md) — the Models page and DeepSeek onboarding over this base.
- [settings](../../settings/README.md) — the durable user-settings seam and its file provider.
- [ui-sidebar](../ui-sidebar/README.md) — the sidebar shell whose bottom seat hosts the settings panel occupant.

-----

<a id="model-experience"></a>
## Model Experience

None, as the package is a browser-side UI plugin layer that registers nothing model-facing.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define where the settings transport cannot reach; they are current package constraints.

- **Non-loopback pages get no durable settings** — this Client keeps Host persistence disabled there, so a scope starts `unavailable` and never crosses the wire; every row it backs is inert even though Connection authentication covers the API.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
