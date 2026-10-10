---
description: "Build the POSIX SSH helper as a standalone executable that embeds its own Node runtime, so a remote host needs no Node installation."
kind: "package-library"
---

# @qilin-agent/ssh-helper-runtime

English | [中文](README.zh.md)

## Summary

The private carrier turns the SSH helper, the managed subprocess runner and the embedded PTC worker into one executable archive, so a remote host runs them without installing Node or workspace packages. `runSshHelperRuntime` is the only entry: it asserts the SEA bootstrap, points the native package at its co-shipped directory, then dispatches to exactly one of the three. Connection configuration stays in [`qilin-ssh`](../ssh/README.md).

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

The carrier is a private workspace package: it is not a profile plugin and it exposes no npm CLI. Its distribution unit is an executable archive holding the executable, the `native/system/` directory beside it and integrity metadata; a deployment extracts the whole archive into a versioned runtime location instead of replacing a temporary mount.

Configure the remote connection in [`qilin-ssh`](../ssh/README.md) with `launch: { kind: "executable" }`, naming the absolute `helper` path and its SHA-256. The connection obtains the embedded PTC invocation from `ctx.ssh.ptcLaunch`.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The bootstrap runs only from the packaged executable, so the entry rejects a plain `node` invocation. Two facts drive the remainder: the operating system executes the Landlock launcher and the PTY launcher from real files, and the platform native package is resolved by specifier at runtime. A process-local resolution hook maps `@qilin-agent/node-addon-system-<platform>-<arch>/package.json` to `native/system/package.json` beside the executable, which is why that directory must ship with it; node-pty keeps its executable-relative spawn-helper convention.

Dispatch reads the private selectors before importing anything and then removes them. `QILIN_PTC_RUNTIME_NODE=1` imports the PTC Node worker; any `QILIN_SUBPROCESS_RUNNER` value imports the managed subprocess runner and passes it the selector; neither present imports the SSH helper. The runner entry states that its selector arrives already removed, so the bootstrap owns that deletion.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [SSH connection](../ssh/README.md) — authentication, invocation and lifecycle.
- [PTC Node runtime](../../ptc-runtime/ptc-runtime-node/README.md) — explicit worker launch and execution limits.
- [SSH subsystem](../../../docs/subsystems/ssh.md) — remote execution coordinates.

-----

<a id="model-experience"></a>
## Model Experience

None, as this private process carrier registers no model-facing tools or prompt content; its consumers own operation results.

#### KV Cache effect

The carrier adds no request-prefix content.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The repository carries no archive builder or artifact verifier for this carrier, so it cannot be exercised from a checkout until they exist.
- Windows and musl-based Linux are not targets. Sandbox availability still depends on the target kernel and system tools.
- The executable accepts private worker invocations, not arbitrary Node CLI arguments. Project `node` commands and nested JavaScript subprocesses need their own Node installation.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

</details>
