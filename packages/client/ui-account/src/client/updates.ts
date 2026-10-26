/** Desktop update presentation bridge: desktop-shell-only, absent in the browser. */
import type { HostObservable } from '@qilin-agent/client-ui-slots'

/** Semantic update state the desktop shell publishes (apps/desktop ipc). */
export interface UpdatesPresentation {
  phase: 'idle' | 'checking' | 'available' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'error'
  version?: string
  percent?: number
  failure?: string
}

/**
 * The desktop shell's update surface exposed on the window (preload-app). The
 * 3.1.7 shell publishes the subscription as `subscribe`; shells before that
 * rename spelled it `onPresentation` over the same IPC channel, so both shapes
 * are accepted. Every member is validated before use: the indicator is
 * cosmetic, and a shell whose surface drifted must hide it instead of throwing
 * during apply — a failed entry aborts the whole web boot.
 */
interface DesktopUpdatesApi {
  status(): Promise<UpdatesPresentation>
  open(): Promise<void>
  subscribe?(listener: (presentation: UpdatesPresentation) => void): () => void
  onPresentation?(listener: (presentation: UpdatesPresentation) => void): () => void
}

/** Whether a runtime value can be called (the contextBridge surface is untyped). */
function isCallable(value: unknown): boolean {
  return typeof value === 'function'
}

/**
 * Read the desktop shell's update surface, or undefined outside the desktop
 * shell and for a shell that lacks a member this plugin drives.
 */
export function readDesktopUpdates(): DesktopUpdatesApi | undefined {
  if (typeof window === 'undefined') return undefined
  const api = (window as unknown as { qilinDesktop?: { updates?: DesktopUpdatesApi } }).qilinDesktop?.updates
  if (api === undefined) return undefined
  if (!isCallable(api.status) || !isCallable(api.open)) return undefined
  if (!isCallable(api.subscribe) && !isCallable(api.onPresentation)) return undefined
  return api
}

const IDLE: UpdatesPresentation = { phase: 'idle' }

/**
 * Wrap the desktop shell's update surface as a host observable the sidebar
 * footer can render, or undefined when no usable surface is present. The shell
 * owns the underlying subscription; the page never unsubscribes it.
 */
export function createUpdatesSource(api: DesktopUpdatesApi | undefined): HostObservable<UpdatesPresentation> | undefined {
  if (api === undefined) return undefined
  const subscribe = api.subscribe ?? api.onPresentation
  if (subscribe === undefined) return undefined
  let current = IDLE
  const listeners = new Set<() => void>()
  const publish = (next: UpdatesPresentation): void => {
    current = next
    for (const listener of listeners) listener()
  }
  subscribe(publish)
  void api.status().then(publish).catch(() => { /* keep the last known state */ })
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

/** The presentation a browser deployment always sees. */
export const UPDATES_ABSENT: UpdatesPresentation = { phase: 'idle' }
