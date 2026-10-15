---
description: "Schema and draft model layer behind configuration editors: rehydrate a serialized schemastery envelope, validate drafts, and edit them immutably by path."
kind: "package-library"
---
# @qilin-agent/client-schema-form

English | [中文](README.zh.md)

## Summary

Schema introspection and immutable draft editing for the configuration editors of the web client. A Host row publishes its declared schemastery `Config` as the serialized `schema.toJSON()` envelope, and `rehydrateSchema` turns that envelope back into a live node tree, so the same schema that validates a row on the Host validates a draft in the browser. `setPath`, `deletePath`, `nodeAtPath`, and `validateDraft` apply and reject a draft by path; the package owns no React and no rendering.

Consumers: `@qilin-agent/client-ui-settings` serves these helpers as `ctx.settingsSchema`, and `@qilin-agent/client-ui-plugin-manager` builds a row's configuration form over them.

## Table of Contents

- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="model-experience"></a>
## Model Experience

None, as this package backs browser configuration editors; nothing here reaches a model request.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Rehydration executes the served envelope** — `rehydrateSchema` reconstructs a live schemastery validator, and schemastery revives serialized callbacks through `new Function`, so the schema envelope is executable content rather than inert data. This is safe only for an envelope from the same trusted host that serves the page; the protocol provides no inert cross-trust representation.
- **Validation is draft-level, not per-field** — `validateDraft` reports schemastery's first failure message, including its `$.path`; it does not map errors onto individual controls.
- **No generic renderer** — consumers build their own controls over these helpers. Every configuration surface in this repository decides its own layout; the [Web configuration plane Agent Note](../../../.agents/notes/archived/architecture/2026-07-30-web-config-plane.md) records why the schema dump that a fully generic renderer produced was rejected.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The package is built with the `staticLinked` preset and named in `INLINE_SAFE` in [`tsdown.client.ts`](../tsdown.client.ts): its exports are pure folds with no runtime identity to share, so a dynamic browser bundle inlines its own copy instead of requesting a module-table row.

</details>
