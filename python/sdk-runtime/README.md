# deepseek-harness-runtime-bin

English | [中文](README.zh.md)

Platform runtime wheel for the QiLin Python SDK. It packages the normal `qilin` CLI and its closed Node dependency tree into a native executable, so SDK use requires no system Node.js. This package publishes wheels only.

## Installed commands and artifacts

The wheel installs a `qilin` console command and the `deepseek_harness_runtime` Python module. `qilin` forwards its arguments to the bundled executable and requires a non-empty `QILIN_HOME`; it never falls back to `~/.qilin`.

Production executables are named `deepseek-harness-sdk-runtime-<platform>-<arch>` under the module's `runtime/` directory; Windows uses the `.exe` suffix. Linux and macOS wheels include a target-native `-rg` sidecar, Windows includes `-rg.exe`, and macOS also includes `-spawn-helper` for `node-pty`. Published targets are Linux x64, Linux arm64, macOS arm64, macOS x64, and Windows x64. The wheel tag and payload must match exactly; no Windows arm64 wheel is published.

The wheel carries only the executable, native execution helpers, and `<platform>-<arch>/` with `downloads.json` and the lightweight `office-skills/` tree. CPython, authoring libraries, standalone Node, pnpm, and the complete Office sidecar are optional downloads. Importing Python modules, starting SDK profiles, and processing Office files never download resources.

Download either resource explicitly before using it:

```py
from deepseek_harness_runtime import download_office, download_primary_runtime

office = download_office()
primary_runtime = download_primary_runtime()
```

`download_office()` downloads the locked npm Kit, target engine, and complete dependency tree, plus standalone Node for the Kit CLI. `download_primary_runtime()` independently downloads CPython, locked Python libraries, Node, pnpm, and Office skills. Both return absolute resource directories and reuse completed caches. The authoring download validates its target, interpreters, library directory and skills before returning. The existing local `installPrimaryRuntime()` operation still copies an already available payload; it does not download. The shared builder applies the [NumPy/pandas test-file exclusions](../../apps/desktop/README.md#bundled-workspace-dependencies).

`QILIN_RESOURCE_CACHE` selects an absolute cache root, defaulting to `~/.cache/qilin/resources`. Resource identities include the release's locked inputs. Downloads verify archive hashes and package identities, preserve executable permissions, and publish completed directories atomically. Failed downloads can be retried. `QILIN_RESOURCE_DOWNLOAD_TIMEOUT_MS` bounds each archive download, including its body; the default is `300000`, and accepted values are integers from `1` to `2147483647`. Downloads follow the Harness proxy environment policy. Installed wheel files are never modified. Release versions have separate cache directories; unused versions require manual removal. Downloads use the locked upstream URLs without a registry or mirror override.

On subsequent launches the packaged bootstrap exposes downloaded resources to the SDK profile. `QILIN_PRIMARY_RUNTIME` overrides the cached authoring environment; an empty value disables its query. `QILIN_OFFICE_SIDECAR` can select an absolute sidecar directory with its standalone Node. Users may provide their own Python environment and document libraries without downloading the authoring environment. Office skills are available when either resource is selected; authoring-only deployments expose the skills with the Kit CLI disabled. External authoring payloads retain the `primary-runtime/` plus sibling `office-skills/` layout. The SDK reads resources in place without copying them into `QILIN_HOME`. The `sdk-minimal` profile does not mount these providers.

Repository builds also materialize a dev-only `runtime/node/` carrier. It runs `node runtime/node/runtime-bootstrap.mjs` on system Node 22.19 or newer. It is never selected automatically and is excluded from wheels and sdists.

Both carriers execute the same `qilin` grammar and shipped profiles, including the standalone `sdk-minimal` tree and the full `web` profile with its frontend assets. The private `qilin-python-runtime-closure` manifest defines the packaged dependency closure; there is no Python-specific Node application or checked-in default `cordis.yml`.

## Python module API

- `bundled_package_dir() -> Path` returns the installed module-data root and verifies its release metadata.
- `bundled_runtime_path() -> Path` returns the current platform executable and verifies required sidecars.
- `resolve_bundled_launch_args(mode=None) -> tuple[str, ...]` returns the executable argv by default. Explicit `mode="node"` or `QILIN_RUNTIME_MODE=node` selects the repo-only Node carrier.
- `download_office() -> Path` explicitly downloads or reuses the Office sidecar and its standalone Node.
- `download_primary_runtime() -> Path` explicitly downloads or reuses the authoring environment.
- `resolve_office_launch_args() -> tuple[str, str]` locates the installed Node and Kit CLI without downloading; missing resources raise `FileNotFoundError` with the download instruction.
- `main()` implements the installed `qilin` console command and rejects an absent or blank `QILIN_HOME`. On Windows it waits for the bundled process with inherited standard streams and forwards its exit status; on POSIX it replaces the Python process.

Unsupported platforms and missing executables or sidecars raise `FileNotFoundError` with the build and installation routes. Unknown runtime modes raise `ValueError`.

## Packaged profile resolution

`qilin` initializes shipped profiles under the explicit home, composes their bundle patches, and loads bundled plugins from the executable's virtual filesystem. Because operating-system symlinks cannot enter that filesystem, packaged launches maintain small real ESM proxy packages under `$QILIN_HOME/profiles/node_modules`. Each proxy mirrors explicit runtime exports, records the original package identity, and re-exports the virtual module URL. Built-in rows and external plugin peers therefore share one Kylin/module instance. Native shared libraries and Windows ConPTY addons are packaged with native addons, while ripgrep and the macOS PTY helper remain executable sidecars.

Python and the packaged bootstrap share the resource layout: `<cache>/<identity>/office/`, `node/bin/node[.exe]`, and `node_modules/@deepseek-ai/libreoffice-kit/lib/cli.js`. Automatic Office cache discovery requires the `complete` marker to match the manifest identity; an explicit `QILIN_OFFICE_SIDECAR` requires the Node and CLI files. The Python bootstrap resolves the Office kit from its explicitly downloaded or selected sidecar so native helpers and URL Workers use real filesystem paths. The kit owns document operations; the Python bootstrap adds no runtime download or compilation.

External profile management uses `qilin plugin --profile <name> ...`. That command requires `pnpm` on `PATH`; ordinary SDK/profile execution does not.

## Build and distribution

Production deployment permits unused workspace patches for packages outside the runtime closure; patches for included packages must still apply successfully. This exception is confined to the deploy command; repository installation still rejects unused patches.

From the repository root, `pnpm exec tsx scripts/build-exe-for-python-sdk.ts` verifies the closure, builds packages, deploys a symlink-free tree, packages the selected target, and syncs the executable and sidecars into this module. `scripts/build-python-release.py` stages release-shaped wheels at the root repository version and pins `deepseek-harness-sdk` to the exact runtime version.

The installed-wheel smoke creates a clean virtual environment outside the checkout, proves the installed distribution and executable identities, then exercises default and customized SDK profiles, external plugins, MCP, native tools, direct JSON-RPC, committed snapshots, and the real provider on trusted runs. Its Office scenario relocates the complete target payload and converts DOCX with the required platform engine: the target’s declared native engine, or WASM when no native engine is declared. See the [Python contributor workflow](../development.md) and [installed-wheel testing decision](../../.agents/notes/implemented/testing/2026-08-23-installed-python-wheel-black-box-ci.md).
