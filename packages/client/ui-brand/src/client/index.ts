/** QiLin occupants for the generic sidebar and conversation brand slots. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@qilin/client-ui-conversation/client'
import type {} from '@qilin/client-ui-renderer/client'
import type {} from '@qilin/client-ui-sidebar/client'
import { QilinSealHeroMark, QilinSealMark } from './Seal.tsx'

/** Required service: the UI slot registry. */
export const inject = ['slots']

/**
 * Fill the sidebar and hero brand-mark slots as one declaration-aware
 * registration set. The sidebar brand name keeps the shell's own fallback, so
 * the QiLin label and its build badge stay owned by the shell.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('conversation.hero.brand.mark', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, QilinSealMark)
      yield ctx.slots.register({ name: 'conversation.hero.brand.mark' }, QilinSealHeroMark)
    }))
}
