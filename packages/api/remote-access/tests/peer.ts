/** Test Peers for the access specs, until client-connection grows the shared Peer (S3 replaces this helper). */
import { randomUUID } from 'node:crypto'
import type { Context } from '@qilin-agent/kylin'
import type { PeerId, PeerScope, Principal } from '@qilin-agent/typert-protocol'

/**
 * The owner Peer of one test Context tree, created on first use.
 * @param ctx - any Context of the tree; the Peer hangs under its root.
 * @returns the tree's shared owner Peer.
 */
export function ownerPeer(ctx: Context): PeerScope {
  return peerFor(ctx, { kind: 'owner' })
}

/**
 * A fresh Peer of one principal under the test Context tree.
 * @param ctx - any Context of the tree; the Peer hangs under its root.
 * @param principal - identity the Peer speaks for.
 * @returns an independent Peer.
 */
export function peerFor(ctx: Context, principal: Principal): PeerScope {
  const fiber = ctx.root.plugin(() => {})
  const signal = new AbortController()
  return {
    id: randomUUID() as PeerId,
    ctx: fiber.ctx,
    principal,
    signal: signal.signal,
    interactions: 'answer',
    dispose: async () => {
      signal.abort()
      await fiber.dispose()
    },
  }
}
