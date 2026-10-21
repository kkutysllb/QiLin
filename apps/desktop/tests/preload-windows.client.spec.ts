// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { DESKTOP_IPC } from '../src/ipc.ts'
import { syncWindowsAppearance } from '../src/preload-windows.ts'

const send = vi.hoisted(() => vi.fn())
vi.mock('electron', () => ({ ipcRenderer: { send } }))
vi.mock('../src/preload-menu.ts', () => ({ installWindowsMenu: () => ({ update: vi.fn(), dispose: vi.fn() }) }))

afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  document.documentElement.removeAttribute('data-windows-titlebar')
  document.documentElement.style.removeProperty('--dsh-windows-titlebar-height')
  document.documentElement.lang = 'en'
  document.body.removeAttribute('data-ds-dark-theme')
  vi.restoreAllMocks()
  send.mockClear()
})

it.each(['darwin', 'linux'] as const)('does not install Windows controls on %s', (platform) => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue(platform)
  syncWindowsAppearance()
  expect(document.documentElement.hasAttribute('data-windows-titlebar')).toBe(false)
  expect(send).not.toHaveBeenCalled()
})

it('synchronizes live language and palette changes and stops observing a closed document', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  vi.spyOn(document, 'readyState', 'get').mockReturnValue('loading')
  vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(() => ({
    backgroundColor: document.body.hasAttribute('data-ds-dark-theme') ? 'oklch(0.2 0 0)' : 'hsl(0 0% 100%)',
    color: 'black',
  }) as CSSStyleDeclaration)
  const context = {
    fillStyle: '', clearRect: vi.fn(), fillRect: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray(context.fillStyle === 'black'
      ? [0, 0, 0, 255] : context.fillStyle.startsWith('oklch') ? [27, 27, 28, 255] : [255, 255, 255, 255]) }),
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  document.documentElement.lang = 'en'
  syncWindowsAppearance()
  expect(send).not.toHaveBeenCalled()
  expect(document.documentElement.hasAttribute('data-windows-titlebar')).toBe(true)
  window.dispatchEvent(new Event('DOMContentLoaded'))
  expect(document.documentElement.style.getPropertyValue('--dsh-windows-titlebar-height')).toBe('40px')
  expect(send).toHaveBeenLastCalledWith(DESKTOP_IPC.windowsAppearance, 'en', 'rgba(255, 255, 255, 1)', 'rgba(0, 0, 0, 1)')
  document.documentElement.lang = 'zh-CN'
  document.body.setAttribute('data-ds-dark-theme', '')
  await vi.waitFor(() => { expect(send).toHaveBeenLastCalledWith(DESKTOP_IPC.windowsAppearance, 'zh-CN', 'rgba(27, 27, 28, 1)', 'rgba(0, 0, 0, 1)') })
  window.dispatchEvent(new Event('pagehide'))
  send.mockClear()
  document.documentElement.lang = 'en'
  await new Promise<void>((resolve) => { queueMicrotask(resolve) })
  expect(send).not.toHaveBeenCalled()
})

it('samples the settings surface while a settings overlay is mounted', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('win32')
  vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(element => ({
    backgroundColor: (element as HTMLElement | undefined)?.dataset?.desktopCaptionProbe === 'settings'
      ? 'rgb(34, 34, 34)' : 'rgb(10, 16, 14)',
    color: 'rgb(233, 234, 237)',
  }) as unknown as CSSStyleDeclaration)
  const context = {
    fillStyle: '', clearRect: vi.fn(), fillRect: vi.fn(),
    getImageData: () => {
      const match = /rgb\((\d+), (\d+), (\d+)\)/u.exec(context.fillStyle)
      const channels = match === null ? [255, 255, 255] : [Number(match[1]), Number(match[2]), Number(match[3])]
      return { data: new Uint8ClampedArray([...channels, 255]) }
    },
  }
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D)
  syncWindowsAppearance()
  window.dispatchEvent(new Event('DOMContentLoaded'))
  expect(send).toHaveBeenLastCalledWith(DESKTOP_IPC.windowsAppearance, 'en', 'rgba(10, 16, 14, 1)', 'rgba(233, 234, 237, 1)')
  const overlay = document.createElement('div')
  overlay.innerHTML = "<div data-shortcut-modal='settings'><div class='panel'></div></div>"
  document.body.append(overlay)
  await vi.waitFor(() => { expect(send).toHaveBeenLastCalledWith(DESKTOP_IPC.windowsAppearance, 'en', 'rgba(34, 34, 34, 1)', 'rgba(233, 234, 237, 1)') })
  overlay.remove()
  await vi.waitFor(() => { expect(send).toHaveBeenLastCalledWith(DESKTOP_IPC.windowsAppearance, 'en', 'rgba(10, 16, 14, 1)', 'rgba(233, 234, 237, 1)') })
})
