/** Desktop tray: the Windows notification area and the macOS menu bar, always present as the way back to a hidden window. */

import { join } from 'node:path'
import { Menu, nativeImage, Tray } from 'electron'
import type { DesktopLocale } from './locale.ts'

/** Main-process actions the tray triggers; both run the same paths as the window and application menu. */
export interface DesktopTrayOptions {
  /**
   * Windows: the multi-size ICO rendered by `scripts/render-tray-icon.ts`; the display scale picks
   * the bitmap. macOS: a 16 px PNG whose 32 px `@2x` sibling `nativeImage` pairs automatically.
   */
  readonly iconPath: string
  readonly locale: () => DesktopLocale
  /** Show and focus the primary window. */
  readonly open: () => void
  /** Request quit through the same confirmation as every other quit entry. */
  readonly quit: () => void
}

/** Process facts the tray icon path depends on; passed in so the platform matrix is testable. */
export interface DesktopTrayIconEnvironment {
  readonly platform: NodeJS.Platform
  readonly development: boolean
  /** Application directory (`app.getAppPath()`); a development Windows icon lives under its `resources/`. */
  readonly appPath: string
  /** Packaged resources directory (`process.resourcesPath`). */
  readonly resourcesPath: string
  /** Product root from the loaded manifest; absent when the engine's own product applies. */
  readonly productRoot?: string | undefined
}

/**
 * Icon path for the desktop tray.
 * Windows keeps its multi-size ICO (development: the application's `resources/`, packaged:
 * `resourcesPath`). macOS reuses the product's tray bitmap (16 px `build/tray.png` plus the
 * 32 px `@2x` that `nativeImage` pairs automatically) in development, and
 * `resourcesPath/tray.png` once packaged.
 * @param environment - Platform, build form, app path, resources path, and product root.
 * @returns Absolute icon path for this run.
 */
export function desktopTrayIconPath(environment: DesktopTrayIconEnvironment): string {
  if (environment.platform === 'darwin') {
    return environment.development && environment.productRoot !== undefined
      ? join(environment.productRoot, 'apps', 'desktop', 'build', 'tray.png')
      : join(environment.resourcesPath, 'tray.png')
  }
  return environment.development
    ? join(environment.appPath, 'resources', 'tray-windows.ico')
    : join(environment.resourcesPath, 'tray.ico')
}

/** Tray icon present for the whole run, not only while the window is hidden. */
export class DesktopTray {
  private tray: Tray | undefined

  /** @param options - Icon path, locale reader, and the open and quit actions. */
  constructor(private readonly options: DesktopTrayOptions) {
    const tray = new Tray(nativeImage.createFromPath(options.iconPath))
    this.tray = tray
    tray.on('click', () => { options.open() })
    this.relabel()
  }

  /** Rebuild the tooltip and context menu in the current locale. */
  relabel(): void {
    const tray = this.tray
    if (tray === undefined) return
    const { messages } = this.options.locale()
    tray.setToolTip(messages.aboutProduct)
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: messages.openApplication, click: () => { this.options.open() } },
      { type: 'separator' },
      { label: messages.quitApplication, click: () => { this.options.quit() } },
    ]))
  }

  /** Remove the icon; called once the quit is confirmed so no dead icon outlives the process. */
  dispose(): void {
    const tray = this.tray
    this.tray = undefined
    tray?.destroy()
  }
}
