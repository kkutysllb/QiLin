/** Synchronous reader for one Session projection, as the panel consumes it. */

import type { Context } from '@qilin-agent/kylin'
import type { Session } from '@qilin-agent/session'
import type { SessionProjectionStateMap } from '@qilin-agent/session-projection/types'
import type { ForgeWorktreeState } from './types.ts'

declare module '@qilin-agent/session-projection/types' {
  interface SessionProjectionStateMap {
    /** Per-Session worktree the panel created, its creation phase, and its checkout state. */
    forgeWorktree: ForgeWorktreeState
  }
}

/** Reads one projection's current state for a Session and unregisters it on disposal. */
export interface ProjectionReader<S> {
  /**
   * @param session - Session whose projected state is read.
   * @returns the projection's current state for that Session.
   */
  stateOf(session: Session): S
  /** Unregister the projection this reader was bound to. */
  dispose(): void
}

/**
 * Bind a projection read and its unregistration to the registry service.
 * The registry publishes the state read at service level while registration returns its disposer,
 * so the reader carries the key and keeps the panel's per-Session read contract.
 * @param ctx - context that injected `sessionProjections`.
 * @param key - registered projection key.
 * @param unregister - disposer returned by `sessionProjections.register()`.
 * @returns the reader the panel stores.
 */
export function projectionReader<S>(ctx: Context, key: keyof SessionProjectionStateMap, unregister: () => void): ProjectionReader<S> {
  return { stateOf: session => ctx.sessionProjections.stateOf(session, key) as S, dispose: unregister }
}
