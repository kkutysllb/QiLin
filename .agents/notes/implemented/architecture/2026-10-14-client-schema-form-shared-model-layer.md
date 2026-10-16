# Agent Note: One schema/draft model layer for configuration editors

Status: implemented

English | [中文](2026-10-14-client-schema-form-shared-model-layer.zh.md)

## Problem

The Plugins page renders a configuration form for any bundle row whose module exports a schemastery `Config`. That form, `RowConfigForm`, carried its own schema walker: a local `SchemaNode` interface, an `assign()` that rebuilt records by hand, a union picker keyed on `typeof`, and a textarea test on `node.role` that never matched — a schemastery node keeps its role at `meta.role`, so the property read was always undefined and every textarea rendered as a single-line input.

The same draft operations also existed inside `@qilin-agent/client-ui-settings` as the `ctx.settingsSchema` service, which is how dynamic client plugins reach them, so two implementations of one contract were already maintained side by side and had drifted (the service reported roles from `meta`, the form from the node root).

Neither implementation validated a draft. `pluginManager.setBundleConfig` writes the caller's complete map into the profile patch with no schema check, so a form could persist a configuration the row's own `Config` would reject on the next boot, and the user saw a saved state that could not run.

## Decision

`@qilin-agent/client-schema-form` owns the schema/draft model layer as a pure browser library: `rehydrateSchema`, `validateDraft`, `nodeAtPath`, `getPath`, `hasPath`, `setPath`, `deletePath`, and the `SchemaNode` alias. The module is the upstream DSH `packages/client/schema-form` source, rescoped; upstream deleted that package when it moved the identical helpers into `packages/client/ui-settings/src/client/schema.ts`, which QiLin had already ported as its settings service.

Both consumers now read the one implementation. `SettingsSchemaService` keeps its Cordis identity and `ctx.settingsSchema` contract, and delegates every method; `RowConfigForm` imports the helpers directly. A dynamic-plugin-only consumer still needs no import (it receives the service), and a shipped editor needs no service round trip.

`RowConfigForm` renders through that layer. The draft is edited by path (`setPath` for a value, `deletePath` for an array entry), a nested control reports only its own path, and no branch rebuilds a record by hand. `validateDraft` runs against the rehydrated node before `save` is called; a rejected draft shows the validator's own message and writes nothing.

**Controls.** The form renders the shared `ui-primitives` atoms — `Input` (text and number), `Checkbox`, `Button` — and keeps a local control only where the catalog has none: a `textarea` for a node whose `meta.role` is `'textarea'`, and a native `select` for a union's alternative picker. Layout, not control chrome, is what the package's CSS module still owns.

**Build channel.** The package builds with the `staticLinked` preset, which `verify-client-packages` requires of any `packages/client/*` package that declares no `qilin.client` row, and is named in `INLINE_SAFE` in [`tsdown.client.ts`](../../../../packages/client/tsdown.client.ts): its exports are pure folds with no runtime identity, so each consuming browser bundle inlines its own copy instead of requesting a module-table row.

**Unsupported nodes.** A `dict`, an `intersect`, or a schema-extension type has no control here; it renders through the leaf fallback and the validator then refuses a draft that cannot fit it, rather than the form silently storing a wrong value.

## Alternatives considered

**Vendor the literal `schemastery-vue` / `schemastery-react` stack.** The request that started this work named those packages. `schemastery-vue@7.3.15` is a Vue 3 component set whose peers are `vue@^3`, `@vueuse/core`, and `element-plus@^2`; `schemastery-react@0.1.5` is not a React implementation at all but a `veaury` bridge that mounts them, and it ships Vue 3.5.22 and Element Plus 2.11.3 inside one 1.7 MB ESM file plus 348 KB of CSS, peering on the unscoped `schemastery@^3.16.1` rather than `@qilin-agent/schemastery`. Adopting it would put a second component framework and a component library into a React shell and break three client rules at once — no component library, locale-owned copy, and `--qilin-*` tokens for color. The model layer was worth taking; the renderer was not.

**Put the library in the module-table baseline.** `PLATFORM_MODULES` would give every dynamic bundle one shared instance, at the cost of a shell seed row and an `apps/web` input for a package whose values are pure functions with nothing to share. The `INLINE_SAFE` channel exists for exactly this: a fold a bundle may carry privately.

**Keep the helpers only in `ctx.settingsSchema`.** Shipped editors would then reach a schema walker through an injected service on every render, and the service's contract — the delivery path for dynamic plugins that cannot import values across packages — would carry a second responsibility it does not need. The bundle purity gate also rejects one feature plugin importing another feature plugin's values, so `ui-plugin-manager` could not have taken the helpers from `ui-settings` even if that were the only home.

**Render every settings surface generically.** Rejected when the configuration plane was designed and rejected again here: a fully generic form flattens a curated card into a schema dump. The [web configuration plane Agent Note](../../archived/architecture/2026-07-30-web-config-plane.md) records that decision, and the shipped settings cards (`ui-settings-plugins`) stay hand-written over `SettingsFormModel` and the same atoms. A row's form is generic only because a third-party row's schema has no card to hand-write.

## Consequences

One implementation now backs the settings service, the row form, and every future editor; the drift between `meta.role` and node-root reads is gone, and the textarea role works. Draft validation exists for the first time on this surface: an invalid draft is refused in the browser with schemastery's own message before anything is written, which is the only place it can be refused, because the Host writes the map as given.

The cost is a workspace browser library whose code is inlined per consumer bundle, and one more package in the client dependency graph. Rehydration still executes the served envelope (schemastery revives serialized callbacks through `new Function`), which stays safe only for an envelope from the same trusted host that serves the page.

The row form is not a generic schema form: nested `dict` and extension nodes are not editable, and a row whose `Config` requires one of them cannot be edited here at all — the validator says so instead of writing an incompatible map.

## Testing

[`packages/client/schema-form/tests/model.client.spec.ts`](../../../../packages/client/schema-form/tests/model.client.spec.ts) covers rehydration, validation failure text, and the immutable path operations, including array splices through array intermediates. [`schema.client.spec.ts`](../../../../packages/client/ui-settings/tests/schema.client.spec.ts) covers the same operations over the settings document's drafts. `pnpm run test:gui` runs both.

## Related

- [Web configuration plane](../../archived/architecture/2026-07-30-web-config-plane.md) — the settings wire face, the `ctx.settingsSchema` service, and why a generic renderer was rejected.
