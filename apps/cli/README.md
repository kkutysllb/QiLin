# `@qilin/cli`

English | [中文](README.zh.md)

The `qilin` command is the sole supported Node application launcher: profiles are ordered stacks of plugin-bundle patch layers under the user's own overrides. SDK and ACP are profiles, not separate public bins. The Python runtime wheel packages this same command; the SDK defaults to `sdk`, and the minimal example selects `sdk-minimal`. [`src/args.ts`](src/args.ts) owns the command grammar, and [`src/bin.ts`](src/bin.ts) loads only the selected runner. Invalid commands, options from another mode, and fatal configuration or boot failures exit nonzero.

## Entry modes

| Command | Purpose |
|---|---|
| `qilin --profile <name>` | Boot the named profile under `$QILIN_HOME/profiles/<name>`. |
| `qilin --profile <name> --from-default-profile <template>` | Create a new custom profile from a shipped template, then boot it. |
| `qilin --profile acp` | Serve automation clients over ACP stdio until disconnect. |
| `qilin --profile headless "job"` | Run one fresh persisted session, print the final answer, and exit. |
| `qilin --profile sdk` | Serve SDK clients over JSON-RPC stdio until shutdown or disconnect. |
| `qilin --profile sdk-minimal` | Serve SDK clients with the standalone minimal agent tree. |
| `qilin web` | Alias of `--profile web`. |
| `qilin plugin --profile <name> <pnpm args>` | Manage a profile's plugins by forwarding to pnpm in the profile directory. |
| `qilin plugin list` | List a profile's bundle layers in activation order; omit `--profile` for the product profile. |
| `qilin plugin doctor <package\|directory>` | Report one plugin package's DSH-era compatibility without installing or running anything. |

The invoking directory is the default workspace root. The `web`, `headless`, `sdk`, `sdk-minimal`, and `acp` profiles auto-initialize on first use from shipped templates. Create another profile at an unused, non-shipped name with `--from-default-profile`, or initialize a base-backed profile through `qilin plugin`. The `desktop` name is reserved for the Electron-owned profile, so the CLI rejects boot, config-dump, and plugin-management requests for it. After a successful package operation the command reconciles the profile's bundle list, and it refuses a profile whose installed dependencies include an upstream DSH-era engine package: the diagnostic names each colliding package, the QiLin package it maps onto, and the `remove` command that clears it, and the command exits 1 without changing the bundle list.

`list` and `doctor` read the profile and never initialize it or run pnpm. `doctor` accepts an installed package name or a package directory and checks the four rules a plugin must satisfy to load here: whether the package builds the DSH-era home itself instead of reading `DSH_HOME`/`QILIN_HOME`, installs an engine package the harness supplies, imports an engine name it never declared as a peer, and injects client module names the compatibility layer cannot map. It prints one finding per line and exits 1 only when a finding blocks activation.

Install the command itself from the published package (`npm install -g @qilin/cli`) to get `qilin` on `PATH`; the manifest declares `lib/bin.js` as the `qilin` bin and ships only that bundle.

## App arguments

The launcher parses only its own flags and hands everything after them to the booted profile, where any injected app plugin may parse the shared immutable snapshot ([`qilin-cmdline`](../../packages/boot/cmdline/README.md)). The first token the launcher does not recognize starts the app's arguments:

```sh
qilin --profile web --port 8080       # --port belongs to the web app
qilin --profile tui --resume <id>     # example, assuming the tui profile is installed; --resume belongs to the terminal app
qilin --profile headless "run the tests"
qilin --profile web --help            # the web app's flags, not the launcher's
qilin --help                          # the launcher's own help
```

<a id="profiles"></a>
## Profiles

A profile directory holds a `package.json` (out-of-tree plugin dependencies plus the profile manifest `qilin.profile` with its ordered `bundles` list and `patchReload` lifecycle) and a `cordis.patch.yml` (the user's own patch layer). `patchReload: live` watches the profile and home-level patch files; `startup` applies them once.

The tree composes over an empty root:
- each bundle's patch in `qilin.profile.bundles` order
- then the profile's `cordis.patch.yml`, then the home-level `$QILIN_HOME/cordis.patch.yml`
- then `--patch` overlays

Bundles named in `qilin.profile.bundles` resolve from the qilin installation first (`@qilin/base`, `@qilin/web-app`, `@qilin/headless`, `@qilin/sdk-app`, `@qilin/sdk-minimal`, `@qilin/acp-app`), then from the profile's own `node_modules`, where pnpm installs out-of-tree plugins.

Use `--dump-default-config` and `--dump-config` to inspect the composed tree without booting it.

The [CLI behavior reference](reference/README.md) owns exact layer precedence, flags, shutdown behavior, deployment defaults, and source execution. The [startup and reload failure table](../../packages/boot/app-boot/README.md#startup-and-reload-failures) compares optional and required plugin failures with configuration HMR.

## Optional overlays

`config/examples/` ships opt-in overlays for GitHub review webhooks, session-local Schedule, memory MCP servers, and runtime Kylin tools. They are never part of a default profile; the [user guides](../../docs/user/guide/index.md) and [developer practice guides](../../docs/user/develop/practice/index.md) own setup and safety instructions.

## Development

Production runs require built package and frontend artifacts. From the repository root, run `pnpm run build` separately, then use `pnpm qilin <args...>` to run the TypeScript entry and forward every argument; the [source-execution reference](reference/README.md#source-execution) owns the module-resolution contract.

The [Web failure matrix](tests/profiles/web/tests/web-failure-matrix.expected.e2e.ts) runs the built CLI through startup failures and native configuration HMR with `awaitWriteFinish` enabled in `test:expected`. It verifies authenticated HTTP responses, diagnostics, recovery, process exits, and disposal without model API calls; the [startup acceptance](tests/profiles/web/tests/web-best-effort-startup.expected.e2e.ts) also covers the shipped required Web dependencies and port conflicts.
