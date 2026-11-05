import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, Service } from '@qilin-agent/kylin'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import LlmRuntime from '@qilin-agent/llm'
import SessionStore, { SessionId, SessionLogOffset, type SessionHeader } from '@qilin-agent/session'
import SystemPrompt from '@qilin-agent/system-prompt'
import ToolRuntime from '@qilin-agent/tools'
import AgentRegistry, { type Agent } from '@qilin-agent/agent'
import SessionProjectionRegistry from '@qilin-agent/session-projection'
import SessionPersistence, {
  type SessionHandle,
  type SessionPersistenceSnapshot,
} from '@qilin-agent/session-persistence'
import JsonlSessionPersistence from '@qilin-agent/session-persistence-jsonl'
import AgentLoop from '@qilin-agent/agent-loop'

const dirs: string[] = []
afterEach(async () => { for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true }) })

/** Write handle for a backend that never reads back what it accepted. */
function stubHandle(header: SessionHeader): SessionHandle {
  return {
    id: header.id,
    header,
    inheritedEventCount: SessionLogOffset(0),
    access: 'write',
    read: () => Promise.reject(new Error('read is not part of this scenario')),
    append: () => Promise.resolve(),
    flush: () => Promise.resolve(),
    close: () => Promise.resolve(),
    [Symbol.asyncDispose]: () => Promise.resolve(),
  }
}

/**
 * Backend whose activation stays pending until released, so a session created
 * during the mount window observes a provider that is provided but not active.
 */
class GatedPersistence extends SessionPersistence {
  static latest: GatedPersistence | undefined
  readonly created: SessionId[] = []
  private readonly gate = Promise.withResolvers<undefined>()

  constructor(ctx: Context) {
    super(ctx)
    GatedPersistence.latest = this
  }

  /** Let the activation finish. */
  release(): void {
    this.gate.resolve(undefined)
  }

  protected async [Service.init](): Promise<void> {
    await this.gate.promise
  }

  create(header: SessionHeader): Promise<SessionHandle> {
    this.created.push(header.id)
    return Promise.resolve(stubHandle(header))
  }

  open(): Promise<SessionHandle> {
    return Promise.reject(new Error('open is not part of this scenario'))
  }

  flush(): Promise<void> {
    return Promise.resolve()
  }

  stat(): Promise<SessionPersistenceSnapshot | undefined> {
    return Promise.resolve(undefined)
  }

  list(): Promise<readonly SessionPersistenceSnapshot[]> {
    return Promise.resolve([])
  }
}

/** Read the configured agent once its creation settles. */
async function configuredAgent(ctx: Context): Promise<Agent> {
  const find = (): Agent | undefined => ctx.agents.list().find(candidate => candidate.options.model === 'mock')
  await vi.waitFor(() => { expect(find()).toBeDefined() })
  const agent = find()
  if (agent === undefined) throw new Error('configured agent was not created')
  return agent
}

/** Mount the services AgentLoop reads without a persistence backend. */
async function mountCore(ctx: Context): Promise<void> {
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
}

describe('configured agent creation ordered against a mounting backend', () => {
  it('waits for a provided backend to finish activating before creating the session', async () => {
    const ctx = new Context()
    await mountCore(ctx)
    const provider = ctx.plugin(GatedPersistence)
    // The provider registers its service before its activation settles.
    await vi.waitFor(() => { expect(GatedPersistence.latest).toBeDefined() })
    const backend = GatedPersistence.latest
    if (backend === undefined) throw new Error('gated backend was not constructed')

    await ctx.plugin(AgentLoop, { agents: [{ id: 'main', model: 'mock' }] })
    // The provider is provided but not active: creation waits instead of
    // falling back to an unpersisted session.
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(ctx.get('sessionPersistence')).toBeUndefined()
    expect(backend.created).toHaveLength(0)

    backend.release()
    await provider
    await configuredAgent(ctx)
    expect(backend.created).toHaveLength(1)
    await ctx.fiber.dispose()
  })

  it('persists the session when the backend provider is still activating', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agent-loop-persistence-order-'))
    dirs.push(root)
    const ctx = new Context()
    await mountCore(ctx)

    // Start both entries without awaiting between them: a Loader mounts one
    // layer's entries concurrently, so the configured agent is built while the
    // backend's fiber is still loading.
    const backend = ctx.plugin(JsonlSessionPersistence, { root, compression: 'none' })
    const loop = ctx.plugin(AgentLoop, { agents: [{ id: 'main', model: 'mock' }] })
    await backend
    await loop

    const agent = await configuredAgent(ctx)
    const handle = await ctx.sessionPersistence.open(agent.session.id, 'read')
    await handle.close()
    await ctx.fiber.dispose()
  })

  it('creates an in-memory session when the composition mounts no backend', async () => {
    const ctx = new Context()
    await mountCore(ctx)
    await ctx.plugin(AgentLoop, { agents: [{ id: 'main', model: 'mock' }] })
    await configuredAgent(ctx)
    expect(ctx.get('sessionPersistence')).toBeUndefined()
    await ctx.fiber.dispose()
  })
})
