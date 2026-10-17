/**
 * Tests for the spill-policy PLUGIN. It registers no service, only the
 * `tools/post-execute` transformer. We drive real tools through
 * `ctx.tools.execute(...)` and assert: disabled mode is a true no-op, an
 * oversized plain-text result is spilled and replaced with a preview + locator,
 * a small result and a non-text result pass through, `read` is skipped, and a
 * `saveText` failure / missing backend / missing owner all preserve the original
 * result without an `isError`.
 */

import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import Loader from '@qilin-agent/kylin-plugin-loader'
import { provideWorkingDirectoryFixture } from '@qilin-agent/agent-loop-testkit'
import LlmRuntime, { LlmAdapter, createUserMessage, ToolCallId } from '@qilin-agent/llm'
import { estimateContent } from '@qilin-agent/token-meter/estimate'
import { AttachmentId, AttachmentStore } from '@qilin-agent/attachment'
import type {
  ImageAttachmentLimits, ImageAttachmentRef, SaveImageAttachment, StoredImageAttachment,
} from '@qilin-agent/attachment'
import type {
  ContentBlock, ContextFormed, GenerateOptions, ImageBlock, LlmImageRequestPrice, StreamChunk,
} from '@qilin-agent/llm'
import SessionStore, { SessionId } from '@qilin-agent/session'
import SystemPrompt from '@qilin-agent/system-prompt'
import ToolRuntime, { defineContentToolFixture } from '@qilin-agent/tools'
import type { ToolDefinition } from '@qilin-agent/tools'
import type { PostToolDecision, ToolExecution, ToolExecutionToken } from '@qilin-agent/tools'
import { SpillLocator, SpillStore } from '@qilin-agent/spill'
import type { SaveTextSpill, SpillRef } from '@qilin-agent/spill'
import * as SpillPolicy from '@qilin-agent/spill-policy'
import NodeRuntime, { type Config as NodeRuntimeConfig } from '@qilin-agent/ptc-runtime-node'
import FileSystem from '@qilin-agent/fs-local'
import Subprocess from '@qilin-agent/subprocess-local'
import Sandbox from '@qilin-agent/sandbox-local'
import SandboxPolicy from '@qilin-agent/sandbox-policy'
import SessionProjections from '@qilin-agent/session-projection'

declare module '@qilin-agent/llm' {
  interface MessageSourceMap {
    'test': { kind: 'test' } & ContextFormed
  }
}

async function mountRuntime(ctx: Context, config: NodeRuntimeConfig = {}): Promise<void> {
  onTestFinished(async () => { await ctx.fiber.dispose() })
  if (!ctx.get('sessions')) await ctx.plugin(SessionStore)
  provideWorkingDirectoryFixture(ctx)
  if (!ctx.get('fs')) await ctx.plugin(FileSystem)
  if (!ctx.get('subprocess')) await ctx.plugin(Subprocess)
  if (!ctx.get('sandbox')) await ctx.plugin(Sandbox, {})
  if (!ctx.get('sessionProjections')) await ctx.plugin(SessionProjections)
  if (!ctx.get('sandboxPolicy')) await ctx.plugin(SandboxPolicy, { mode: 'danger-full-access' })
  await ctx.plugin(NodeRuntime, config)
}

function observedAgent(ctx: Context, id: string, observe: (type: string, data: unknown) => void) {
  const session = ctx.sessions.create(SessionId(id), { meta: { cwd: process.cwd() } })
  ctx.on('session/event', (owner, event) => { if (owner === session) observe(event.type, event.data) })
  return { session }
}

const testToolSignal = new AbortController().signal

/** A stub spill backend recording its saves; `fail` exercises the best-effort fallback. */
class StubStore extends SpillStore {
  saves: SaveTextSpill[] = []
  fail = false
  /** Per-save hang hook: each call awaits the returned promise before completing. */
  gate: (() => Promise<void>) | undefined

  async saveText(input: SaveTextSpill): Promise<SpillRef> {
    if (this.fail) throw new Error('disk full')
    await this.gate?.()
    this.saves.push(input)
    return {
      locator: SpillLocator(`/spill/${input.suggestedName}`),
      bytes: Buffer.byteLength(input.content, 'utf8'),
      retrievalHint: 'Use the stub retrieval path.',
    }
  }
}

/** A tool returning `text` verbatim (name configurable so we can register `read`). */
function textTool(name: string, text: string) {
  return defineContentToolFixture({
    name,
    description: name,
    parameters: {},
    async execute(): Promise<ContentBlock[]> { return [{ type: 'text', text }] },
  })
}

/** A minimal exec carrying a session header id (the spill owner). */
function exec(name: string, session = 's1'): ToolExecution {
  // Only agent.session.header.id is read by the policy; a structural stub suffices.
  const agent = { session: { header: { id: SessionId(session) } } }
  return { callId: ToolCallId(`call-${name}`), name, arguments: {}, agent, signal: testToolSignal } as unknown as ToolExecution
}

/**
 * Build a context with tools + the policy, and optionally a spill backend.
 * Returns the context and the backend handle (undefined when `withSpill` false).
 */
async function setup(
  config: SpillPolicy.Config,
  withSpill = true,
  beforePolicy?: (ctx: Context) => void | Promise<void>,
): Promise<{ ctx: Context; spill?: StubStore; fiber: Awaited<ReturnType<Context['plugin']>> }> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  let spill: StubStore | undefined
  if (withSpill) {
    await ctx.plugin(StubStore)
    spill = ctx.spillStore as StubStore
  }
  await beforePolicy?.(ctx)
  const fiber = await ctx.plugin(SpillPolicy, config)
  return { ctx, fiber, ...spill ? { spill } : {} }
}

/** Flatten a result's text blocks. */
function textOf(content: ContentBlock[]): string {
  return content.filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text').map(b => b.text).join('')
}

describe('disabled mode', () => {
  it('registers no post-execute listener when maxInlineTokens is omitted', async () => {
    const { ctx, spill } = await setup({})
    ctx.tools.register(textTool('big', 'x'.repeat(1000)))
    const result = await ctx.tools.execute(exec('big'))
    expect(textOf(result.content)).toBe('x'.repeat(1000))
    expect(result.isError).toBe(false)
    expect(spill?.saves).toHaveLength(0)
  })
})

describe('loader export shape', () => {
  it('has no default export and keeps name/inject/Config through unwrapExports', () => {
    expect('default' in SpillPolicy).toBe(false)

    const loader = Object.create(Loader.prototype) as Loader
    const unwrapped = loader.unwrapExports(SpillPolicy) as Record<string, unknown>
    expect(unwrapped).toBe(SpillPolicy)
    expect(unwrapped.name).toBe('spill-policy')
    expect(unwrapped.inject).toEqual(['tools'])
    expect(unwrapped.Config).toBeDefined()
    expect(typeof unwrapped.apply).toBe('function')
  })
})

describe('config validation', () => {
  it('rejects a negative maxInlineTokens at load', async () => {
    await expect(setup({ maxInlineTokens: -1 })).rejects.toThrow(/non-negative integer/)
  })

  it('rejects a fractional maxInlineTokens at load', async () => {
    await expect(setup({ maxInlineTokens: 1.5 })).rejects.toThrow(/non-negative integer/)
  })

})

describe('oversized plain-text replacement', () => {
  it('spills the full text and replaces the result with a preview + locator within the cap', async () => {
    const { ctx, spill } = await setup({ maxInlineTokens: 64 })
    const body = 'HEAD'.repeat(200) + 'TAIL'.repeat(200) // 1600 bytes > 200
    ctx.tools.register(textTool('big', body))
    const result = await ctx.tools.execute(exec('big'))

    expect(result.isError).toBe(false)
    expect(spill?.saves).toHaveLength(1)
    expect(spill?.saves[0]?.content).toBe(body)
    expect(spill?.saves[0]?.source).toMatchObject({ toolName: 'big' })
    expect(spill?.saves[0]?.suggestedName).toBe('big.txt')
    expect(spill?.saves[0]?.owner.sessionId).toBe('s1')

    const text = textOf(result.content)
    expect(text).not.toBe(body)
    expect(text.startsWith('HEAD')).toBe(true)
    expect(text).toContain('Full formatted result stored at: /spill/big.txt')
    expect(text).toContain('Use the stub retrieval path.')
    expect(text).toContain('Omitted')
    // The replacement (preview + blank line + notice) stays within the cap and
    // is smaller than the original — the whole point of spilling.
    expect(estimateContent(result.content)).toBeLessThanOrEqual(64)
    expect(Buffer.byteLength(text, 'utf8')).toBeLessThan(body.length)
  })

  it('keeps the inline result when the notice-only replacement would exceed the cap', async () => {
    // A body just over a tiny cap: the notice alone is larger than the cap, so
    // there is no within-cap replacement — the policy keeps the inline result.
    const { ctx } = await setup({ maxInlineTokens: 4 })
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    const body = 'xxxxx' // 5 bytes > 4, but far shorter than the notice
    ctx.tools.register(textTool('big', body))
    const result = await ctx.tools.execute(exec('big'))
    expect(textOf(result.content)).toBe(body)
    expect(warn).toHaveBeenCalled()
  })

  it('leaves a small plain-text result unchanged', async () => {
    const { ctx, spill } = await setup({ maxInlineTokens: 1000 })
    ctx.tools.register(textTool('small', 'tiny'))
    const result = await ctx.tools.execute(exec('small'))
    expect(textOf(result.content)).toBe('tiny')
    expect(spill?.saves).toHaveLength(0)
  })

  it('leaves a result with a non-text block unchanged', async () => {
    const { ctx, spill } = await setup({ maxInlineTokens: 5 })
    ctx.tools.register(defineContentToolFixture({
      name: 'mixed',
      description: 'mixed',
      parameters: {},
      async execute(): Promise<ContentBlock[]> {
        return [{ type: 'text', text: 'x'.repeat(100) }, { type: 'reasoning', text: 'why' }]
      },
    }))
    const result = await ctx.tools.execute(exec('mixed'))
    expect(spill?.saves).toHaveLength(0)
    expect(result.content).toHaveLength(2)
  })
})

describe('outer PTC mode failure capture', () => {
  it('spills the bounded output-limit diagnostic through the ordinary outer-result policy', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime, { mode: 'ptc' })
    await ctx.plugin(StubStore)
    await ctx.plugin(SpillPolicy, { maxInlineTokens: 64 })
    await mountRuntime(ctx, { maxOutputBytes: 500 })
    const events: unknown[] = []
    const agent = observedAgent(ctx, 'code-spill', (_type: string, data: unknown) => { events.push(data) })

    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId('code-output-limit'),
      name: 'run_code',
      arguments: {
        code: 'console.log("HEAD-" + "x".repeat(300)); console.log("TAIL-" + "y".repeat(300)); return "unreachable";',
        description: 'Print oversized head and tail lines',
      },
      agent: agent as never,
    })

    expect(result.isError).toBe(true)
    const saved = (ctx.spillStore as StubStore).saves
    expect(saved).toHaveLength(1)
    expect(saved[0]?.source).toMatchObject({ toolName: 'run_code' })
    expect(saved[0]?.content).toContain('code run failed (output-limit)')
    expect(saved[0]?.content).toContain('HEAD-')
    expect(textOf(result.content)).toContain('Full formatted result stored at: /spill/run_code.txt')
    expect(events).toEqual([])
  })
})

describe('read skip', () => {
  it('never spills the read tool result (avoids a read → spill → read loop)', async () => {
    const { ctx, spill } = await setup({ maxInlineTokens: 10 })
    ctx.tools.register(textTool('read', 'x'.repeat(1000)))
    const result = await ctx.tools.execute(exec('read'))
    expect(textOf(result.content)).toBe('x'.repeat(1000))
    expect(spill?.saves).toHaveLength(0)
  })
})

describe('the durable dispatch-log arm', () => {
  /** Boot code mode + the policy + the Node runtime; run one program via the real bridge. */
  async function runCodeWith(program: string, maxInlineTokens: number, extraTools: ToolDefinition[] = []) {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime, { mode: 'ptc' })
    await ctx.plugin(StubStore)
    await ctx.plugin(SpillPolicy, { maxInlineTokens })
    await mountRuntime(ctx, {})
    const events: { type: string; data: unknown }[] = []
    const agent = observedAgent(ctx, 'dispatch-spill', (type: string, data: unknown) => { events.push({ type, data }) })
    ctx.tools.register(textTool('huge_read', 'H'.repeat(2_000)))
    ctx.tools.register(textTool('small_read', 'tiny'))
    for (const tool of extraTools) ctx.tools.register(tool)
    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId('parent-1'),
      name: 'run_code',
      arguments: { code: program, description: 'Drive dispatch-log spilling' },
      agent: agent as never,
    })
    return { ctx, result, events, spill: ctx.spillStore as StubStore }
  }

  it('bounds the tool/ptc-dispatch copy of an oversized sub-result while the program value stays whole', async () => {
    const { result, events, spill } = await runCodeWith(
      'const blocks = await tools.huge_read({});\nreturn blocks[0].text.length', 200)
    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected success')
    // The program received the COMPLETE text (length 2000), untouched by spill.
    expect(result.value).toMatchObject({ result: 2_000 })
    // The durable settle event carries the bounded projection + locator.
    const settle = events.find(event => event.type === 'tool/ptc-dispatch')
    expect(settle).toBeDefined()
    const logged = (settle!.data as { content: { type: string; text: string }[] }).content
    expect(logged).toHaveLength(1)
    const loggedText = logged[0]!.text
    expect(estimateContent([{ type: 'text', text: loggedText }])).toBeLessThanOrEqual(200)
    expect(loggedText).toContain('Full formatted result stored at: /spill/huge_read.txt')
    // The artifact holds the full text under the dispatch label and sub-call id.
    const save = spill.saves.find(entry => entry.source.label === 'dispatch')
    expect(save).toMatchObject({
      source: { kind: 'tool', toolName: 'huge_read', callId: 'parent-1:ptc:1', label: 'dispatch' },
    })
    expect(save?.content).toBe('H'.repeat(2_000))
  })

  it('leaves a non-text sub-result log unchanged (flatten declines)', async () => {
    const { events, spill } = await runCodeWith(
      'return await tools.mixed_read({})', 5, [defineContentToolFixture({
        name: 'mixed_read',
        description: 'mixed_read',
        parameters: {},
        async execute(): Promise<ContentBlock[]> {
          return [{ type: 'text', text: 'x'.repeat(100) }, { type: 'reasoning', text: 'why' }]
        },
      })])
    const settle = events.find(event => event.type === 'tool/ptc-dispatch')
    expect((settle!.data as { content: unknown[] }).content).toHaveLength(2)
    expect(spill.saves.filter(entry => entry.source.label === 'dispatch')).toHaveLength(0)
  })

  it('leaves a within-cap sub-result log untouched and saves nothing for it', async () => {
    const { events, spill } = await runCodeWith(
      'return await tools.small_read({})', 200)
    const settle = events.find(event => event.type === 'tool/ptc-dispatch')
    expect((settle!.data as { content: { type: string; text: string }[] }).content)
      .toEqual([{ type: 'text', text: 'tiny' }])
    expect(spill.saves.filter(entry => entry.source.label === 'dispatch')).toHaveLength(0)
  })

  it('a slow spill backend never delays the program value or a later dispatch slot', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime, { mode: 'ptc' })
    await ctx.plugin(StubStore)
    await ctx.plugin(SpillPolicy, { maxInlineTokens: 40 })
    await mountRuntime(ctx, {})
    const saveStarted = Promise.withResolvers<undefined>()
    const saveGate = Promise.withResolvers<undefined>()
    const smallStarted = Promise.withResolvers<undefined>()
    const store = ctx.spillStore as StubStore
    const realSave = store.saveText.bind(store)
    store.saveText = async (input) => {
      saveStarted.resolve(undefined)
      await saveGate.promise
      return realSave(input)
    }
    const events: { type: string; data: unknown }[] = []
    const agent = observedAgent(ctx, 'dispatch-slow-spill', (type: string, data: unknown) => {
      events.push({ type, data })
      if (type === 'tool/ptc-dispatch-start' && (data as { name: string }).name === 'small_read') smallStarted.resolve(undefined)
    })
    ctx.tools.register(textTool('huge_read', 'H'.repeat(2_000)))
    ctx.tools.register(textTool('small_read', 'tiny'))
    const runPromise = ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId('parent-3'),
      name: 'run_code',
      arguments: {
        // Both program values remain available while the durable spill is blocked.
        code: 'const big = await tools.huge_read({});\nconst small = await tools.small_read({});\nreturn big[0].text.length + small[0].text.length',
        description: 'Prove log shaping is off the program path',
      },
      agent: agent as never,
    })
    onTestFinished(() => { saveGate.resolve(undefined) })
    try {
      await Promise.race([
        Promise.all([saveStarted.promise, smallStarted.promise]),
        runPromise.then(() => { throw new Error('run finished before the blocked save and later dispatch overlapped') }),
      ])
      saveGate.resolve(undefined)
      const result = await runPromise
      expect(result.isError).toBe(false)
      if (result.isError) throw new Error('expected success')
      expect(result.value).toMatchObject({ result: 2_004 })
      expect(events.filter(event => event.type === 'tool/ptc-dispatch')).toHaveLength(2)
    } finally {
      saveGate.resolve(undefined)
      await runPromise
    }
  })

  it('a sustained slow backend backpressures the run instead of accumulating unbounded log tasks', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime, { mode: 'ptc', maxParallelSubCalls: 1 })
    await ctx.plugin(StubStore)
    await ctx.plugin(SpillPolicy, { maxInlineTokens: 40 })
    await mountRuntime(ctx, {})
    const secondSaveStarted = Promise.withResolvers<undefined>()
    const thirdStarted = Promise.withResolvers<undefined>()
    const store = ctx.spillStore as StubStore
    const releases: (() => void)[] = []
    let gateNewSaves = true
    let saves = 0
    store.gate = () => {
      if (!gateNewSaves) return Promise.resolve()
      return new Promise<void>((resolve) => {
        releases.push(resolve)
        if (++saves === 2) secondSaveStarted.resolve(undefined)
      })
    }
    // Disabling future gates also releases a third save that has not reached the backend yet.
    const releaseSaves = (): void => {
      gateNewSaves = false
      for (const release of releases.splice(0)) release()
    }
    const events: { type: string; data: unknown }[] = []
    const agent = observedAgent(ctx, 'dispatch-spill-bound', (type: string, data: unknown) => {
      events.push({ type, data })
      if (type === 'tool/ptc-dispatch-start' && (data as { subCallId: string }).subCallId.endsWith(':ptc:3')) thirdStarted.resolve(undefined)
    })
    ctx.tools.register(textTool('huge_read', 'H'.repeat(2_000)))
    const started = (n: number): boolean => events.some(event => event.type === 'tool/ptc-dispatch-start'
      && (event.data as { subCallId: string }).subCallId.endsWith(`:ptc:${n}`))
    const runPromise = ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId('parent-bound'),
      name: 'run_code',
      arguments: {
        // Queue all requests before waiting so the third is available to the bounded lane.
        code: 'await Promise.all([tools.huge_read({}), tools.huge_read({}), tools.huge_read({})]); return "done"',
        description: 'Three oversized reads against a hung backend',
      },
      agent: agent as never,
    })
    onTestFinished(releaseSaves)
    try {
      await Promise.race([
        secondSaveStarted.promise,
        runPromise.then(() => { throw new Error('run finished before two spill saves were blocked') }),
      ])
      expect(started(2)).toBe(true)
      expect(started(3)).toBe(false)
      releases.shift()!()
      await Promise.race([
        thirdStarted.promise,
        runPromise.then(() => { throw new Error('run finished before the third dispatch started') }),
      ])
      releaseSaves()
      const result = await runPromise
      expect(result.isError).toBe(false)
      expect(events.filter(event => event.type === 'tool/ptc-dispatch')).toHaveLength(3)
    } finally {
      releaseSaves()
      await runPromise
    }
  })

  it('a saveText failure keeps the complete content in the durable log (best-effort)', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime, { mode: 'ptc' })
    await ctx.plugin(StubStore)
    await ctx.plugin(SpillPolicy, { maxInlineTokens: 40 })
    await mountRuntime(ctx, {})
    ;(ctx.spillStore as StubStore).fail = true
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    const events: { type: string; data: unknown }[] = []
    const agent = observedAgent(ctx, 'dispatch-spill-fail', (type: string, data: unknown) => { events.push({ type, data }) })
    ctx.tools.register(textTool('huge_read', 'H'.repeat(2_000)))
    const result = await ctx.tools.execute({
      signal: testToolSignal,
      callId: ToolCallId('parent-2'),
      name: 'run_code',
      arguments: { code: 'return (await tools.huge_read({}))[0].text.length', description: 'Fail the spill backend' },
      agent: agent as never,
    })
    expect(result.isError).toBe(false)
    const settle = events.find(event => event.type === 'tool/ptc-dispatch')
    expect((settle!.data as { content: { text: string }[] }).content[0]!.text).toBe('H'.repeat(2_000))
    expect(warn).toHaveBeenCalled()
  })
})

describe('nested-call skip', () => {
  it('leaves nested composite results complete and spillable only through their outer call', async () => {
    const { ctx, spill } = await setup({ maxInlineTokens: 10 })
    const body = 'x'.repeat(1000)
    ctx.tools.register(textTool('nested', body))
    const nested = {
      ...exec('nested'),
      parent: Symbol('outer') as ToolExecutionToken,
    }
    const result = await ctx.tools.execute(nested)
    expect(textOf(result.content)).toBe(body)
    expect(spill?.saves).toHaveLength(0)
  })
})

describe('best-effort fallback', () => {
  it('keeps the original result when saveText fails', async () => {
    const { ctx, spill } = await setup({ maxInlineTokens: 10 })
    spill!.fail = true
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    ctx.tools.register(textTool('big', 'x'.repeat(1000)))
    const result = await ctx.tools.execute(exec('big'))
    expect(textOf(result.content)).toBe('x'.repeat(1000))
    expect(result.isError).toBe(false)
    expect(warn).toHaveBeenCalled()
  })

  it('keeps the original result when no spill backend is loaded', async () => {
    const { ctx } = await setup({ maxInlineTokens: 10 }, false)
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    ctx.tools.register(textTool('big', 'x'.repeat(1000)))
    const result = await ctx.tools.execute(exec('big'))
    expect(textOf(result.content)).toBe('x'.repeat(1000))
    expect(warn).toHaveBeenCalled()
  })

  it('keeps the original result when the call has no session owner', async () => {
    const { ctx, spill } = await setup({ maxInlineTokens: 10 })
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    ctx.tools.register(textTool('big', 'x'.repeat(1000)))
    const result = await ctx.tools.execute({ signal: testToolSignal, callId: ToolCallId('c'), name: 'big', arguments: {} })
    expect(textOf(result.content)).toBe('x'.repeat(1000))
    expect(spill?.saves).toHaveLength(0)
    expect(warn).toHaveBeenCalled()
  })
})

describe('composition', () => {
  it('wraps an earlier tool-owned projection before applying the generic cap', async () => {
    let downstreamDecision: PostToolDecision | undefined
    const { ctx, spill } = await setup({ maxInlineTokens: 64 }, true, (target) => {
      target.on('tools/post-execute', async (_exec, _result, next): Promise<PostToolDecision> => {
        downstreamDecision = await next()
        return {
          kind: 'accept',
          content: [{ type: 'text', text: `first page\n\nFull canonical result stored at /spill/search-results.txt.\n${'z'.repeat(500)}` }],
        }
      })
    })
    ctx.tools.register(textTool('search', 'initial capped page'))

    const result = await ctx.tools.execute(exec('search'))

    expect(downstreamDecision).toEqual({ kind: 'accept' })
    expect(spill?.saves[0]?.content).toContain('Full canonical result stored at /spill/search-results.txt.')
    expect(textOf(result.content)).toContain('Full formatted result stored at')
  })

  it('bounds content a downstream post-execute listener replaced', async () => {
    const { ctx, spill } = await setup({ maxInlineTokens: 64 })
    // A later-registered listener replaces the (small) tool result with a big one;
    // the policy delegated via next(), so it bounds the replacement.
    ctx.on('tools/post-execute', async (_e, _r, _next) =>
      ({ kind: 'accept', content: [{ type: 'text', text: 'z'.repeat(500) }] }))
    ctx.tools.register(textTool('small', 'tiny'))
    const result = await ctx.tools.execute(exec('small'))
    expect(spill?.saves[0]?.content).toBe('z'.repeat(500))
    expect(textOf(result.content)).toContain('Full formatted result stored at')
  })

  it('preserves downstream accept-decision contexts when spilling', async () => {
    const { ctx } = await setup({ maxInlineTokens: 64 })
    const context = createUserMessage({
      content: [{ type: 'text' as const, text: 'note' }],
      source: { kind: 'test' as const },
    })
    ctx.on('tools/post-execute', async (_e, _r, _next) =>
      ({ kind: 'accept', additionalContexts: [context] }))
    ctx.tools.register(textTool('big', 'x'.repeat(1000)))
    const result = await ctx.tools.execute(exec('big'))
    expect(textOf(result.content)).toContain('Full formatted result stored at')
    expect(result.additionalContexts).toEqual([context])
  })

  it('passes a downstream value replacement through for registry rendering', async () => {
    const { ctx, spill } = await setup({ maxInlineTokens: 10 })
    const replacement = [{ type: 'text' as const, text: 'z'.repeat(500) }]
    ctx.on('tools/post-execute', async () => ({ kind: 'accept' as const, value: replacement }))
    ctx.tools.register(textTool('small', 'tiny'))

    const result = await ctx.tools.execute(exec('small'))

    expect(result.isError).toBe(false)
    if (result.isError) throw new Error('expected replacement success')
    expect(result.value).toEqual(replacement)
    expect(textOf(result.content)).toBe('z'.repeat(500))
    expect(spill?.saves).toHaveLength(0)
  })
})

describe('cap invariant', () => {
  it('keeps the inline result when the notice alone exceeds the cap, even for a large original', async () => {
    // A large body (so it is well over the cap) but a cap smaller than the
    // notice itself: there is no within-cap replacement, so the policy must keep
    // the inline result rather than emit content over maxInlineTokens.
    const { ctx } = await setup({ maxInlineTokens: 8 })
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    const body = 'x'.repeat(5000)
    ctx.tools.register(textTool('big', body))
    const result = await ctx.tools.execute(exec('big'))
    expect(textOf(result.content)).toBe(body)
    expect(warn).toHaveBeenCalled()
  })
})

const VISION_ROUTE = { provider: 'vision-route', model: 'vision-model' }
const HOST_IMAGE_PATH = '/host/.qilin/attachments/objects/aa/object'

const IMAGE_REF: ImageAttachmentRef = {
  attachmentId: AttachmentId(`sha256:${'a'.repeat(64)}`),
  mediaType: 'image/png',
  bytes: 12,
  width: 4,
  height: 4,
}

const IMAGE_LIMITS: ImageAttachmentLimits = {
  maxImageBytes: 16,
  maxImagesPerMessage: 4,
  maxMessageImageBytes: 64,
  maxImagePixels: 16,
  maxImageDimension: 8,
  mediaTypes: ['image/png'],
}

/** One whole image block in a tool result; each call is a distinct occurrence. */
function imageBlock(): ImageBlock {
  return { type: 'image', attachment: IMAGE_REF }
}

/** Attachment store double exposing only the host-object location the policy forwards. */
class StubAttachments extends AttachmentStore {
  readonly imageLimits = IMAGE_LIMITS
  /** Host-object location reported for every reference; a relative path is unmappable. */
  hostPath: string | undefined = HOST_IMAGE_PATH

  validateImage(_input: SaveImageAttachment): Promise<void> {
    return Promise.resolve()
  }

  saveImage(_input: SaveImageAttachment): Promise<ImageAttachmentRef> {
    return Promise.resolve(IMAGE_REF)
  }

  readImage(ref: ImageAttachmentRef): Promise<StoredImageAttachment> {
    return Promise.resolve({ ref, data: Uint8Array.of(1, 2, 3) })
  }

  override imageHostPath(_ref: ImageAttachmentRef): string | undefined {
    return this.hostPath
  }
}

/** The route-owned pricing declaration one adapter answers for its images. */
interface ImagePricing {
  priceImages(images: readonly ImageBlock[]): LlmImageRequestPrice[]
}

/** Adapter answering request-image pricing for the one visual route. */
class StubVisionAdapter extends LlmAdapter {
  /** Visual tokens charged for each image occurrence. */
  visualTokens = 0
  /** Descriptor text priced alongside each image. */
  handleText = 'handle'
  /** Price count returned instead of one per occurrence, to exercise the refusal. */
  prices: number | undefined

  async * stream(_options: GenerateOptions): AsyncIterable<StreamChunk> {
    throw new Error('not exercised')
  }

  override imageRequestPricing(provider: string, model: string): ImagePricing | undefined {
    if (provider !== VISION_ROUTE.provider || model !== VISION_ROUTE.model) return undefined
    return {
      priceImages: (images: readonly ImageBlock[]): LlmImageRequestPrice[] =>
        Array.from({ length: this.prices ?? images.length }, () => ({ visualTokens: this.visualTokens, text: this.handleText })),
    }
  }
}

describe('image results', () => {
  /**
   * Mount tools + the policy with the real filesystem mapping, a stub
   * attachment store, and an image-pricing route. Each service can be withheld
   * or pointed at an unmappable location to exercise the policy's refusals.
   */
  async function setupImages(
    config: SpillPolicy.Config,
    options: { attachments?: boolean; fs?: boolean; llm?: boolean; hostPath?: string } = {},
  ): Promise<{ ctx: Context; spill: StubStore; adapter: StubVisionAdapter; attachments: StubAttachments | undefined }> {
    const adapter = new StubVisionAdapter()
    let attachments: StubAttachments | undefined
    const { ctx, spill } = await setup(config, true, async (target) => {
      if (options.llm !== false) {
        await target.plugin(LlmRuntime)
        target.llm.registerAdapter([VISION_ROUTE.provider], adapter)
      }
      if (options.attachments !== false) {
        await target.plugin(StubAttachments)
        attachments = target.get('attachments') as StubAttachments
        if (options.hostPath !== undefined) attachments.hostPath = options.hostPath
      }
      if (options.fs !== false) {
        provideWorkingDirectoryFixture(target)
        await target.plugin(FileSystem)
      }
    })
    return { ctx, spill: spill as StubStore, adapter, attachments }
  }

  /** Execution of an image-returning content tool with a controlled LLM route. */
  function visionExec(tool: string, options: {
    routed?: { provider: string; model: string }
    configured?: { provider: string; model: string }
    parent?: ToolExecutionToken
  } = {}): ToolExecution {
    const agent = {
      session: {
        header: { id: SessionId('s-image') },
        requestHeader: () => options.routed === undefined ? undefined : { config: options.routed },
      },
      options: options.configured ?? {},
    }
    return {
      callId: ToolCallId(`call-${tool}`), name: tool, arguments: {}, agent, signal: testToolSignal,
      ...options.parent === undefined ? {} : { parent: options.parent },
    } as unknown as ToolExecution
  }

  /** A content tool returning a fixed image-bearing result. */
  function imageTool(name: string, content: ContentBlock[]) {
    return defineContentToolFixture({
      name,
      description: name,
      parameters: {},
      async execute(): Promise<ContentBlock[]> { return content },
    })
  }

  it('spills an oversized image result whole, saving the read-only address beside the text', async () => {
    const { ctx, spill } = await setupImages({ maxInlineTokens: 64 })
    const body = 'x'.repeat(2000)
    ctx.tools.register(imageTool('screenshot', [imageBlock(), { type: 'text', text: body }]))

    const result = await ctx.tools.execute(visionExec('screenshot', { routed: VISION_ROUTE }))

    expect(result.isError).toBe(false)
    expect(spill.saves).toHaveLength(1)
    expect(spill.saves[0]?.content).toBe(
      `\n[Image: "${HOST_IMAGE_PATH}"; image/png; 4x4. Use read_image to view it.]\n${body}`)
    // The replacement keeps the image whole; only text is trimmed around it.
    expect(result.content.filter(block => block.type === 'image')).toEqual([imageBlock()])
    const text = textOf(result.content)
    // The image stayed inline, so only the trimmed text bytes are reported.
    expect(text).toContain('(Omitted 1972 bytes. Full formatted result stored at: /spill/screenshot.txt. Use the stub retrieval path.)')
    expect(text.startsWith('xxxx')).toBe(true)
    expect(text).toContain(`\n\n[...]\n\n${body.slice(-24)}\n\n`)
    expect(estimateContent([{ type: 'text', text }])).toBeLessThanOrEqual(64)
  })

  it('prices images from the agent options when the session has no request header', async () => {
    const { ctx, spill } = await setupImages({ maxInlineTokens: 64 })
    ctx.tools.register(imageTool('fallback_route', [imageBlock(), { type: 'text', text: 'y'.repeat(2000) }]))

    const result = await ctx.tools.execute(visionExec('fallback_route', { configured: VISION_ROUTE }))

    expect(spill.saves).toHaveLength(1)
    expect(textOf(result.content)).toContain('Full formatted result stored at: /spill/fallback_route.txt')
  })

  it('keeps the inline result when the execution names no image-pricing route', async () => {
    const { ctx } = await setupImages({ maxInlineTokens: 64 })
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    const body = 'x'.repeat(2000)
    ctx.tools.register(imageTool('unrouted', [imageBlock(), { type: 'text', text: body }]))

    const result = await ctx.tools.execute(visionExec('unrouted'))

    expect(result.content.some(block => block.type === 'image')).toBe(true)
    expect(textOf(result.content)).toBe(body)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no image token calculator'))
  })

  it('keeps the inline result when the calculator omits an image occurrence', async () => {
    const { ctx, adapter } = await setupImages({ maxInlineTokens: 64 })
    adapter.prices = 1
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    const body = 'x'.repeat(2000)
    ctx.tools.register(imageTool('two_images', [imageBlock(), imageBlock(), { type: 'text', text: body }]))

    const result = await ctx.tools.execute(visionExec('two_images', { routed: VISION_ROUTE }))

    expect(textOf(result.content)).toBe(body)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('inconsistent occurrence count'))
  })

  it('keeps the inline result when the attachment has no readable path in the tool world', async () => {
    const { ctx } = await setupImages({ maxInlineTokens: 64 }, { hostPath: 'relative/object.png' })
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    const body = 'x'.repeat(2000)
    ctx.tools.register(imageTool('unmapped', [imageBlock(), { type: 'text', text: body }]))

    const result = await ctx.tools.execute(visionExec('unmapped', { routed: VISION_ROUTE }))

    expect(textOf(result.content)).toBe(body)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('has no readable attachment path'))
  })

  it('keeps the inline result when the composition mounts no attachment store', async () => {
    const { ctx } = await setupImages({ maxInlineTokens: 64 }, { attachments: false })
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    const body = 'x'.repeat(2000)
    ctx.tools.register(imageTool('no_attachments', [imageBlock(), { type: 'text', text: body }]))

    const result = await ctx.tools.execute(visionExec('no_attachments', { routed: VISION_ROUTE }))

    expect(textOf(result.content)).toBe(body)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('has no readable attachment path'))
  })

  it('keeps the inline result when the composition mounts no filesystem', async () => {
    const { ctx } = await setupImages({ maxInlineTokens: 64 }, { fs: false })
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    const body = 'x'.repeat(2000)
    ctx.tools.register(imageTool('no_fs', [imageBlock(), { type: 'text', text: body }]))

    const result = await ctx.tools.execute(visionExec('no_fs', { routed: VISION_ROUTE }))

    expect(textOf(result.content)).toBe(body)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('has no readable attachment path'))
  })

  it('offers the retained preview as additional context when a dispatch omits its images', async () => {
    const { ctx, spill, adapter } = await setupImages({ maxInlineTokens: 64 })
    adapter.visualTokens = 100_000
    const body = 'x'.repeat(2000)
    ctx.tools.register(imageTool('vision_dispatch', [{ type: 'text', text: body }, imageBlock()]))

    const result = await ctx.tools.execute(visionExec('vision_dispatch', {
      routed: VISION_ROUTE,
      parent: Symbol('outer') as ToolExecutionToken,
    }))

    expect(spill.saves).toHaveLength(1)
    expect(spill.saves[0]?.source).toMatchObject({ toolName: 'vision_dispatch', label: 'dispatch' })
    expect(result.content.some(block => block.type === 'image')).toBe(false)
    const text = textOf(result.content)
    expect(text).toContain('Full formatted result stored at: /spill/vision_dispatch.txt')
    expect(text).toContain('Omitted 1 images.')
    expect(result.additionalContexts).toHaveLength(1)
    expect(result.additionalContexts?.[0]).toMatchObject({ content: result.content })
  })
})

describe('disposal (HMR safety)', () => {
  it('stops transforming oversized results after the plugin fiber is disposed', async () => {
    const { ctx, spill, fiber } = await setup({ maxInlineTokens: 64 })
    const body = 'HEAD'.repeat(200) + 'TAIL'.repeat(200)
    ctx.tools.register(textTool('big', body))

    // Live: the listener spills and replaces.
    const before = await ctx.tools.execute(exec('big'))
    expect(textOf(before.content)).toContain('Full formatted result stored at')
    expect(spill?.saves).toHaveLength(1)

    // After disposal the listener is gone — the result passes through untouched
    // and nothing more is spilled (no leaked registration across reload).
    await fiber.dispose()
    const after = await ctx.tools.execute(exec('big'))
    expect(textOf(after.content)).toBe(body)
    expect(spill?.saves).toHaveLength(1)
  })
})
