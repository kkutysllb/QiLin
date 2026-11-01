/** Hold a spawned child's first step until its parent finishes the current turn. */
import type { Context } from '@qilin-agent/kylin'

export const name = 'hold-child-until-parent-turn'

/** Order the parent's turn boundary before the child's first proposal without elapsed-time assumptions. */
export function apply(ctx: Context): void {
  const parentClosed = Promise.withResolvers<undefined>()
  ctx.effect(() => () => { parentClosed.resolve(undefined) })
  ctx.on('session/event', (session, event) => {
    if (session.header.parentSession === undefined && event.type === 'turn/end') parentClosed.resolve(undefined)
  })
  ctx.on('agent/pre-step', async ({ agent }, next) => {
    if (agent.session.header.parentSession !== undefined) await parentClosed.promise
    return next()
  })
}
