// @vitest-environment jsdom
/** The Desktop keyboard installer against fixture Electron surfaces: config wiring, interception, and menu ownership. */
import { EventEmitter } from 'node:events'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, onTestFinished, vi } from 'vitest'
import type { BrowserWindow, MenuItemConstructorOptions, WebContents, WebFrameMain } from 'electron'
import type { ShortcutBinding, ShortcutCommandId, ShortcutConfigSnapshot,
  ShortcutDefinition } from '@qilin/client-shortcuts/protocol'
import { DESKTOP_IPC } from '../src/ipc.ts'

const ipc = vi.hoisted(() => ({ handle: vi.fn(), removeHandler: vi.fn() }))
vi.mock('electron', () => ({ ipcMain: ipc }))
const { installDesktopShortcuts } = await import('../src/keyboard.ts')
afterEach(() => { vi.clearAllMocks() })

type FrameFixture = { url: WebFrameMain['url']; name: WebFrameMain['name']; parent: FrameFixture | null }
type ContentsFixture = EventEmitter & Pick<WebContents,
  'isDestroyed' | 'isFocused' | 'send' | 'setIgnoreMenuShortcuts' | 'focus' | 'sendInputEvent'> & {
    mainFrame: FrameFixture
    focusedFrame: FrameFixture | null
  }
type WindowFixture = EventEmitter & Pick<BrowserWindow, 'isDestroyed' | 'isFocused' | 'isEnabled' | 'close'> & {
  webContents: ContentsFixture
}
type InvokeFixture = { sender: object; senderFrame: object | null }
type KeyboardFixture = Omit<ReturnType<typeof installDesktopShortcuts>, 'attach'> & {
  attach(window: WindowFixture): void
}

function desktopDefaults(binding: ShortcutBinding): ShortcutDefinition['defaults'] {
  return { 'desktop:macos': binding, 'desktop:windows': binding, 'desktop:linux': binding }
}

/** One content surface: URL-carrying frames, focus state, and recorded sends. */
function contents(url: string, name = ''): ContentsFixture {
  const frame: FrameFixture = { url, name, parent: null }
  const surface = Object.assign(new EventEmitter(), {
    mainFrame: frame,
    focusedFrame: frame,
    isDestroyed: () => false,
    isFocused: vi.fn(() => true),
    setIgnoreMenuShortcuts: vi.fn(),
    send: vi.fn(),
    focus: vi.fn(),
    sendInputEvent: vi.fn(),
  })
  return surface
}

function window(surface: ContentsFixture): WindowFixture {
  const win = Object.assign(new EventEmitter(), {
    webContents: surface,
    isDestroyed: () => false,
    isFocused: vi.fn(() => true),
    isEnabled: vi.fn(() => true),
    close: vi.fn(),
  })
  return win
}

async function fixture(platform: 'macos' | 'windows' | 'linux' = 'macos') {
  const root = await mkdtemp(join(tmpdir(), 'qilin-keyboard-'))
  onTestFinished(async () => { await rm(root, { recursive: true, force: true }) })
  const updateMenu = vi.fn()
  const appUrl = 'qilin-app://app/'
  const surface = contents(appUrl)
  const win: WindowFixture = window(surface)
  const installer = installDesktopShortcuts(() => win as unknown as BrowserWindow | undefined, root, platform,
    updateMenu) as KeyboardFixture
  onTestFinished(() => { installer.dispose() })
  const handlers = new Map(ipc.handle.mock.calls.map(([channel, handler]) => [channel, handler]))
  const invoke = async (channel: string, event: InvokeFixture, ...input: unknown[]): Promise<unknown> => {
    const handler = handlers.get(channel)
    if (handler === undefined) throw new Error(`no handler installed for ${channel}`)
    return handler(event, ...input)
  }
  const frameEvent = (): InvokeFixture => ({ sender: surface, senderFrame: surface.mainFrame })
  const definitions: ShortcutDefinition[] = [
    { id: 'page.close' as ShortcutCommandId, defaults: desktopDefaults({ code: 'KeyW', modifiers: ['primary'] }) },
    { id: 'sidebar.toggle' as ShortcutCommandId, defaults: desktopDefaults({ code: 'KeyB', modifiers: ['primary'] }) },
  ]
  return { root, installer, surface, win: win as WindowFixture, updateMenu, invoke, frameEvent, definitions, appUrl }
}

async function configured(platform: 'macos' | 'windows' | 'linux' = 'macos') {
  const h = await fixture(platform)
  h.installer.attach(h.win)
  const snapshot = await h.invoke(DESKTOP_IPC.shortcutsGet, h.frameEvent(), h.definitions) as ShortcutConfigSnapshot
  expect(snapshot.status).toBe('ready')
  return { ...h, snapshot }
}

/** The physical-key members the interception reads; the fixture carries no others. */
interface KeyEvent {
  type: 'keyDown' | 'keyUp'
  code: string
  key: string
  control?: boolean
  alt?: boolean
  shift?: boolean
  meta?: boolean
}

/** One physical key event as Electron reports it to `before-input-event`. */
function key(surface: ContentsFixture, event: KeyEvent): boolean {
  let prevented = false
  const listeners = surface.listeners('before-input-event')
  for (const listener of listeners) {
    (listener as (event: { preventDefault(): void; defaultPrevented: boolean }, input: unknown) => void)(
      { preventDefault: () => { prevented = true }, defaultPrevented: false },
      { isComposing: false, isAutoRepeat: false, modifiers: [], altgr: false, ...event },
    )
  }
  return prevented
}

it('rejects invoke senders outside the owning window and top frame', async () => {
  const h = await fixture()
  const stranger = contents(h.appUrl)
  await expect(h.invoke(DESKTOP_IPC.shortcutsGet, { sender: stranger, senderFrame: stranger.mainFrame }, h.definitions))
    .rejects.toThrow('rejected sender')
  await expect(h.invoke(DESKTOP_IPC.shortcutsGet, { sender: h.surface, senderFrame: null }, h.definitions))
    .rejects.toThrow('rejected sender')
})

it('publishes the snapshot, indexes bindings, and rebuilds the menu on availability', async () => {
  const h = await configured()
  expect(h.updateMenu).toHaveBeenCalled()
  // The changed snapshot reaches the trusted product page after every commit.
  expect(h.surface.send).toHaveBeenCalledWith(DESKTOP_IPC.shortcutsChanged, expect.objectContaining({ status: 'ready' }))
  // The File menu carries the binding and is enabled once definitions exist.
  const menu = h.installer.fileMenu({ fileMenu: 'File', closePage: 'Close Window' })
  expect((menu.submenu as MenuItemConstructorOptions[])[0]).toMatchObject({ label: 'Close Window', enabled: true, accelerator: 'Command+W' })
})

it('intercepts a matching key, forwards it to the page, and passes other keys through', async () => {
  const h = await configured()
  expect(key(h.surface, { type: 'keyDown', code: 'KeyQ', key: 'q' })).toBe(false)
  expect(h.surface.send).not.toHaveBeenCalledWith(DESKTOP_IPC.shortcutsInput, expect.anything())
  expect(key(h.surface, { type: 'keyDown', code: 'KeyB', key: 'b', meta: true })).toBe(true)
  expect(h.surface.send).toHaveBeenCalledWith(DESKTOP_IPC.shortcutsInput, expect.objectContaining({
    kind: 'keyboard', code: 'KeyB', meta: true, repeat: false, frameName: '',
  }))
  // The chord's release must reach the renderer's input handlers, not the menu.
  expect(key(h.surface, { type: 'keyUp', code: 'KeyB', key: 'b', meta: true })).toBe(true)
})

it('completes a two-key chord when both codes match one binding, and releases cleanly', async () => {
  const h = await fixture('windows')
  h.installer.attach(h.win)
  const definitions: ShortcutDefinition[] = [
    {
      id: 'workspace.chord' as ShortcutCommandId,
      // Two-key chords are a scoped-desktop feature: the other profiles declare no default.
      defaults: {
        'desktop:macos': { code: 'KeyB', secondCode: 'KeyY', modifiers: ['control'] },
        'desktop:windows': { code: 'KeyB', secondCode: 'KeyY', modifiers: ['control'] },
      },
    },
  ]
  const snapshot = await h.invoke(DESKTOP_IPC.shortcutsGet, h.frameEvent(), definitions) as ShortcutConfigSnapshot
  expect(snapshot.status).toBe('ready')
  // The first chord key is unregistered alone, so it delivers normally while the
  // installer holds it for the pair read.
  expect(key(h.surface, { type: 'keyDown', code: 'KeyB', key: 'b', control: true })).toBe(false)
  expect(h.surface.send).not.toHaveBeenCalledWith(DESKTOP_IPC.shortcutsInput, expect.anything())
  // The second code completes the pair: one dispatch carries both codes.
  expect(key(h.surface, { type: 'keyDown', code: 'KeyY', key: 'y', control: true })).toBe(true)
  expect(h.surface.send).toHaveBeenLastCalledWith(DESKTOP_IPC.shortcutsInput, expect.objectContaining({
    kind: 'keyboard', code: 'KeyB', secondCode: 'KeyY', control: true,
  }))
  // A completed press cannot seed another chord, and its keyup still reaches the page.
  expect(key(h.surface, { type: 'keyDown', code: 'KeyY', key: 'y', control: true })).toBe(false)
  expect(key(h.surface, { type: 'keyUp', code: 'KeyY', key: 'y', control: true })).toBe(false)
})

it('blocks dispatch while recording and releases the native menu afterwards', async () => {
  const h = await configured()
  await h.invoke(DESKTOP_IPC.shortcutsRecording, h.frameEvent(), true)
  expect(h.surface.setIgnoreMenuShortcuts).toHaveBeenLastCalledWith(true)
  expect(key(h.surface, { type: 'keyDown', code: 'KeyB', key: 'b', meta: true })).toBe(false)
  expect(h.surface.send).not.toHaveBeenCalledWith(DESKTOP_IPC.shortcutsInput, expect.anything())
  await h.invoke(DESKTOP_IPC.shortcutsRecording, h.frameEvent(), false)
  expect(h.surface.setIgnoreMenuShortcuts).toHaveBeenLastCalledWith(false)
  expect(key(h.surface, { type: 'keyDown', code: 'KeyB', key: 'b', meta: true })).toBe(true)
  await expect(h.invoke(DESKTOP_IPC.shortcutsRecording, h.frameEvent(), 'yes')).rejects.toThrow('invalid recording state')
})

it('closes the window only for the accepted revision on a focused enabled window', async () => {
  const h = await configured()
  await h.invoke(DESKTOP_IPC.shortcutsCloseWindow, h.frameEvent(), 'stale-revision')
  expect(h.win.close).not.toHaveBeenCalled()
  await h.invoke(DESKTOP_IPC.shortcutsCloseWindow, h.frameEvent(), h.snapshot.revision)
  expect(h.win.close).toHaveBeenCalledTimes(1)
  // A recording session must not lose the user's take to a close request.
  await h.invoke(DESKTOP_IPC.shortcutsRecording, h.frameEvent(), true)
  await h.invoke(DESKTOP_IPC.shortcutsCloseWindow, h.frameEvent(), h.snapshot.revision)
  expect(h.win.close).toHaveBeenCalledTimes(1)
})

it('drops the catalog and recording state when the main frame navigates away', async () => {
  const h = await configured()
  await h.invoke(DESKTOP_IPC.shortcutsRecording, h.frameEvent(), true)
  h.surface.mainFrame.url = 'https://example.org/other'
  h.surface.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false })
  // The File menu entry is disabled with no accepted catalog behind it.
  const menu = h.installer.fileMenu({ fileMenu: 'File', closePage: 'Close Window' })
  expect((menu.submenu as MenuItemConstructorOptions[])[0]).toMatchObject({ enabled: false })
  expect((menu.submenu as MenuItemConstructorOptions[])[0]).not.toHaveProperty('accelerator')
  // Reinstalling the catalog re-enables it (a fresh product page at the app
  // origin registered again — the navigated-away page's sender would be rejected).
  h.surface.mainFrame.url = h.appUrl
  const snapshot = await h.invoke(DESKTOP_IPC.shortcutsGet, h.frameEvent(), h.definitions) as ShortcutConfigSnapshot
  expect(snapshot.status).toBe('ready')
  const rebuilt = h.installer.fileMenu({ fileMenu: 'File', closePage: 'Close Window' })
  expect((rebuilt.submenu as MenuItemConstructorOptions[])[0]).toMatchObject({ enabled: true, accelerator: 'Command+W' })
})

it('forwards through an embedded frame with the frame name and clears on blur', async () => {
  const h = await configured()
  const embedded: FrameFixture = { url: 'https://example.org/frame', name: 'browser-1', parent: h.surface.mainFrame }
  h.surface.focusedFrame = embedded as unknown as ContentsFixture['focusedFrame']
  expect(key(h.surface, { type: 'keyDown', code: 'KeyB', key: 'b', meta: true })).toBe(true)
  expect(h.surface.send).toHaveBeenLastCalledWith(DESKTOP_IPC.shortcutsInput, expect.objectContaining({
    kind: 'iframe', frameName: 'browser-1',
  }))
  h.win.emit('blur')
  // Held chord state is gone: the next key starts a fresh read and still matches.
  expect(key(h.surface, { type: 'keyDown', code: 'KeyB', key: 'b', meta: true })).toBe(true)
  expect(h.surface.send).toHaveBeenLastCalledWith(DESKTOP_IPC.shortcutsInput, expect.objectContaining({ code: 'KeyB' }))
})

it('removes its IPC handlers on disposal', async () => {
  const h = await fixture()
  h.installer.dispose()
  const channels = ipc.removeHandler.mock.calls.map(([channel]) => channel)
  for (const channel of [DESKTOP_IPC.shortcutsGet, DESKTOP_IPC.shortcutsEdit,
    DESKTOP_IPC.shortcutsRecording, DESKTOP_IPC.shortcutsCloseWindow]) {
    expect(channels).toContain(channel)
  }
})
