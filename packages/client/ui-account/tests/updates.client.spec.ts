/**
 * The desktop-shell update surface: the 3.1.7 `subscribe` spelling, the legacy
 * `onPresentation` spelling it replaced, and the drifted surface that must hide
 * the indicator instead of failing the account entry's activation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUpdatesSource, readDesktopUpdates } from '../src/client/updates.ts'
import type { UpdatesPresentation } from '../src/client/updates.ts'

const IDLE: UpdatesPresentation = { phase: 'idle' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('desktop update surface', () => {
  it('subscribes through the 3.1.7 spelling and publishes the status it reads', async () => {
    let push: ((next: UpdatesPresentation) => void) | undefined
    const subscribe = vi.fn((listener: (next: UpdatesPresentation) => void) => {
      push = listener
      return () => {}
    })
    const status = vi.fn(async (): Promise<UpdatesPresentation> => ({ phase: 'available', version: '1.1.5' }))
    vi.stubGlobal('window', { qilinDesktop: { updates: { status, open: vi.fn(), subscribe } } })
    const api = readDesktopUpdates()
    expect(api).toBeDefined()
    const source = createUpdatesSource(api)
    expect(source).toBeDefined()
    expect(subscribe).toHaveBeenCalledOnce()
    expect(source!.getSnapshot()).toEqual(IDLE)
    await Promise.resolve()
    expect(source!.getSnapshot()).toEqual({ phase: 'available', version: '1.1.5' })
    push?.({ phase: 'downloading', percent: 40 })
    expect(source!.getSnapshot()).toEqual({ phase: 'downloading', percent: 40 })
  })

  it('accepts the legacy onPresentation spelling the pre-3.1.7 shell kept', async () => {
    const onPresentation = vi.fn(() => () => {})
    vi.stubGlobal('window', {
      qilinDesktop: { updates: { status: async () => IDLE, open: vi.fn(), onPresentation } },
    })
    const source = createUpdatesSource(readDesktopUpdates())
    expect(source).toBeDefined()
    expect(onPresentation).toHaveBeenCalledOnce()
  })

  it('hides the indicator instead of throwing when the surface drifted', () => {
    vi.stubGlobal('window', { qilinDesktop: { updates: { status: async () => IDLE, open: vi.fn() } } })
    expect(readDesktopUpdates()).toBeUndefined()
    expect(createUpdatesSource(undefined)).toBeUndefined()
  })

  it('reads no surface outside the desktop shell', () => {
    expect(readDesktopUpdates()).toBeUndefined()
  })
})
