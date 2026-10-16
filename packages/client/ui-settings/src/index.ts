/** Host registration of shared Web and desktop developer-tool preferences. */
import type {} from '@qilin-agent/settings'

import type { Volatile, Context } from '@qilin-agent/kylin'

import z from '@qilin-agent/schemastery'
import { DeveloperToolsSettingsFields } from './developer-tools-settings.ts'

export { DEVELOPER_TOOLS_NAMESPACE, type DeveloperToolsSettings } from './developer-tools-settings.ts'

/** Runtime preferences projected to the browser. */
export interface Config {
  /** Whether developer tools are enabled. */
  enabled: Volatile<boolean>
}

/** Live preferences projected to the browser. */
export const Config = z.object({
  enabled: DeveloperToolsSettingsFields['enabled'].volatile(),
})

/** Host preferences are consumed through the configuration form projection.
 * @param ctx Plugin context used for optional settings presentation.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (child) => { child.effect(() => child.settings.configure({ auto: false }, ctx.fiber)) })
}
