# 扩展

[English](extensions.md) | 中文

extensions 子系统允许 agent（智能体）定义带版本的 Kylin 包、运行其 host 与浏览器两半，并在编写代码前查询获准公开的运行时元数据。包生命周期与沙箱行为由 [`packages/extensions`](../../packages/extensions/README.zh.md) 包组说明。

<!-- BEGIN GENERATED kylin-surface (gen-kylin-catalog.ts) — do not edit between markers -->

<a id="kylin-surface"></a>

## Kylin API

Generated from source by `scripts/gen-kylin-catalog.ts` (verified fresh by `pnpm run verify-kylin-catalog` in doc-sync; regenerate with `pnpm run gen-kylin-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts kylin-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../kylin-primer.zh.md#dispatch-modes), and the framework-inherited `ctx` API lives in [kylin-api/inherited.md](../kylin-api/inherited.md).

<a id="ctxkylininspect--kylininspectregistryservice"></a>

### `ctx.kylinInspect` — `KylinInspectRegistryService`

Registry and cross-page router behind the two model-facing inspect tools.

```ts kylin-catalog
/**
 * Register one Host provider.
 * @param registration - manifest and local query handler.
 * @returns idempotent disposer.
 */
register(registration: HostKylinInspectProviderRegistration): () => void

/**
 * Replace the mirrored Client provider directory.
 * @param providers - complete Client manifest snapshot.
 */
syncClientManifest(providers: readonly KylinInspectProviderManifest[]): void

/**
 * Return the complete known Host and Client provider directory.
 * @returns Host providers followed by the Client providers.
 */
list(): KylinInspectProviderView[]

/**
 * Execute one provider query on its owning platform.
 * @param platform - Host or Client runtime.
 * @param providerId - provider selected from {@link list}.
 * @param methodName - declared method name.
 * @param input - optional lossless JSON input.
 * @param agent - requesting Agent and scope.
 * @param signal - tool-call cancellation.
 * @returns provider JSON data.
 */
async query( platform: KylinInspectPlatform, providerId: string, methodName: string, input: JsonValue | undefined, agent: Agent, signal: AbortSignal, ): Promise<JsonValue>

/**
 * Accept the first valid Client response for a pending query.
 * @param agent - Agent whose Session owns the query.
 * @param requestId - Pending Client query identity.
 * @param resolution - Client provider result or failure.
 * @returns whether this response settled the still-pending query.
 */
resolveClientQuery( agent: Agent, requestId: KylinInspectRequestId, resolution: KylinInspectQueryResolution, ): KylinInspectResolveAck
```

Types: [Agent](core.zh.md)

Source: [`packages/extensions/kylin-host-runner/src/inspect-registry.ts`](../../packages/extensions/kylin-host-runner/src/inspect-registry.ts)

<a id="ctxdynamickylinrunner--dynamickylinrunnerservice"></a>

### `ctx.dynamicKylinRunner` — `DynamicKylinRunnerService`

Dynamic Plugin registry and Host-half lifecycle.

```ts kylin-catalog
/**
 * Define a new Plugin's first Package or append a Package to an existing Plugin.
 * @param request - Session ownership, Plugin selection, metadata, and source code.
 * @returns Host-minted Plugin and Package identities with declared-half metadata.
 */
define(request: DynamicKylinDefineRequest): DynamicKylinDefineReceipt

/**
 * Remove a Plugin, its active run, and all immutable Packages.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to remove.
 * @returns Whether removal succeeded and whether it stopped an active run.
 */
async undefine(agent: Agent, pluginId: KylinDynamicPluginId): Promise<DynamicKylinUndefineReceipt>

/**
 * Remove a Plugin from the user panel and queue the resulting state change for the model's next step.
 * @param agent - Agent whose Session owns the Plugin and receives the context.
 * @param pluginId - Stable Plugin identity to remove.
 * @returns Whether removal succeeded and whether it stopped an active run.
 */
@Remote('undefineFromPanel') async undefineFromPanel(agent: Agent, pluginId: KylinDynamicPluginId): Promise<DynamicKylinUndefineReceipt>

/**
 * Start or update one Package for a model tool call. An unauthorized Client
 * Package waits for approval; Plugin-wide authorization covers later versions.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to activate.
 * @param packageId - Immutable Package version to activate.
 * @param mode - Whether to run the current version or switch versions.
 * @param signal - Tool-call cancellation signal while the activation request is being created.
 * @returns The successful activation identity or an actionable refusal.
 */
async run( agent: Agent, pluginId: KylinDynamicPluginId, packageId: KylinDynamicPackageId, mode: KylinDynamicRunMode, signal?: AbortSignal, ): Promise<DynamicKylinRunResponse>

/**
 * Start Host code for an approved request or a direct panel gesture.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to activate.
 * @param packageId - Immutable Package version to activate.
 * @param mode - Whether to run the current version or switch versions.
 * @param requestId - Model-driven request identity, or null for a direct user gesture.
 * @param approveFutureVersions - Whether this approval covers later Packages of the same Plugin.
 * @returns The exact Host activation or a failure message.
 */
@Remote('runHostHalf') async runHostHalf( agent: Agent, pluginId: KylinDynamicPluginId, packageId: KylinDynamicPackageId, mode: KylinDynamicRunMode, requestId: ApprovalRequestId | null, approveFutureVersions: boolean, ): Promise<DynamicKylinHostHalfResult>

/**
 * Fetch Client code for the exact active run.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to read.
 * @param pluginRunId - Exact active run authorized to receive source.
 * @returns Client source and its Plugin, Package, and run identities.
 */
@Remote('getClientCode') getClientCode( agent: Agent, pluginId: KylinDynamicPluginId, pluginRunId: KylinDynamicPluginRunId, ): DynamicKylinClientSource

/**
 * Resolve one model-driven Client activation request.
 * @param requestId - Request identity to settle once.
 * @param resolution - Browser refusal or exact Client activation result.
 * @returns Whether the still-pending request accepted this resolution.
 */
@Remote('resolveRequestRun') async resolveRequestRun( requestId: ApprovalRequestId, resolution: DynamicKylinRunResolution, ): Promise<DynamicKylinResolveAck>

/**
 * Settle a direct panel run after this page loaded or failed its Client half.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity being settled.
 * @param resolution - Exact Client activation result from the acting page.
 * @returns The committed activation or its failure.
 */
@Remote('settleUserRun') async settleUserRun( agent: Agent, pluginId: KylinDynamicPluginId, resolution: DynamicKylinRunResolution, ): Promise<DynamicKylinRunResponse>

/**
 * Stop the active run while retaining every Package version.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity to stop.
 * @returns Success or the reason no run was stopped.
 */
async stop(agent: Agent, pluginId: KylinDynamicPluginId): Promise<DynamicKylinStopResponse>

/**
 * Stop a Plugin from the user panel and queue the resulting state change for the model's next step.
 * @param agent - Agent whose Session owns the Plugin and receives the context.
 * @param pluginId - Stable Plugin identity to stop.
 * @returns Success or the reason no run was stopped.
 */
@Remote('stopFromPanel') async stopFromPanel(agent: Agent, pluginId: KylinDynamicPluginId): Promise<DynamicKylinStopResponse>

/**
 * Replace the Host mirror of the Client inspect provider directory.
 * @param providers - complete Client provider manifest.
 * @returns null after accepting the manifest.
 */
@Remote('syncInspectManifest') syncInspectManifest(providers: readonly KylinInspectProviderManifest[]): null

/**
 * Claim one pending Client inspect query with its live result.
 * @param agent - Session that owns the query.
 * @param requestId - exact pending query identity.
 * @param resolution - provider result or structured refusal.
 * @returns whether this answer won the query.
 */
@Remote('resolveInspectQuery') resolveInspectQuery( agent: Agent, requestId: KylinInspectRequestId, resolution: KylinInspectQueryResolution, ): KylinInspectResolveAck

/**
 * Frame-wide inventory, grouped as one row per stable Plugin.
 * @returns Source-free metadata for every process-local Plugin.
 */
@Remote('inventory') inventory(): DynamicKylinInventoryRow[]

/**
 * Read one Session's Host-rich state for inspection and result rendering.
 * @param agent - Agent whose Session selects visible Plugins.
 * @returns Plugin versions, active runs, Host fibers, and render failures.
 */
snapshot(agent: Agent): DynamicKylinSnapshotRow[]

/**
 * Read source-free context for an explicit `@pluginId` user gesture.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity referenced by the user.
 * @returns The preferred modification base, or undefined when unavailable.
 */
reference(agent: Agent, pluginId: KylinDynamicPluginId): DynamicKylinReference | undefined

/**
 * List source-free Plugin summaries owned by one Session.
 * @param agent - Agent whose Session selects visible Plugins.
 * @returns one summary per Plugin in creation order.
 */
listPlugins(agent: Agent): DynamicKylinPluginInspection[]

/**
 * Inspect one Plugin without returning Package source.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - stable Plugin identity.
 * @returns version pointers, latest run, and all Package summaries.
 */
inspectPlugin(agent: Agent, pluginId: KylinDynamicPluginId): DynamicKylinPluginInspection

/**
 * Read one exact immutable Package and its Host and Client source.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity that owns the Package.
 * @param packageId - Exact immutable Package identity to inspect.
 * @returns Package metadata, source, and the Plugin's lifecycle pointers.
 */
inspectPackage( agent: Agent, pluginId: KylinDynamicPluginId, packageId: KylinDynamicPackageId, ): DynamicKylinPackageInspection

/**
 * Record a post-load render failure for the exact active run.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity that rendered.
 * @param pluginRunId - Exact active run that produced the failure.
 * @param failure - Slot, message, and entry-retirement result.
 * @returns Null after recording or ignoring a stale report.
 */
@Remote('reportRenderFailure') async reportRenderFailure( agent: Agent, pluginId: KylinDynamicPluginId, pluginRunId: KylinDynamicPluginRunId, failure: DynamicKylinRenderFailure, ): Promise<null>

/**
 * Report a Client guard rejection that happened after the Package completed activation.
 * @param agent - Agent whose Session must own the Plugin.
 * @param pluginId - Stable Plugin identity whose Client code was rejected.
 * @param pluginRunId - Exact active run that produced the rejection.
 * @param failure - Original guard message and stack.
 * @returns Null after reporting or ignoring a stale/startup failure.
 */
@Remote('reportClientGuardFailure') async reportClientGuardFailure( agent: Agent, pluginId: KylinDynamicPluginId, pluginRunId: KylinDynamicPluginRunId, failure: KylinErrorDetails, ): Promise<null>

/**
 * Invoke an active Host method while rejecting stale Client runs.
 * @param pluginId - Stable Plugin identity that owns the method.
 * @param pluginRunId - Exact active run authorizing the call.
 * @param method - Registered Host handler name.
 * @param args - JSON argument delivered to the handler.
 * @returns The JSON result or a typed invocation failure.
 */
@Remote('invoke') async invoke( pluginId: KylinDynamicPluginId, pluginRunId: KylinDynamicPluginRunId, method: string, args: JsonValue, ): Promise<DynamicKylinInvokeResult>
```

Types: [Agent](core.zh.md)

Source: [`packages/extensions/kylin-host-runner/src/index.ts`](../../packages/extensions/kylin-host-runner/src/index.ts)

<a id="ctxinspector--inspectorservice"></a>

### `ctx.inspector` — `InspectorService`

Shared Host/Client service façade over the realm's source publisher.

```ts kylin-catalog
/**
 * Publish one JSON observation without waiting for Worker delivery.
 * @param topic - Domain-owned topic name.
 * @param payload - JSON value validated before it reaches the carrier.
 * @param monotonicMs - Source-clock timestamp; defaults to `performance.now()`.
 */
publish(topic: string, payload: InspectorJsonValue, monotonicMs?: number): void
```

Source: [`packages/experimental/inspector/src/index.ts`](../../packages/experimental/inspector/src/index.ts)

<a id="kylin-events"></a>

### `kylin/*` events

<a id="kylindynamic-package--emit"></a>

#### `kylin/dynamic-package` — emit

One exact Plugin/Package activation is now live in the Host.

```ts kylin-catalog
/**
 * One exact Plugin/Package activation is now live in the Host.
 * @param pkg - stable plugin, immutable package, run identity, and label.
 * @mode emit
 */
'kylin/dynamic-package'(pkg: DynamicKylinPackage): void
```

Source: [`packages/extensions/kylin-host-runner/src/types.ts`](../../packages/extensions/kylin-host-runner/src/types.ts)

<a id="kylindynamic-retract--emit"></a>

#### `kylin/dynamic-retract` — emit

One exact activation was withdrawn.

```ts kylin-catalog
/**
 * One exact activation was withdrawn.
 * @param retracted - plugin, package, and run identity.
 * @mode emit
 */
'kylin/dynamic-retract'(retracted: DynamicKylinRetracted): void
```

Source: [`packages/extensions/kylin-host-runner/src/types.ts`](../../packages/extensions/kylin-host-runner/src/types.ts)

<a id="kylininspect-query--emit"></a>

#### `kylin/inspect-query` — emit

Request a live read-only query from the Client inspect registry.

```ts kylin-catalog
/**
 * Request a live read-only query from the Client inspect registry.
 * @param request - correlation, Session, provider, method, and JSON input.
 * @mode emit
 */
'kylin/inspect-query'(request: KylinInspectQueryRequest): void
```

Source: [`packages/extensions/kylin-host-runner/src/types.ts`](../../packages/extensions/kylin-host-runner/src/types.ts)

<a id="kylininspect-query-resolved--emit"></a>

#### `kylin/inspect-query-resolved` — emit

Notify every Client that an inspect query has settled or been cancelled.

```ts kylin-catalog
/**
 * Notify every Client that an inspect query has settled or been cancelled.
 * @param resolved - exact query identity that is no longer answerable.
 * @mode emit
 */
'kylin/inspect-query-resolved'(resolved: KylinInspectQueryResolved): void
```

Source: [`packages/extensions/kylin-host-runner/src/types.ts`](../../packages/extensions/kylin-host-runner/src/types.ts)

<a id="kylinrequest-run--emit"></a>

#### `kylin/request-run` — emit

A Client-bearing activation needs a browser page, and may require a user decision.

```ts kylin-catalog
/**
 * A Client-bearing activation needs a browser page, and may require a user decision.
 * @param request - correlation identity, owner, target version, mode, and approval requirement.
 * @mode emit
 */
'kylin/request-run'(request: DynamicKylinRunRequest): void
```

Source: [`packages/extensions/kylin-host-runner/src/types.ts`](../../packages/extensions/kylin-host-runner/src/types.ts)

<a id="kylinrequest-run-resolved--emit"></a>

#### `kylin/request-run-resolved` — emit

A pending Client activation request left the answerable state.

```ts kylin-catalog
/**
 * A pending Client activation request left the answerable state.
 * @param resolved - request identity and outcome.
 * @mode emit
 */
'kylin/request-run-resolved'(resolved: DynamicKylinRequestResolved): void
```

Source: [`packages/extensions/kylin-host-runner/src/types.ts`](../../packages/extensions/kylin-host-runner/src/types.ts)
<!-- END GENERATED kylin-surface -->
