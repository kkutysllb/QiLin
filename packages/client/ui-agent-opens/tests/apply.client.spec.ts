// @vitest-environment jsdom
/**
 * The dispatcher: which Sidebar surface a model-requested open reaches, that a
 * Session switch re-subscribes, and that leaving the plugin abandons the stream.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import { SessionId } from '@qilin-agent/session/types'
import { fileAddressFor } from '@qilin-agent/util-workspace-path'
import type { SidebarOpenRequest } from '@qilin-agent/sidebar-opens/types'
import { apply, inject } from '../src/client/index.ts'

const VIEWED = SessionId('viewed')
const OTHER = SessionId('other')

/** One controllable request stream per watch call. */
class Stream {
  readonly requests: SidebarOpenRequest[] = []
  private wake: (() => void) | undefined
  closed = false

  push(request: SidebarOpenRequest): void {
    this.requests.push(request)
    this.wake?.()
    this.wake = undefined
  }

  async *iterate(signal: AbortSignal): AsyncIterable<SidebarOpenRequest> {
    signal.addEventListener('abort', () => { this.closed = true; this.wake?.() }, { once: true })
    while (!signal.aborted) {
      if (this.requests.length === 0) {
        await new Promise<void>((resolve) => { this.wake = resolve })
        continue
      }
      yield this.requests.shift() as SidebarOpenRequest
    }
  }
}

function request(target: string, kind: 'file' | 'url' = 'url'): SidebarOpenRequest {
  return { id: target, kind, target, title: target }
}

async function boot(options: { browserTab?: boolean; workbenchTag?: 'coding' | 'general' } = {}) {
  const ctx = new Context()
  const streams = new Map<string, Stream>()
  const watch = vi.fn((sessionId: SessionId, signal: AbortSignal) => {
    const stream = new Stream()
    streams.set(sessionId, stream)
    return stream.iterate(signal) as AsyncIterable<SidebarOpenRequest> & { dispose?: () => void }
  })
  let current: SessionId | undefined = VIEWED
  const listeners = new Set<() => void>()
  const openTab = vi.fn()
  const openResource = vi.fn()
  ctx.provide('remote', { sidebarOpens: { watch } } as never)
  ctx.provide('sidebarRight', { openTab, openResource } as never)
  ctx.provide('sidebarRightTabs', { get: (kind: string) => options.browserTab === false ? undefined : (kind === 'browser' ? {} : undefined) } as never)
  ctx.provide('sessions', {
    list: { getSnapshot: () => ({ byId: { [VIEWED]: { cwd: '/work/app' }, [OTHER]: { cwd: '/work/other' } } }) },
  } as never)
  const codingOpenTab = vi.fn()
  const codingOpenFile = vi.fn()
  const workbenchTag = options.workbenchTag
  if (workbenchTag !== undefined) {
    ctx.provide('workbench', { state: { getSnapshot: () => ({ active: workbenchTag }) } } as never)
    ctx.provide('betterSidebar', { openTab: codingOpenTab, openFile: codingOpenFile } as never)
  }
  ctx.provide('uiSession', {
    adapter: {
      current: {
        getSnapshot: () => ({ key: current }),
        subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
      },
    },
  } as never)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  /** Let the stream's first pull and every queued delivery settle. */
  const settle = async (rounds = 4): Promise<void> => {
    for (let round = 0; round < rounds; round++) await Promise.resolve()
  }
  await settle()
  return {
    ctx, fiber, watch, openTab, openResource, streams, settle, codingOpenTab, codingOpenFile,
    switchTo(sessionId: SessionId | undefined) { current = sessionId; for (const listener of listeners) listener() },
    viewer: () => streams.get(VIEWED),
  }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('agent open dispatcher', () => {
  it('opens a page in the built-in browser when that tab type is composed', async () => {
    const h = await boot()
    expect(h.watch).toHaveBeenCalledExactlyOnceWith(VIEWED, expect.any(AbortSignal))
    h.viewer()?.push(request('https://example.test/docs'))
    await h.settle()
    expect(h.openTab).toHaveBeenCalledExactlyOnceWith('browser', { params: { url: 'https://example.test/docs' } })
    expect(h.openResource).not.toHaveBeenCalled()
    await h.fiber.dispose()
  })

  it('falls back to a new browser tab without the built-in browser', async () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    const h = await boot({ browserTab: false })
    h.viewer()?.push(request('https://example.test/docs'))
    await h.settle()
    expect(h.openTab).not.toHaveBeenCalled()
    expect(open).toHaveBeenCalledExactlyOnceWith('https://example.test/docs', '_blank', 'noopener,noreferrer')
    await h.fiber.dispose()
  })

  it('opens a file through its Session-relative resource address', async () => {
    const h = await boot()
    h.viewer()?.push(request('/work/app/src/app.ts', 'file'))
    await h.settle()
    expect(h.openResource).toHaveBeenCalledExactlyOnceWith(fileAddressFor(VIEWED, '/work/app', '/work/app/src/app.ts'))
    await h.fiber.dispose()
  })

  it('lands a page in the coding sidebar while the coding workbench is active', async () => {
    const h = await boot({ workbenchTag: 'coding' })
    h.viewer()?.push(request('https://example.test/docs'))
    await h.settle()
    expect(h.codingOpenTab).toHaveBeenCalledExactlyOnceWith(
      { type: 'browser', url: 'https://example.test/docs', title: 'https://example.test/docs' },
      { sessionId: VIEWED },
    )
    expect(h.openTab).not.toHaveBeenCalled()
    await h.fiber.dispose()
  })

  it('lands a file in the coding sidebar while the coding workbench is active', async () => {
    const h = await boot({ workbenchTag: 'coding' })
    h.viewer()?.push(request('/work/app/src/app.ts', 'file'))
    await h.settle()
    expect(h.codingOpenFile).toHaveBeenCalledExactlyOnceWith(
      { sessionId: VIEWED },
      '/work/app/src/app.ts',
      '/work/app/src/app.ts',
    )
    expect(h.openResource).not.toHaveBeenCalled()
    await h.fiber.dispose()
  })

  it('keeps the native Sidebar under the general workbench tag', async () => {
    const h = await boot({ workbenchTag: 'general' })
    h.viewer()?.push(request('/work/app/src/app.ts', 'file'))
    await h.settle()
    expect(h.codingOpenFile).not.toHaveBeenCalled()
    expect(h.openResource).toHaveBeenCalledExactlyOnceWith(fileAddressFor(VIEWED, '/work/app', '/work/app/src/app.ts'))
    await h.fiber.dispose()
  })

  it('re-subscribes for the newly viewed Session and abandons the old stream', async () => {
    const h = await boot()
    h.switchTo(OTHER)
    await h.settle()
    expect(h.watch).toHaveBeenCalledTimes(2)
    expect(h.watch).toHaveBeenLastCalledWith(OTHER, expect.any(AbortSignal))
    expect(h.streams.get(VIEWED)?.closed).toBe(true)
    expect(h.streams.get(OTHER)?.closed).toBe(false)
    // A switch to no Session at all stops watching without opening anything.
    h.switchTo(undefined)
    await h.settle()
    expect(h.watch).toHaveBeenCalledTimes(2)
    expect(h.streams.get(OTHER)?.closed).toBe(true)
    await h.fiber.dispose()
  })

  it('stops watching when the plugin is disposed', async () => {
    const h = await boot()
    await h.fiber.dispose()
    await h.settle()
    expect(h.viewer()?.closed).toBe(true)
  })
})
