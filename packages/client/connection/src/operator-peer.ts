/**
 * The operator Peer: the one party this Host answers to. Connection owns it
 * for its own lifetime, admits every request as it, and hands it to each
 * Remote call as `invocation.peer`.
 * @module @qilin-agent/client-connection/src/operator-peer
 */

import { randomUUID } from 'node:crypto'
import type { Context } from '@qilin-agent/kylin'
import { createScope, type Scope } from '@qilin-agent/scope'
import type { PeerId, PeerScope, Principal } from '@qilin-agent/typert-protocol'

/**
 * The operator's scope. The instance is its own scope key, so `scopeOf(peer.ctx)`
 * returns it and events dispatched with `scopeTarget(subject, peer)` reach
 * listeners registered through `peer.ctx` and nobody else.
 */
export class OperatorPeer implements PeerScope {
  readonly id: PeerId = randomUUID() as PeerId
  readonly ctx: Context
  /** The deployment's account owner: one account-session runtime admits every connection as the owner. */
  readonly principal: Principal = { kind: 'owner' }
  /** Aborted with the scope, so Remote streams that speak for the operator end with it. */
  readonly signal: AbortSignal
  /** The operator answers forwarded waterfalls and receives every broadcast. */
  readonly interactions = 'answer' as const
  private readonly scope: Scope
  private readonly lifetime = new AbortController()

  /** @param owner - Connection plugin context the scope fiber hangs under. */
  constructor(owner: Context) {
    this.scope = createScope(owner, this)
    this.ctx = this.scope.ctx
    this.signal = this.lifetime.signal
  }

  /** Tear down every connection-lifetime registration; racing calls share one completion. */
  dispose(): Promise<void> {
    this.lifetime.abort()
    return this.scope.dispose()
  }
}
