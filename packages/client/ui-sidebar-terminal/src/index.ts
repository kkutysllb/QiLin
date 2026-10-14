/** Host companion for the interactive terminal Client plugin. */

import type { Context } from '@qilin-agent/kylin'

/**
 * No Host registration: the terminal font role lives in the theme section
 * (`ui-theme`), migrated once from this plugin's retired namespace by the
 * Client plugin.
 * @param ctx - Host context.
 */
export function apply(ctx: Context): void {
  void ctx
}
