/** Host registration for the shared developer-tool preference. */

import type { Context } from '@qilin/kylin'
import type {} from '@qilin/settings'
import { DEVELOPER_TOOLS_NAMESPACE, DeveloperToolsSettingsSchema } from './developer-tools-settings.ts'

export { DEVELOPER_TOOLS_NAMESPACE, type DeveloperToolsSettings } from './developer-tools-settings.ts'

/** Register the durable developer-tools section when a provider exists. */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.settings.register(DEVELOPER_TOOLS_NAMESPACE, DeveloperToolsSettingsSchema)
  })
}
