/** Host registration for browser conversation preferences. */

import type { Context } from '@qilin/kylin'
import type {} from '@qilin/settings'
import { CONVERSATION_SETTINGS_NAMESPACE, ConversationSettingsSchema } from './conversation-settings.ts'

export {
  BUSY_ENTER_BEHAVIORS, BUSY_ENTER_FIELD, CONVERSATION_SETTINGS_NAMESPACE,
  CONTENT_WIDTH_ADAPTIVE, CONTENT_WIDTH_FIELD, CONTENT_WIDTH_MAX, CONTENT_WIDTH_MIN,
  CONTENT_WIDTH_STEP, DEFAULT_BUSY_ENTER_BEHAVIOR, DEFAULT_CONTENT_WIDTH,
  type BusyEnterBehavior, type ConversationSettings,
} from './conversation-settings.ts'

/**
 * Register the durable conversation section when a settings provider exists.
 * @param ctx - Host context whose optional settings service owns the section.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      CONVERSATION_SETTINGS_NAMESPACE,
      ConversationSettingsSchema,
    )
  })
}
