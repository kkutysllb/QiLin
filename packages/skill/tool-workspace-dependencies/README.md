---
description: "The load_workspace_dependencies tool: absolute paths into a bundled Python, Node.js, and pnpm payload, used in place or installed under the QiLin home."
kind: "package-reference"
---

# @qilin-agent/tool-workspace-dependencies

English | [中文](README.zh.md)

## Summary

Deployments that ship their own script runtimes — a container image layer or a deployment-provided primary runtime — mount this tool so the agent can ask where the bundled Python, Node.js, and pnpm live instead of discovering a system interpreter. The tool returns absolute paths and recorded distribution versions; it changes neither `PATH` nor package-manager settings. The payload is either copied under the QiLin home on first use or used where it lies (read-only carriers).

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

Mount the plugin beside the tool registry with the payload directory. Configuration validation requires a nonempty `source` and rejects empty `root` values before activation; both paths must be absolute. The bundled Office skills (`@qilin-agent/skill-office`) call this tool by name for their default interpreter.

### Minimal configuration

```yaml
- name: '@qilin-agent/tool-workspace-dependencies'
  config:
    source: /path/to/primary-runtime
```

| Field | Default | Meaning |
|---|---|---|
| `source` | required | Absolute payload directory carrying `runtime.json` and `dependencies/`. |
| `root` | unset | Absolute installation directory under the QiLin home. Set: the payload is copied there on the first call and reused while `runtime.json` is unchanged. Unset: the payload is validated and used in place; nothing is copied. |

### Payload layout

`runtime.json` records `desktopVersion`, `platform` (`win32`, `darwin`, or `linux`), `arch`, optional `payloadDigest`, top-level `python`, optional `node`/`pnpm` versions, and the complete `pythonPackages` distribution-version map. A pnpm entry requires Node.js. Python libraries, including numpy and pandas, appear only in `pythonPackages`. Entries live under `dependencies/`: `python/bin/python3` (`python/python.exe` on Windows) with `site-packages` beneath it, and, when declared, `node/bin/node` with `node/node_modules` and `pnpm/bin/pnpm.mjs`. A manifest whose platform or architecture differs from the running process is rejected.

### Carrier activation

The `sdk` profile mounts this tool and `@qilin-agent/skill-office` only when a carrier path exists. A deployment declares one of two environment variables; with neither set, both rows stay disabled and no payload is read.

| Variable | Meaning |
|---|---|
| `QILIN_PRIMARY_RUNTIME` | Absolute path to a `primary-runtime/` payload directory. An empty string opts out even when a packaged carrier default exists. |
| `QILIN_BUNDLED_PRIMARY_RUNTIME` | Carrier default supplied by a packaged carrier. Its `skill-office` `assetRoot` resolves to the sibling `office-skills/` directory and its Node executable to `<payload>/dependencies/node/bin/node`. |

A carrier directory keeps the two resource trees side by side:

```text
<carrier>/
  primary-runtime/
    runtime.json
    dependencies/python/…
    dependencies/node/…
    dependencies/pnpm/…
  office-skills/
    office-docx/SKILL.md
    office-pptx/SKILL.md
    office-xlsx/SKILL.md
    scripts/check_office.py
```

The three Office workflows and their shared checker ship in this repository under [`packages/skill/skill-office/assets/`](../skill-office/assets); copy that tree to `<carrier>/office-skills/`. A container can copy both directories into an immutable image layer and set `QILIN_PRIMARY_RUNTIME` to the absolute `primary-runtime/` path; the tool then queries that payload in place. Profile patches can disable `skill-office` or replace its `assetRoot` independently of this tool, and a custom Python-only payload must either patch `skill-office.config.cli: false` or supply `skill-office.config.node`. Missing skill resources produce a startup warning; invalid or incomplete payloads fail the first tool call. Configuration changes require restarting the SDK process.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

`readPrimaryRuntime` and build smoke checks share `parsePrimaryRuntime`. It validates the flat manifest and rejects duplicate normalized distribution names. Legacy `components` metadata is normalized in memory, retaining its consistency checks; a missing legacy distribution map becomes empty. Mixed flat and legacy version fields are rejected. Reads do not rewrite metadata, and equivalent normalized manifests can reuse an installed payload. `workspaceDependencyPaths` derives the platform-specific entries. `installPrimaryRuntime` copies into a staging directory, requires declared interpreters and scripts to be files and package roots to be directories, and swaps it into place while retaining the previous tree on failure; `resolvePrimaryRuntime` verifies the same entries without copying. The tool memoizes the first successful preparation for the plugin's lifetime.

| File | Responsibility |
|---|---|
| [`src/index.ts`](src/index.ts) | Manifest validation, path derivation, in-place and installed preparation, tool registration. |

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Office skills](../skill-office/README.md) — the workflows that call this tool for their interpreter.
- [Tool registry](../../core/tools/README.md) — registration and schemas.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schema

#### What the model sees

The model sees the generated [`load_workspace_dependencies` schema](../../../docs/tool-catalog.md#qilin-agenttool-workspace-dependencies).

#### Token effect

Fixed schema cost per request where the tool is visible; the description names the bundled Office libraries so the model can choose the interpreter without loading a skill first.

#### KV Cache effect

Prefix-stable while the tool definition and visibility are unchanged.

### Tool result

#### What the model sees

One JSON object with absolute `python` and `pythonPackages` paths, `pythonDistributions` from `runtime.json`, and `node`, `nodePackages`, and `pnpm` when the payload declares them. Repeated calls return the same object.

#### Token effect

A few hundred characters per call; paths dominate.

#### KV Cache effect

Append-only tool result in the turn history; no prompt section is added.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- This repository ships no primary-runtime builder: the payload is always deployment-provided, and the shipped profiles read it only through `QILIN_PRIMARY_RUNTIME`.
- Linux targets require glibc; musl payloads are not locked.
- Windows payloads used in place must already be executable from their carrier; the in-place mode performs no permission repair.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

The carrier boundary is recorded in the [desktop and account alignment boundaries](../../../.agents/notes/implemented/architecture/2026-09-25-desktop-and-account-alignment-boundaries.md): this repository neither builds nor releases the desktop carrier, so the payload directory arrives from the deployment.

</details>
