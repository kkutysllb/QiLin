/**
 * Browser half: open what the model asked to see in the Session's own Sidebar.
 *
 * The requests arrive as a Host Remote stream (`ctx.remote.sidebarOpens.watch`)
 * for the Session the user is viewing, so the plugin watches the current Session
 * and re-subscribes when the view switches. Delivery is transient by design: the
 * Host consumes a request on send and drops it, so nothing here replays an open
 * the user already saw — and nothing here is durable, which is why this package
 * owns no store, no slot, and no copy.
 *
 * A page opens in the built-in browser when that tab type is composed and in a
 * new browser tab otherwise. A file opens through its resource address, because
 * which tab type claims an address is the Sidebar's decision, not this
 * dispatcher's.
 */
import type { Context } from '@qilin-agent/kylin'
import type {} from '@qilin-agent/api-remotes/client'
import type {} from '@qilin-agent/client-ui-renderer/client'
import type {} from '@qilin-agent/client-ui-session/client'
import type {} from '@qilin-agent/client-ui-sidebar-right/client'
// Type-only: the browser tab type's own parameter declaration, so a page opens
// with its address rather than through a bare kind.
import type {} from '@qilin-agent/client-ui-sidebar-browser/client'
import type {} from '@qilin-agent/sidebar-opens/remote'
import type { SidebarOpenRequest } from '@qilin-agent/sidebar-opens/types'
import { fileAddressFor } from '@qilin-agent/util-workspace-path'
import type { SessionId } from '@qilin-agent/session/types'

/** Required browser services: the Remote carrier, the Sidebar's tabs, and the viewed Session. */
export const inject = ['remote', 'sidebarRight', 'sidebarRightTabs', 'sessions', 'uiSession']

/**
 * Client plugin body: follow the viewed Session's open requests and dispatch them.
 * @param ctx - client root context carrying the Remote carrier and the Sidebar face.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => {
    const current = ctx.uiSession.adapter.current
    let stop: (() => void) | undefined
    const sync = (): void => {
      stop?.()
      stop = undefined
      const sessionId = current.getSnapshot().key as SessionId | undefined
      if (sessionId === undefined) return
      const controller = new AbortController()
      stop = () => { controller.abort() }
      void (async () => {
        try {
          for await (const request of ctx.remote.sidebarOpens.watch(sessionId, controller.signal)) {
            if (controller.signal.aborted) return
            openRequested(ctx, sessionId, request)
          }
        } catch (error) {
          // A carrier failure ends the watch; the next Session switch asks again.
          // Logged rather than swallowed: an unmounted Remote namespace fails here,
          // and a silent end leaves every `sidebar_open` queued with no viewer.
          console.error('[ui-agent-opens] sidebarOpens.watch ended', error)
        }
      })()
    }
    const unsubscribe = current.subscribe(sync)
    sync()
    return () => { unsubscribe(); stop?.() }
  }, 'ui-agent-opens: model open requests')
}

/**
 * Open one request in the Session's Sidebar.
 * @param ctx - client root context.
 * @param sessionId - the Session whose Sidebar the request targets.
 * @param request - the resolved request.
 */
function openRequested(ctx: Context, sessionId: SessionId, request: SidebarOpenRequest): void {
  if (request.kind === 'url') {
    if (ctx.sidebarRightTabs.get('browser') !== undefined) {
      ctx.sidebarRight.openTab('browser', { params: { url: request.target } })
    } else {
      window.open(request.target, '_blank', 'noopener,noreferrer')
    }
    return
  }
  const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd
  ctx.sidebarRight.openResource(fileAddressFor(sessionId, cwd, request.target))
}
