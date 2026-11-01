/** Host-owned opt-in setting for model-selectable subagent delegation. */
import type { Volatile } from '@qilin-agent/kylin'

import { Context, Service } from '@qilin-agent/kylin'
import z from '@qilin-agent/schemastery'
import {
  AllowedModelRouteSchema,
  assertAllowedModelRoutes,
  type AllowedModelRoute,
} from './model-selection.ts'

declare module '@qilin-agent/kylin' {
  interface Context {
    /** User preference sampled when a new Session receives delegation tools. */
    subagentModelSelection: SubagentModelSelectionConfig
  }
}

/** Stored user preference; the shipped composition defaults it off. */
export interface SubagentModelSelectionSettings {
  /** Whether newly composed top-level Sessions receive model selection. */
  enabled: boolean
  /** Exact child LLM routes offered to newly composed top-level Sessions. */
  allowedModels: AllowedModelRoute[]
  /**
   * Route every delegation starts on when its call names none. Absent leaves the
   * child route to the provider's advertised default and the deployment's
   * `childRouteDefaults`, so a composition without either keeps inheriting.
   */
  defaultRoute?: AllowedModelRoute
}

/** Optional deployment base for the preference. */
export interface Config {
  /** Initial enabled state inherited when the user document does not override it. */
  enabled: Volatile<boolean>
  /** Initial route list inherited when the user document does not override it. */
  allowedModels: Volatile<AllowedModelRoute[]>
  /** Initial default route inherited when the user document does not override it. */
  defaultRoute: Volatile<AllowedModelRoute>
}

/** Singleton settings owner read when delegation tools are composed for a Session. */
export class SubagentModelSelectionConfig extends Service {
  static Config = z.object({
    enabled: z.boolean().default(false).volatile(),
    allowedModels: z.array(AllowedModelRouteSchema).default([]).volatile(),
    // Omitted stays absent: the seam distinguishes "no default" from a route.
    defaultRoute: AllowedModelRouteSchema.default(undefined as unknown as AllowedModelRoute).volatile(),
  })

  constructor(ctx: Context, private config: Config) {
    super(ctx, 'subagentModelSelection')
    // The seam owns route resolution for every backend, so this row publishes
    // its preference there instead of letting each tool read the setting.
    ctx.inject(['subagents'], (seamCtx: Context) => {
      // The injection guarantees the service, so the seam reads directly.
      const subagents = seamCtx.subagents
      seamCtx.effect(() => subagents.setChildRoutePreference(() => this.current().defaultRoute))
    })
  }

  /**
   * Read a detached selection preference for the next eligible Session composition.
   * @returns the enabled state and exact allowed routes.
   */
  current(): SubagentModelSelectionSettings {
    const enabled = this.config.enabled.get()
    const allowedModels = this.config.allowedModels.get()
    const defaultRoute = this.config.defaultRoute.get()
    assertAllowedModelRoutes(allowedModels)
    if (enabled && allowedModels.length === 0) {
      throw new Error('enabled subagent model selection requires at least one allowed model')
    }
    if (defaultRoute !== undefined
      && !allowedModels.some(route => route.provider === defaultRoute.provider && route.model === defaultRoute.model)) {
      throw new Error('the default child route must be one of the authorized routes')
    }
    return {
      enabled,
      allowedModels: allowedModels.map(route => ({ ...route })),
      ...defaultRoute === undefined ? {} : { defaultRoute: { ...defaultRoute } },
    }
  }

}

export const name = 'subagent-model-selection-settings'
export default SubagentModelSelectionConfig
