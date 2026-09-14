# Agent Note: Saving a workspace file from the browser

Status: implemented

English | [中文](2026-09-14-workspace-file-save.zh.md)

## Problem

The Web client could read a workspace file but never write one. `ctx.workspaceFiles` exposed `stat`, `read`, `readBytes`, `readAll`, `readRelated`, `list`, and `changes`, and nothing in `packages/api` mutated a file: the only client-reachable mutations were the session and workspace records, a capability-gated directory create, and the settings document. The Host write capability, `ctx.fs.writeText`, is a Host-only Cordis service with no wire face. An editor tab is meaningless without a save, so the file workbench could not ship before this.

## Decision

`remote.workspaceFiles.write(scopeId, path, text, { baseVersion? })` returns the file's `WorkspaceFileStat` after the write. It reuses the read path's containment instead of growing a second one: the entry is probed before the path is resolved, a non-file entry is refused as `workspace-file/not-regular-file`, and the resolved target must stay inside the Session's workspace or the call is refused as `workspace-file/outside-workspace`. Text is capped by the existing validated `maxFileBytes`.

**Freshness is the caller's token, not the Agent's observation.** A save does not dispatch `fs/write-intent`. That waterfall derives its intent from the Agent's own read record: an unobserved file yields `createIfAbsent`, which the provider refuses for an existing file, so delegating would make every overwrite fail. Passing the Agent's identity instead would be worse — it would file the user's own edit in the Agent's observation ledger, and the Agent's next edit would run a compare-and-swap against a version it never read. `baseVersion` therefore becomes the provider guard `replaceIfVersion` directly, and an omitted token means unconditional. The token is opaque: compared for equality, never parsed or ordered.

After a successful write the service emits `fs/observed` with no actor, so the change stream publishes the new version to other readers while the observation policy records nothing. The write runs under a per-call `{ mode: 'workspace-write', workspaceRoot }` policy rooted at the same workspace the service already confined to, because the backend's no-session default resolves to the deployment root and would refuse a path this service just accepted.

## Alternatives considered

- **Dispatching `fs/write-intent`** — see above; it inverts the meaning of the observation record.
- **Exposing `readAll`/`writeText` as one read-modify-write call** — it would hide the freshness decision inside the Host, where the retry policy belongs to the editor.
- **A new config field for the write cap** — `maxFileBytes` already bounds a complete read of the same file, and the write cannot grow a file past what a read refuses.

## Consequences

- A session whose sandbox mode is read-only still admits a browser save: the save's authority is the user's own workspace boundary plus the freshness token, not the session's Agent policy. Tightening that would need a `sandboxPolicy.resolve(session)` check at this call.
- The editor's conflict path is the client's: `workspace-file/stale` leaves the user's text in place and offers reload or overwrite.

## Verification

- `packages/api/workspace-files/tests/write.spec.ts` covers the guarded write, the stale refusal leaving the file unchanged, an unconditional write, containment escapes, symlink and directory refusals, the size cap at and past the limit, and that `fs/write-intent` is not consulted.
- The file workbench's own specs cover the save action, the dirty state, and the conflict decision.

## Deferred

- No browser scenario saves a file through the real Host and re-reads it.
- The read-only-session behavior above is stated, not tested.
