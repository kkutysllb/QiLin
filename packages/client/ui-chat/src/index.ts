/** Host registration for browser Chat preferences. */

import type { Context } from '@qilin/kylin'
import type {} from '@qilin/settings'
import { CHAT_SETTINGS_NAMESPACE, ChatSettingsSchema } from './chat-settings.ts'

export {
  CHAT_SETTINGS_NAMESPACE, ChatSettingsFields, DEFAULT_LINK_OPENING, DEFAULT_PERFORMANCE_USAGE,
  DEFAULT_TRANSCRIPT_VIEW_MODE, LEGACY_EXPANDED_TRANSCRIPT_VIEW_MODE, LEGACY_TRANSCRIPT_VIEW_MODE,
  PERFORMANCE_USAGE_MODES, TRANSCRIPT_VIEW_FIELD, TRANSCRIPT_VIEW_MODES,
  type ChatSettings, type LinkOpening, type PerformanceUsageMode, type TranscriptViewMode,
} from './chat-settings.ts'

/** Register the durable Chat settings section when a provider exists. */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(
      CHAT_SETTINGS_NAMESPACE,
      ChatSettingsSchema,
    )
  })
}
