/** Host registration for browser conversation preferences. */
import type {} from '@qilin-agent/settings'

import type { Volatile, Context } from '@qilin-agent/kylin'
import type { BusyEnterBehavior } from './conversation-settings.ts'
import z from '@qilin-agent/schemastery'
import { BUSY_ENTER_FIELD } from './conversation-settings.ts'

import { ConversationSettingsFields } from './conversation-settings.ts'

export {
  BUSY_ENTER_BEHAVIORS, BUSY_ENTER_FIELD, CONVERSATION_SETTINGS_NAMESPACE,
  CONTENT_WIDTH_ADAPTIVE, CONTENT_WIDTH_FIELD, CONTENT_WIDTH_MAX, CONTENT_WIDTH_MIN,
  CONTENT_WIDTH_STEP, DEFAULT_BUSY_ENTER_BEHAVIOR, DEFAULT_CONTENT_WIDTH,
  type BusyEnterBehavior, type ConversationSettings,
} from './conversation-settings.ts'

/** Runtime preferences projected to the browser. */
export interface Config {
  /** Enter key behavior while a turn is running. */
  busyEnter: Volatile<BusyEnterBehavior>
}

/** Live preferences projected to the browser. */
export const Config = z.object({
  [BUSY_ENTER_FIELD]: ConversationSettingsFields[BUSY_ENTER_FIELD].volatile(),
})

/** Host preferences are consumed through the configuration form projection.
 * @param ctx Plugin context used for optional settings presentation.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}
