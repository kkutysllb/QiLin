/** Host companion for the interactive terminal Client plugin. */
import type { Context } from '@qilin/kylin'
import type {} from '@qilin/settings'
import { TERMINAL_SETTINGS_NAMESPACE, TerminalSettingsSchema } from './terminal-settings.ts'

export {
  DEFAULT_TERMINAL_FONT_SIZE, TERMINAL_FONT_SIZE_MAX, TERMINAL_FONT_SIZE_MIN, TERMINAL_SETTINGS_NAMESPACE,
  TerminalSettingsSchema,
  type TerminalSettings,
} from './terminal-settings.ts'

/**
 * Register the durable terminal section when a settings provider exists.
 * @param ctx - Host context; the settings service arrives through `inject`.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(TERMINAL_SETTINGS_NAMESPACE, TerminalSettingsSchema)
  })
}
