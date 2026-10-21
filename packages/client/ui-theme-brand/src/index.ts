/**
 * QiLin brand skin, node half: contributes the skin's canvas colors so the
 * pre-plugin index render paints the user's palette before any browser plugin
 * runs. The browser half ships through `exports["./client"]`.
 */

import type { Context } from '@qilin-agent/kylin'
import type {} from '@qilin-agent/client-ui-theme'
import { QILIN_SKIN_BOOT, QILIN_SKIN_ID } from './skin.ts'

/** Required Host services: the boot registry the index render reads. */
export const inject = ['themeBoot']

/**
 * Register the QiLin canvas colors for the pre-plugin interval.
 * @param ctx - Host plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.themeBoot.register(QILIN_SKIN_ID, QILIN_SKIN_BOOT), 'qilin: skin boot colors')
}
