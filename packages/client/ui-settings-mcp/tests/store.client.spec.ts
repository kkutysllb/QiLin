import { describe, expect, it, vi } from 'vitest'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { McpServersSnapshot } from '@qilin/mcp-servers/types'
import { McpServersStore } from '../src/client/store.ts'

/** One answer the fake Remote hands back. */
type Answer = { ok: true; value: McpServersSnapshot } | { ok: false; error: { code: string; message: string } }

const EMPTY: McpServersSnapshot = { patchPath: '/home/.qilin/cordis.patch.yml', servers: [], builtins: [] }

function snapshot(overrides: Partial<McpServersSnapshot> = {}): McpServersSnapshot {
  return { ...EMPTY, ...overrides }
}

function bench(answers: {
  list?: () => Promise<Answer>
  save?: (draft: unknown, signal?: AbortSignal) => Promise<Answer>
  remove?: (serverName: string, signal?: AbortSignal) => Promise<Answer>
  setEnabled?: (serverName: string, enabled: boolean, signal?: AbortSignal) => Promise<Answer>
  addBuiltin?: (id: string, signal?: AbortSignal) => Promise<Answer>
}) {
  const fallback = async (): Promise<Answer> => ({ ok: true, value: snapshot() })
  const mcpServers = {
    list: vi.fn(answers.list ?? fallback),
    save: vi.fn(answers.save ?? fallback),
    remove: vi.fn(answers.remove ?? fallback),
    setEnabled: vi.fn(answers.setEnabled ?? fallback),
    addBuiltin: vi.fn(answers.addBuiltin ?? fallback),
  }
  const ctx = { remote: { mcpServers } } as unknown as ClientContext
  const store = new McpServersStore(ctx)
  return { store, mcpServers }
}

describe('McpServersStore', () => {
  it('publishes the answered snapshot', async () => {
    const { store } = bench({ list: async () => ({ ok: true, value: snapshot({ patchPath: '/tmp/patch.yml' }) }) })
    await store.load()
    expect(store.store.getSnapshot()).toMatchObject({ status: 'ready', error: null, patchPath: '/tmp/patch.yml' })
  })

  it('reports a refused read without dropping the layer state it describes', async () => {
    const { store } = bench({
      list: async () => ({ ok: true, value: snapshot({ error: 'the file is not valid YAML' }) }),
    })
    await store.load()
    expect(store.store.getSnapshot()).toMatchObject({
      status: 'ready',
      layerError: 'the file is not valid YAML',
      servers: [],
    })
  })

  it('reports a failed call and stays ready', async () => {
    const { store } = bench({
      list: async () => ({ ok: false, error: { code: 'mcp-server/patch-file', message: 'the layer is unreadable' } }),
    })
    await store.load()
    expect(store.store.getSnapshot()).toMatchObject({ status: 'ready', error: 'the layer is unreadable' })
  })

  it('reports a thrown failure as the message', async () => {
    const { store } = bench({
      list: async () => { throw new Error('connection reset') },
    })
    await store.load()
    expect(store.store.getSnapshot().error).toBe('connection reset')
  })

  it('reports a rejection that is not an Error by its string form', async () => {
    const thrown: unknown = 'the socket closed'
    const { store } = bench({ list: async () => { throw thrown } })
    await store.load()
    expect(store.store.getSnapshot().error).toBe('the socket closed')
  })

  it('lets the newest read win over one still in flight', async () => {
    let release: ((answer: Answer) => void) | undefined
    const pending = new Promise<Answer>((resolve) => { release = resolve })
    const answers = [pending, Promise.resolve({ ok: true, value: snapshot({ patchPath: '/newer' }) })]
    const { store } = bench({ list: async () => await (answers.shift() as Promise<Answer>) })
    const first = store.load()
    const second = store.load()
    release?.({ ok: true, value: snapshot({ patchPath: '/older' }) })
    await Promise.all([first, second])
    expect(store.store.getSnapshot().patchPath).toBe('/newer')
  })


  it('ignores a failure that a newer call already superseded', async () => {
    let rejectStale: ((error: Error) => void) | undefined
    const stale = new Promise<Answer>((_resolve, reject) => { rejectStale = reject })
    const answers = [stale, Promise.resolve({ ok: true, value: snapshot({ patchPath: '/newer' }) })]
    const { store } = bench({ list: async () => await (answers.shift() as Promise<Answer>) })
    const first = store.load()
    const second = store.load()
    rejectStale?.(new Error('stale failure'))
    await Promise.all([first, second])
    expect(store.store.getSnapshot()).toMatchObject({ patchPath: '/newer', error: null })
  })

  it('writes a draft and publishes the answer', async () => {
    const { store, mcpServers } = bench({
      save: async () => ({ ok: true, value: snapshot({ patchPath: '/after-save' }) }),
    })
    const landed = await store.save({ serverName: 'fetch', transport: 'stdio', command: 'uvx' })
    expect(landed).toBe(true)
    expect(mcpServers.save).toHaveBeenCalledWith({ serverName: 'fetch', transport: 'stdio', command: 'uvx' }, expect.anything())
    expect(store.store.getSnapshot().patchPath).toBe('/after-save')
  })

  it('keeps the editor open by reporting a refused write', async () => {
    const { store } = bench({
      save: async () => ({ ok: false, error: { code: 'mcp-server/missing-command', message: 'a stdio server needs the executable to start' } }),
    })
    const landed = await store.save({ serverName: 'fetch', transport: 'stdio' })
    expect(landed).toBe(false)
    expect(store.store.getSnapshot()).toMatchObject({
      busy: null,
      error: 'a stdio server needs the executable to start',
    })
  })

  it('forwards removal, enablement, and recommended-server additions', async () => {
    const { store, mcpServers } = bench({})
    await store.remove('fetch')
    await store.setEnabled('fetch', false)
    await store.addBuiltin('context7')
    expect(mcpServers.remove).toHaveBeenCalledWith('fetch', expect.anything())
    expect(mcpServers.setEnabled).toHaveBeenCalledWith('fetch', false, expect.anything())
    expect(mcpServers.addBuiltin).toHaveBeenCalledWith('context7', expect.anything())
  })

  it('marks the namespace a write is in flight for', async () => {
    let release: ((answer: Answer) => void) | undefined
    const pending = new Promise<Answer>((resolve) => { release = resolve })
    const { store } = bench({ remove: async () => await pending })
    const removal = store.remove('fetch')
    expect(store.store.getSnapshot().busy).toBe('fetch')
    release?.({ ok: true, value: snapshot() })
    await removal
    expect(store.store.getSnapshot().busy).toBeNull()
  })
})
