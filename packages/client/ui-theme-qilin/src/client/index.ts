/** QiLin brand color layer for the Web client theme. */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-theme/client'
import { QILIN_THEME_SOURCE, QILIN_TOKENS } from './tokens.ts'

/** Required service: the theme registry and override stack. */
export const inject = ['theme']

/**
 * Stack the QiLin brand layer over whatever palette the user selected. The
 * layer is an effect, so unloading the plugin restores the covered tokens.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.theme.overrideTokens(QILIN_THEME_SOURCE, QILIN_TOKENS), 'qilin: brand tokens')
}
