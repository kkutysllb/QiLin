/**
 * Color packs, node half: contributes each pack's canvas colors so the
 * pre-plugin index render paints the user's palette before any browser plugin
 * runs. The browser half ships through `exports["./client"]`.
 */

import type { Context } from '@qilin-agent/kylin'
import type {} from '@qilin-agent/client-ui-theme'
import { SKIN_PACKS } from './skin.ts'

/** Required Host services: the boot registry the index render reads. */
export const inject = ['themeBoot']

/**
 * Register every shipped pack's canvas colors for the pre-plugin interval.
 * @param ctx - Host plugin context.
 */
export function apply(ctx: Context): void {
  for (const pack of SKIN_PACKS) {
    ctx.effect(() => ctx.themeBoot.register(pack.id, pack.boot), `ui-theme-brand: ${pack.id} boot colors`)
  }
}
