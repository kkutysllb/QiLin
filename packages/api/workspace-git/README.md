---
description: "Host owner of the workspaceGit Remote namespace: repository discovery, porcelain status, staging, commits, branch listing and switching, bounded diff, push, pull, and the gh pull-request face, each one fixed-argv git or gh spawn inside the Session workspace root."
kind: "package-reference"
---

# @qilin/api-workspace-git

English | [中文](README.zh.md)

## Summary

Use this package to drive Git on a Session's workspace root from the web client: discover whether the root is a repository, read porcelain status with the current branch and its upstream position, read bounded diffs, stage and unstage paths, discard one path's worktree changes, commit the index with one message, list and switch branches, and push or pull. Through the `gh` CLI it also probes the GitHub login and lists, opens, and merges pull requests. Every call spawns the configured git or gh binary with a fixed argv inside the workspace root; no shell ever interprets a caller string.

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
| `ghAvailable()` | `boolean` | Whether the configured gh binary answers `--version`; `false` on every failure |
| `ghAuthStatus()` | `GhAuthStatus { authenticated, account?, message }` | The gh login state; never throws — a missing binary, timeout, or missing login is `authenticated: false` with a readable `message` |
| `ghListPrs(state)` | `readonly GhPr[]` | Pull requests from one `gh pr list --json` call, capped by `maxListEntries`; `state` is `open`, `closed`, or `all` |
| `ghCreatePr(title, body, base)` | `GhCreatedPr { number, url }` | Open one pull request for the current branch; an empty `base` selects the repository default branch |
| `ghMergePr(number, method)` | `void` | Merge one pull request; an empty `method` passes no strategy flag and leaves the choice to gh |

### Fixed argv, no shell

The `@qilin/shell` seam executes one command-line string through a shell, so a one-call-one-fixed-argv spawn is not expressible there; this service spawns `node:child_process` directly and every argument is one argv element. Caller strings enter argv only as a pathspec after `--` (which makes any leading `-` a pathspec character, not an option), as the one `-m` commit message, as the `--title`/`--body` pull-request values, or as a branch name matching `/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/` — anything else fails with `bad-branch` before git runs. That first-character class keeps every accepted name from spelling a git option.

### The gh pull-request face

`ghAvailable` and `ghAuthStatus` probe the environment and never throw: a missing binary, a timeout, or a missing login all resolve, so the panel renders a degraded state instead of catching errors. `ghListPrs` reads one `gh pr list --json` answer and reports the seven fields the panel lists; a row gh omits a field for arrives as its zero value, and output that is not a JSON array yields no rows. `ghCreatePr` trims `title` and `body`, bounds-checks them (1..500 and 1..4000 characters) before gh runs, and takes the last https URL of gh's answer, parsing the pull-request number from it. `ghMergePr` passes the method as its matching `--merge`/`--squash`/`--rebase` flag, or no strategy flag at all when the method is empty — gh's non-interactive rules and the repository's allowed methods then decide.

### Status classification

`status` runs `git status --porcelain=v1 -z --untracked-files=all` and classifies each `XY` record: `staged` is a non-blank, non-`?` index column; `unstaged` is the same for the worktree column, so an unmerged conflict reports both; `untracked` is the `??` pair. A rename or copy reports the path the entry now lives at, not the origin. `branch` is `git rev-parse --abbrev-ref HEAD`, absent on an unborn `HEAD`; `upstream` is `{ ahead, behind }` from `git rev-list --left-right --count HEAD...@{upstream}`, absent when no upstream is configured or it is gone. Ignored files never appear.

### Configuration

| Field | Default | Meaning |
|---|---|---|
| `gitBin` | `git` | Git executable spawned for every repository call |
| `ghBin` | `gh` | gh executable spawned for every pull-request call |
| `timeoutMs` | `30000` | Kill deadline on one content or mutation command (`status`, `diff`, `add`, `reset`, `checkout`, `commit`, `for-each-ref`, `push`, `pull`) |
| `discoveryTimeoutMs` | `5000` | Kill deadline on one repository-discovery command (`rev-parse`, upstream resolution, `gh --version`) |
| `ghTimeoutMs` | `30000` | Kill deadline on one `gh` call; gh talks to the GitHub API and is slower than local git |
| `maxDiffBytes` | `1048576` (1 MiB) | Inclusive byte cap on one diff; a larger diff fails with `too-large`, never shortened |
| `maxStderrChars` | `2000` | Character cap on the stderr one command failure carries |
| `maxListEntries` | `200` | Cap on returned branch entries and on the gh pull-request `--limit` |

The generated [configuration catalog](../../../docs/config-catalog.md#qilinapi-workspace-git) is the exhaustive source for every accepted field and its JSDoc.

### Failures

Each failure is one `RemoteError` code with typed details, declared in [`src/types.ts`](src/types.ts): `workspace-git/not-a-repo`, `workspace-git/bad-branch` (`branch`), `workspace-git/bad-message` (`length`), `workspace-git/bad-path` (`path`), `workspace-git/bad-pr-title` (`field` names the refused `title` or `body`, plus `length`), `workspace-git/too-large` (`bytes` is a lower bound observed before the kill, plus `maxBytes`), and `workspace-git/command-failed` (`command` names the invocation, `code` the exit status when there is one, `stderr` trimmed to `maxStderrChars`; a timeout names itself in `stderr` and carries no `code`). Structurally invalid wire values — a `ghListPrs` state outside the three words, a `ghMergePr` number that is not a positive integer, or a method outside the four words — fail with `gateway/bad-request` before anything runs. Callers branch on the code, never on message text.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

### Design concept

The workspace root arrives through the `workspaceFileScope` Typert lookup that `@qilin/api-workspace-files` registers; this package declares no lookup of its own and imports the scope type type-only, because Typert binds a lookup parameter by its Host type symbol, not by structural shape. One private `run` spawns the configured binary — git or gh — with a fixed argv, applies the call's timeout, honors caller cancellation by rejecting with the abort reason, and optionally kills the child once stdout passes `maxDiffBytes` so an oversized diff never buffers whole. Every method maps failures at one place: discovery refusals to `not-a-repo`, validated refusals before any spawn, and everything else to `command-failed` with the invocation and trimmed stderr. The parsers are pure functions over recorded output strings, exported for fixture specs.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | `WorkspaceGit`: the `workspaceGit` service and Remote namespace, `Config`, the fixed-argv spawn runner, and every Remote method |
| [`src/parse.ts`](src/parse.ts) | Pure parsers: porcelain `-z` status, the fixed `for-each-ref` format, `rev-list --left-right --count`, and the gh answers (PR rows, account, URL, first line) |
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

- **`push --set-upstream` names `origin`** — the upstream push targets the `origin` remote by that fixed name; a differently named remote fails with `command-failed` and its stderr.
- **`pull` has no merge-method parameter** — `pull` uses the repository's own merge configuration; the merge/squash/rebase enum is consumed by `ghMergePr` only.
- **Empty `ghMergePr` method defers to gh** — with no strategy flag gh applies its non-interactive rules; when a repository allows several strategies gh may refuse and surface as `command-failed`.
- **gh output formats are pinned by fixtures** — the account read requires gh's `account NAME (` wording and the create answer must contain the https URL; a gh release that changes either degrades to an absent `account` or `command-failed`.
- **`ghListPrs` degrades malformed zero-exit output to no rows** — gh exiting zero with non-JSON output answers an empty list rather than an error.
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
