/**
 * Loader fixture that creates the driven agent under a stored Session identity.
 * @module fresh-agent
 */

import type { Context } from '@qilin-agent/kylin'
import type { SessionId } from '@qilin-agent/session'

/** Fixture plugin name. */
export const name = 'fresh-agent'

/**
 * Services that must exist before the fixture creates its agent: the registry
 * itself and the persistence backend that owns the session log.
 */
export const inject = ['agents', 'sessionPersistence']

/**
 * Create the one driven root agent, stored under a fixed session identity so
 * its log is durable before the fixture turn starts.
 * @param ctx - settled agent and persistence services from the Loader tree.
 * @returns after the created agent is published.
 */
export async function apply(ctx: Context): Promise<void> {
  const handle = await ctx.agents.create({
    sessionId: 'main-session' as SessionId,
    meta: { cwd: process.cwd() },
    agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
  })
  ctx.effect(() => () => handle.dispose(), 'fresh-agent.handle')
}
