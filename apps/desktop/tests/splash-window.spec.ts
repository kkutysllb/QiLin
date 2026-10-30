import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const electron = vi.hoisted(() => ({
  create: vi.fn<(options: unknown) => ReturnType<typeof createWindow>>(),
  root: '/desktop-app',
}))
vi.mock('electron', () => ({
  app: { getAppPath: () => electron.root },
  BrowserWindow: vi.fn(function (options: unknown) { return electron.create(options) }),
}))

const { closeSplashWindow, openSplashWindow, splashWindowOptions } = await import('../src/splash-window.ts')

function createWindow() {
  return {
    webContents: {
      setWindowOpenHandler: vi.fn<(handler: () => { action: string }) => void>(),
      on: vi.fn<(name: string, handler: (event: { preventDefault(): void }) => void) => void>(),
    },
    loadFile: vi.fn<(path: string) => Promise<undefined>>().mockResolvedValue(undefined),
    isDestroyed: vi.fn().mockReturnValue(false),
    destroy: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    once: vi.fn<(name: string, callback: () => void) => void>(),
  }
}

beforeEach(() => {
  electron.create.mockReset()
  closeSplashWindow()
})

describe('desktop splash window', () => {
  it.each(['darwin', 'win32', 'linux'] as const)('keeps the %s splash fixed-size, frameless, and sandboxed', (platform) => {
    const options = splashWindowOptions(platform)
    expect(options).toMatchObject({
      width: 360, height: 360, useContentSize: true, center: true, frame: false, show: false,
      resizable: false, minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true,
      },
    })
    expect(options.webPreferences?.preload).toBeUndefined()
    if (platform === 'darwin') {
      expect(options.vibrancy).toBe('menu')
      expect(options.visualEffectState).toBe('active')
      expect(options.backgroundColor).toBe('#00000000')
      expect(options.backgroundMaterial).toBeUndefined()
    } else if (platform === 'win32') {
      expect(options.backgroundMaterial).toBe('acrylic')
      expect(options.backgroundColor).toBe('#00000000')
      expect(options.vibrancy).toBeUndefined()
    } else {
      expect(options.backgroundColor).toBe('#FFFFFF')
      expect(options.vibrancy).toBeUndefined()
      expect(options.backgroundMaterial).toBeUndefined()
    }
  })

  it('shows only after its document loads and the renderer reports ready', async () => {
    const window = createWindow()
    const loaded = Promise.withResolvers<undefined>()
    window.loadFile.mockReturnValue(loaded.promise)
    electron.create.mockReturnValue(window)
    const opening = openSplashWindow()
    expect(window.show).not.toHaveBeenCalled()
    expect(window.loadFile).toHaveBeenCalledWith(join(electron.root, 'renderer', 'splash.html'))
    expect(window.webContents.setWindowOpenHandler.mock.calls[0]![0]()).toEqual({ action: 'deny' })
    const event = { preventDefault: vi.fn() }
    window.webContents.on.mock.calls[0]![1](event)
    expect(event.preventDefault).toHaveBeenCalledOnce()
    loaded.resolve(undefined)
    expect(await opening).toBe(window)
    expect(window.show).not.toHaveBeenCalled()
    window.once.mock.calls.find(([name]) => name === 'ready-to-show')![1]()
    expect(window.show).toHaveBeenCalledOnce()
  })

  it('destroys a window whose document fails to load and opens cleanly afterwards', async () => {
    const window = createWindow()
    window.loadFile.mockRejectedValue(new Error('missing splash document'))
    electron.create.mockReturnValueOnce(window)
    await expect(openSplashWindow()).rejects.toThrow('missing splash document')
    expect(window.destroy).toHaveBeenCalledOnce()
    expect(window.show).not.toHaveBeenCalled()
    const next = createWindow()
    electron.create.mockReturnValueOnce(next)
    await expect(openSplashWindow()).resolves.toBe(next)
    expect(electron.create).toHaveBeenCalledTimes(2)
  })

  it('does not show a window closed while its document was loading', async () => {
    const window = createWindow()
    window.isDestroyed.mockReturnValue(true)
    electron.create.mockReturnValue(window)
    await openSplashWindow()
    expect(window.show).not.toHaveBeenCalled()
    expect(window.destroy).not.toHaveBeenCalled()
  })

  it('focuses the existing window instead of opening a second one', async () => {
    const window = createWindow()
    electron.create.mockReturnValue(window)
    await expect(openSplashWindow()).resolves.toBe(window)
    await expect(openSplashWindow()).resolves.toBe(window)
    expect(electron.create).toHaveBeenCalledTimes(1)
    expect(window.focus).toHaveBeenCalledOnce()
  })

  it('destroys the splash on close, ignores repeated closes, and drops a late ready report', async () => {
    const window = createWindow()
    const loaded = Promise.withResolvers<undefined>()
    window.loadFile.mockReturnValue(loaded.promise)
    electron.create.mockReturnValue(window)
    const opening = openSplashWindow()
    closeSplashWindow()
    expect(window.destroy).toHaveBeenCalledOnce()
    expect(() => closeSplashWindow()).not.toThrow()
    loaded.resolve(undefined)
    await expect(opening).resolves.toBe(window)
    window.once.mock.calls.find(([name]) => name === 'ready-to-show')![1]()
    expect(window.show).not.toHaveBeenCalled()
  })
})
