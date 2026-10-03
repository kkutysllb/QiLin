/**
 * `sidebar_open`: what the model may ask to open, and how a request reaches the
 * Session's Sidebar — delivered while a view is attached, queued while none is,
 * and never replayed after the view goes away.
 */
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@qilin/kylin'
import AgentRegistry, { type Agent } from '@qilin/agent'
import { unsupportedInbox } from '@qilin/agent-loop-testkit'
import LocalFileSystem from '@qilin/fs-local'
import { createScope, type Scope } from '@qilin/scope'
import { ToolCallId } from '@qilin/llm'
import { SESSION_FORMAT_VERSION, Session, SessionId } from '@qilin/session'
import SystemPrompt from '@qilin/system-prompt'
import ToolRuntime from '@qilin/tools'
import * as SidebarOpens from '../src/index.ts'
import type { SidebarOpenRequest } from '../src/types.ts'

const cleanups: Array<() => Promise<unknown>> = []
let callNumber = 0
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
  vi.restoreAllMocks()
})

async function workspace(): Promise<string> {
  const created = await mkdtemp(join(tmpdir(), 'qilin-sidebar-opens-'))
  cleanups.push(() => rm(created, { recursive: true, force: true }))
  await writeFile(join(created, 'notes.md'), '# notes\n')
  // The Host reports the resolved path, which on macOS reaches the same file
  // through `/private`.
  return await realpath(created)
}

/** One agent whose Session has the given working directory. */
async function agent(ctx: Context, cwd: string | undefined): Promise<Agent> {
  const id = SessionId(`sidebar-opens-owner-${++callNumber}`)
  const scope: Scope = createScope(ctx, id)
  const session = Session.create(id, [], {
    version: SESSION_FORMAT_VERSION, id, createdAt: 0, ...cwd === undefined ? {} : { cwd }, isSeeded: false,
  })
  const value: Agent = {
    id,
    options: {},
    session,
    inbox: unsupportedInbox(),
    status: 'idle',
    get ctx() { return scope.ctx },
    send: () => {},
    followup: () => {},
    steer: () => {},
    inject: () => {},
    cancel: () => {},
    whenIdle: async () => {},
    runMaintenance: task => task(new AbortController().signal),
  }
  await ctx.plugin(AgentRegistry).await()
  ctx.agents.register(value)
  return value
}

async function boot(cwd: string | undefined, config: Partial<SidebarOpens.Config> = {}) {
  const ctx = new Context()
  cleanups.push(() => ctx.fiber.dispose())
  await ctx.plugin(LocalFileSystem, cwd === undefined ? {} : { cwd })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(SidebarOpens, { maxQueued: config.maxQueued ?? 2 })
  const owner = await agent(ctx, cwd)
  const call = async (args: Record<string, unknown>, signal = new AbortController().signal) =>
    await ctx.tools.execute({ agent: owner, callId: ToolCallId('call-1'), name: 'sidebar_open', arguments: args, signal })
  return { ctx, call, session: owner.session }
}

/** Collect the first `count` requests one watcher yields. */
async function collect(stream: AsyncIterable<SidebarOpenRequest>, count: number, signal: AbortSignal): Promise<SidebarOpenRequest[]> {
  const seen: SidebarOpenRequest[] = []
  for await (const request of stream) {
    seen.push(request)
    if (seen.length >= count) break
  }
  expect(signal.aborted).toBe(false)
  return seen
}

describe('sidebar_open tool', () => {
  it('queues an http(s) page under its host name and reports it as queued while nothing watches', async () => {
    const { ctx, call, session } = await boot(await workspace())
    const result = await call({ url: 'https://example.test/docs?q=1' })
    expect(result).toMatchObject({
      isError: false,
      value: { kind: 'url', target: 'https://example.test/docs?q=1', title: 'example.test', delivered: false },
    })
    const controller = new AbortController()
    const [request] = await collect(ctx.sidebarOpens.watch(session.id, controller.signal), 1, controller.signal)
    expect(request).toMatchObject({ kind: 'url', title: 'example.test' })
    controller.abort()
  })

  it('opens an existing file through the Session filesystem and titles it by its basename', async () => {
    const cwd = await workspace()
    const { call, session, ctx } = await boot(cwd)
    const result = await call({ path: 'notes.md' })
    expect(result).toMatchObject({ isError: false, value: { kind: 'file', target: join(cwd, 'notes.md'), title: 'notes.md' } })
    const controller = new AbortController()
    const stream = ctx.sidebarOpens.watch(session.id, controller.signal)
    const [request] = await collect(stream, 1, controller.signal)
    expect(request?.target).toBe(join(cwd, 'notes.md'))
    controller.abort()
  })

  it('refuses a target it cannot open', async () => {
    const cwd = await workspace()
    const { call } = await boot(cwd)
    const failures = [
      { url: 'file:///etc/hosts' }, { url: 'not a url' },
      { path: 'missing.md' }, { path: '.' },
      {}, { path: 'notes.md', url: 'https://example.test' },
    ]
    for (const args of failures) {
      expect(await call(args), JSON.stringify(args)).toMatchObject({ isError: true })
    }
  })

  it('requires an initiating agent', async () => {
    const ctx = new Context()
    cleanups.push(() => ctx.fiber.dispose())
    await ctx.plugin(LocalFileSystem, {})
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await ctx.plugin(SidebarOpens, { maxQueued: 2 })
    const result = await ctx.tools.execute({
      callId: ToolCallId('call-1'), name: 'sidebar_open', arguments: { url: 'https://example.test' },
      signal: new AbortController().signal,
    })
    expect(result).toMatchObject({ isError: true })
  })

  it('resolves an absolute path for a Session that declares no working directory', async () => {
    const cwd = await workspace()
    const { call } = await boot(undefined)
    const result = await call({ path: join(cwd, 'notes.md') })
    expect(result).toMatchObject({
      isError: false,
      value: { kind: 'file', target: join(cwd, 'notes.md'), title: 'notes.md' },
    })
  })

  it('tells the model an attached view opened the target, not that it queued', async () => {
    const { ctx, call, session } = await boot(await workspace())
    const controller = new AbortController()
    const parked = ctx.sidebarOpens.watch(session.id, controller.signal)[Symbol.asyncIterator]().next()
    await Promise.resolve()
    const result = await call({ url: 'https://example.test/docs' })
    expect(result).toMatchObject({ isError: false, value: { delivered: true } })
    expect(result).toMatchObject({
      content: [{ type: 'text', text: 'Opened https://example.test/docs in the sidebar.' }],
    })
    expect((await parked).value).toMatchObject({ target: 'https://example.test/docs' })
    controller.abort()
  })
})

describe('sidebar open delivery', () => {
  it('delivers to an attached view and forgets the request', async () => {
    const { ctx, session } = await boot(await workspace())
    const controller = new AbortController()
    const stream = ctx.sidebarOpens.watch(session.id, controller.signal)
    // The generator registers its watcher when the first pull starts.
    const first = stream[Symbol.asyncIterator]().next()
    await Promise.resolve()
    expect(ctx.sidebarOpens.enqueue(session.id, request('one'))).toBe(true)
    expect((await first).value).toMatchObject({ target: 'one' })
    controller.abort()
    // Nothing was left queued, so a later view has nothing to replay.
    const second = new AbortController()
    expect(ctx.sidebarOpens.enqueue(session.id, request('two'))).toBe(false)
    const [replayed] = await collect(ctx.sidebarOpens.watch(session.id, second.signal), 1, second.signal)
    expect(replayed).toMatchObject({ target: 'two' })
    second.abort()
  })

  it('replays the queue in order and drops the oldest request past the bound', async () => {
    const { ctx, session } = await boot(await workspace(), { maxQueued: 2 })
    for (const target of ['one', 'two', 'three']) ctx.sidebarOpens.enqueue(session.id, request(target))
    const controller = new AbortController()
    const iterator = ctx.sidebarOpens.watch(session.id, controller.signal)[Symbol.asyncIterator]()
    // `one` fell out of the two-slot queue, so the view replays what waited and
    // then takes the live request.
    expect((await iterator.next()).value).toMatchObject({ target: 'two' })
    expect((await iterator.next()).value).toMatchObject({ target: 'three' })
    expect(ctx.sidebarOpens.enqueue(session.id, request('four'))).toBe(true)
    expect((await iterator.next()).value).toMatchObject({ target: 'four' })
    controller.abort()
  })

  it('stops replaying a queue once the stream is aborted', async () => {
    const { ctx, session } = await boot(await workspace(), { maxQueued: 3 })
    for (const target of ['one', 'two', 'three']) ctx.sidebarOpens.enqueue(session.id, request(target))
    const controller = new AbortController()
    const iterator = ctx.sidebarOpens.watch(session.id, controller.signal)[Symbol.asyncIterator]()
    expect((await iterator.next()).value).toMatchObject({ target: 'one' })
    controller.abort()
    // The two requests still queued are not handed to a view that is going away.
    expect(await iterator.next()).toMatchObject({ done: true })
  })

  it('hands the Session to the newest view and stops on abort', async () => {
    const { ctx, session } = await boot(await workspace())
    const first = new AbortController()
    const firstStream = ctx.sidebarOpens.watch(session.id, first.signal)[Symbol.asyncIterator]()
    const parked = firstStream.next()
    await Promise.resolve()
    const second = new AbortController()
    const secondStream = ctx.sidebarOpens.watch(session.id, second.signal)[Symbol.asyncIterator]()
    const secondParked = secondStream.next()
    await Promise.resolve()
    // The older view was taken over: its pull settles without a request.
    expect(await parked).toMatchObject({ done: true })
    expect(ctx.sidebarOpens.enqueue(session.id, request('newest'))).toBe(true)
    expect((await secondParked).value).toMatchObject({ target: 'newest' })

    // An aborted stream leaves no watcher behind, so the next request waits.
    second.abort()
    await Promise.resolve()
    expect(ctx.sidebarOpens.enqueue(session.id, request('after'))).toBe(false)
    const third = new AbortController()
    const [replayed] = await collect(ctx.sidebarOpens.watch(session.id, third.signal), 1, third.signal)
    expect(replayed).toMatchObject({ target: 'after' })
    third.abort()
    first.abort()
  })

  it('drops every queue when the Host goes away', async () => {
    const { ctx, session } = await boot(await workspace())
    const controller = new AbortController()
    const stream = ctx.sidebarOpens.watch(session.id, controller.signal)[Symbol.asyncIterator]()
    const parked = stream.next()
    await Promise.resolve()
    ctx.sidebarOpens.dispose()
    expect(await parked).toMatchObject({ done: true })
    expect(ctx.sidebarOpens.enqueue(session.id, request('later'))).toBe(false)
    controller.abort()
  })

  it('refuses a queue bound that is not a positive integer', async () => {
    const ctx = new Context()
    cleanups.push(() => ctx.fiber.dispose())
    await ctx.plugin(LocalFileSystem, {})
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime)
    await expect(ctx.plugin(SidebarOpens, { maxQueued: 0 })).rejects.toThrow('positive integer maxQueued')
  })
})

/** One request as the service sees it, without going through the tool. */
function request(target: string): SidebarOpenRequest {
  return { id: target, kind: 'url', target, title: target }
}
