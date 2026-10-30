/** Native launch splash: a presentational window shown while the Host boots. */

import { join } from 'node:path'
import { app, BrowserWindow, type BrowserWindowConstructorOptions } from 'electron'

/**
 * Resolve the frameless splash window's native material.
 * @param platform - operating system hosting Electron.
 * @returns fixed-size sandboxed window options without a preload or title bar.
 */
export function splashWindowOptions(platform: NodeJS.Platform): BrowserWindowConstructorOptions {
  return {
    width: 360,
    height: 360,
    useContentSize: true,
    center: true,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    show: false,
    backgroundColor: platform === 'linux' ? '#FFFFFF' : '#00000000',
    ...(platform === 'darwin' ? {
      vibrancy: 'menu',
      visualEffectState: 'active',
    } as const : {}),
    ...(platform === 'win32' ? {
      backgroundMaterial: 'acrylic',
    } as const : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  }
}

let active: BrowserWindow | undefined

/**
 * Open the process's sole splash window; a repeated open focuses the existing one.
 * @returns the opened window, already loading its document; a failed document load
 * destroys it before rejecting.
 */
export async function openSplashWindow(): Promise<BrowserWindow> {
  if (active !== undefined && !active.isDestroyed()) {
    active.focus()
    return active
  }
  const window = new BrowserWindow(splashWindowOptions(process.platform))
  active = window
  window.once('closed', () => {
    if (active === window) active = undefined
  })
  window.once('ready-to-show', () => {
    if (active === window && !window.isDestroyed()) window.show()
  })
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  window.webContents.on('will-navigate', (event) => { event.preventDefault() })
  try {
    await window.loadFile(join(app.getAppPath(), 'renderer', 'splash.html'))
  } catch (error) {
    if (active === window) active = undefined
    if (!window.isDestroyed()) window.destroy()
    throw error
  }
  return window
}

/**
 * Close the splash wherever the launch reached a real surface or the process is
 * leaving. Repeated calls, and calls before the first open, do nothing.
 */
export function closeSplashWindow(): void {
  const window = active
  active = undefined
  if (window !== undefined && !window.isDestroyed()) window.destroy()
}
