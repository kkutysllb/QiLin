# Inspector

English | [中文](inspector.zh.md)

[`@qilin-agent/experimental-inspector`](../../packages/experimental/inspector/README.md) exposes one Chrome DevTools connection to a running QiLin Host and to every connected browser Client. Both plugin faces provide the same `ctx.inspector` service: `publish()` carries realm observations and `cordis.getTree()` reads the shared Cordis topology. All Chrome DevTools Protocol state lives in a Worker page target; Host and Client code publish internal observation records, and the Worker translates the topics it recognizes into protocol domains.

## Runtime layout

The Host plugin injects `webServer` and `connection`, starts the Worker, and holds a dedicated `MessagePort` to it. The Worker serves the protocol endpoint on `127.0.0.1`, owns source state and retention, and attaches a private `node:inspector.Session` per DevTools connection to the Host main thread, so Host debugging stays available while Host JavaScript is paused. A Client opens an authenticated WebSocket directly to the Worker from bootstrap parameters it receives either injected by the Host or fetched through an authenticated Host route registered before the Worker starts. A Client never receives a DevTools URL.

Producers send internal observation records — source generation, sequence, source-clock timestamp, topic, JSON payload — and the Worker validates every process and network frame before translating a recognized topic. Client sources declare typed Runtime, Console, and read-only Sources capabilities. `Runtime.enable` publishes the default Host execution context and one synthetic context for every connected Client included in that DevTools connection, and selecting a Client context routes evaluation, property access, function calls, promise awaiting, and object release to that browser realm. Client-script breakpoints, stepping, and call frames are unsupported, and target-wide pause and resume control the Host debugger only.

When the platform cannot run the Worker and reports Node's `ERR_FEATURE_UNAVAILABLE_ON_PLATFORM`, the Host logs one warning and starts with only the bootstrap route, which answers `503`: no `ctx.inspector`, DevTools route, bootstrap injection, or `devtools://` URL. Any other startup error rejects the plugin. A late-loading Client's bootstrap request waits for Worker readiness and receives `503` when startup failed. A Client closes its source on `pagehide` and reconnects under the same logical identity on `pageshow`; switching a live page to the background does not disconnect it.

## Observation API

`ctx.inspector.publish(topic, payload, monotonicMs?)` validates lossless JSON and schedules delivery without waiting for the Worker, so the observed application operation is never delayed. Each source has a bounded queue; overflow is reported as a sequence gap. `ctx.inspector.cordis.getTree()` reads the Worker's latest detached semantic snapshot without creating a session or enabling Runtime, Debugger, or Sources, and both faces expose the same reader. The [configuration catalog](../config-catalog.md#qilin-agentexperimental-inspector) lists every accepted Host field with its declaration.

## Cordis tree inspection

Both faces run the same browser-safe Cordis collector, which converts reachable Context and Fiber objects into a versioned `CordisTreeSnapshot`; the Worker stores that protocol-independent representation and projects each Host or Client source into the Elements panel. The Elements document has fixed `<host>` and `<clients>` containers: `<host>` holds the Host root Context and `<clients>` holds one `<client>` per source with that realm's root Context. The Cordis root Fiber is omitted; every other Fiber is a child of `fiber.parent`, owns exactly one Context child for `fiber.ctx`, and carries only `uid`; Context elements have no attributes. Context and Fiber nodes carry opaque handles for realm-local object lookup, Fiber nodes also carry the Cordis `uid`, and the Worker composes the realm snapshots into one `{ host, clients }` tree.

Node delivery is depth-limited per DevTools connection: `DOM.getDocument` serves three document levels when `depth` is omitted, withheld levels advertise `childNodeCount` and are fetched through `DOM.requestChildNodes`, and expanding a known node delivers only child lists not yet sent, so existing frontend nodes and deeper loaded descendants stay stable. Sources publish complete snapshots while the Worker compares stable backend node identities before notifying DevTools, so unchanged snapshots emit no DOM event. `DOM.resolveNode` asks the owning Host or Client Runtime for a connection-local object id, and `DOM.requestNode` maps that object back to the same Elements node. A disconnected Client loses its Console context and live object ids immediately; with disconnected-tree retention the last tree remains and its `<client>` element carries `disconnected` until a complete snapshot from the new transport generation replaces it.

## Host fetch capture

Fetch capture wraps `globalThis.fetch` and records the complete URL, request and response headers, body prefixes, status, timing, errors, and cancellation. It does not redact credentials, cookies, query values, or payloads. Configured body limits bound retention rather than select fields: capture keeps the prefix and marks the record truncated, and `Network.getRequestPostData` and `Network.getResponseBody` read the Worker's retained bytes. Direct Undici `Client` and `Dispatcher` calls and fetch references retained before plugin activation are outside this observer.

## Security

The protocol target grants arbitrary code execution in the Host and in every connected Client realm through `Runtime.evaluate`, and fetch capture includes secrets, so the Worker accepts only a `127.0.0.1` bind address. Client ingest additionally requires a random WebSocket subprotocol token injected by the Host and rejects non-loopback origins unless `clientOrigins` names them; the CDP socket carries no token, so loopback binding is its only access control. Client selection limits one DevTools connection's realm sessions, DOM projection, and diagnostic queries; it is a display filter, not authorization, and Host evaluation keeps its existing authority.

## Developer Tools bundle

The [Developer Tools bundle](../../packages/experimental/inspector-profile/README.md) enables this Inspector, the Host fetch capture, and the [Session Inspector](../../packages/experimental/session-inspector/README.md) Sidebar page together. The bundle is off by default.

<!-- BEGIN GENERATED kylin-surface (gen-kylin-catalog.ts) — do not edit between markers -->

<a id="kylin-surface"></a>

## Cordis API

Generated from source by `scripts/gen-kylin-catalog.ts` (verified fresh by `pnpm run verify-kylin-catalog` in doc-sync; regenerate with `pnpm run gen-kylin-catalog`) — the language sides differ only in locale-specific paired document paths. Signature blocks use a `ts cordis-catalog` fence and keep the original source JSDoc; dispatch modes are defined in the [primer](../kylin-primer.md#dispatch-modes), and the framework-inherited `ctx` API lives in [kylin-api/inherited.md](../kylin-api/inherited.md).

<a id="ctxinspector--inspectorservice"></a>

### `ctx.inspector` — `InspectorService`

Shared Host/Client service façade over the realm's source publisher.

```ts cordis-catalog
/**
 * Publish one JSON observation without waiting for Worker delivery.
 * @param topic - Domain-owned topic name.
 * @param payload - JSON value validated before it reaches the carrier.
 * @param monotonicMs - Source-clock timestamp; defaults to `performance.now()`.
 */
publish(topic: string, payload: InspectorJsonValue, monotonicMs?: number): void
```

Types: [InspectorJsonValue](extensions.md)

Source: [`packages/experimental/inspector/src/index.ts`](../../packages/experimental/inspector/src/index.ts)
<!-- END GENERATED kylin-surface -->
