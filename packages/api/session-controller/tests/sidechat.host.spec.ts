/** Session Controller sidechat threads: seeding, boundary delivery, and lifecycle. */

import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@qilin/kylin'
import { mountAgentLoopTestDependencies, mountAgentLoopTestHarness } from '@qilin/agent-loop-testkit'
import type { Agent } from '@qilin/agent'
import { createUserMessage, type MessageId } from '@qilin/llm'
import { SessionQueryError } from '@qilin/session-query'
import JsonlSessionPersistence from '@qilin/session-persistence-jsonl'
import { SessionLogOffset, SESSION_FORMAT_VERSION, SessionSeq } from '@qilin/session'
import type { Session, SessionEvent, SessionHeader, SessionId } from '@qilin/session'
import type { SessionRequestId } from '../src/types.ts'
import SessionTitleService, { SessionTitleInvalidError } from '@qilin/session-title'
import { SUBAGENT_DESCRIPTOR_VERSION } from '@qilin/subagent'
import {
  SIDECHAT_BOUNDARY_PROMPT,
  SIDECHAT_LABEL_MAX_CHARS,
  SIDECHAT_NEW_THREAD_LABEL,
  SIDECHAT_PROVIDER,
  sidechatLabel,
  sidechatOwnEvents,
  sidechatThreadRowOrder,
} from '../src/sidechat.ts'
import { createSessionTestController, createSessionTestRemote, testSessionPersistence } from './test-remote.ts'
import type { TestSessionRemote } from './test-remote.ts'
import { SessionPersistenceRevision } from '@qilin/session-persistence'
import { MockAdapter, textResponse } from '../../../core/agent-loop/tests/mock-adapter.ts'

const sid = (id: string): SessionId => id as SessionId

/** One scripted MockAdapter constructor payload. */
type MockScript = ConstructorParameters<typeof MockAdapter>[0]

const TITLE_SERVICE_CONFIG = { fallbackMaxWords: 5, fallbackMaxBytes: 40, maxTitleBytes: 80 } as const

const SIDECHAT_PRESET = 'sidechat-spec-preset'

const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

/** One mounted mock provider route plus its scripted adapter. */
interface RoutedAdapter {
  readonly route: string
  readonly adapter: MockAdapter
}

interface SidechatHarness {
  readonly ctx: Context
  readonly parent: Agent
  readonly remote: TestSessionRemote
  readonly adapters: readonly RoutedAdapter[]
  readonly startThread: (question?: string) => Promise<SessionId>
}

/** Mount the real loop stack with scripted mock providers and a title service. */
async function sidechatHarness(
  script: MockScript,
  options: {
    readonly persisted?: boolean
    readonly maxSnapshotEvents?: number
    readonly maxPromptChars?: number
    readonly extraAdapters?: readonly { readonly route: string; readonly script: MockScript }[]
    readonly parentDepth?: number
    readonly omitParentCwd?: boolean
    readonly noPresetRoster?: boolean
    readonly noTitleService?: boolean
  } = {},
): Promise<SidechatHarness> {
  const ctx = new Context()
  try {
    await mountAgentLoopTestDependencies(ctx)
    if (options.persisted === true) {
      const root = await mkdtemp(join(tmpdir(), 'qilin-sidechat-'))
      roots.push(root)
      // The backend mounts before the loop so root teardown unwinds agents first.
      await ctx.plugin(JsonlSessionPersistence, { root })
    }
    if (options.noTitleService !== true) {
      await ctx.plugin(SessionTitleService, TITLE_SERVICE_CONFIG)
    }
    const harness = await mountAgentLoopTestHarness(ctx)
    const adapters: RoutedAdapter[] = [{ route: 'mock', adapter: new MockAdapter([...script]) }]
    for (const extra of options.extraAdapters ?? []) {
      adapters.push({ route: extra.route, adapter: new MockAdapter([...extra.script]) })
    }
    for (const { route, adapter } of adapters) ctx.llm.registerAdapter([route], adapter)
    ctx.provide('workspaceRegistry', { list: () => [], archivedSessionIds: [] } as never)
    if (options.noPresetRoster !== true) {
      ctx.provide('agentPresets', {
        defaultId: SIDECHAT_PRESET,
        resolve: (id?: string) => Promise.resolve({ id: id ?? SIDECHAT_PRESET, trust: 'system' }),
        mount: (id?: string) => Promise.resolve({ id: id ?? SIDECHAT_PRESET, trust: 'system' }),
      } as never)
    }
    const remote = createSessionTestRemote(ctx, {
      defaultModelSelection: () => ({ provider: 'mock', model: 'mock' }),
      cwd: '/tmp',
      ...options.maxSnapshotEvents === undefined ? {} : { sidechatMaxSnapshotEvents: options.maxSnapshotEvents },
      ...options.maxPromptChars === undefined ? {} : { sidechatMaxPromptChars: options.maxPromptChars },
    })
    const parent = await harness.create(
      sid('sidechat-parent'),
      { provider: 'mock', model: 'mock' },
      {
        ...(options.omitParentCwd === true ? {} : { cwd: '/tmp' }),
        agentPreset: SIDECHAT_PRESET,
        ...(options.parentDepth === undefined ? {} : { delegationDepth: options.parentDepth }),
      },
    )
    completeTurn(parent.session, 1)
    return {
      ctx,
      parent,
      remote,
      adapters,
      startThread: async (question?: string) => {
        const response = await remote.sidechatStart({
          sessionId: parent.id,
          ...(question === undefined ? {} : { question }),
        })
        if (!response.ok) throw response.error
        return response.value.threadId
      },
    }
  } catch (error: unknown) {
    await ctx.fiber.dispose()
    throw error
  }
}

const message = (text: string) => createUserMessage({
  content: [{ type: 'text', text }], source: { kind: 'user' },
})

/**
 * Append one completed turn to a Session log without a model call. The shape
 * mirrors a minimal real loop turn (open step, protected system head, admitted
 * user input) so seeded and persisted replays accept the prefix.
 */
function completeTurn(
  session: Pick<Session, 'append'>,
  turn: number,
): void {
  const step = 1
  session.append('turn/start', { turn })
  session.append('step/start', { turn, step })
  session.append('system/message', {
    turn, step,
    message: {
      role: 'system',
      content: [{ type: 'text', text: 'You are an AI agent powered by QiLin.' }],
      source: { kind: 'system-prompt' },
      id: `system-${String(turn)}` as MessageId,
    },
  }, { surfaceOp: 'append' })
  session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: `prompt ${String(turn)}` }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('step/end', { turn, step })
  session.append('turn/end', { turn, reason: { kind: 'completed' } })
}

/** Whether one logged event is the thread's boundary injection. */
const isBoundaryMessage = (event: SessionEvent): boolean => event.type === 'user/message'
  && (event.data as { source?: { kind?: string } }).source?.kind === 'sidechat-boundary'

describe('sidechat threads', () => {
  it('seeds the honest parent prefix, stamps the descriptor, and fires no model request', async () => {
    const h = await sidechatHarness([textResponse('unused')])
    try {
      const parentEvents = h.parent.session.snapshotEvents()
      const boundary = parentEvents.at(-1)!.seq
      const requestsBefore = countRequests(h)
      h.parent.inbox.append('next-turn', message('queued parent input'))

      const threadId = await h.startThread()

      const session = h.ctx.sessions.get(threadId)!
      expect(session.header).toMatchObject({
        parentSession: h.parent.id,
        origin: 'subagent',
        isSeeded: true,
        delegationDepth: 1,
        cwd: '/tmp',
        agentPreset: SIDECHAT_PRESET,
      })
      expect(session.inheritedEventCount).toBe(boundary + 1)
      const events = session.snapshotEvents()
      expect(events.slice(0, session.inheritedEventCount)).toEqual(parentEvents.slice(0, boundary + 1))
      expect(events.slice(session.inheritedEventCount).map(event => event.type)).toEqual([
        'session/end-seed', 'subagent/descriptor',
      ])
      expect(events.at(-1)?.data).toMatchObject({
        version: SUBAGENT_DESCRIPTOR_VERSION,
        mode: 'continuable',
        provider: SIDECHAT_PROVIDER,
        label: SIDECHAT_NEW_THREAD_LABEL,
      })
      // An empty thread awaits its first prompt: no boundary, no rename, no model call.
      expect(sidechatOwnEvents(events, session.inheritedEventCount).map(event => event.type))
        .toEqual(['subagent/descriptor'])
      expect(countRequests(h)).toBe(requestsBefore)
      const registry = h.ctx.agents
      await h.ctx.fiber.dispose()
      expect(registry.get(threadId)).toBeUndefined()
    } finally {
      await h.ctx.fiber.dispose()
    }
  })

  it('injects the boundary ahead of the first question, earns the label, and never repeats the boundary', async () => {
    const h = await sidechatHarness([textResponse('side answer'), textResponse('second answer')])
    try {
      const threadId = await h.startThread()
      expect(own_entries(h, threadId).map(event => event.type)).toEqual(['subagent/descriptor'])

      // The inherited prefix is honest: the thread's request carries the parent's
      // completed turn but not the parent input queued after the fork boundary.
      h.parent.inbox.append('next-turn', message('parent input after the cut'))
      const first = await h.remote.sidechatPrompt({
        sessionId: threadId, text: 'What is a sidechat thread?', requestId: 'rpc-sidechat-1' as SessionRequestId,
      })
      expect(first.ok ? first.value : first.error).toMatchObject({ accepted: true })
      if (first.ok) expect(first.value.label).toBe('Side: What is a sidechat thread?')
      await h.ctx.agents.get(threadId)!.whenIdle()

      const threadRequests = requestsMentioning(h, 'What is a sidechat thread?')
      expect(threadRequests).toHaveLength(1)
      const requestText = JSON.stringify(threadRequests[0]?.messages)
      expect(requestText).toContain('Side conversation boundary.')
      expect(requestText).toContain('What is a sidechat thread?')
      expect(requestText).toContain('prompt 1')
      expect(requestText).not.toContain('parent input after the cut')
      expect(own_entries(h, threadId).filter(isBoundaryMessage)).toHaveLength(1)
      expect(own_entries(h, threadId).filter(event => event.type === 'session/title')).toHaveLength(1)
      const asked = own_entries(h, threadId).filter(event => event.type === 'user/message'
        && JSON.stringify((event.data as { content?: readonly { text?: string }[] }).content)?.includes('What is a sidechat thread?'))
      expect((asked[0]?.data as { source?: { rpcId?: string } }).source?.rpcId).toBe('rpc-sidechat-1')

      const second = await h.remote.sidechatPrompt({ sessionId: threadId, text: 'follow-up question' })
      expect(second.ok ? second.value : second.error).toMatchObject({ accepted: true })
      if (second.ok) expect(second.value.label).toBeUndefined()
      await h.ctx.agents.get(threadId)!.whenIdle()
      expect(own_entries(h, threadId).filter(isBoundaryMessage)).toHaveLength(1)

      const rows = await h.remote.sidechatThreads({ sessionId: h.parent.id })
      expect(rows.ok ? rows.value.threads : []).toEqual([{
        id: threadId,
        createdAt: h.ctx.sessions.get(threadId)!.header.createdAt,
        label: 'Side: What is a sidechat thread?',
        live: true,
        running: false,
      }])
    } finally {
      await h.ctx.fiber.dispose()
    }
  })

  it('keeps the placeholder label when no title service is mounted', async () => {
    const ctx = new Context()
    try {
      await mountAgentLoopTestDependencies(ctx)
      const harness = await mountAgentLoopTestHarness(ctx)
      ctx.llm.registerAdapter(['mock'], new MockAdapter([textResponse('answer')]))
      ctx.provide('workspaceRegistry', { list: () => [], archivedSessionIds: [] } as never)
      const remote = createSessionTestRemote(ctx, {
        defaultModelSelection: () => ({ provider: 'mock', model: 'mock' }), cwd: '/tmp',
      })
      const parent = await harness.create(sid('untitled-parent'), { provider: 'mock', model: 'mock' }, { cwd: '/tmp' })
      completeTurn(parent.session, 1)
      const started = await remote.sidechatStart({ sessionId: parent.id, question: 'hello there' })
      if (!started.ok) throw started.error
      const threadId = started.value.threadId
      await ctx.agents.get(threadId)!.whenIdle()
      await expect(remote.sidechatPrompt({ sessionId: threadId, text: 'again' }))
        .resolves.toMatchObject({ ok: true, value: { accepted: true } })
      await ctx.agents.get(threadId)!.whenIdle()
      expect(ctx.sessions.get(threadId)!.snapshotEvents().filter(event => event.type === 'session/title')).toEqual([])
      // Without a durable title the listing falls back to the descriptor label,
      // which a question-carrying start already names from its first question.
      const rows = await remote.sidechatThreads({ sessionId: parent.id })
      expect(rows.ok ? rows.value.threads : []).toEqual([{
        id: threadId,
        createdAt: ctx.sessions.get(threadId)!.header.createdAt,
        label: 'Side: hello there',
        live: true,
        running: false,
      }])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('re-aligns the thread selection to the parent before delivery', async () => {
    const h = await sidechatHarness([textResponse('first')], {
      extraAdapters: [{ route: 'mock2', script: [textResponse('routed reply')] }],
    })
    try {
      const threadId = await h.startThread('first question')
      await h.ctx.agents.get(threadId)!.whenIdle()
      await expect(h.remote.selectModel({ sessionId: h.parent.id, provider: 'mock2', model: 'mock2' }))
        .resolves.toMatchObject({ ok: true })

      const prompt = await h.remote.sidechatPrompt({ sessionId: threadId, text: 'aligned question' })
      expect(prompt.ok ? prompt.value.modelFollow : prompt.error).toMatchObject({
        ok: true, provider: 'mock2', model: 'mock2',
      })
      await h.ctx.agents.get(threadId)!.whenIdle()
      expect(own_entries(h, threadId).some(event => event.type === 'model/selection'
        && (event.data as { provider?: string }).provider === 'mock2')).toBe(true)
      const routed = h.adapters.find(entry => entry.route === 'mock2')!
      expect(routed.adapter.requests.length).toBeGreaterThanOrEqual(1)
    } finally {
      await h.ctx.fiber.dispose()
    }
  })

  it('reports a failed parent selection read as a failed model follow without blocking delivery', async () => {
    const h = await sidechatHarness([textResponse('answer')])
    try {
      const threadId = await h.startThread('first question')
      await h.ctx.agents.get(threadId)!.whenIdle()
      const controller = createSessionTestController(h.ctx, {
        defaultModelSelection: () => ({ provider: 'mock', model: 'mock' }), cwd: '/tmp',
      })
      const spy = vi.spyOn(controller['agents'], 'selectionFor')
        .mockImplementation(() => { throw new Error('selection read failed') })

      const prompt = await h.remote.sidechatPrompt({ sessionId: threadId, text: 'still delivered' })
      expect(prompt.ok ? prompt.value.modelFollow : prompt.error).toMatchObject({
        ok: false, reason: 'selection read failed',
      })
      await h.ctx.agents.get(threadId)!.whenIdle()
      expect(countRequests(h)).toBe(2)

      // A thrown non-Error is stringified into the reported reason.
      spy.mockImplementation(() => { throw 'selection lookup broke' as never })
      const second = await h.remote.sidechatPrompt({ sessionId: threadId, text: 'still delivered twice' })
      expect(second.ok ? second.value.modelFollow : second.error).toMatchObject({
        ok: false, reason: 'selection lookup broke',
      })
      await h.ctx.agents.get(threadId)!.whenIdle()
      expect(countRequests(h)).toBe(3)
      spy.mockRestore()
    } finally {
      await h.ctx.fiber.dispose()
    }
  })

  it('cancels a running turn and tolerates repeated cancels while live', async () => {
    const h = await sidechatHarness(['hang'])
    try {
      const threadId = await h.startThread('slow question')
      const agent = h.ctx.agents.get(threadId)!
      await vi.waitFor(() => { expect(agent.status).toBe('running') })
      await expect(h.remote.sidechatCancel({ sessionId: threadId }))
        .resolves.toMatchObject({ ok: true, value: { accepted: true } })
      await agent.whenIdle()
      expect(own_entries(h, threadId).some(event => event.type === 'turn/end'
        && (event.data as { reason?: { kind?: string } }).reason?.kind === 'aborted')).toBe(true)
      await expect(h.remote.sidechatCancel({ sessionId: threadId }))
        .resolves.toMatchObject({ ok: true, value: { accepted: true } })
    } finally {
      await h.ctx.fiber.dispose()
    }
  })

  it('bounds the snapshot tail to the configured own-event budget', async () => {
    const h = await sidechatHarness([textResponse('one'), textResponse('two')], { maxSnapshotEvents: 3 })
    try {
      const threadId = await h.startThread('question one')
      const agent = h.ctx.agents.get(threadId)!
      await agent.whenIdle()
      await h.remote.sidechatPrompt({ sessionId: threadId, text: 'question two' })
      await agent.whenIdle()

      const snap = await h.remote.sidechatSnapshot({ sessionId: threadId })
      if (!snap.ok) throw new Error(`snapshot failed: ${String(snap.error)}`)
      const own = own_entries(h, threadId)
      expect(snap.value.records).toHaveLength(3)
      expect(snap.value.records.map(record => record.event.seq))
        .toEqual(own.slice(-3).map(event => event.seq))
      expect(snap.value.info).toMatchObject({ sessionId: threadId, live: true, running: false })
      expect(snap.value.info.label).toBe('Side: question one')
      expect(snap.value.info.provider).toBe('mock')
      expect(snap.value.info.preset).toBe(SIDECHAT_PRESET)
    } finally {
      await h.ctx.fiber.dispose()
    }
  })

  it('refuses prompts and lifecycle calls on Sessions that are not sidechat threads', async () => {
    const h = await sidechatHarness([textResponse('unused')])
    try {
      const ordinary = h.parent.id
      const missing = sid('sidechat-missing')
      await expect(h.remote.sidechatPrompt({ sessionId: ordinary, text: 'hello' }))
        .resolves.toMatchObject({
          ok: false,
          error: { code: 'sidechat/not-a-thread', details: { sessionId: ordinary } },
        })
      await expect(h.remote.sidechatRelease({ sessionId: ordinary }))
        .resolves.toMatchObject({ ok: false, error: { code: 'sidechat/not-a-thread' } })
      await expect(h.remote.sidechatPrompt({ sessionId: missing, text: 'hello' }))
        .resolves.toMatchObject({ ok: false, error: { code: 'session/not-found' } })
      await expect(h.remote.sidechatSnapshot({ sessionId: missing }))
        .resolves.toMatchObject({ ok: false, error: { code: 'session/not-found' } })
      await expect(h.remote.sidechatThreads({ sessionId: missing }))
        .resolves.toMatchObject({ ok: true, value: { threads: [] } })

      // A foreign subagent child (a different descriptor provider) is not a thread either.
      const foreign = h.ctx.sessions.create(sid('sidechat-foreign'), {
        meta: { cwd: '/tmp', parentSession: h.parent.id, origin: 'subagent' },
      })
      foreign.append('subagent/descriptor', {
        version: SUBAGENT_DESCRIPTOR_VERSION,
        mode: 'continuable',
        provider: 'task-runner',
        label: 'A task',
      })
      await expect(h.remote.sidechatPrompt({ sessionId: foreign.id, text: 'hello' }))
        .resolves.toMatchObject({
          ok: false,
          error: { code: 'sidechat/not-a-thread', details: { sessionId: foreign.id } },
        })
      await expect(h.remote.sidechatThreads({ sessionId: h.parent.id }))
        .resolves.toMatchObject({ ok: true, value: { threads: [] } })
    } finally {
      await h.ctx.fiber.dispose()
    }
  })

  it('rejects blank questions and oversized prompt text before touching a Session', async () => {
    const h = await sidechatHarness([textResponse('short answer')], { maxPromptChars: 12 })
    try {
      await expect(h.remote.sidechatStart({ sessionId: h.parent.id, question: '   ' }))
        .resolves.toMatchObject({ ok: false, error: { code: 'gateway/bad-request' } })
      await expect(h.remote.sidechatStart({ sessionId: h.parent.id, atSeq: -1 }))
        .resolves.toMatchObject({ ok: false, error: { code: 'gateway/bad-request' } })
      await expect(h.remote.sidechatStart({ sessionId: sid('sidechat-absent') }))
        .resolves.toMatchObject({ ok: false, error: { code: 'session/not-found' } })
      const threadId = await h.startThread()
      await expect(h.remote.sidechatPrompt({ sessionId: threadId, text: '  ' }))
        .resolves.toMatchObject({ ok: false, error: { code: 'gateway/bad-request' } })
      await expect(h.remote.sidechatPrompt({ sessionId: threadId, text: 'x'.repeat(13) }))
        .resolves.toMatchObject({ ok: false, error: { code: 'gateway/bad-request' } })
      await expect(h.remote.sidechatPrompt({ sessionId: threadId, text: 'short' }))
        .resolves.toMatchObject({ ok: true, value: { accepted: true } })
      await h.ctx.agents.get(threadId)!.whenIdle()
    } finally {
      await h.ctx.fiber.dispose()
    }
  })

  it('releases the live Agent, keeps history readable, and resumes on the next prompt', async () => {
    const h = await sidechatHarness([textResponse('first answer'), textResponse('resumed answer')], {
      persisted: true,
    })
    try {
      const threadId = await h.startThread('stateful question')
      await h.ctx.agents.get(threadId)!.whenIdle()
      const before = own_entries(h, threadId)
      const createdAt = (await coldHeader(h, threadId)).createdAt

      await expect(h.remote.sidechatRelease({ sessionId: threadId }))
        .resolves.toMatchObject({ ok: true, value: { accepted: true } })
      expect(h.ctx.agents.get(threadId)).toBeUndefined()
      expect(h.ctx.sessions.get(threadId)).toBeUndefined()
      // A released thread is cold: cancelling it no longer finds a live Agent.
      await expect(h.remote.sidechatCancel({ sessionId: threadId }))
        .resolves.toMatchObject({
          ok: false,
          error: { code: 'sidechat/thread-cold', details: { sessionId: threadId } },
        })

      const cold = await h.remote.sidechatSnapshot({ sessionId: threadId })
      if (!cold.ok) throw new Error(`cold snapshot failed: ${String(cold.error)}`)
      expect(cold.value.info).toMatchObject({ sessionId: threadId, live: false, running: false })
      expect(cold.value.records.map(record => record.event.seq)).toEqual(before.map(event => event.seq))
      await expect(h.remote.sidechatThreads({ sessionId: h.parent.id }))
        .resolves.toMatchObject({
          ok: true,
          value: {
            threads: [{
              id: threadId, createdAt, label: 'Side: stateful question', live: false, running: false,
            }],
          },
        })

      // Releasing an already-released thread is a tolerated no-op.
      await expect(h.remote.sidechatRelease({ sessionId: threadId }))
        .resolves.toMatchObject({ ok: true, value: { accepted: true } })

      const prompt = await h.remote.sidechatPrompt({ sessionId: threadId, text: 'question after resume' })
      if (!prompt.ok) throw new Error(`resume prompt failed: ${String(prompt.error)}`)
      await h.ctx.agents.get(threadId)!.whenIdle()
      expect(countRequests(h)).toBe(2)
      expect(own_entries(h, threadId).filter(isBoundaryMessage)).toHaveLength(1)

      // A registry miss while the controller still holds the live handle keeps
      // the thread reachable: the held handle serves the next prompt.
      const registry = h.ctx.agents
      const originalGet = registry.get.bind(registry)
      const getSpy = vi.spyOn(registry, 'get')
      getSpy.mockImplementation((id: SessionId) => id === threadId ? undefined : originalGet(id))
      const heldPrompt = await h.remote.sidechatPrompt({ sessionId: threadId, text: 'prompt via held handle' })
      getSpy.mockRestore()
      expect(heldPrompt.ok).toBe(true)
      await h.ctx.agents.get(threadId)!.whenIdle()
      expect(countRequests(h)).toBe(3)
    } finally {
      await h.ctx.fiber.dispose()
    }
  })

  it('deduplicates concurrent resumes of one cold thread', async () => {
    const h = await sidechatHarness([textResponse('a'), textResponse('b')], { persisted: true })
    try {
      const threadId = await h.startThread('seed question')
      await h.ctx.agents.get(threadId)!.whenIdle()
      await h.remote.sidechatRelease({ sessionId: threadId })
      const resume = vi.spyOn(h.ctx.agents, 'resume')

      const [first, second] = await Promise.all([
        h.remote.sidechatPrompt({ sessionId: threadId, text: 'concurrent one' }),
        h.remote.sidechatPrompt({ sessionId: threadId, text: 'concurrent two' }),
      ])
      if (!first.ok) throw new Error(`first failed: ${String(first.error)}`)
      if (!second.ok) throw new Error(`second failed: ${String(second.error)}`)
      await h.ctx.agents.get(threadId)!.whenIdle()
      expect(resume).toHaveBeenCalledTimes(1)
      const concurrent = own_entries(h, threadId).filter(event => event.type === 'user/message'
        && JSON.stringify((event.data as { content?: readonly { text?: string }[] }).content)?.includes('concurrent'))
      expect(concurrent).toHaveLength(2)
    } finally {
      await h.ctx.fiber.dispose()
    }
  })

  it('rethrows an aborted model-follow race as gateway/cancelled', async () => {
    const h = await sidechatHarness([textResponse('answer')])
    try {
      const threadId = await h.startThread('first question')
      await h.ctx.agents.get(threadId)!.whenIdle()
      const original = h.ctx.sessionQuery.observeSession.bind(h.ctx.sessionQuery)
      const observeSpy = vi.spyOn(h.ctx.sessionQuery, 'observeSession')
      observeSpy.mockImplementation((sessionId: SessionId, options?: { signal?: AbortSignal }) => original(sessionId, {
        ...options === undefined ? {} : options,
        signal: undefined,
      } as never))
      const controller = createSessionTestController(h.ctx, {
        defaultModelSelection: () => ({ provider: 'mock', model: 'mock' }), cwd: '/tmp',
      })
      const selectionSpy = vi.spyOn(controller['agents'], 'selectionFor')
        .mockImplementation(() => { throw new Error('aborted during alignment') })
      const signal = AbortSignal.abort()

      await expect(h.remote.sidechatPrompt({ sessionId: threadId, text: 'cancelled mid-flight' }, signal))
        .resolves.toMatchObject({ ok: false, error: { code: 'gateway/cancelled' } })
      expect(observeSpy).toHaveBeenCalled()
      expect(selectionSpy).toHaveBeenCalled()
      observeSpy.mockRestore()
      selectionSpy.mockRestore()
    } finally {
      await h.ctx.fiber.dispose()
    }
  })

  it('follows a cold parent\'s logged selection and reports a cold parent without one', async () => {
    for (const withSelection of [true, false]) {
      const ctx = new Context()
      try {
        await mountAgentLoopTestDependencies(ctx)
        await ctx.plugin(SessionTitleService, TITLE_SERVICE_CONFIG)
        await mountAgentLoopTestHarness(ctx)
        ctx.llm.registerAdapter(['mock'], new MockAdapter([textResponse('thread answer')]))
        ctx.provide('workspaceRegistry', { list: () => [], archivedSessionIds: [] } as never)
        const parentId = sid(`sidechat-cold-parent-${withSelection ? 'with' : 'without'}-selection`)
        const header: SessionHeader = {
          version: SESSION_FORMAT_VERSION, id: parentId, createdAt: 1, cwd: '/tmp', isSeeded: false,
        }
        const events: SessionEvent[] = [
          { type: 'turn/start', seq: SessionSeq(0), time: 1, data: { turn: 1 } },
          { type: 'user/message', seq: SessionSeq(1), time: 2, surfaceOp: 'append', data: message('persisted parent task') },
          ...(withSelection
            ? [{
              type: 'request/header', seq: SessionSeq(2), time: 3,
              data: { header: { config: { provider: 'mock', model: 'mock' } }, reason: 'initial' },
            } satisfies SessionEvent]
            : []),
          { type: 'turn/end', seq: SessionSeq(withSelection ? 3 : 2), time: 4, data: { turn: 1, reason: { kind: 'completed' } } },
        ]
        // A native in-memory backend so the live thread created from the cold
        // parent can persist its own seed and suffix.
        const stored = new Map<SessionId, {
          meta: SessionHeader
          inheritedEventCount: SessionLogOffset
          events: SessionEvent[]
        }>([[parentId, { meta: header, inheritedEventCount: SessionLogOffset(0), events }]])
        const revision = (id: SessionId): SessionPersistenceRevision => SessionPersistenceRevision(`cold:${String(id)}`)
        const handleFor = (entry: { meta: SessionHeader; inheritedEventCount: SessionLogOffset; events: SessionEvent[] }): object => ({
          id: entry.meta.id,
          header: entry.meta,
          inheritedEventCount: entry.inheritedEventCount,
          access: 'write',
          read: (offset = 0, length?: number) => Promise.resolve({
            events: structuredClone(entry.events.slice(offset, length === undefined ? undefined : offset + length)),
          }),
          append: (batch: readonly SessionEvent[]) => {
            entry.events.push(...batch.map(event => structuredClone(event)))
            return Promise.resolve()
          },
          flush: () => Promise.resolve(),
          close: () => Promise.resolve(),
          [Symbol.asyncDispose]: () => Promise.resolve(),
        })
        ctx.provide('sessionPersistence', {
          list: () => Promise.resolve([...stored.values()].map(entry => ({
            header: entry.meta, revision: revision(entry.meta.id),
          }))),
          stat: (id: SessionId) => {
            const entry = stored.get(id)
            return Promise.resolve(entry === undefined ? undefined : { header: entry.meta, revision: revision(id) })
          },
          open: (id: SessionId, access: string) => {
            const entry = stored.get(id)
            if (entry === undefined) return Promise.reject(new Error(`not stored: ${String(id)}`))
            void access
            return Promise.resolve(handleFor(entry))
          },
          create: (meta: SessionHeader, options?: { inheritedEventCount?: SessionLogOffset }) => {
            const entry = {
              meta, inheritedEventCount: options?.inheritedEventCount ?? SessionLogOffset(0), events: [] as SessionEvent[],
            }
            stored.set(meta.id, entry)
            return Promise.resolve(handleFor(entry))
          },
        } as never)
        const remote = createSessionTestRemote(ctx, {
          defaultModelSelection: () => ({ provider: 'mock', model: 'mock' }), cwd: '/tmp',
        })
        const started = await remote.sidechatStart({ sessionId: parentId, question: 'thread question' })
        if (!started.ok) throw started.error
        const prompt = await remote.sidechatPrompt({ sessionId: started.value.threadId, text: 'again' })
        if (withSelection) {
          expect(prompt.ok ? prompt.value.modelFollow : prompt.error).toMatchObject({
            ok: true, provider: 'mock', model: 'mock',
          })
        } else {
          expect(prompt.ok ? prompt.value.modelFollow : prompt.error).toMatchObject({
            ok: false, reason: `parent session "${parentId}" has no recorded model selection`,
          })
        }
        await ctx.agents.get(started.value.threadId)!.whenIdle()
      } finally {
        await ctx.fiber.dispose()
      }
    }
  })

  it('propagates thread read failures other than concurrent removal', async () => {
    const h = await sidechatHarness([textResponse('answer')])
    try {
      const threadId = await h.startThread('first question')
      await h.ctx.agents.get(threadId)!.whenIdle()
      const originalGet = h.ctx.sessions.get.bind(h.ctx.sessions)
      const getSpy = vi.spyOn(h.ctx.sessions, 'get')
      getSpy.mockImplementation((id: SessionId) => id === threadId ? undefined : originalGet(id))
      const observeSpy = vi.spyOn(h.ctx.sessionQuery, 'observeSession')
        .mockImplementation(() => {
          throw new SessionQueryError('projection index exploded', 'SESSION_QUERY_INDEX_FAILED')
        })

      await expect(h.remote.sidechatThreads({ sessionId: h.parent.id }))
        .resolves.toMatchObject({ ok: false, error: { code: 'gateway/internal' } })

      getSpy.mockRestore()
      observeSpy.mockRestore()
      const rows = await h.remote.sidechatThreads({ sessionId: h.parent.id })
      expect(rows.ok ? rows.value.threads.map(row => row.id) : rows.error).toEqual([threadId])
    } finally {
      await h.ctx.fiber.dispose()
    }
  })

  it('reports an untouched cold thread with identity facts only', async () => {
    const h = await sidechatHarness([textResponse('unused')], {
      persisted: true, noPresetRoster: true, noTitleService: true,
    })
    try {
      const threadId = await h.startThread()
      await expect(h.remote.sidechatRelease({ sessionId: threadId }))
        .resolves.toMatchObject({ ok: true, value: { accepted: true } })
      const snap = await h.remote.sidechatSnapshot({ sessionId: threadId })
      expect(snap.ok ? snap.value.info : snap.error).toEqual({
        sessionId: threadId,
        label: SIDECHAT_NEW_THREAD_LABEL,
        live: false,
        running: false,
      })
    } finally {
      await h.ctx.fiber.dispose()
    }
  })

  it('derives lineage depth and cwd from the parent header', async () => {
    const h = await sidechatHarness([textResponse('unused')], { parentDepth: 2, omitParentCwd: true })
    try {
      const threadId = await h.startThread()
      const header = h.ctx.sessions.get(threadId)!.header
      expect(header.delegationDepth).toBe(3)
      expect(header.cwd).toBeUndefined()
      expect(header.parentSession).toBe(h.parent.id)
    } finally {
      await h.ctx.fiber.dispose()
    }
  })

  it('folds a thread with a corrupt own descriptor as not-a-thread', async () => {
    const ctx = new Context()
    try {
      await mountAgentLoopTestDependencies(ctx)
      await ctx.plugin(SessionTitleService, TITLE_SERVICE_CONFIG)
      await mountAgentLoopTestHarness(ctx)
      ctx.llm.registerAdapter(['mock'], new MockAdapter([]))
      ctx.provide('workspaceRegistry', { list: () => [], archivedSessionIds: [] } as never)
      const parentId = sid('sidechat-corrupt-parent')
      const threadId = sid('sidechat-corrupt-thread')
      const parentHeader: SessionHeader = {
        version: SESSION_FORMAT_VERSION, id: parentId, createdAt: 1, cwd: '/tmp', isSeeded: false,
      }
      const threadHeader: SessionHeader = {
        version: SESSION_FORMAT_VERSION,
        id: threadId,
        createdAt: 2,
        cwd: '/tmp',
        isSeeded: true,
        parentSession: parentId,
        origin: 'subagent',
      }
      const vanishedHeader: SessionHeader = {
        version: SESSION_FORMAT_VERSION,
        id: sid('sidechat-vanished-thread'),
        createdAt: 3,
        cwd: '/tmp',
        isSeeded: true,
        parentSession: parentId,
        origin: 'subagent',
      }
      const threadEvents: SessionEvent[] = [
        { type: 'turn/start', seq: SessionSeq(0), time: 1, data: { turn: 1 } },
        { type: 'session/end-seed', seq: SessionSeq(1), time: 2, data: { inherited: true } },
        { type: 'subagent/descriptor', seq: SessionSeq(2), time: 3, data: { version: 'corrupt' } as never },
      ]
      ctx.provide('sessionPersistence', testSessionPersistence(ctx, {
        list: () => Promise.resolve([parentHeader, threadHeader, vanishedHeader]),
        inspect: (requested: SessionId) => Promise.resolve(
          requested === threadId
            ? { meta: threadHeader, inheritedEventCount: SessionLogOffset(3), events: threadEvents }
            : requested === parentId
              ? { meta: parentHeader, inheritedEventCount: SessionLogOffset(0), events: [] }
              : undefined,
        ),
      }) as never)
      const remote = createSessionTestRemote(ctx, {
        defaultModelSelection: () => ({ provider: 'mock', model: 'mock' }), cwd: '/tmp',
      })
      await expect(remote.sidechatPrompt({ sessionId: threadId, text: 'hello' }))
        .resolves.toMatchObject({
          ok: false,
          error: { code: 'sidechat/not-a-thread', details: { sessionId: threadId } },
        })
      await expect(remote.sidechatRelease({ sessionId: threadId }))
        .resolves.toMatchObject({ ok: false, error: { code: 'sidechat/not-a-thread' } })
      // The listed-but-vanished row is skipped by the not-found mapping.
      await expect(remote.sidechatThreads({ sessionId: parentId }))
        .resolves.toMatchObject({ ok: true, value: { threads: [] } })
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('maps a title-service rejection to the label-invalid code and releases the failed thread', async () => {
    const h = await sidechatHarness([textResponse('answer')])
    try {
      const titles = h.ctx.get('sessionTitle')!
      const spy = vi.spyOn(titles, 'rename').mockImplementation(() => {
        throw new SessionTitleInvalidError('refused by test')
      })
      await expect(h.remote.sidechatStart({ sessionId: h.parent.id, question: 'labeled question' }))
        .resolves.toMatchObject({ ok: false, error: { code: 'sidechat/label-invalid' } })
      expect(spy).toHaveBeenCalled()
      await expect(h.remote.sidechatThreads({ sessionId: h.parent.id }))
        .resolves.toMatchObject({ ok: true, value: { threads: [] } })

      // A non-title failure from the rename is not mapped: it surfaces as an
      // internal start failure and still releases the thread it created.
      spy.mockImplementation(() => {
        throw new RangeError('rename exploded')
      })
      await expect(h.remote.sidechatStart({ sessionId: h.parent.id, question: 'second question' }))
        .resolves.toMatchObject({ ok: false, error: { code: 'gateway/internal' } })
      await expect(h.remote.sidechatThreads({ sessionId: h.parent.id }))
        .resolves.toMatchObject({ ok: true, value: { threads: [] } })
    } finally {
      await h.ctx.fiber.dispose()
    }
  })

  it('reports a failed thread creation as gateway/internal without publishing the thread', async () => {
    const h = await sidechatHarness([])
    try {
      const spy = vi.spyOn(h.ctx.agents, 'create').mockRejectedValue(new Error('registry refused'))
      await expect(h.remote.sidechatStart({ sessionId: h.parent.id }))
        .resolves.toMatchObject({ ok: false, error: { code: 'gateway/internal' } })
      expect(spy).toHaveBeenCalled()
      expect(h.ctx.sessions.list().map(session => session.id)).toEqual([h.parent.id])
    } finally {
      await h.ctx.fiber.dispose()
    }
  })

  it('maps a failed resume to gateway/internal', async () => {
    const h = await sidechatHarness([textResponse('a')], { persisted: true })
    try {
      const threadId = await h.startThread('resumable question')
      await h.ctx.agents.get(threadId)!.whenIdle()
      await h.remote.sidechatRelease({ sessionId: threadId })
      vi.spyOn(h.ctx.agents, 'resume').mockRejectedValue(new Error('resume refused'))
      await expect(h.remote.sidechatPrompt({ sessionId: threadId, text: 'after failed resume' }))
        .resolves.toMatchObject({ ok: false, error: { code: 'gateway/internal' } })
    } finally {
      await h.ctx.fiber.dispose()
    }
  })

  it('maps a failed thread read to gateway/internal', async () => {
    const h = await sidechatHarness([textResponse('a')])
    try {
      const threadId = await h.startThread('readable question')
      await h.ctx.agents.get(threadId)!.whenIdle()
      vi.spyOn(h.ctx.sessionQuery, 'observeSession').mockRejectedValue(new Error('query engine failed'))
      await expect(h.remote.sidechatPrompt({ sessionId: threadId, text: 'unreadable' }))
        .resolves.toMatchObject({ ok: false, error: { code: 'gateway/internal' } })
      await expect(h.remote.sidechatSnapshot({ sessionId: threadId }))
        .resolves.toMatchObject({ ok: false, error: { code: 'gateway/internal' } })
    } finally {
      await h.ctx.fiber.dispose()
    }
  })
})

describe('sidechat labels', () => {
  it('flattens whitespace and truncates long questions with an ellipsis', () => {
    expect(sidechatLabel('  what   is \n sidechat?  ')).toBe('Side: what is sidechat?')
    const long = 'x'.repeat(SIDECHAT_LABEL_MAX_CHARS + 10)
    const labeled = sidechatLabel(long)
    expect(labeled).toHaveLength(SIDECHAT_LABEL_MAX_CHARS)
    expect(labeled.startsWith('Side: ')).toBe(true)
    expect(labeled.endsWith('…')).toBe(true)
  })

  it('cuts own events after the seed marker and yields nothing before it', () => {
    const events: readonly SessionEvent[] = [
      { type: 'turn/start', seq: SessionSeq(0), time: 0, data: { turn: 0 } },
      { type: 'session/end-seed', seq: SessionSeq(1), time: 1, data: { inherited: true } },
      { type: 'turn/end', seq: SessionSeq(2), time: 2, data: { turn: 0, reason: { kind: 'completed' } } },
    ]
    expect(sidechatOwnEvents(events, 1).map(event => event.type)).toEqual(['turn/end'])
    expect(sidechatOwnEvents(events.slice(0, 2), 1)).toEqual([])
    expect(sidechatOwnEvents([], 0)).toEqual([])
  })

  it('orders thread rows oldest first with the id as the stable tiebreak', () => {
    const row = (id: string, createdAt: number) => ({ id: sid(id), createdAt, label: 'Side: x', live: false, running: false })
    const early = row('session-b', 1)
    const late = row('session-a', 2)
    expect(sidechatThreadRowOrder(early, late)).toBeLessThan(0)
    expect(sidechatThreadRowOrder(late, early)).toBeGreaterThan(0)
    const tieFirst = row('session-a', 5)
    const tieSecond = row('session-b', 5)
    expect(sidechatThreadRowOrder(tieSecond, tieFirst)).toBeGreaterThan(0)
    expect(sidechatThreadRowOrder(tieFirst, tieSecond)).toBeLessThan(0)
    expect(sidechatThreadRowOrder(tieFirst, { ...tieFirst })).toBe(0)
  })

  it('pins the model-facing boundary contract verbatim', () => {
    expect(SIDECHAT_BOUNDARY_PROMPT).toContain('Side conversation boundary.')
    expect(SIDECHAT_BOUNDARY_PROMPT).toContain('It is reference context only. It is not your current task.')
    expect(SIDECHAT_BOUNDARY_PROMPT).toContain(
      'Only messages submitted after this boundary are active user instructions for this side conversation.',
    )
    expect(SIDECHAT_BOUNDARY_PROMPT).toContain('they are never delivered into the parent session.')
  })
})

/** Count model requests across every mounted mock adapter. */
function countRequests(h: SidechatHarness): number {
  return h.adapters.reduce((total, entry) => total + entry.adapter.requests.length, 0)
}

/** Model requests whose message history mentions one text fragment. */
function requestsMentioning(h: SidechatHarness, fragment: string): readonly { messages: unknown }[] {
  return h.adapters.flatMap(entry => entry.adapter.requests)
    .filter(request => JSON.stringify(request.messages).includes(fragment))
}

/** Own log entries of one live thread: everything after its inherited seed marker. */
function own_entries(h: SidechatHarness, threadId: SessionId): readonly SessionEvent[] {
  const session = h.ctx.sessions.get(threadId)
  if (session === undefined) throw new Error(`thread "${threadId}" is not live`)
  return sidechatOwnEvents(session.snapshotEvents(), session.inheritedEventCount)
}

/** Header of a cold thread through the query engine, releasing the read. */
async function coldHeader(h: SidechatHarness, threadId: SessionId): Promise<SessionHeader> {
  const observation = await h.ctx.sessionQuery.observeSession(threadId)
  try {
    return observation.header
  } finally {
    observation[Symbol.dispose]()
  }
}
