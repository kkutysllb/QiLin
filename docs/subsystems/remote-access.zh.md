# Remote 访问控制

[English](remote-access.md) | 中文

[`@qilin-agent/api-remote-access`](../../packages/api/remote-access/README.zh.md) 决定非 owner Peer 可以调用哪些 Remote 方法、可以收到哪些转发事件。每个挂载 [API Gateway](../api-gateway.zh.md) 的组合都挂载 `ctx.remoteAccess`；Gateway 解析一次调用或事件触及的资源，并在解析 lookup、解码参数之前询问本服务。owner principal 从不接受检查。资源类型由 Typert 页的[资源声明](typert.zh.md)拥有，QiLin 侧的引入裁决由 [remote-access 设计稿](../../plans/2026-10-17-remote-access-typert-owner-design.md)拥有。

## 资源模型

业务包定义角色——每个角色是一个资源种类上的动作集合——并把角色绑定到该种类的一个资源上，可以带一个条件；每个非 owner principal 种类的策略同步回答 `bindings(principal)`，且绑定在每次判定、每次 `allows()` 检查、每次快照计算时都会重新读取。一个请求被允许，当且仅当在每个解析出的资源上，存在绑定指明该资源、其角色列出该动作、且没有条件拒绝；资源相互独立，内建 `global` 资源上的授权不蕴含任何其他资源。抛错的 `bindings()`、条件或 `explain()` 只以 `policy-failed` 拒绝这一个提问，因此一条 faulty 规则不会破坏共享的事件 source、快照流或页面渲染；服务在每次 `invalidate()` 与每次注册变更之后记录每个策略的第一次失败。

Gateway 从方法的 `resources` 读取函数解析一次调用触及的资源，否则从声明该种类的 lookup 参数与 Context adapter 解析，否则从 `typert.resources` 注册的该种类默认字段解析；不指明资源的调用访问 `global`。读取函数抛错或返回空列表、或某个资源 id 不是非空字符串，都会使资源非法，Gateway 不询问 `decide()` 即以 `remote-access/denied` 原因 `resource-invalid` 拒绝该调用。转发事件以 `event:<name>` 为动作、在其转发条目读取函数指明的资源上判定，条目未声明时在 `global` 上判定；角色、绑定、条件、策略与判定的逐成员契约由[包 README](../../packages/api/remote-access/README.zh.md) 拥有。

## Gateway 裁决点

对 Peer principal 非 owner 的调用，Gateway 在参数校验之后、任何 lookup 或 Context 解析之前询问 `ctx.remoteAccess.decide({ principal, action, resources, args })`；被拒调用以 details `{ action, reason }` 抛出 `remote-access/denied`，在激活任何 Session 之前失败，而 owner 调用不经资源解析、不经裁决直接分发。转发事件要么整体到达非 owner 流、要么不到达：被拒的帧或资源非法的帧只为该流丢弃，payload 永不被裁剪，非 owner 流也永远不会收到它能回答的作用域 waterfall。在 Remote 方法内部，列表条目通过 `this.ctx.remoteAccess.allows(resource)` 过滤：它不带参数地在该条目上判定调用的端点动作，并在每次检查时重新读取绑定。

## 访问快照

`remoteAccess/follow` 流是每个页面跟随的 per-Peer 视图：一条 `baseline`，其后是每次 `invalidate()` 与每次改变授权的策略注册或移除之后的 `upsert` 与 `remove` 帧。授权按资源列出在该资源上无需调用参数即被允许的端点动作（排序后）；`event:` 动作从不进入快照，允许集合变空的资源被移除，owner 只收到 `{ type: 'baseline', owner: true }`。signal 中止或服务卸载时一个世代结束，因此重载后的服务让每个读者从新基线开始；快照只在 `invalidate()` 与策略注册或移除之后重算。

webServer 渲染的每个 index 都携带一行名为 `REMOTE_ACCESS_SNAPSHOT_KEY`（`__QILIN_REMOTE_ACCESS__`）的 `global` 行，值为 owner 基线；为某个 principal 渲染页面的组合，在每条 index 注入行之后把 `ctx.remoteAccess.snapshotFor(principal)` 赋值给该 global，Client 入口挂载时读取该 global，页面因此以该 principal 的授权打开。Client 面提供 `ctx.remoteAccess.source(kind, id, action)` 与 `useRemoteAccess(action)` Hook；非 owner 的答案是该资源的授权是否列出该动作，绝不回退到 `global` 的答案，没有注入基线、或快照流终态失败的非 owner 页面回答 false，owner 的每个答案都是 true。Hook 从不发起请求；Host 仍检查每一次调用。

## Owner 语义

QiLin 部署为单账号会话运行时：accounts-local 以一个账号把守运行时入口，Connection 把每条连接都接纳为 owner Peer，因此同一运行时内的所有连接持有同一个 owner principal。今天所有连接的默认策略是全权——相对本子系统落地前的运行时为零行为回归；基于角色的机制只约束 driver 真正并入 `PrincipalMap` 并注册了策略的 principal 种类，`registerPolicy()` 接受 `owner` 之外的任何种类。日后引入非 owner principal 的部署，通过角色、绑定与条件收紧访问，不需要新的判定路径。

Peer principal 是这些裁决之下的数据面：`PeerScope.principal` 在进程内 Host 代码创建 Peer 时固定，任何 wire 字段都无法设置它；认证的浏览器连接共享一个 owner Peer，而每个 API operator 持有专属 Peer；session controller 只在调用方非 owner 时才在 `user-rpc` 回合输入上记录 `principal`，因此 `principal` 缺省即 owner。精确的 Connection Fetch 路由不经过 Gateway，在每条路由声明自己的访问规则之前，它们以 owner 身份应答。

## Operator connect

非页面 Connection 安装默认 `interactions: 'none'`：Peer 不打开 `$events` 流，`$on()` 与世代恢复不可用，一元方法与 raw stream 方法保持可用。desktop shell、SDK 与 ACP 客户端以该模式连接；有意回答转发交互的调用方显式请求 `interactions=answer`。[operator-connect 指南](../upgrade-guide/v0.2.1-alpha.2/operator-connect/guide.zh.md)拥有连接握手与迁移步骤，[握手 Agent Note](../../.agents/notes/implemented/architecture/2026-10-09-operator-scoped-connect-handshake.zh.md)拥有该决策。

<!-- BEGIN GENERATED kylin-surface (gen-kylin-catalog.ts) — do not edit between markers -->

<a id="kylin-surface"></a>

## Cordis API

Generated from source by `scripts/gen-kylin-catalog.ts` (verified fresh by `pnpm run verify-kylin-catalog` in doc-sync; regenerate with `pnpm run gen-kylin-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../kylin-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [kylin-api/inherited.md](../kylin-api/inherited.md).

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

Types: [Principal](typert.zh.md) · [PrincipalMap](typert.zh.md) · [RemoteAccessResource](typert.zh.md)

Source: [`packages/api/remote-access/src/index.ts`](../../packages/api/remote-access/src/index.ts)
<!-- END GENERATED kylin-surface -->
