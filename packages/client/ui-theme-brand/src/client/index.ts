/** QiLin brand color skin for the Web client theme. */

import type { Context as ClientContext } from '@qilin-agent/kylin'
import type {} from '@qilin-agent/client-ui-theme/client'
import { QILIN_SKIN_ID, QILIN_SKIN_LABEL, QILIN_TOKENS } from './tokens.ts'

/** Required service: the theme registry and its skin registry. */
export const inject = ['theme']

/**
 * Register the QiLin palette as one selectable skin. Light/dark selection stays
 * the user's; the skin only replaces QiLin-owned alias tokens. Registration is
 * an effect, so unloading the plugin removes the skin and restores the platform
 * palette while the durable selection survives for a later load.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.theme.registerSkin({
    id: QILIN_SKIN_ID, label: QILIN_SKIN_LABEL, tokens: QILIN_TOKENS,
  }), 'qilin: brand skin')
}
