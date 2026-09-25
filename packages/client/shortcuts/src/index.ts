/** Host configuration for window-local keyboard sequences. */
// Host configuration injection stays with each plugin's validated Config and browser global.
/* jscpd:ignore-start */
import type { Context } from '@qilin/kylin'
import type {} from '@qilin/host-webserver'
import type { Config } from './config.ts'

export { Config } from './config.ts'

/**
 * Embed validated keyboard settings in product pages.
 * @param ctx - Host context serving browser pages.
 * @param config - sequence timing adopted when the page loads.
 */
export function apply(ctx: Context, config: Config): void {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'global', name: '__QILIN_SHORTCUTS_CONFIG__', value: config })
  })
}
/* jscpd:ignore-end */
