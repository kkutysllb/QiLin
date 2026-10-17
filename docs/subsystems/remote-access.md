# Remote access control

English | [中文](remote-access.zh.md)

[`@qilin-agent/api-remote-access`](../../packages/api/remote-access/README.md) decides which Remote methods a non-owner Peer may call and which forwarded events it may receive. Every composition that mounts the [API Gateway](../api-gateway.md) mounts `ctx.remoteAccess`; the Gateway resolves the resources a call or event touches and asks this service before it resolves lookups or decodes arguments. The owner principal is never checked. The [resource declarations](typert.md) on the Typert page own the resource types, and the [remote-access design plan](../../plans/2026-10-17-remote-access-typert-owner-design.md) owns the QiLin adoption decisions.

## Resource model

A business package defines roles, each an action set over one resource kind, and binds a role to one resource of that kind with an optional condition; the policy of one non-owner principal kind answers `bindings(principal)` synchronously and its bindings are read again on every decision, every `allows()` check, and every snapshot computation. A request is allowed only when, on every resolved resource, some binding names that resource, its role lists the action, and no condition refuses; resources are independent, and a grant on the built-in `global` resource implies nothing on any other resource. A throwing `bindings()`, condition, or `explain()` refuses the single question with `policy-failed`, so one faulty rule cannot break a shared event source, a snapshot stream, or page rendering; the service logs each policy's first failure after every `invalidate()` and every registration change.

The Gateway resolves the resources of a call from the method's `resources` readers, else from lookup parameters and Context adapters that declare the kind, else from the kind's default field registered in `typert.resources`; a call that names no resource touches `global`. A reader that throws or returns an empty list, or a resource id that is not a non-empty string, makes the resources invalid, and the Gateway refuses the call with `remote-access/denied` reason `resource-invalid` before asking `decide()`. A forwarded event is decided as the action `event:<name>` on the resources its forwarding entry's readers name, or on `global` when the entry declares none; the per-member contracts of roles, bindings, conditions, policies, and decisions are owned by the [package README](../../packages/api/remote-access/README.md).

## Gateway adjudication points

For a call whose Peer principal is not the owner, the Gateway asks `ctx.remoteAccess.decide({ principal, action, resources, args })` after argument validation and before any lookup or Context resolution; a denied call throws `remote-access/denied` with details `{ action, reason }` and fails before it activates any Session, while an owner call is dispatched without resource resolution or a decision. A forwarded event reaches a non-owner stream whole or not at all: a denied frame or a frame whose resources are invalid is dropped for that stream alone, payloads are never trimmed, and a non-owner stream never receives a scoped waterfall it could answer. Inside a Remote method, list items are filtered through `this.ctx.remoteAccess.allows(resource)`, which decides the call's endpoint action on each item without arguments and re-reads the bindings on every check.

## Access snapshots

The `remoteAccess/follow` stream is the per-Peer view a page follows: one `baseline`, then `upsert` and `remove` frames after each `invalidate()` and each policy registration or removal that changes a grant. A grant lists, per resource, the sorted endpoint actions allowed there without call arguments; `event:` actions never enter the snapshot, a resource whose allowed set becomes empty is removed, and the owner receives only `{ type: 'baseline', owner: true }`. A generation ends when its `signal` aborts or the service unloads, so a reloaded service starts every reader from a fresh baseline, and snapshots are recomputed only after `invalidate()` and policy registration or removal.

Every index the webServer renders carries a `global` row named `REMOTE_ACCESS_SNAPSHOT_KEY` (`__QILIN_REMOTE_ACCESS__`) holding the owner baseline; a composition that renders a page for one principal assigns `ctx.remoteAccess.snapshotFor(principal)` to that global after every index injection row, and the Client entry reads the global when it mounts, so the page opens with that principal's grants. The Client face provides `ctx.remoteAccess.source(kind, id, action)` and the `useRemoteAccess(action)` Hook; a non-owner answer is whether that resource's grant lists the action and never falls back to the `global` answer, a non-owner page without an injected baseline or with a terminally failed stream answers false, and every answer is true for the owner. Hooks never issue requests; the Host still checks every call.

## Owner semantics

QiLin deploys one account-session runtime: accounts-local gates the runtime entry with one account, and Connection admits every connection as the owner Peer, so all connections inside one runtime hold the same owner principal. The default policy for today's connections is full access, which is zero behavior regression against the runtime before this subsystem landed; the role-based machinery binds only principal kinds a driver actually merges into `PrincipalMap` and registers a policy for, and `registerPolicy()` accepts every kind except `owner`. Deployments that later introduce non-owner principals tighten access through roles, bindings, and conditions without a new decision path.

The Peer principal is the data plane beneath these decisions: `PeerScope.principal` is fixed when in-process Host code creates the Peer and no wire field can set it, authenticated browser connections share one owner Peer while each API operator holds a dedicated Peer, and the session controller records a `user-rpc` turn input's `principal` only when the caller is not the owner, so an absent `principal` means the owner. Exact Connection Fetch routes bypass the Gateway and are answered as the owner until each route declares its own access rule.

## Operator connect

Non-page Connection installations default to `interactions: 'none'`: the Peer opens no `$events` stream, `$on()` and generation recovery are unavailable, and unary and raw stream methods remain usable. The desktop shell, SDK, and ACP clients connect in this mode; a caller that intentionally answers forwarded interactions requests `interactions=answer` explicitly. The [operator-connect guide](../upgrade-guide/v0.2.1-alpha.2/operator-connect/guide.md) owns the connect handshake and migration steps, and the [handshake Agent Note](../../.agents/notes/implemented/architecture/2026-10-09-operator-scoped-connect-handshake.md) owns that decision.

<!-- BEGIN GENERATED kylin-surface (gen-kylin-catalog.ts) — do not edit between markers -->

<a id="kylin-surface"></a>

## Cordis API

Generated from source by `scripts/gen-kylin-catalog.ts` (verified fresh by `pnpm run verify-kylin-catalog` in doc-sync; regenerate with `pnpm run gen-kylin-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../kylin-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [kylin-api/inherited.md](../kylin-api/inherited.md).

<a id="ctxremoteaccess--remoteaccessservice"></a>

### `ctx.remoteAccess` — `RemoteAccessService`

Registry of access policies, the Gateway's access decisions, list filtering, and the per-Peer access snapshot. Every composition that mounts the Gateway mounts this service too.

```ts cordis-catalog
/**
 * Register the policy of one non-owner principal kind in the caller's
 * fiber; open snapshots are recomputed on registration and removal.
 * @param kind - the principal kind the policy serves; never `owner`.
 * @param policy - business-owned bindings and refusal reasons for principals of `kind`.
 * @returns disposer removing this policy.
 * @throws Error when `kind` already has a policy.
 */
registerPolicy<K extends Exclude<keyof PrincipalMap, 'owner'>>(kind: K, policy: RemoteAccessPolicy<PrincipalMap[K]>): () => void

/**
 * Report that the bindings or condition answers for `principal` may have
 * changed. Business packages call this on every grant, revocation, mode
 * change, and expiry; open snapshots re-push, and the next failure of each
 * policy is logged again.
 * @param principal - affected principal; omitted for every principal.
 */
invalidate(principal?: Principal): void

/**
 * Gateway-only: decide one request whose resources the Gateway resolved.
 * The owner is allowed, and so is `remoteAccess/follow`: every Peer reads
 * its own snapshot. Otherwise the action is allowed only when, on every
 * listed resource, some binding of the principal's policy names that
 * resource, has a role listing the action, and has no condition or a
 * condition that allows. `bindings()` is called once per decision.
 * @param request - the caller or recipient, the action, the resources it
 *   touches, and a call's arguments.
 * @returns `allow`; or `deny` with `no-allow` when the principal kind has
 *   no policy, the first refusing condition's reason on the first resource
 *   no binding allows, else `explain()`'s reason, else `no-allow`;
 *   `policy-failed` when `bindings()`, a condition, or `explain()` throws,
 *   logged once per policy until the next `invalidate()`. The Gateway
 *   throws `remote-access/denied` for a denied call and drops a denied event.
 */
decide(request: RemoteAccessRequest<Principal>): RemoteAccessDecision

/**
 * Filter items inside a Remote method. The invocation is read from the
 * Context that accessed this service, so call it as
 * `this.ctx.remoteAccess.allows(resource)` from the Remote method. Each
 * check reads the policy's bindings again, so a long-running stream sees
 * binding changes from the next check on.
 * @param resource - resource of one result item.
 * @returns true for the owner and outside a Remote call; otherwise whether
 *   the invocation's endpoint action is allowed on `resource` without call
 *   arguments, false when the policy is absent or fails.
 */
allows(resource: RemoteAccessResource): boolean

/**
 * The baseline a page opens with before its snapshot stream connects. A
 * business package rendering a non-owner page assigns this value to
 * {@link REMOTE_ACCESS_SNAPSHOT_KEY} after every index injection row,
 * replacing the owner baseline the webServer index carries.
 * @param principal - the page's caller identity.
 * @returns the owner baseline for the owner; otherwise the principal's current grants.
 */
snapshotFor(principal: Principal): RemoteAccessBaseline

/**
 * Stream the calling Peer's access snapshot: one baseline, then `upsert`
 * and `remove` frames after each `invalidate()` and each policy
 * registration or removal that changes a grant. The owner receives only
 * `{ owner: true }`. The generation ends when `signal` aborts or this
 * service unloads, so a reloaded service starts every reader from a fresh
 * baseline.
 * @param signal - generation cancellation.
 * @returns the access frames of one generation.
 */
@Remote({ mode: 'stream' }) async *follow(signal: AbortSignal): AsyncIterable<RemoteAccessFrame>
```

Types: [Principal](typert.md) · [PrincipalMap](typert.md) · [RemoteAccessResource](typert.md)

Source: [`packages/api/remote-access/src/index.ts`](../../packages/api/remote-access/src/index.ts)
<!-- END GENERATED kylin-surface -->
