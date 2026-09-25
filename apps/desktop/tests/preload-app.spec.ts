import { afterEach, expect, it, vi } from 'vitest'
import { syncWindowsAppearance } from '../src/preload-windows.ts'
import { DESKTOP_IPC, type QilinDesktopProductApi } from '../src/ipc.ts'

const electron = vi.hoisted(() => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: { invoke: vi.fn(), on: vi.fn(), off: vi.fn(), send: vi.fn() },
}))
vi.mock('electron', () => electron)
vi.mock('../src/preload-platform.ts', () => ({ markDocumentPlatform: vi.fn() }))
vi.mock('../src/preload-theme.ts', () => ({ syncNativeTheme: vi.fn() }))
vi.mock('../src/preload-windows.ts', () => ({ syncWindowsAppearance: vi.fn() }))

afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); vi.resetModules() })

it('limits product documents to updates, shortcut preferences, and verified native input', async () => {
  vi.stubGlobal('location', new URL('qilin-app://app/index.html'))
  await import('../src/preload-app.ts')
  const api = electron.contextBridge.exposeInMainWorld.mock.calls.find(([name]) => name === 'qilinDesktop')?.[1] as QilinDesktopProductApi
  await api.updates.status()
  await api.updates.open()
  expect(electron.ipcRenderer.invoke.mock.calls.slice(0, 2)).toEqual([[DESKTOP_IPC.updatesStatus], [DESKTOP_IPC.updatesOpen]])
  expect(api).not.toHaveProperty('plugins')
  expect(api).not.toHaveProperty('backend')
  expect(api.updates).not.toHaveProperty('install')
  const listener = vi.fn()
  const dispose = api.updates.subscribe(listener)
  const handler = electron.ipcRenderer.on.mock.calls[0]?.[1] as (event: unknown, state: unknown) => void
  handler({}, { visible: false })
  expect(listener).toHaveBeenCalledWith({ visible: false })
  dispose()
  expect(electron.ipcRenderer.off).toHaveBeenCalledWith(DESKTOP_IPC.updatesPresentation, handler)
  // The preference face forwards exactly the catalog read, the constrained edit,
  // and the recording switch; the close request carries the accepted revision.
  await api.shortcuts.get([])
  await api.shortcuts.edit({ type: 'reset-all' }, 'revision' as never)
  await api.shortcuts.recording(true)
  const snapshotListener = vi.fn()
  const off = api.shortcuts.subscribe(snapshotListener)
  const changedHandler = electron.ipcRenderer.on.mock.calls.find(([channel]) => channel === DESKTOP_IPC.shortcutsChanged)![1]
  changedHandler({}, { status: 'ready' })
  expect(snapshotListener).toHaveBeenCalledWith({ status: 'ready' })
  off()
  expect(electron.ipcRenderer.invoke.mock.calls.slice(-3)).toEqual([
    [DESKTOP_IPC.shortcutsGet, []],
    [DESKTOP_IPC.shortcutsEdit, { type: 'reset-all' }, 'revision'],
    [DESKTOP_IPC.shortcutsRecording, true],
  ])
  await api.keyboard.closeWindow('revision' as never)
  expect(electron.ipcRenderer.invoke).toHaveBeenLastCalledWith(DESKTOP_IPC.shortcutsCloseWindow, 'revision')
  const inputListener = vi.fn()
  const offInput = api.keyboard.subscribe(inputListener)
  const inputHandler = electron.ipcRenderer.on.mock.calls.find(([channel]) => channel === DESKTOP_IPC.shortcutsInput)![1]
  inputHandler({}, { kind: 'keyboard', code: 'KeyB' })
  expect(inputListener).toHaveBeenCalledWith({ kind: 'keyboard', code: 'KeyB' })
  offInput()
  expect(electron.ipcRenderer.off).toHaveBeenCalledWith(DESKTOP_IPC.shortcutsInput, inputHandler)
})

it.each(['qilin-app://shell/plugin-manager.html', 'qilin-app://other/index.html', 'https://shell/startup.html', 'http://example.com/'])('exposes only the carrier marker to %s', async (url) => {
  vi.stubGlobal('location', new URL(url))
  await import('../src/preload-app.ts')
  expect(electron.contextBridge.exposeInMainWorld).toHaveBeenCalledWith('qilinDesktop', { protocolVersion: 1 })
})

it('exposes asynchronous boot only to the local application document', async () => {
  vi.stubGlobal('location', new URL('qilin-app://app/'))
  await import('../src/preload-app.ts')
  const api = electron.contextBridge.exposeInMainWorld.mock.calls.find(([name]) => name === 'qilinDesktopBoot')?.[1] as { ready(): Promise<unknown>; failed(message: string): Promise<void> }
  await api.ready()
  await api.failed('client mount failed')
  expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(DESKTOP_IPC.bootFailed, 'client mount failed')
  expect(electron.ipcRenderer.invoke).toHaveBeenCalledWith(DESKTOP_IPC.boot)
  vi.resetModules()
  electron.contextBridge.exposeInMainWorld.mockClear()
  vi.stubGlobal('location', new URL('https://other.example/'))
  await import('../src/preload-app.ts')
  expect(electron.contextBridge.exposeInMainWorld.mock.calls.some(([name]) => name === 'qilinDesktopBoot')).toBe(false)
})

it('exposes a directory picker only to the local application document', async () => {
  vi.stubGlobal('location', new URL('qilin-app://app/'))
  await import('../src/preload-app.ts')
  const api = electron.contextBridge.exposeInMainWorld.mock.calls.find(([name]) => name === '__QILIN_DIRECTORY_PICKER__')?.[1] as { pick(): Promise<string | null> }
  electron.ipcRenderer.invoke.mockResolvedValue('/workspace')
  await expect(api.pick()).resolves.toBe('/workspace')
  expect(electron.ipcRenderer.invoke).toHaveBeenCalledExactlyOnceWith(DESKTOP_IPC.directoryPick)
  for (const url of ['qilin-app://shell/startup.html', 'https://example.com/']) {
    vi.resetModules()
    electron.contextBridge.exposeInMainWorld.mockClear()
    vi.stubGlobal('location', new URL(url))
    await import('../src/preload-app.ts')
    expect(electron.contextBridge.exposeInMainWorld.mock.calls.some(([name]) => name === '__QILIN_DIRECTORY_PICKER__')).toBe(false)
  }
})

it.each(['qilin-app://app/', 'qilin-app://shell/plugin-manager.html', 'https://example.com/'])(
  'installs Windows appearance only for the application document (%s)', async (url) => {
    vi.stubGlobal('location', new URL(url))
    await import('../src/preload-app.ts')
    expect(syncWindowsAppearance).toHaveBeenCalledTimes(url === 'qilin-app://app/' ? 1 : 0)
  },
)
