---
description: "Read the Session’s current directory or enter an existing directory with the same tool. Relative changes use the current directory. The returned absolute path can be passed to other tools."
kind: "package-reference"
---

# @qilin-agent/tool-working-directory

English | [中文](README.zh.md)

## Summary

Read the Session’s current directory or enter an existing directory with the same tool. Relative changes use the current directory. The returned absolute path can be passed to other tools.

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

Mount alongside `tools` and `workingDirectory`. Call `working_directory({})` to read or `working_directory({ cd: "src" })` to change directory. The tool has no configuration fields.

```yaml
- name: '@qilin-agent/tool-working-directory'
```

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

The tool delegates validation, recovery, persistence, and context notices to the directory owner. Its canonical result contains `cwd`; native rendering returns that path. The generic tool card displays the arguments and result without a separate GUI renderer.

-----

<a id="further-exploration"></a>
## Further Exploration

- [Session group](../README.md) — durable Session services.
- [Tool catalog](../../../docs/tool-catalog.md) — the model-facing tool schemas.
- [Testing](../../../docs/testing.md) — composition and replay verification.

-----

<a id="model-experience"></a>
## Model Experience

### Tool schema and result

#### What the model sees

The [tool catalog](../../../docs/tool-catalog.md#qilin-agenttool-working-directory) defines the optional `cd` argument and canonical `cwd` result. Directory notices are owned by `@qilin-agent/working-directory`.

#### Token effect

The registered schema and returned path contribute tokens when the tool is available and invoked.

#### KV Cache effect

Changing tool availability changes its schema in the request; a directory change itself adds no schema tokens.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Directory changes are per Session** — existing shells, background jobs, and sandbox grants keep their own directories; the tool does not move them.

<a id="dev-note"></a>
### Dev Note

None.
