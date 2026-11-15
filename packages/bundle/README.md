---
description: "Ready-made qilin profile bundles for the shared core, browser GUI, one-shot task, ACP, and SDK application surfaces."
kind: "package-group"
---

# bundle/ — profile plugin bundles

English | [中文](README.zh.md)

## Summary

This group maps the installable patch layers used by `qilin --profile`. Each package declares `qilin.bundle.patch`; the launcher stacks those patch documents to assemble a named profile. The `web`, `headless`, `acp`, and `sdk` profiles build on `qilin-base`, while `sdk-minimal` supplies its complete tree in one bundle. Domain packages can declare additional layers outside this directory.

## Table of Contents

- [Packages](#packages)
- [Related documentation](#related-documentation)
- [Dev Note](#dev-note)

<a id="packages"></a>
## Packages

| Package | Role | ctx key |
|---|---|---|
| [`base`](base/README.md) | Shared core for base-backed profiles | — (patch only) |
| [`acp-app`](acp-app/README.md) | Automation-only ACP stdio application over base | mounts the ACP bridge |
| [`web-app`](web-app/README.md) | Browser application layer over base | mounts Web rows |
| [`kylin-images-bundle`](kylin-images-bundle/README.md) | Built-in optional Image Studio layer over `dsh-kylin-images` | mounts the image tools and Settings entry when enabled |
| [`animations-bundle`](animations-bundle/README.md) | Built-in optional Animation Studio skill pack over `dsh-animations` | registers eight runtime skills when enabled |
| [`skills-bundle`](skills-bundle/README.md) | Built-in optional methodology skill pack over `dsh-skills-bundle` | registers 31 core skills and exposes optional skills when enabled |
| [`headless`](headless/README.md) | One-shot command-line task application over base | `headless-runner` |
| [`sdk-app`](sdk-app/README.md) | SDK JSON-RPC stdio application over base | mounts the SDK server |
| [`sdk-minimal`](sdk-minimal/README.md) | Standalone minimal SDK application without base or Web | — (complete patch tree) |

In-box bundles resolve from the qilin installation; out-of-tree bundles install into a profile through `qilin plugin --profile <name> add <package>`.

<a id="related-documentation"></a>
## Related documentation

- [qilin app](../../apps/cli/README.md) — the `qilin` command that starts a profile.
- [app-boot](../boot/app-boot/README.md) — how profiles are resolved, layered, and customized.
- [Profile plugin bundles note](../../.agents/notes/implemented/architecture/2026-08-05-profile-plugin-bundles.md) — the profile and bundle composition design.
- [Generated composition graph](../../apps/cli/composition.md) — the exact composition each shipped profile uses.

<a id="dev-note"></a>
## Dev Note

None.
