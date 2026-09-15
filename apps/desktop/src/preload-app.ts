/** Startup controls for shell documents; application documents receive only the carrier marker. */

import { contextBridge, ipcRenderer } from 'electron'
import { DESKTOP_IPC, type QilinDesktopStartupApi } from './ipc.ts'
import type { DesktopBackendState } from './backend-controller.ts'

const startup: QilinDesktopStartupApi = {
  protocolVersion: 1,
  locale: () => ipcRenderer.invoke(DESKTOP_IPC.localeGet) as ReturnType<QilinDesktopStartupApi['locale']>,
  backend: {
    status: () => ipcRenderer.invoke(DESKTOP_IPC.backendStatus) as ReturnType<QilinDesktopStartupApi['backend']['status']>,
    subscribe(listener: (state: DesktopBackendState) => void) {
      const handle = (_event: Electron.IpcRendererEvent, state: DesktopBackendState): void => { listener(state) }
      ipcRenderer.on(DESKTOP_IPC.backendState, handle)
      return () => { ipcRenderer.off(DESKTOP_IPC.backendState, handle) }
    },
  },
  disablePlugins: () => ipcRenderer.invoke(DESKTOP_IPC.pluginsDisableAll) as Promise<void>,
  restart: () => ipcRenderer.invoke(DESKTOP_IPC.applicationRestart) as Promise<void>,
  resetConfiguration: () => ipcRenderer.invoke(DESKTOP_IPC.configurationReset) as Promise<void>,
}

contextBridge.exposeInMainWorld('qilinDesktop', location.protocol === 'qilin-app:' && location.hostname === 'shell'
  ? startup : { protocolVersion: 1 })
