/** Typed preload operations exposed only by the Electron shell. */

import type { DesktopPluginRecord } from './project-manager.ts'
import type { DesktopLocale } from './locale.ts'

/** IPC channel names kept private to the desktop application bundle. */
export const DESKTOP_IPC = {
  localeGet: 'qilin-desktop:locale-get',
  pluginsList: 'qilin-desktop:plugins-list',
  pluginsAdd: 'qilin-desktop:plugins-add',
  pluginsRemove: 'qilin-desktop:plugins-remove',
  pluginsUpdate: 'qilin-desktop:plugins-update',
  updatesCheck: 'qilin-desktop:updates-check',
  updatesInstall: 'qilin-desktop:updates-install',
  updatesState: 'qilin-desktop:updates-state',
} as const

/** Desktop release update state rendered by desktop-owned UI. */
export interface DesktopUpdateState {
  readonly phase: 'idle' | 'checking' | 'available' | 'installing' | 'ready' | 'error'
  readonly version?: string
  readonly message?: string
}

/** Narrow bridge exposed through context isolation. */
export interface QilinDesktopApi {
  readonly protocolVersion: 1
  locale(): Promise<DesktopLocale>
  readonly plugins: {
    list(): Promise<readonly DesktopPluginRecord[]>
    add(spec: string): Promise<void>
    remove(name: string): Promise<void>
    update(name: string, version: string): Promise<void>
  }
  readonly updates: {
    check(): Promise<DesktopUpdateState>
    install(): Promise<void>
    subscribe(listener: (state: DesktopUpdateState) => void): () => void
  }
}
