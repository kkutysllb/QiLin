# Agent Note: Web Scheduler API shim at the host entry points

Status: implemented

English | [中文](2026-10-07-web-scheduler-yield-host-shim.zh.md)

## Problem

The dsh 0.2.1-alpha.1 port brought cooperative-yield paths that call the Web Scheduler API: the cold session list in `@qilin-agent/api-session-controller` and the work-slice yields in `@qilin-agent/session-persistence-jsonl`. Read as a bare global, `scheduler` exists on neither host that serves the harness — Node 24.18.0 defines no such global while `node:timers/promises` exports one, and Electron 44 bundles Node 24 — and the resulting `ReferenceError` landed inside the RPC gateway: the gateway failed as a whole instead of one call, and the desktop Shell showed an empty session history.

## Decision

Both host entry points install a `globalThis.scheduler.yield` fallback when the host provides no `scheduler`. `apps/cli/src/scheduler-yield.ts` holds the TypeScript one and `apps/cli/src/bin.ts` calls it at the top of the entry, ahead of every mode module, so it covers all invocation modes (`profile`, `plugin`, `tenants`, `dump-config`). `desktop/package/app/host/main.mjs` carries its own copy because the Electron-as-Node host cannot import the TypeScript module. The fallback resolves on the next `setImmediate` — the API's "yield to the event loop once, then continue" semantic — and a host-provided `scheduler` is never overwritten.

The three call sites no longer depend on it: each imports `scheduler` from `node:timers/promises`, which every supported interpreter provides (`@types/node` dates the export to Node 17.3.0). The shim is the host-capability guarantee for the rest of the process — modules ported from upstream and third-party plugins loaded into the same host.

## Alternatives considered

**Require a host that defines the global.** Rejected: the `engines` range (`^22.19.0 || >=24.0.0`) and the runtime the desktop Shell actually uses (Node 24 inside Electron 44) are chosen by consumers of this repository, not by it.

**Drop the shim and rely on the call sites' module imports.** Rejected: those three imports are what makes the harness itself correct, but the failure the shim prevents is process-wide, and the code that can read the global includes modules this repository does not ship — a module ported from upstream, or a third-party plugin the plugin manager loads. No static check enumerates them, while the guarantee costs one `setImmediate`-backed method.

**Depend on a published `scheduler` shim package.** Rejected: the surface used is one method with a documented semantic, and such a package would still have to be installed before the modules that read the global evaluate, which is exactly the entry point this installs from.

## Consequences

The global is defined in every `qilin` invocation mode and in the desktop host process; a host that defines `scheduler` keeps its own implementation and repeated installation is a no-op. Running the harness under a supported Node cannot reveal a missing global, because nothing shipped reads it — `apps/cli/tests/scheduler-yield.spec.ts` is the coverage, pinning that the fallback yields past the microtask queue, that a host-provided `scheduler` survives, and that installation is idempotent. The two copies are removed together once the harness and the plugins it loads stop reading the global bare.
