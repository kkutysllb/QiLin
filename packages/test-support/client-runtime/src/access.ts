/**
 * Allow-all access for client specs. Production pages receive the
 * `remoteAccess` Client service, the global-resource `useRemoteAccess` Hook
 * from the remote-access Client plugin, the Session list `useSessionAccess`
 * Hook from the session Client plugin, and the bound Session's `useAccess`
 * Hook as a standard prop. Hand-built component props spread
 * {@link allowAllAccess}; a spec of a refused path overrides the Hook.
 * @module @qilin-agent/client-test-runtime/src/access
 */

import { Service, type Context } from '@qilin-agent/kylin'
import type { AccessEffect, ClientRemoteAccess, RemoteEndpoint } from '@qilin-agent/api-remote-access/client/types'
import type {
  GlobalStandardProps, HostObservable, SessionStandardProps,
} from '@qilin-agent/client-ui-slots'
import type { TypertResourceKind } from '@qilin-agent/typert-protocol'

/**
 * The access Hooks a root- or session-scoped Slot component receives: the two
 * GlobalStandardProps Hooks plus the SessionStandardProps `useAccess`, whose
 * `boolean` result also satisfies the `session-maybe` seat's
 * `boolean | undefined` result.
 */
export type AccessStandardProps =
  & Pick<GlobalStandardProps, 'useRemoteAccess' | 'useSessionAccess'>
  & Pick<SessionStandardProps, 'useAccess'>

/** Access Hooks that allow every action on every resource, for hand-built component props. */
export const allowAllAccess: AccessStandardProps = {
  useRemoteAccess: () => true,
  useSessionAccess: () => true,
  useAccess: () => true,
}

const ALLOWED: HostObservable<boolean> = { getSnapshot: () => true, subscribe: () => () => {} }
const REFUSED: HostObservable<boolean> = { getSnapshot: () => false, subscribe: () => () => {} }

/**
 * A `remoteAccess` Client service whose answers never change: `allows`
 * decides each action on every resource once. `whenAccess` installs an
 * allowed action's effects in the caller's fiber at once and never installs a
 * refused action's effects.
 */
export class StaticRemoteAccess extends Service implements ClientRemoteAccess {
  /**
   * @param ctx - Context the service is provided on.
   * @param allows - the fixed answer for each action; allows everything when omitted.
   */
  constructor(ctx: Context, private readonly allows: (action: string) => boolean = () => true) {
    super(ctx, 'remoteAccess')
  }

  source(_kind: TypertResourceKind, _id: string, action: string): HostObservable<boolean> {
    return this.allows(action) ? ALLOWED : REFUSED
  }

  // Prototype methods: the Cordis service proxy binds `this.ctx` to the caller's Context.
  whenAccess(action: RemoteEndpoint, callback: () => AccessEffect): () => void {
    if (!this.allows(action)) return () => {}
    const dispose = this.ctx.effect(callback, `remoteAccess.whenAccess(${JSON.stringify(action)})`)
    return () => { void dispose() }
  }

  whenResourceAccess(_kind: TypertResourceKind, _id: string, action: RemoteEndpoint, callback: () => AccessEffect): () => void {
    return this.whenAccess(action, callback)
  }
}
