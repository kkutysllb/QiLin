/** Desktop update presentation bridge: desktop-shell-only, absent in the browser. */
import type { HostObservable } from '@qilin-agent/client-ui-slots'

/** Semantic update state the desktop shell publishes (apps/desktop ipc). */
export interface UpdatesPresentation {
  phase: 'idle' | 'checking' | 'available' | 'downloading' | 'verifying' | 'installing' | 'ready' | 'error'
  version?: string
  percent?: number
  failure?: string
}

/** The desktop shell's update surface exposed on the window (preload-app). */
interface DesktopUpdatesApi {
  status(): Promise<UpdatesPresentation>
  open(): Promise<void>
  onPresentation(listener: (presentation: UpdatesPresentation) => void): () => void
}

/** Read the desktop shell's update surface, or undefined outside the desktop shell. */
export function readDesktopUpdates(): DesktopUpdatesApi | undefined {
  if (typeof window === 'undefined') return undefined
  const api = (window as unknown as { qilinDesktop?: { updates?: DesktopUpdatesApi } }).qilinDesktop?.updates
  return api ?? undefined
}

const IDLE: UpdatesPresentation = { phase: 'idle' }

/**
 * Wrap the desktop shell's update surface as a host observable the sidebar
 * footer can render, or undefined outside the desktop shell. The shell owns
 * the underlying subscription; the page never unsubscribes it.
 */
export function createUpdatesSource(api: DesktopUpdatesApi | undefined): HostObservable<UpdatesPresentation> | undefined {
  if (api === undefined) return undefined
  let current = IDLE
  const listeners = new Set<() => void>()
  const publish = (next: UpdatesPresentation): void => {
    current = next
    for (const listener of listeners) listener()
  }
  api.onPresentation(publish)
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
