---
description: "The extensions group map: model-facing tools and dual-half runners for defining, running, and removing dynamic Kylin packages, for users and maintainers navigating the group."
kind: "package-group"
---

# packages/extensions

English | [中文](README.zh.md)

## Summary

The extensions group lets an agent inspect and modify the live DSH runtime without editing repository files or configuration. It can define, run, update, stop, and remove dynamic Kylin packages from model tools or a browser panel. A package may affect the host, browser, or both, and immutable versions support controlled updates. Definitions exist only in process memory and disappear when DSH restarts. Choose the child package for model tooling, host execution, browser execution, or browser controls.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

-----

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`tool-kylin`](tool-kylin/README.md) | Seven model-facing tools: inspect the live runtime, define, run, stop, and remove dynamic packages | registers on `ctx.tools` |
| [`kylin-host-runner`](kylin-host-runner/README.md) | Host half: definition registry, sandboxed host-half lifecycle, and the inspect registry that answers browser queries | provides `ctx.dynamicKylinRunner` and `ctx.cordisInspect` |
| [`kylin-client-runner`](kylin-client-runner/README.md) | Browser half: evaluates a browser-half source into a live plugin and answers run requests | client face; provides browser `ctx.dynamicKylinRunner` |
| [`ui-kylin`](ui-kylin/README.md) | Browser surfaces: the frame-wide panel, lifecycle tool cards, and the `@pluginId` input source | client face; registers slots |

-----

<a id="related-documentation"></a>
## Related documentation

- [Extensions subsystem](../../docs/subsystems/extensions.md) — the generated `ctx.cordisInspect` and `ctx.dynamicKylinRunner` service API.
- [Generated tool catalog](../../docs/tool-catalog.md#qilintool-kylin) — the seven model-facing tool schemas.
- [Generated configuration catalog](../../docs/config-catalog.md#qilinkylin-host-runner) — the runner's accepted config fields.
- [Self-referential Kylin toolset Agent Note](../../.agents/notes/implemented/feature/2026-07-08-self-referential-cordis-toolset.md) — design home for sandbox semantics, lifecycle, and composition.
- [Client shells and dynamic packages Agent Note](../../.agents/notes/implemented/architecture/2026-08-15-client-shells-and-dynamic-packages.md) — package placement and build faces for the client halves.

-----

<a id="dev-note"></a>
## Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The two browser-half packages live in this group rather than under `packages/client/` because they are halves of this subsystem's dual-half packages; the client face compiles them through the client program, while the host program references only the host runner.

</details>
