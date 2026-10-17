/** Test Peers for the Gateway specs, until client-connection grows the shared Peer (S3 replaces this helper). */
import { randomUUID } from 'node:crypto'
import type { Context } from '@qilin-agent/kylin'
import type { PeerId, PeerScope, Principal } from '@qilin-agent/typert-protocol'

/**
 * The owner Peer of one test Context tree, created on first use.
 * @param ctx - any Context of the tree; the Peer hangs under its root.
 * @returns the tree's shared owner Peer.
 */
export function ownerPeer(ctx: Context): PeerScope {
  let peer = owners.get(ctx.root)
  if (peer === undefined) {
    peer = peerFor(ctx, { kind: 'owner' })
    owners.set(ctx.root, peer)
  }
  return peer
}

const owners = new WeakMap<Context, PeerScope>()

/**
 * A fresh Peer of one principal under the test Context tree.
 * @param ctx - any Context of the tree; the Peer hangs under its root.
 * @param principal - identity the Peer speaks for.
 * @returns an independent Peer.
 */
export function peerFor(ctx: Context, principal: Principal): PeerScope {
  const fiber = ctx.root.plugin(() => {})
  const lifetime = new AbortController()
  return {
    id: randomUUID() as PeerId,
    ctx: fiber.ctx,
    principal,
    signal: lifetime.signal,
    interactions: 'answer',
    dispose: async () => {
      lifetime.abort()
      await fiber.dispose()
    },
  }
}
