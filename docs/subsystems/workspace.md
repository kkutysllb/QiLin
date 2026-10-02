# Workspaces

English | [中文](workspace.zh.md)

A workspace is the persistent record of a directory the user works in: a stable id over a canonical path, a display title, and the ordered account of sessions that belong to it. The subsystem is one package ([qilin-workspace](../../packages/workspace/workspace), `ctx.workspaceRegistry`) — an optional host-side capability, not part of the agent-loop spine, and invisible to models (no tools, no prompt text, no session events). It stores its records through the [storage domain form](storage.md) and validates session membership against [`SessionHeader.cwd`](persistence.md#sessionheader--metadata-beside-the-log), so `storageDomain` and `sessionPersistence` are mandatory startup dependencies: an unavailable persistence peer leaves the plugin pending rather than being mistaken for an empty history. Design record: [domain KV storage Agent Note](../../.agents/notes/proposed/architecture/2026-07-24-domain-kv-storage-and-workspace.md); bootstrap and GUI ordering: [Workspace UI product-flow Agent Note](../../.agents/notes/archived/feature/2026-07-25-workspace-ui-product-flow.md).

Source: [`packages/workspace/workspace/src/types.ts`](../../packages/workspace/workspace/src/types.ts)

## Identity

```ts type-equiv
/**
 * Identifies one workspace record. A generated uuid, never the path: path
 * normalization rewrites paths, and a reference anchor must stay stable.
 */
type WorkspaceId = Branded<'WorkspaceId'>
```

`WorkspaceId` is a [branded id](core.md#branded-ids). Path identity is separate: `realpathNormalize` (`fs.realpath`; trailing slashes, `..`, and symlinks resolved) is the one uniqueness canon — workspace paths are stored canonicalized, uniqueness is string equality of canonical paths (a symlink to an owned directory collides), and attach-time session cwd checks go through the same canon.

## The workspace entity

Consumers see only the `Workspace` interface; the implementation stays package-private.

```ts type-equiv
/**
 * One workspace: a stable id over an existing directory, a display title, and
 * an ordered candidate account of sessions. Membership requires both an id in
 * that account and a session header whose canonical cwd equals the workspace
 * path. Consumers only see this interface; the implementation stays private.
 */
interface Workspace {
  /** Stable record id (generated uuid). */
  readonly id: WorkspaceId

  /**
   * Canonical directory path: the `fs.realpath` of the path given at create
   * time (trailing slashes, `..`, and symlinks all resolved). Never rewritten
   * afterwards, even when the directory disappears (see {@link status}).
   */
  readonly path: string

  /** Display title. Defaults to the final path segment, or a filesystem root's own spelling; duplicates are allowed. */
  readonly title: string

  /** ISO-8601 creation instant, stamped at create and never rewritten. */
  readonly createdAt: string

  /** ISO-8601 instant of the last durable mutation (create counts as one). */
  readonly updatedAt: string

  /**
   * Header-validated sessions in manually owned order: a new session is
   * prepended at attach, explicit reordering goes through
   * `insertSessionBefore`, and activity never reorders. The durable candidate
   * account is filtered synchronously: missing headers, invalid cwd values,
   * and canonical cwd mismatches are never returned. A subsequent workspace
   * mutation prunes those filtered candidates durably.
   */
  readonly sessionIds: readonly SessionId[]

  /**
   * Replace the display title durably.
   * @param title - New title; any string, duplicates across workspaces allowed.
   * @returns resolution after durability.
   */
  setTitle(title: string): Promise<void>

  /**
   * Prepend a session to this workspace's candidate account. An already
   * accounted id resolves without writing, aside from the durable
   * filtered-candidate prune every accepted mutation performs. A new id's
   * live or persisted
   * header cwd must resolve to an existing directory equal to {@link path};
   * unknown ids, missing or invalid cwd values, and mismatches reject without
   * writing.
   * @param sessionId - The session to record.
   * @returns resolution after durability.
   */
  attachSession(sessionId: SessionId): Promise<void>

  /**
   * Move an accounted session within the manual order, DOM-insertBefore-like:
   * with an anchor the session lands before it, without one it appends to the
   * end. Only the moved id changes position. A session or anchor absent from
   * the account rejects without writing; a move to the current position
   * resolves without writing, aside from the durable filtered-candidate
   * prune every accepted mutation performs; decided on the domain write
   * chain.
   * @param sessionId - The accounted session to move.
   * @param beforeSessionId - Accounted anchor to insert before; omitted appends.
   * @returns resolution after durability.
   */
  insertSessionBefore(sessionId: SessionId, beforeSessionId?: SessionId): Promise<void>

  /**
   * Remove a session from this workspace's account. Idempotent: an id not on
   * the account resolves without writing, aside from the durable
   * filtered-candidate prune every accepted mutation performs; decided on
   * the domain write chain like attach. Never touches the session's own stored log.
   * @param sessionId - The session to remove.
   * @returns resolution after durability.
   */
  detachSession(sessionId: SessionId): Promise<void>

  /**
   * Live directory check, uncached: whether {@link path} currently exists and
   * is a directory. A missing directory never mutates the record — the
   * directory may only be temporarily moved.
   * @returns `'ok'` when the directory exists, `'missing-dir'` otherwise.
   */
  status(): Promise<'ok' | 'missing-dir'>
}
```

Ownership truth is the record's ordered `sessionIds`, never derived from session cwd — but membership requires both: an id on the account and a header whose canonical cwd equals the workspace path, so one session structurally belongs to at most one workspace. Failed writes reject (`insertSessionBefore` account errors as `WorkspaceMoveInvalidError`, storage failures as plain errors); every accepted mutation stamps `updatedAt` and durably prunes candidates that no longer pass the membership check.

## The registry: `ctx.workspaceRegistry`

`WorkspaceRegistry` ([signatures](#ctxworkspaceregistry--workspaceregistry)) owns registration and resolution. `create(path, title?)` requires a fully qualified path, canonicalizes it, rejects a nonexistent path (the original `ENOENT`) or a non-directory, returns the existing entity unchanged when the canonical path is already owned, and otherwise creates a record with `title ?? defaultWorkspaceTitle(path)` prepended to the durable registry order (different canonical paths may share a display title, and a path with no final segment uses its root spelling). `get(id)` and the ordered `list()` are synchronous cache reads; `resolveByPath(path)` applies the same fully qualified realpath canon without creating. `delete(id)` removes only the registration, order entry, and session account — the directory, user files, live sessions, and persisted logs are never touched, so those sessions become Ungrouped ([decision](../../.agents/notes/implemented/feature/2026-07-27-workspace-registration-deletion.md)); unknown ids return `false`. Create and delete persist a pending-mutation marker before their two writes (record + order) can diverge; startup resolves exactly the marked mutation — by deleting the marked table row, which completes an interrupted delete and rolls back an interrupted create (the registration is re-creatable, so rollback is the safe direction) — and an unmarked order/table mismatch fails loud as corruption.

Sessions get their cwd at create time from whoever creates them, not from this registry — the API gateway resolves a new session's cwd from the chosen workspace's `path` (falling back to an explicit or default cwd), creates the session so the cwd lands in its immutable [`SessionHeader`](persistence.md#sessionheader--metadata-beside-the-log), then calls `attachSession`, which re-validates that stored header cwd against the workspace path. On the first successful start, the registry bootstraps history from persisted headers alone (`id`, `cwd`, `createdAt` — never event bodies), grouping sessions with a valid canonical cwd into per-directory workspaces, newest first; the initialized marker is written last so an interrupted bootstrap resumes safely. The bootstrap is one-time: cwd-less legacy sessions stay Ungrouped, and sessions created afterwards join a workspace only through `attachSession`.

## Consumers

[`qilin-workspace-controller`](../../packages/api/workspace-controller) serves workspace CRUD to GUI clients over `ctx.workspaceRegistry`, and [`qilin-session-controller`](../../packages/api/session-controller) performs the create-session-then-attach flow above. [qilin-agent-instructions](../../packages/context/agent-instructions) is **not** a consumer despite the name: it discovers AGENTS.md-style instruction files under an agent's own cwd and never touches `ctx.workspaceRegistry` — the shared word refers to the user's working directory, not to this registry's entities.

<!-- BEGIN GENERATED kylin-surface (gen-kylin-catalog.ts) — do not edit between markers -->

<a id="kylin-surface"></a>

## Cordis API

Generated from source by `scripts/gen-kylin-catalog.ts` (verified fresh by `pnpm run verify-kylin-catalog` in doc-sync; regenerate with `pnpm run gen-kylin-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../kylin-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [kylin-api/inherited.md](../kylin-api/inherited.md).

<a id="ctxdirectorypicker--directorypicker-abstract-seam"></a>

### `ctx.directoryPicker` — `DirectoryPicker` (abstract seam)

Abstract directory-picking service. Subclass, implement `capability()`, and load the subclass as a plugin — it registers as `ctx.directoryPicker` (one implementation per context; loading a second throws, cordis' standard duplicate-service behavior). The capability object must be stable for the service lifetime: consumers may capture it across calls.

```ts cordis-catalog
/**
 * The backend's interaction capability.
 * @returns the discriminated capability consumers switch on.
 */
abstract capability(): DirectoryPickerCapability
```

Source: [`packages/host/directory-picker/src/index.ts`](../../packages/host/directory-picker/src/index.ts)

<a id="ctxdirectorypickercontroller--directorypickercontroller"></a>

### `ctx.directoryPickerController` — `DirectoryPickerController`

Host service backing the generated `ctx.remote.directoryPicker` namespace. The seam it exports is abstract and therefore never a Loader entry of its own, so this controller carries the wire verbs: one composed backend serves either the native chooser or the browse primitives, and a verb the composition cannot serve is refused rather than approximated.

```ts cordis-catalog
/**
 * Open the host's OS chooser for a Remote caller.
 * @param signal - caller lifetime; abort terminates the chooser.
 * @returns the chosen absolute path, or null when the operator cancels.
 */
@Remote('pick') async pick(signal: AbortSignal): Promise<string | null>

/**
 * List one directory level for a Remote caller's in-app browser.
 * @param path - absolute directory to list; absent lists the home directory.
 * @param signal - caller lifetime; abort stops the backend's scan instead of
 *   letting it outlive a disconnected caller.
 * @returns the level's listing with its ancestry.
 */
@Remote('list') async list(path: string | undefined, signal: AbortSignal): Promise<DirectoryListing>

/**
 * Create one child directory for a Remote caller's in-app browser.
 * @param path - absolute existing parent directory.
 * @param name - single non-blank path segment.
 * @returns the created directory's absolute path.
 */
@Remote('createDirectory') async createDirectory(path: string, name: string): Promise<string>
```

Source: [`packages/api/workspace-controller/src/directory-picker.ts`](../../packages/api/workspace-controller/src/directory-picker.ts)

<a id="ctxsidebaropens--sidebaropens"></a>

### `ctx.sidebarOpens` — `SidebarOpens`

Per-Session open queues with their attached watchers.

One request has one destination: with a watcher attached it is pushed there and forgotten, and with none it waits in the Session's queue until a view attaches. The queue is bounded because a Session nobody is watching must not accumulate requests without end.

```ts cordis-catalog
/**
 * Deliver one request to the Session's view, or queue it for the next one.
 * @param sessionId - the Session whose Sidebar the request targets.
 * @param request - the resolved request.
 * @returns whether an attached view consumed it now.
 */
enqueue(sessionId: SessionId, request: SidebarOpenRequest): boolean

/**
 * Watch one Session's opens: what queued while nothing was attached, then
 * every request as it arrives.
 * @param sessionId - the Session whose Sidebar is watching.
 * @param signal - physical Remote stream cancellation.
 * @returns the queued requests followed by the live ones.
 */
@Remote({ mode: 'stream' }) async *watch(sessionId: SessionId, signal: AbortSignal): AsyncIterable<SidebarOpenRequest>

/**
 * Drop every queue, for a Host that is going away.
 */
dispose(): void
```

Types: [SessionId](core.md)

Source: [`packages/host/sidebar-opens/src/index.ts`](../../packages/host/sidebar-opens/src/index.ts)

<a id="ctxterminalcontroller--terminalcontroller"></a>

### `ctx.terminalController` — `TerminalController`

Typed Remote control of transient Session-owned terminal processes.

```ts cordis-catalog
/**
 * Read the Session working directory and terminal limits without resolving a shell.
 * @param agent - Session owner supplied by the Gateway.
 * @param signal - request cancellation.
 * @returns the Session workspace directory and terminal limits.
 */
@Remote environment(agent: Agent, signal: AbortSignal): TerminalEnvironment

/**
 * Discover installed shells in the Session's execution environment.
 * @param agent - Session owner supplied by the Gateway.
 * @param signal - request cancellation.
 * @returns verified profiles, with the configured or system default first.
 */
@Remote shells(agent: Agent, signal: AbortSignal): Promise<TerminalShell[]>

/**
 * List retained terminals without resolving or activating an Agent.
 * @param sessionId - displayed Session identity, including offline history.
 * @returns terminals retained for this Host lifetime.
 */
@Remote list(sessionId: SessionId): WebTerminalInfo[]

/**
 * Allocate a user shell once for a caller-generated identity, without Agent sandbox or approval restrictions.
 * @param agent - Session owner supplied by the Gateway.
 * @param request - initial dimensions and idempotency identity.
 * @param signal - allocation cancellation; committed terminals survive disconnection.
 * @returns the existing or newly committed terminal.
 */
@Remote async create(agent: Agent, request: TerminalCreateRequest, signal: AbortSignal): Promise<WebTerminalInfo>

/**
 * Retain an existing terminal for a window without activating its Agent or taking input control.
 * @param sessionId - owning Session identity, including an inactive saved layout.
 * @param id - retained Host terminal identity.
 * @param signal - physical Remote stream cancellation.
 * @returns a hold acknowledgement followed by an open lifetime stream.
 */
@Remote({ mode: 'stream' }) retain(sessionId: SessionId, id: WebTerminalId, signal: AbortSignal): AsyncIterable<TerminalRetentionFrame>

/**
 * Attach to a terminal without binding its process lifetime to the transport.
 * @param agent - Session owner supplied by the Gateway.
 * @param id - terminal identity.
 * @param attachmentId - new exclusive input attachment.
 * @param signal - physical stream cancellation.
 * @returns screen recovery followed by output and metadata changes.
 */
@Remote({ mode: 'stream' }) follow(agent: Agent, id: WebTerminalId, attachmentId: TerminalAttachmentId, signal: AbortSignal): AsyncIterable<TerminalFrame>

/**
 * Deliver raw input, including Tab completion and control characters.
 * @param agent - Session owner supplied by the Gateway.
 * @param id - terminal identity.
 * @param attachmentId - current writable attachment.
 * @param data - input bytes represented as UTF-8 text.
 * @returns after provider input acceptance.
 */
@Remote async write(agent: Agent, id: WebTerminalId, attachmentId: TerminalAttachmentId, data: string): Promise<void>

/**
 * Update the dimensions of the PTY and recovery screen.
 * @param agent - Session owner supplied by the Gateway.
 * @param id - terminal identity.
 * @param attachmentId - current writable attachment.
 * @param cols - column count.
 * @param rows - row count.
 * @returns after the resize completes.
 */
@Remote async resize(agent: Agent, id: WebTerminalId, attachmentId: TerminalAttachmentId, cols: number, rows: number): Promise<void>

/**
 * Rename a terminal without changing its shell.
 * @param agent - Session owner supplied by the Gateway.
 * @param id - terminal identity.
 * @param title - nonempty display title, at most 120 characters.
 */
@Remote rename(agent: Agent, id: WebTerminalId, title: string): void

/**
 * Close an identity to future creation and kill its process range; repeated closes succeed.
 * @param agent - Session owner supplied by the Gateway.
 * @param id - terminal identity.
 * @returns after provider cleanup succeeds. A failure retains the terminal for retry.
 */
@Remote async close(agent: Agent, id: WebTerminalId): Promise<void>
```

Types: [Agent](core.md) · [SessionId](core.md)

Source: [`packages/api/terminal-controller/src/index.ts`](../../packages/api/terminal-controller/src/index.ts)

<a id="ctxworkspacecontroller--workspacecontroller"></a>

### `ctx.workspaceController` — `WorkspaceController`

Host service backing the generated `ctx.remote.workspace` namespace.

```ts cordis-catalog
/**
 * Create or idempotently resolve one Workspace over an existing directory.
 * @param request - directory path to register.
 * @returns the Workspace and whether this call created it.
 */
@Remote('create') create(request: WorkspaceCreateRequest): Promise<WorkspaceCreateValue>

/**
 * Rename one Workspace to a unique non-blank title.
 * @param request - Workspace identity and proposed title.
 * @returns the updated Workspace projection.
 */
@Remote('rename') rename(request: WorkspaceRenameRequest): Promise<WorkspaceValue>

/**
 * Remove one Workspace registration while retaining files and Sessions.
 * @param request - Workspace identity to remove.
 * @returns deletion confirmation.
 */
@Remote('delete') delete(request: WorkspaceDeleteRequest): Promise<WorkspaceDeleteValue>

/**
 * Move one Workspace within the registry display order.
 * @param request - moved Workspace and optional anchor.
 * @returns the complete resulting Workspace order.
 */
@Remote('insertBefore') insertBefore(request: WorkspaceInsertBeforeRequest): Promise<WorkspaceOrderValue>

/**
 * Move one accounted Session within a Workspace.
 * @param request - Workspace, Session, and optional anchor identities.
 * @returns the updated Workspace projection.
 */
@Remote('insertSessionBefore') insertSessionBefore(request: WorkspaceInsertSessionBeforeRequest): Promise<WorkspaceValue>

/**
 * Hide one known Session from Workspace grouping surfaces.
 * @param request - Session identity to archive.
 * @returns the complete resulting archive set.
 */
@Remote('archiveSession') archiveSession(request: WorkspaceArchiveSessionRequest): Promise<WorkspaceArchiveValue>

/**
 * Restore one archived Session to Workspace grouping surfaces.
 * @param request - Session identity to unarchive.
 * @returns the complete resulting archive set.
 */
@Remote('unarchiveSession') unarchiveSession(request: WorkspaceUnarchiveSessionRequest): Promise<WorkspaceArchiveValue>

/**
 * Surface one known unarchived Session ahead of unpinned Sessions.
 * @param request - Session identity to pin.
 * @returns the complete resulting pin set, most recently pinned first.
 */
@Remote('pinSession') pinSession(request: WorkspacePinSessionRequest): Promise<WorkspacePinValue>

/**
 * Remove one Session's pin without changing its saved Session order.
 * @param request - Session identity to unpin.
 * @returns the complete resulting pin set, most recently pinned first.
 */
@Remote('unpinSession') unpinSession(request: WorkspaceUnpinSessionRequest): Promise<WorkspacePinValue>

/**
 * Stream a complete Workspace baseline followed by ordered increments.
 * @param signal - generation cancellation.
 * @returns baseline followed by ordered Workspace increments.
 */
@Remote({ mode: 'stream' }) follow(signal: AbortSignal): AsyncIterable<WorkspaceFollowFrame>
```

Source: [`packages/api/workspace-controller/src/index.ts`](../../packages/api/workspace-controller/src/index.ts)

<a id="ctxworkspacefiles--workspacefiles"></a>

### `ctx.workspaceFiles` — `WorkspaceFiles`

Host Remote file reads, writes, and workspace entry mutations plus workspace directory observations over the composed filesystem.

```ts cordis-catalog
/**
 * Read one page of lines from a UTF-8 file readable by the filesystem backend.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - absolute path or path relative to the workspace root; files outside it are allowed.
 * @param range - the line window; omitted fields take the page defaults.
 * @param signal - caller cancellation.
 * @returns the page, the file's version at the stat before it, and whether it reaches the last line.
 */
@Remote async read( workspaceFileScope: WorkspaceFileScope, path: string, range: WorkspaceFileRange, signal: AbortSignal, ): Promise<WorkspaceFileText>

/**
 * Read one byte window of a regular file readable by the filesystem backend: raw
 * bytes, no text decoding and no binary rejection.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - absolute path or path relative to the workspace root; files outside it are allowed.
 * @param range - the byte window; omitted fields take the window defaults.
 * @param signal - caller cancellation.
 * @returns the window in base64, the file's version and size at the stat before it, and whether it reaches the last byte.
 */
@Remote async readBytes( workspaceFileScope: WorkspaceFileScope, path: string, range: WorkspaceByteRange, signal: AbortSignal, ): Promise<WorkspaceFileBytes>

/**
 * Read a complete regular file as bytes, subject to the configured full-file cap.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - absolute or workspace-relative file path.
 * @param signal - caller cancellation.
 * @returns one complete base64 window with offset zero and eof true; oversized files fail with too-large.
 */
@Remote async readAll(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<WorkspaceFileBytes>

/**
 * Read a complete file relative to another file's directory, including outside the workspace.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - base file, absolute or workspace-relative.
 * @param relativePath - relative filesystem path, not a URL or absolute path.
 * @param signal - caller cancellation.
 * @returns the complete related file using the ordinary file-size and access checks.
 */
@Remote async readRelated( workspaceFileScope: WorkspaceFileScope, path: string, relativePath: string, signal: AbortSignal, ): Promise<WorkspaceFileBytes>

/**
 * Report one regular file's identity, version, and size without its content.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - absolute path or path relative to the workspace root; files outside it are allowed.
 * @param signal - caller cancellation.
 * @returns the file's absolute path, current version, and byte size.
 */
@Remote async stat(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<WorkspaceFileStat>

/**
 * Search file names below the workspace root for a substring, comparing each
 * basename case-insensitively. The walk visits directories breadth-first, so
 * a shallow match precedes a deeper one, and every match is reported as a
 * path relative to the workspace root. Only regular files match: a directory
 * is walked, never offered.
 *
 * This is a name lookup, not a code search: no ignore file is consulted, and
 * the configured excluded directories are neither matched nor descended, so a
 * dependency store neither crowds the matches nor burns the visit budget. A
 * directory the workspace root does not contain is not descended either: a
 * symbolic link to a directory elsewhere neither reports names outside the
 * workspace nor loops the walk.
 *
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param query - the substring matched against each basename; blank matches nothing.
 * @param signal - caller cancellation.
 * @returns the matching paths, cut to the configured match cap, and whether a cap stopped the walk.
 */
@Remote async searchNames( workspaceFileScope: WorkspaceFileScope, query: string, signal: AbortSignal, ): Promise<WorkspaceFileNameSearch>

/**
 * Save one complete UTF-8 text file inside the Session's workspace: replace an
 * existing regular file or create one. The path is refused before anything is
 * written when its own entry is not a regular file (a final symbolic link
 * included) or when the resolved target lies outside the workspace root.
 *
 * The write is guarded by the caller's own freshness basis, not by the
 * `fs/write-intent` slot. That slot decides from the per-Session
 * observations an Agent accumulates by reading (`fs-observation-policy`,
 * `writeIntent`), and its actor is a tool execution this Remote has none of;
 * a browser save has read nothing through the Agent, so delegating to it would
 * refuse every save of an existing file with `FS_NOT_OBSERVED`. Passing the
 * Session as the actor instead would attribute the user's own save to the
 * Agent's observation record and let a later Agent edit rewrite content it
 * never read. `baseVersion` is therefore the basis the provider compares,
 * and the successful write emits `fs/observed` with no actor, so the change
 * feed reports the new version while the policy records no Agent observation.
 *
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - absolute path or path relative to the workspace root; a resolved target outside it fails with outside-workspace.
 * @param text - the complete new file content, written as UTF-8; more bytes than the configured `maxFileBytes` fails with too-large.
 * @param request - the freshness basis; an omitted `baseVersion` writes unconditionally.
 * @param signal - caller cancellation.
 * @returns the saved file's absolute path, its version after the write, and the saved byte size.
 */
@Remote async write( workspaceFileScope: WorkspaceFileScope, path: string, text: string, request: WorkspaceFileWriteRequest, signal: AbortSignal, ): Promise<WorkspaceFileStat>

/**
 * List the direct children of one directory inside the Session's workspace.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - workspace path, absolute or relative to the workspace root.
 * @param signal - caller cancellation.
 * @returns the directory's children in the backend's stable name order, bounded by the entry cap.
 */
@Remote async list(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<WorkspaceDirectoryListing>

/**
 * Stream every `fs/observed` observation of a file inside the Session's
 * workspace. Only instrumented filesystem operations report here; the OS is
 * not watched.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param signal - generation cancellation.
 * @returns `ready` once the Host observation queue is active and the workspace
 *   root is resolved, then queued and live observations in emission order.
 */
@Remote({ mode: 'stream' }) changes(workspaceFileScope: WorkspaceFileScope, signal: AbortSignal): AsyncIterable<WorkspaceFileWatchFrame>

/**
 * Delete one file or directory inside the Session's workspace. A final
 * symbolic link is refused before resolution follows it, so a delete never
 * reaches through a link to a file the caller did not name; a directory is
 * either emptied by the caller or removed whole with `recursive`.
 *
 * The successful removal emits `fs/observed` with an absent observation, so
 * the change feed reports the disappearance to every open consumer.
 *
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - absolute path or path relative to the workspace root; a resolved target outside it fails with outside-workspace.
 * @param recursive - remove a directory with all its contents; `false` refuses a non-empty directory with not-empty.
 * @param signal - caller cancellation.
 * @returns nothing; the caller observes the removal through `list`/`stat`.
 */
@Remote async remove( workspaceFileScope: WorkspaceFileScope, path: string, recursive: boolean, signal: AbortSignal, ): Promise<void>

/**
 * Move or rename one entry inside the Session's workspace. Both ends are
 * gated the same way: each path's own entry is probed before resolution
 * follows it, a final symbolic link on either end is refused, and both
 * resolved targets must stay inside the workspace root, so a move can never
 * land outside it. An existing destination is refused rather than replaced.
 *
 * The successful move emits `fs/observed` twice: an absent observation for
 * the source and a present one for the destination, so the change feed
 * reports both ends.
 *
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param from - the source, absolute or relative to the workspace root.
 * @param to - the destination, absolute or relative to the workspace root; its parent directory must exist.
 * @param signal - caller cancellation.
 * @returns nothing; the caller observes the destination through `list`/`stat`.
 */
@Remote async move( workspaceFileScope: WorkspaceFileScope, from: string, to: string, signal: AbortSignal, ): Promise<void>

/**
 * Create one directory inside the Session's workspace. A final symbolic link
 * is refused before resolution follows it, and the resolved target must stay
 * inside the workspace root.
 *
 * The successful creation emits `fs/observed` with a present observation at
 * the new directory's version, so the change feed reports the new entry.
 *
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - absolute path or path relative to the workspace root; a resolved target outside it fails with outside-workspace.
 * @param signal - caller cancellation.
 * @returns nothing; the caller observes the directory through `list`.
 */
@Remote async createDirectory( workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal, ): Promise<void>
```

Source: [`packages/api/workspace-files/src/index.ts`](../../packages/api/workspace-files/src/index.ts)

<a id="ctxworkspacegit--workspacegit"></a>

### `ctx.workspaceGit` — `WorkspaceGit`

Host Remote git operations for the Session workspace root.

```ts cordis-catalog
/**
 * Report whether the Session workspace root lies inside a Git work tree.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param signal - caller cancellation.
 * @returns the discovery answer; `false` on every failure, including a missing binary or timeout.
 */
@Remote async isRepo(workspaceFileScope: WorkspaceFileScope, signal: AbortSignal): Promise<boolean>

/**
 * Name the work tree's top-level directory.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param signal - caller cancellation.
 * @returns the absolute path `git rev-parse --show-toplevel` prints.
 * @throws {RemoteError} `workspace-git/not-a-repo` when discovery cannot place the root inside a work tree.
 */
@Remote async repoRoot(workspaceFileScope: WorkspaceFileScope, signal: AbortSignal): Promise<string>

/**
 * Read one porcelain status of the work tree, its current branch, and that
 * branch's position against its upstream. Untracked files are included;
 * ignored files are not.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param signal - caller cancellation.
 * @returns porcelain entries in order, the `HEAD` abbreviated ref (`undefined` when unborn), and `upstream` when one is configured.
 * @throws {RemoteError} `workspace-git/not-a-repo` outside a work tree.
 */
@Remote async status(workspaceFileScope: WorkspaceFileScope, signal: AbortSignal): Promise<GitStatus>

/**
 * Read one unified diff as text. `staged` selects the index-versus-`HEAD`
 * diff; otherwise the diff is worktree-versus-index.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - repo-relative pathspec limiting the diff; empty diffs the whole work tree.
 * @param staged - whether to diff the index against `HEAD` instead of the worktree against the index.
 * @param signal - caller cancellation.
 * @returns the complete diff text, bounded by the configured `maxDiffBytes`.
 * @throws {RemoteError} `workspace-git/too-large` when the diff exceeds `maxDiffBytes`; `bytes` is then a lower bound of the whole.
 * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero.
 */
@Remote async diff( workspaceFileScope: WorkspaceFileScope, path: string, staged: boolean, signal: AbortSignal, ): Promise<string>

/**
 * Read one page of the current branch's history, newest first.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param count - page size; an integer in `1..100`.
 * @param skip - commits to skip before the page; a non-negative integer.
 * @param signal - caller cancellation.
 * @returns the page's commits in `git log` order, at most `count` of them.
 * @throws {RemoteError} `gateway/bad-request` when `count` or `skip` is outside its bounds; nothing ran.
 * @throws {RemoteError} `workspace-git/not-a-repo` outside a work tree.
 * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero, including a repository whose `HEAD` has no commits yet.
 */
@Remote async log( workspaceFileScope: WorkspaceFileScope, count: number | undefined, skip: number | undefined, signal: AbortSignal, ): Promise<readonly GitLogEntry[]>

/**
 * Read the patch one commit introduced, against its first parent.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param revision - the commit to show; an accepted revision spelling (object name, ref name, or `HEAD~n`).
 * @param signal - caller cancellation.
 * @returns the complete patch text, bounded by the configured `maxDiffBytes`.
 * @throws {RemoteError} `gateway/bad-request` when `revision` is not an accepted spelling; nothing ran.
 * @throws {RemoteError} `workspace-git/not-a-repo` outside a work tree.
 * @throws {RemoteError} `workspace-git/too-large` when the patch exceeds `maxDiffBytes`; `bytes` is then a lower bound of the whole.
 * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero, including a revision the repository does not know.
 */
@Remote async commitDiff( workspaceFileScope: WorkspaceFileScope, revision: string | undefined, signal: AbortSignal, ): Promise<string>

/**
 * Stage changes into the index.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - repo-relative pathspec limiting the stage; empty stages the whole work tree.
 * @param signal - caller cancellation.
 * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero, including a pathspec git refuses.
 */
@Remote async stage(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<void>

/**
 * Unstage changes: reset index entries to their `HEAD` state.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - repo-relative pathspec limiting the unstage; empty unstages the whole index.
 * @param signal - caller cancellation.
 * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero.
 */
@Remote async unstage(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<void>

/**
 * Discard worktree changes of one path: restore it from the index. The
 * whole-repo discard does not exist here; a missing or empty path is
 * refused before anything runs.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param path - repo-relative pathspec; required, never `undefined`.
 * @param signal - caller cancellation.
 * @throws {RemoteError} `workspace-git/bad-path` when `path` is absent or empty.
 * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero.
 */
@Remote async discard(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<void>

/**
 * Commit the staged index with one message.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param message - commit message; trimmed, then required to be 1..2000 characters.
 * @param signal - caller cancellation.
 * @throws {RemoteError} `workspace-git/bad-message` when the trimmed message is empty or longer than 2000 characters.
 * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero, including an empty index.
 */
@Remote async commit(workspaceFileScope: WorkspaceFileScope, message: string, signal: AbortSignal): Promise<void>

/**
 * List local branches with the current marker, each branch's upstream, and
 * each branch's ahead/behind counts, from one `for-each-ref` invocation.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param signal - caller cancellation.
 * @returns branches in ref order, cut to the configured `maxListEntries` with `truncated` reporting the cut.
 * @throws {RemoteError} `workspace-git/not-a-repo` outside a work tree.
 * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero.
 */
@Remote async branches(workspaceFileScope: WorkspaceFileScope, signal: AbortSignal): Promise<GitBranches>

/**
 * Switch the work tree to an existing local branch.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param branch - branch to check out; must pass the accepted-name check.
 * @param signal - caller cancellation.
 * @throws {RemoteError} `workspace-git/bad-branch` when the name fails the accepted-name check.
 * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero, including a missing branch or dirty conflict.
 */
@Remote async checkout(workspaceFileScope: WorkspaceFileScope, branch: string, signal: AbortSignal): Promise<void>

/**
 * Create a local branch, optionally starting from a revision.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param name - branch to create; must pass the accepted-name check.
 * @param from - starting branch or revision; validated by the same check, empty starts from `HEAD`.
 * @param signal - caller cancellation.
 * @throws {RemoteError} `workspace-git/bad-branch` when either name fails the accepted-name check.
 * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero.
 */
@Remote async createBranch( workspaceFileScope: WorkspaceFileScope, name: string, from: string, signal: AbortSignal, ): Promise<void>

/**
 * Push the current branch. With `setUpstream`, the push targets `origin`
 * by that fixed name and names the branch there after itself.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param setUpstream - whether to pass `--set-upstream origin HEAD`.
 * @param signal - caller cancellation.
 * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero, including a missing remote and authentication failures.
 */
@Remote async push(workspaceFileScope: WorkspaceFileScope, setUpstream: boolean, signal: AbortSignal): Promise<void>

/**
 * Pull into the current branch from its upstream.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param signal - caller cancellation.
 * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero, including no configured upstream and merge conflicts.
 */
@Remote async pull(workspaceFileScope: WorkspaceFileScope, signal: AbortSignal): Promise<void>

/**
 * Report whether the configured gh binary answers at all.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param signal - caller cancellation.
 * @returns whether `gh --version` completed; `false` on every failure, including a missing binary or timeout.
 */
@Remote async ghAvailable(workspaceFileScope: WorkspaceFileScope, signal: AbortSignal): Promise<boolean>

/**
 * Report what `gh auth status` says about the GitHub login. This call never
 * throws: a missing binary, a timeout, and a missing login are all
 * `authenticated: false` with a readable message, so the rest of the panel
 * keeps working without gh installed or signed in.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param signal - caller cancellation.
 * @returns the login state; `account` when the output names one, and `message` for people.
 */
@Remote async ghAuthStatus(workspaceFileScope: WorkspaceFileScope, signal: AbortSignal): Promise<GhAuthStatus>

/**
 * List the repository's pull requests from the GitHub API through one
 * `gh pr list --json` call, capped by the configured `maxListEntries`.
 * Fields gh omits arrive as their zero values; output that is not a JSON
 * array yields no rows.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param state - which pull requests to list: `open`, `closed`, or `all`.
 * @param signal - caller cancellation.
 * @returns pull requests in gh order.
 * @throws {RemoteError} `gateway/bad-request` when `state` is not one of the three words.
 * @throws {RemoteError} `workspace-git/not-a-repo` outside a work tree.
 * @throws {RemoteError} `workspace-git/command-failed` when gh exits nonzero, including no GitHub remote and a missing login.
 */
@Remote async ghListPrs( workspaceFileScope: WorkspaceFileScope, state: 'open' | 'closed' | 'all', signal: AbortSignal, ): Promise<readonly GhPr[]>

/**
 * Open one pull request for the current branch. `title` and `body` are
 * trimmed and bounds-checked before gh runs; `base` must pass the
 * accepted-name check, and an empty `base` lets GitHub use the repository
 * default branch.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param title - pull-request title; 1..500 characters after trimming.
 * @param body - pull-request body; 1..4000 characters after trimming.
 * @param base - branch to merge into; empty selects the repository default branch.
 * @param signal - caller cancellation.
 * @returns the number parsed from the URL gh printed and that URL verbatim.
 * @throws {RemoteError} `workspace-git/bad-pr-title` when the title or body fails its bounds; nothing ran.
 * @throws {RemoteError} `workspace-git/bad-branch` when a non-empty `base` fails the accepted-name check; nothing ran.
 * @throws {RemoteError} `workspace-git/not-a-repo` outside a work tree.
 * @throws {RemoteError} `workspace-git/command-failed` when gh exits nonzero or prints no pull-request URL.
 */
@Remote async ghCreatePr( workspaceFileScope: WorkspaceFileScope, title: string, body: string, base: string, signal: AbortSignal, ): Promise<GhCreatedPr>

/**
 * Merge one pull request through `gh pr merge`. An empty `method` passes no
 * strategy flag and leaves the choice to gh's non-interactive rules and the
 * repository's allowed methods; every other value names its matching flag.
 * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
 * @param number - pull request to merge; a positive integer.
 * @param method - `''`, `'merge'`, `'squash'`, or `'rebase'`.
 * @param signal - caller cancellation.
 * @throws {RemoteError} `gateway/bad-request` when `number` or `method` is outside its allowed values.
 * @throws {RemoteError} `workspace-git/not-a-repo` outside a work tree.
 * @throws {RemoteError} `workspace-git/command-failed` when gh exits nonzero, including an unmergeable pull request.
 */
@Remote async ghMergePr( workspaceFileScope: WorkspaceFileScope, number: number, method: '' | 'merge' | 'squash' | 'rebase', signal: AbortSignal, ): Promise<void>
```

Source: [`packages/api/workspace-git/src/index.ts`](../../packages/api/workspace-git/src/index.ts)

<a id="ctxworkspaceregistry--workspaceregistry"></a>

### `ctx.workspaceRegistry` — `WorkspaceRegistry`

Durable workspace registry. Startup waits for `sessionPersistence`, builds one canonical-cwd header index, and completes the one-time history bootstrap before the service becomes active. The persistence dependency is mandatory so an unavailable peer can never be mistaken for an empty history and commit the initialized marker.

```ts cordis-catalog
/**
 * Create or reuse a workspace for an existing directory. The fully qualified
 * path is canonicalized through `fs.realpath`; a relative, nonexistent, or
 * non-directory path rejects. Repeated calls for the same canonical path
 * return the existing entity without changing its title.
 * A newly created workspace is prepended to the durable registry order.
 * Different canonical paths may share a display title.
 * @param path - Existing directory to own, in a fully qualified path spelling.
 * @param title - Display title used only when a new record is created.
 * @returns the existing or newly durable workspace.
 */
async create(path: string, title?: string): Promise<Workspace>

/**
 * Initialize the default Workspace only while both the registry and Session
 * history are empty. Repeated requests reuse its durable identity; deleting
 * that registration permanently disables automatic creation.
 * @param resolveDirectory - resolve the absolute directory and initial title;
 * called only for eligible creation, inside the registry mutation queue.
 * Missing directories are created recursively before registration.
 * After resolution, caller cancellation does not roll back creation or registration.
 * @returns the initialized Workspace, or undefined when automatic creation is ineligible.
 */
initializeDefault(resolveDirectory: () => Promise<{ path: string; title: string }>): Promise<Workspace | undefined>

/**
 * Look up a workspace by id.
 * @param id - Workspace id.
 * @returns the workspace, or `undefined` when unknown.
 */
get(id: WorkspaceId): Workspace | undefined

/**
 * Synchronous workspace projection in durable registry order. Every
 * entity's `sessionIds` getter is already filtered by the startup/live
 * canonical-cwd header index; this method performs no persistence reads.
 * @returns a fresh ordered array of workspace entities.
 */
list(): Workspace[]

/**
 * Delete one workspace registration while retaining its directory and every
 * session log. The durable order is updated before the table deletion; a
 * failed table write restores the prior order and keeps the entity
 * published. Unknown ids are an idempotent no-op for domain callers.
 * @param id - Workspace registration to remove.
 * @returns `true` when a record was deleted, `false` when it was unknown.
 */
delete(id: WorkspaceId): Promise<boolean>

/**
 * Move one workspace within the durable display order, DOM-insertBefore-like.
 * With an anchor it lands before that workspace; without one it appends.
 * @param id - Workspace to move.
 * @param beforeId - Workspace anchor; omitted appends.
 * @returns the complete committed workspace order.
 */
insertBefore(id: WorkspaceId, beforeId?: WorkspaceId): Promise<readonly WorkspaceId[]>

/**
 * Archive one session durably. The session must exist (live or in session
 * persistence); its workspace accounting — or lack of one — is irrelevant.
 * Without `stopActivity` the session must also be inactive: the
 * `workspace/session-activity` waterfall is asked once, and any reported
 * activity rejects with {@link WorkspaceActiveSessionError} before anything
 * is written. With `stopActivity` the archive is written without an
 * activity check, and the `workspace/session-stop` providers are then asked
 * to stop the session's work: the durable archive set is what a provider's
 * `agent/pre-step` gate reads, so every wake the stops induce is already
 * blocked. Archiving drops the session's pin in the same durable write
 * (pinning and archival are mutually exclusive). An already archived id
 * resolves without writing, asking, or stopping.
 * @param sessionId - The session to archive.
 * @param options - Whether running work is stopped instead of refusing.
 * @returns resolution after durability and, with `stopActivity`, after every stop request was issued.
 */
archiveSession(sessionId: SessionId, options: ArchiveSessionOptions = {}): Promise<void>

/**
 * Unarchive one session durably by dropping it from the registry-global
 * archive set; the accounting slot was never touched, so the session
 * returns to its recorded position. Unarchiving runs no session-existence
 * check because removing an id cannot introduce an unknown one, so an
 * entry whose session is gone still resolves. An id that is not archived
 * resolves without writing.
 * @param sessionId - The session to unarchive.
 * @returns resolution after durability.
 */
unarchiveSession(sessionId: SessionId): Promise<void>

/**
 * Pin one session durably, prepending it to the registry-global pin set.
 * The session must exist (live or in session persistence) and must not be
 * archived. An already pinned id resolves without writing or reordering.
 * @param sessionId - The session to pin.
 * @returns resolution after durability.
 */
pinSession(sessionId: SessionId): Promise<void>

/**
 * Unpin one session durably by dropping it from the registry-global pin
 * set. Unpinning runs no session-existence check because removing an id
 * cannot introduce an unknown one, so an entry whose session is gone still
 * resolves. An id that is not pinned resolves without writing.
 * @param sessionId - The session to unpin.
 * @returns resolution after durability.
 */
unpinSession(sessionId: SessionId): Promise<void>

/**
 * Resolve by canonical directory path without creating or mutating a
 * workspace. A missing path rejects during `realpath`; an existing unowned
 * directory returns `undefined`.
 * @param path - Existing directory path in a fully qualified spelling.
 * @returns the workspace owning the canonical path, when one exists.
 */
async resolveByPath(path: string): Promise<Workspace | undefined>
```

Types: [SessionId](core.md)

Source: [`packages/workspace/workspace/src/index.ts`](../../packages/workspace/workspace/src/index.ts)

<a id="workspace-events"></a>

### `workspace/*` events

<a id="workspacesession-activity--waterfall"></a>

#### `workspace/session-activity` — waterfall

Ask the composed providers what still runs for a session before it is archived. A listener prepends its own SessionActivity entries to the result of `next()`; the registry's innermost callback returns an empty list, so a composition without providers archives freely. Any non-empty result refuses the archive without a write.

```ts cordis-catalog
/**
 * Ask the composed providers what still runs for a session before it is
 * archived. A listener prepends its own {@link SessionActivity} entries to
 * the result of `next()`; the registry's innermost callback returns an
 * empty list, so a composition without providers archives freely. Any
 * non-empty result refuses the archive without a write.
 * @param request - the session about to be archived.
 * @param next - delegate to the remaining providers.
 * @mode waterfall
 */
'workspace/session-activity'( request: SessionActivityRequest, next: () => Promise<readonly SessionActivity[]>, ): Promise<readonly SessionActivity[]>
```

Source: [`packages/workspace/workspace/src/index.ts`](../../packages/workspace/workspace/src/index.ts)

<a id="workspacesession-stop--parallel"></a>

#### `workspace/session-stop` — parallel

Stop a session's running work because the caller archived it with `stopActivity`; the archive set is durable when this dispatches. Each provider stops its own families — cancelling a turn, its subagent descendants, owned jobs, or active schedules — through the same cancel paths the user's own stop actions use, so the session log ends every open turn regularly and a later unarchive can continue the conversation. Listeners issue their stop requests without waiting for running work to settle; a listener may await its own durability barrier. A rejection is logged by the registry and does not undo the archive.

```ts cordis-catalog
/**
 * Stop a session's running work because the caller archived it with
 * `stopActivity`; the archive set is durable when this dispatches. Each
 * provider stops its own families — cancelling a turn, its subagent
 * descendants, owned jobs, or active schedules — through the same cancel
 * paths the user's own stop actions use, so the session log ends every
 * open turn regularly and a later unarchive can continue the
 * conversation. Listeners issue their stop requests without waiting for
 * running work to settle; a listener may await its own durability
 * barrier. A rejection is logged by the registry and does not undo the
 * archive.
 * @param request - the session being archived.
 * @mode parallel
 */
'workspace/session-stop'(request: SessionActivityRequest): Promise<void> | void
```

Source: [`packages/workspace/workspace/src/index.ts`](../../packages/workspace/workspace/src/index.ts)
<!-- END GENERATED kylin-surface -->
