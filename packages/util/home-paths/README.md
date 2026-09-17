---
description: "Shared resolution of the QiLin home and user-data paths for packages that need one consistent root, tilde expansion, and stable watch paths."
kind: "package-library"
---

# @qilin/home-paths

English | [中文](README.zh.md)

## Summary

`@qilin/home-paths` lets package authors resolve one QiLin data root and derive child paths from it. An explicit path wins over `$QILIN_HOME`, which wins over `~/.qilin`; blank environment values are ignored. Its public helpers can render the root without revealing an absolute machine path, expand only bare or current-user tilde forms, and canonicalize watch targets whose final components do not yet exist. Use it as a direct library dependency, not through `cordis.yml`.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Use these helpers wherever a package must agree with the rest of the harness about where user data lives: resolve the home once, then derive every child path from it.

### Resolving the home

```ts
import { resolveDshHome, qilinHomePath, qilinCachePath } from '@qilin/home-paths'

const home = resolveQilinHome()                // configured path, else $QILIN_HOME, else ~/.qilin
const settings = qilinHomePath('settings')     // join one child onto the resolved home
const cache = qilinCachePath('models')         // $QILIN_HOME/cache/models, default ~/.qilin/cache/models
```

An explicit configured path has the highest precedence, then `$QILIN_HOME`, then the default `~/.qilin`. An empty or whitespace-only `$QILIN_HOME` is treated as unset, so a blank override never resolves the home to the current working directory.

`qilinCachePath(...segments)` derives paths from the resolved home's `cache` directory. With no segments it returns the cache directory itself. Pass an initial options object, `qilinCachePath({ qilinHome: home }, ...segments)`, to use an explicit configured home with the same precedence and tilde expansion. It returns an absolute path without creating directories.

### Displaying a home

For user-facing paths, render the root symbolically rather than as a machine path: the default home displays as `~/.qilin` and any configured home displays as `$QILIN_HOME`. The display form never leaks an absolute machine path.

### Expanding user paths

`expandHomePath` expands a leading `~`, `~/`, or `~\` against the operating-system home and leaves everything else untouched — non-tilde paths and named-user forms such as `~alice/...` pass through unchanged.

### Canonicalizing watch paths

`canonicalizeWatchPath` gives a native filesystem watcher one canonical spelling of its target: the deepest existing ancestor is resolved through `realpath` and any missing suffix is restored, so a file or directory can be watched before it is created. This prevents Windows from treating a regular-file ancestor as ordinary absence, and prevents 8.3 short-name aliases from mixing with the long paths the native watcher backend emits.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The package is built on one principle: all harness user data lives under one root, and every other helper derives from that decision.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Home resolution, path joining, display, tilde expansion, and watch-path canonicalization |
| — | No runtime invariant companion is published; this pure utility owns no event stream or mutable runtime data; its resolution rules and value algebra are enforced by unit tests. |

### Resolution rules

`resolveQilinHome` reads the explicit override, then `$QILIN_HOME`, then falls back to the operating-system home joined with `.qilin`. The chosen value is tilde-expanded and normalized to an absolute path; `qilinHomePath` joins child segments with Node's platform path rules. `qilinHomeDisplay` compares the resolved path against the default root and returns the symbolic label, so a configured home never leaks its absolute path.

### Canonicalization mechanics

`canonicalizeWatchPath` walks up from the target until it finds an existing ancestor, resolves it with `realpath`, proves it is an enumerable directory, and restores the missing suffix. Errors other than absence propagate, and a missing-suffix ancestor that is not a directory is rejected.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when you need the launcher or the consumers that depend on a single home root.

- [Boot package](../../boot/app-boot/README.md) — the launcher that resolves the home before any plugin mounts.
- [Shell environment](../../shell/shell-env/README.md) — how `QILIN_HOME` reaches model shell calls.
- [Anonymous user id](../../identity/anonymous-user-id/README.md) — a stored identity file under the resolved home.

-----

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>


These limits define when the helpers are not the right tool. They are current package constraints, not a task backlog.

- **Expansion is deliberately narrow** — only bare `~`, `~/...`, and `~\...` use the current operating-system home; named-user forms such as `~alice/...`, environment variables, and shell expressions remain unchanged.
- **Canonicalization reads but never mutates** — `canonicalizeWatchPath` performs `realpath` probes and propagates errors other than absence; callers still own directory creation, permissions, and trust policy for the resulting path.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
