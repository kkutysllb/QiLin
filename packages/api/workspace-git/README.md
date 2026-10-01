---
description: "Host owner of the workspaceGit Remote namespace: repository discovery, porcelain status, staging, commits, branch listing and switching, bounded diff, push, and pull, each one fixed-argv git spawn inside the Session workspace root."
kind: "package-reference"
---

# @qilin/api-workspace-git

English | [中文](README.zh.md)

## Summary

Use this package to drive Git on a Session's workspace root from the web client: discover whether the root is a repository, read porcelain status with the current branch and its upstream position, read bounded diffs, stage and unstage paths, discard one path's worktree changes, commit the index with one message, list and switch branches, and push or pull. Every call spawns the configured git binary with a fixed argv inside the workspace root; no shell ever interprets a caller string.

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

Mount the package beside the Typert Gateway and `@qilin/api-workspace-files`, which supplies the `workspaceFileScope` lookup this service consumes; the bundle loads it right after `workspace-files`. Every method takes the Session identity on the wire, so a Client calls `remote.workspaceGit.isRepo(sessionId, signal)` and never names a root itself. This package is the Host half; the sidebar panel's Client half arrives separately.

| Method | Returns | Purpose |
|---|---|---|
| `isRepo()` | `boolean` | Whether the workspace root lies inside a Git work tree; `false` on every failure |
| `repoRoot()` | `string` | The work tree's top-level directory; outside a work tree fails with `not-a-repo` |
| `status()` | `GitStatus { branch?, upstream?, entries }` | Porcelain entries with staged/unstaged/untracked classification, the abbreviated `HEAD` ref, and the ahead/behind position against the upstream |
| `diff(path, staged)` | `string` | One unified diff as text — worktree-versus-index, or index-versus-`HEAD` with `staged`; an empty `path` diffs everything — bounded by `maxDiffBytes` |
| `stage(path)` | `void` | `git add -A` limited to one pathspec, or the whole work tree when `path` is empty |
| `unstage(path)` | `void` | `git reset -q` limited to one pathspec, or the whole index when `path` is empty |
| `discard(path)` | `void` | `git checkout -- <path>` for one path only; the whole-repo discard does not exist here |
| `commit(message)` | `void` | Commit the index with one trimmed message of 1..2000 characters |
| `branches()` | `GitBranches { branches, truncated }` | Local branches with the current marker, upstream names, and ahead/behind counts, from one `for-each-ref` call |
| `checkout(branch)` | `void` | Switch to an existing local branch with an accepted name |
| `createBranch(name, from)` | `void` | Create a local branch; an empty `from` starts from `HEAD` |
| `push(setUpstream)` | `void` | Push the current branch; `setUpstream` passes `--set-upstream origin HEAD` |
| `pull()` | `void` | Pull into the current branch from its upstream |

### Fixed argv, no shell

The `@qilin/shell` seam executes one command-line string through a shell, so a one-call-one-fixed-argv spawn is not expressible there; this service spawns `node:child_process` directly and every argument is one argv element. Caller strings enter argv only as a pathspec after `--` (which makes any leading `-` a pathspec character, not an option), as the one `-m` commit message, or as a branch name matching `/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/` — anything else fails with `bad-branch` before git runs. That first-character class keeps every accepted name from spelling a git option.

### Status classification

`status` runs `git status --porcelain=v1 -z --untracked-files=all` and classifies each `XY` record: `staged` is a non-blank, non-`?` index column; `unstaged` is the same for the worktree column, so an unmerged conflict reports both; `untracked` is the `??` pair. A rename or copy reports the path the entry now lives at, not the origin. `branch` is `git rev-parse --abbrev-ref HEAD`, absent on an unborn `HEAD`; `upstream` is `{ ahead, behind }` from `git rev-list --left-right --count HEAD...@{upstream}`, absent when no upstream is configured or it is gone. Ignored files never appear.

### Configuration

| Field | Default | Meaning |
|---|---|---|
| `gitBin` | `git` | Git executable spawned for every call |
| `timeoutMs` | `30000` | Kill deadline on one content or mutation command (`status`, `diff`, `add`, `reset`, `checkout`, `commit`, `for-each-ref`, `push`, `pull`) |
| `discoveryTimeoutMs` | `5000` | Kill deadline on one repository-discovery command (`rev-parse`, upstream resolution) |
| `maxDiffBytes` | `1048576` (1 MiB) | Inclusive byte cap on one diff; a larger diff fails with `too-large`, never shortened |
| `maxStderrChars` | `2000` | Character cap on the stderr one command failure carries |
| `maxListEntries` | `200` | Cap on returned branch entries; the rest is dropped and reported cut |

The generated [configuration catalog](../../../docs/config-catalog.md#qilinapi-workspace-git) is the exhaustive source for every accepted field and its JSDoc.

### Failures

Each failure is one `RemoteError` code with typed details, declared in [`src/types.ts`](src/types.ts): `workspace-git/not-a-repo`, `workspace-git/bad-branch` (`branch`), `workspace-git/bad-message` (`length`), `workspace-git/bad-path` (`path`), `workspace-git/too-large` (`bytes` is a lower bound observed before the kill, plus `maxBytes`), and `workspace-git/command-failed` (`command` names the invocation, `code` the exit status when there is one, `stderr` trimmed to `maxStderrChars`; a timeout names itself in `stderr` and carries no `code`). Callers branch on the code, never on message text.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design concept

The workspace root arrives through the `workspaceFileScope` Typert lookup that `@qilin/api-workspace-files` registers; this package declares no lookup of its own and imports the scope type type-only, because Typert binds a lookup parameter by its Host type symbol, not by structural shape. One private `run` spawns git with a fixed argv, applies the call's timeout, honors caller cancellation by rejecting with the abort reason, and optionally kills the child once stdout passes `maxDiffBytes` so an oversized diff never buffers whole. Every method maps failures at one place: discovery refusals to `not-a-repo`, validated refusals before any spawn, and everything else to `command-failed` with the invocation and trimmed stderr. The parsers are pure functions over recorded output strings, exported for fixture specs.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `WorkspaceGit`: the `workspaceGit` service and Remote namespace, `Config`, the fixed-argv spawn runner, and every Remote method |
| [`src/parse.ts`](src/parse.ts) | Pure parsers: porcelain `-z` status, the fixed `for-each-ref` format, and `rev-list --left-right --count` |
| [`src/types.ts`](src/types.ts) | Wire types and the `RemoteErrorDetailsMap` codes, published as `./types` for Client packages |
| — | No runtime invariant companion is published; every answer is derived from one fresh git invocation at call time. |

Typert generates the Host and Client Remote artifacts exposed by `./typert` and `./remote`.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Workspace file service](../../api/workspace-files/README.md) — owner of the `workspaceFileScope` lookup this service consumes, and the file panel this panel sits beside.
- [Remote assembly](../../api/remotes/README.md) — how Client packages reach the `workspaceGit` namespace.
- [Typert protocol](../../typert/protocol/README.md) — the lookup and Remote method mechanics this service is built on.

-----

<a id="model-experience"></a>
## Model Experience

None, as this package registers no tool, contributes no prompt section, and appends no session event.

#### KV Cache effect

None; this package neither assembles nor sends a provider request.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- **Core git only** — no GitHub/`gh` surface: no pull requests, issues, or remote repository management.
- **`push --set-upstream` names `origin`** — the upstream push targets the `origin` remote by that fixed name; a differently named remote fails with `command-failed` and its stderr.
- **No merge method parameter** — `pull` uses the repository's own merge configuration; the merge/squash/rebase enum the argv rules admit has no consuming method yet.
- **Paths decode as UTF-8** — porcelain paths are decoded from the diff/status bytes as UTF-8; a path with undecodable bytes round-trips lossily.
- **`diff` bytes are a lower bound on refusal** — the child is killed at the cap, so `too-large` reports the bytes observed before the kill, not the complete diff's size.
- **Timeouts kill once, with SIGTERM** — a git that ignores SIGTERM holds the call until the process exits; there is no SIGKILL escalation.
- **No timeout coverage in tests** — the timeout arm is exercised only by production; no deterministic in-repo git command was found that reliably exceeds a configured deadline.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
