/** Color packs for the Web client theme: every shipped pack registers as one selectable skin. */

import type { Context as ClientContext } from '@qilin-agent/kylin'
import type {} from '@qilin-agent/client-ui-theme/client'
import { SKIN_PACKS } from '../skin.ts'

/** Required service: the theme registry and its skin registry. */
export const inject = ['theme']

/**
 * Register every shipped color pack as a selectable skin. Light/dark selection
 * stays the user's; a skin only replaces the alias tokens it names. Registration
 * is an effect, so unloading the plugin removes every skin and restores the
 * platform palette while the durable selection survives for a later load.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  for (const pack of SKIN_PACKS) {
    ctx.effect(() => ctx.theme.registerSkin({
      id: pack.id, label: pack.label, tokens: pack.tokens,
    }), `ui-theme-brand: ${pack.id} skin`)
  }
}
