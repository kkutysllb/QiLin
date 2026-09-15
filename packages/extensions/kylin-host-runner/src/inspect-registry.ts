/** Host registry for model-visible, read-only Kylin capability queries. */

import { Service } from '@qilin/kylin'
import type { Context } from '@qilin/kylin'
import type { Agent } from '@qilin/agent'
import { snapshotJsonValue, type JsonValue } from '@qilin/util-values'
import { assertSupportedJsonSchema, validateJsonSchemaValue } from '@qilin/tools'
import type { JsonSchemaNode } from '@qilin/tools'
import type {
  KylinInspectMethodManifest, KylinInspectPlatform, KylinInspectProviderManifest,
  KylinInspectProviderView, KylinInspectQueryRequest, KylinInspectQueryResolution,
  KylinInspectRequestId, KylinInspectResolveAck,
} from './types.ts'

/** Context supplied to a Host inspect query. */
export interface HostKylinInspectQueryContext {
  /** Tool-call cancellation. */
  signal: AbortSignal
  /** Agent whose scoped runtime is being inspected. */
  agent: Agent
}

/** Local registration paired with its serializable manifest. */
export interface HostKylinInspectProviderRegistration {
  /** Provider and explicit method directory. */
  manifest: KylinInspectProviderManifest
  /** Execute one declared method. */
  query(method: string, input: JsonValue | undefined, context: HostKylinInspectQueryContext): Promise<JsonValue>
}

interface PendingClientQuery {
  request: KylinInspectQueryRequest
  method: KylinInspectMethodManifest
  settle(resolution: KylinInspectQueryResolution): void
}

declare module '@qilin/kylin' {
  interface Context {
    /** Host registry for Kylin inspect providers and Client manifest/query routing. */
    cordisInspect: KylinInspectRegistryService
  }
}

/** Registry and cross-page router behind the two model-facing inspect tools. */
export class KylinInspectRegistryService extends Service {
  private readonly providers = new Map<string, HostKylinInspectProviderRegistration>()
  private readonly pending = new Map<KylinInspectRequestId, PendingClientQuery>()
  private clientManifest: readonly KylinInspectProviderManifest[] | undefined
  private nextRequest = 1

  /** Register the process-global Host registry. */
  constructor(ctx: Context) {
    super(ctx, 'cordisInspect')
  }

  /**
   * Register one Host provider.
   * @param registration - manifest and local query handler.
   * @returns idempotent disposer.
   */
  register(registration: HostKylinInspectProviderRegistration): () => void {
    const manifest = validateManifest(registration.manifest)
    if (this.providers.has(manifest.id)) throw new Error(`Host Kylin inspect provider "${manifest.id}" is already registered`)
    const stored = { ...registration, manifest }
    this.providers.set(manifest.id, stored)
    return () => {
      if (this.providers.get(manifest.id) === stored) this.providers.delete(manifest.id)
    }
  }

  /**
   * Replace the mirrored Client provider directory.
   * @param providers - complete Client manifest snapshot.
   */
  syncClientManifest(providers: readonly KylinInspectProviderManifest[]): void {
    const ids = new Set<string>()
    const validated = providers.map((provider) => {
      const manifest = validateManifest(provider)
      if (ids.has(manifest.id)) throw new Error(`Client Kylin inspect manifest repeats provider "${manifest.id}"`)
      ids.add(manifest.id)
      return manifest
    })
    this.clientManifest = Object.freeze(validated)
  }

  /**
   * Return the complete known Host and Client provider directory.
   * @returns Host providers followed by the Client providers.
   */
  list(): KylinInspectProviderView[] {
    return [
      ...[...this.providers.values()].map(provider => view('host', provider.manifest)),
      ...(this.clientManifest ?? []).map(provider => view('client', provider)),
    ]
  }

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
  async query(
    platform: KylinInspectPlatform,
    providerId: string,
    methodName: string,
    input: JsonValue | undefined,
    agent: Agent,
    signal: AbortSignal,
  ): Promise<JsonValue> {
    if (platform === 'host') {
      const registration = this.providers.get(providerId)
      if (registration === undefined) throw new Error(`Host Kylin inspect provider "${providerId}" is not registered`)
      const method = findMethod(registration.manifest, methodName)
      validateInput('Host', providerId, method, input)
      signal.throwIfAborted()
      const data = await registration.query(methodName, input, { agent, signal })
      signal.throwIfAborted()
      return validateOutput('Host', providerId, method, data)
    }
    return await this.queryClient(providerId, methodName, input, agent, signal)
  }

  /**
   * Accept the first valid Client response for a pending query.
   * @param agent - Agent whose Session owns the query.
   * @param requestId - Pending Client query identity.
   * @param resolution - Client provider result or failure.
   * @returns whether this response settled the still-pending query.
   */
  resolveClientQuery(
    agent: Agent,
    requestId: KylinInspectRequestId,
    resolution: KylinInspectQueryResolution,
  ): KylinInspectResolveAck {
    const pending = this.pending.get(requestId)
    if (pending === undefined || pending.request.agentId !== agent.id) return { accepted: false }
    if (!resolution.ok) return { accepted: false }
    try {
      resolution = {
        ok: true,
        data: validateOutput('Client', pending.request.provider, pending.method, resolution.data),
      }
    } catch {
      return { accepted: false }
    }
    this.pending.delete(requestId)
    pending.settle(resolution)
    this.ctx.emit('cordis/inspect-query-resolved', { requestId })
    return { accepted: true }
  }

  private async queryClient(
    providerId: string,
    methodName: string,
    input: JsonValue | undefined,
    agent: Agent,
    signal: AbortSignal,
  ): Promise<JsonValue> {
    const provider = this.clientManifest?.find(candidate => candidate.id === providerId)
    if (provider === undefined) throw new Error(`Client Kylin inspect provider "${providerId}" is not registered`)
    const method = findMethod(provider, methodName)
    validateInput('Client', providerId, method, input)
    signal.throwIfAborted()
    const requestId = `inspect-${this.nextRequest++}` as KylinInspectRequestId
    const request: KylinInspectQueryRequest = {
      requestId,
      agentId: agent.id,
      provider: providerId,
      method: methodName,
      ...input === undefined ? {} : { input },
    }
    const result = new Promise<KylinInspectQueryResolution>((resolve) => {
      this.pending.set(requestId, { request, method, settle: resolve })
    })
    const onAbort = (): void => {
      const pending = this.pending.get(requestId)
      if (pending === undefined) return
      this.pending.delete(requestId)
      pending.settle({ ok: false, reason: 'cancelled', message: `Client inspect query ${providerId}.${methodName} was cancelled` })
      this.ctx.emit('cordis/inspect-query-resolved', { requestId })
    }
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
    else this.ctx.emit('cordis/inspect-query', request)
    try {
      const resolution = await result
      if (!resolution.ok) throw new Error(`${providerId}.${methodName}: ${resolution.message}`)
      return resolution.data
    } finally {
      signal.removeEventListener('abort', onAbort)
    }
  }
}

function view(platform: KylinInspectPlatform, manifest: KylinInspectProviderManifest): KylinInspectProviderView {
  return { platform, ...manifest, methods: [...manifest.methods] }
}

function validateManifest(manifest: KylinInspectProviderManifest): KylinInspectProviderManifest {
  if (manifest.id.trim() === '') throw new Error('Kylin inspect provider id must not be empty')
  if (manifest.description.trim() === '') throw new Error(`Kylin inspect provider "${manifest.id}" needs a description`)
  const names = new Set<string>()
  const methods = manifest.methods.map((method) => {
    if (method.name.trim() === '') throw new Error(`Kylin inspect provider "${manifest.id}" has an empty method name`)
    if (names.has(method.name)) throw new Error(`Kylin inspect provider "${manifest.id}" repeats method "${method.name}"`)
    if (method.description.trim() === '') throw new Error(`Kylin inspect method ${manifest.id}.${method.name} needs a description`)
    assertSupportedJsonSchema(method.inputSchema)
    assertSupportedJsonSchema(method.outputSchema)
    names.add(method.name)
    return Object.freeze({ ...method })
  })
  return Object.freeze({ ...manifest, methods: Object.freeze(methods) })
}

function findMethod(manifest: KylinInspectProviderManifest, name: string): KylinInspectMethodManifest {
  const method = manifest.methods.find(candidate => candidate.name === name)
  if (method === undefined) throw new Error(`Kylin inspect provider "${manifest.id}" has no method "${name}"`)
  return method
}

function validateInput(
  platform: 'Host' | 'Client',
  provider: string,
  method: KylinInspectMethodManifest,
  input: JsonValue | undefined,
): void {
  const violations = validateJsonSchemaValue(method.inputSchema as JsonSchemaNode, input ?? {}, 'input')
  if (violations.length > 0) throw new Error(`${platform} Kylin inspect ${provider}.${method.name} rejected input: ${violations.join('; ')}`)
}

function validateOutput(
  platform: 'Host' | 'Client',
  provider: string,
  method: KylinInspectMethodManifest,
  data: JsonValue,
): JsonValue {
  const snapshot = snapshotJsonValue(data)
  if (snapshot === undefined) throw new Error(`${platform} Kylin inspect ${provider}.${method.name} returned a non-JSON value`)
  const violations = validateJsonSchemaValue(method.outputSchema as JsonSchemaNode, snapshot, 'output')
  if (violations.length > 0) throw new Error(`${platform} Kylin inspect ${provider}.${method.name} returned invalid output: ${violations.join('; ')}`)
  return snapshot
}
