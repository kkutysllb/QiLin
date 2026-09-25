/** Shared developer-tool preference stored by the Host user-settings document. */

import z from '@qilin/schemastery'

/** Namespace for developer UI and HTML preview capabilities. */
export const DEVELOPER_TOOLS_NAMESPACE = 'ui-settings'

/** Persisted developer-tool choice. */
export interface DeveloperToolsSettings {
  /** Enable diagnostic views, preset selection, change summaries and scripted HTML previews. */
  enabled: boolean
}

/** New installations and missing values enable the full interface. */
export const DeveloperToolsSettingsFields = {
  enabled: z.boolean().default(true),
}

/** Durable developer-tools schema; also the wire envelope the browser scope validates against. */
export const DeveloperToolsSettingsSchema: z<DeveloperToolsSettings> = z.object({
  enabled: DeveloperToolsSettingsFields['enabled'],
})
