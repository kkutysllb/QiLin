import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  create: vi.fn<(options: unknown) => ReturnType<typeof createWindow>>(),
}))
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function (options: unknown) { return electron.create(options) }),
}))

const {
  closeKStockSplash, dismissKStockSplash, openKStockSplash, usesKStockSplash,
} = await import('../src/kstock-splash.ts')

function createWindow() {
  let destroyed = false
  return {
    loadURL: vi.fn<(url: string) => Promise<undefined>>().mockResolvedValue(undefined),
    isDestroyed: vi.fn(() => destroyed),
    destroy: vi.fn(() => { destroyed = true }),
    close: vi.fn(() => { destroyed = true }),
    show: vi.fn(),
    focus: vi.fn(),
    center: vi.fn(),
    setOpacity: vi.fn(),
    once: vi.fn<(name: string, callback: () => void) => void>(),
    on: vi.fn<(name: string, callback: () => void) => void>(),
  }
}

function ready(window: ReturnType<typeof createWindow>): void {
  window.once.mock.calls.find(([name]) => name === 'ready-to-show')![1]()
}

beforeEach(() => {
  vi.useFakeTimers()
  electron.create.mockReset()
  dismissKStockSplash()
})

afterEach(() => {
  dismissKStockSplash()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('KStock product splash', () => {
  it('opens a fixed-size, frameless, sandboxed window with no preload', () => {
    const window = createWindow()
    electron.create.mockReturnValue(window)
    openKStockSplash()
    const options = electron.create.mock.calls[0]![0] as Record<string, unknown>
    expect(options).toMatchObject({
      width: 440, height: 320, frame: false, transparent: true, show: false,
      resizable: false, minimizable: false, maximizable: false, fullscreenable: false,
      alwaysOnTop: true, skipTaskbar: true, backgroundColor: '#00000000',
      webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
    })
    expect((options.webPreferences as Record<string, unknown>).preload).toBeUndefined()
    expect(window.loadURL).toHaveBeenCalledOnce()
    expect(window.loadURL.mock.calls[0]![0]).toContain('KStock')
  })

  it('shows on ready-to-show and focuses instead of opening a second window', () => {
    const window = createWindow()
    electron.create.mockReturnValue(window)
    openKStockSplash()
    expect(window.show).not.toHaveBeenCalled()
    ready(window)
    expect(window.center).toHaveBeenCalledOnce()
    expect(window.show).toHaveBeenCalledOnce()
    openKStockSplash()
    expect(electron.create).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })

  it('destroys a failed document and opens cleanly afterwards', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const window = createWindow()
    window.loadURL.mockRejectedValue(new Error('broken splash'))
    electron.create.mockReturnValueOnce(window)
    openKStockSplash()
    await vi.runAllTicks()
    await Promise.resolve()
    expect(window.destroy).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith('kstock splash: unavailable', expect.any(Error))
    const next = createWindow()
    electron.create.mockReturnValueOnce(next)
    openKStockSplash()
    expect(electron.create).toHaveBeenCalledTimes(2)
  })

  it('keeps a minimum lifetime, fades out, and closes once', () => {
    const window = createWindow()
    electron.create.mockReturnValue(window)
    openKStockSplash()
    closeKStockSplash()
    closeKStockSplash()
    vi.advanceTimersByTime(1_099)
    expect(window.setOpacity).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(window.setOpacity).toHaveBeenCalledWith(0)
    vi.advanceTimersByTime(220)
    expect(window.close).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(1_000)
    expect(window.close).toHaveBeenCalledOnce()
  })

  it('dismisses immediately, including while a requested fade is pending', () => {
    const window = createWindow()
    electron.create.mockReturnValue(window)
    openKStockSplash()
    closeKStockSplash()
    dismissKStockSplash()
    expect(window.destroy).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(2_000)
    expect(window.close).not.toHaveBeenCalled()
    expect(() => dismissKStockSplash()).not.toThrow()
  })

  it('does not show a window dismissed before its document reports ready', () => {
    const window = createWindow()
    electron.create.mockReturnValue(window)
    openKStockSplash()
    dismissKStockSplash()
    ready(window)
    expect(window.show).not.toHaveBeenCalled()
  })

  it('selects only the KStock product by its display name', () => {
    expect(usesKStockSplash('KStock')).toBe(true)
    expect(usesKStockSplash('QiLin Desktop')).toBe(false)
    expect(usesKStockSplash(undefined)).toBe(false)
  })
})
