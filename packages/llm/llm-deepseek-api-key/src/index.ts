/** API-key authentication and credential-gated discovery for the official DeepSeek route. */
import type { Context } from '@qilin-agent/kylin'
import type z from '@qilin-agent/schemastery'
import { assertUsableApiKey, LlmError } from '@qilin-agent/llm'
import type {} from '@qilin-agent/kylin-plugin-loader'
import type {} from '@qilin-agent/settings'
import { launchEnvironmentOf } from '@qilin-agent/launch-environment'
import { catalogModelInfo, registerDeepSeekProvider } from '@qilin-agent/llm-deepseek'
import { Config, plainOptions, resolveAdapterOptions } from './config.ts'
import type { ResolvedDeepSeekOptions } from './config.ts'

export { Config, plainOptions, resolveAdapterOptions } from './config.ts'
export type { Options, ResolvedDeepSeekOptions } from './config.ts'
export const name = 'llm-deepseek-api-key'
export const inject = ['llm']

const PROVIDER = 'deepseek-official'

export function apply(ctx: Context, config: Config): void {
  // The active section source: the settings provider's resolved namespace while
  // one is attached, this composition entry otherwise.
  let current: () => Config = () => config
  const options = () => resolveAdapterOptions(plainOptions(current()), launchEnvironmentOf(ctx))
  options()
  const resolveApiKey = async (connection: ResolvedDeepSeekOptions): Promise<string> => {
    // Every credential fact comes from the caller's snapshot, so a rejected
    // settings generation cannot leak its key onto the previous endpoint.
    const ref = connection.apiKeyEnv
    const credentials = ctx.get('credentials')
    if (credentials !== undefined) {
      const hit = await credentials.resolve(ref)
      if (hit !== undefined) return assertUsableApiKey(hit.value, 'llm-deepseek', ref)
    } else {
      // Without the seam there is no managed store to rank against, so the
      // environment is the whole credential plane.
      const ambient = launchEnvironmentOf(ctx).get(ref)
      if (ambient !== undefined && ambient.value.length > 0) {
        return assertUsableApiKey(ambient.value, 'llm-deepseek', ref)
      }
    }
    throw new LlmError(
      `llm-deepseek: no API key for provider route "${PROVIDER}"; store ${ref} through the credentials`
      + ` service (the web Models page writes it), or export ${ref} in the launching environment`,
      'MISSING_CREDENTIAL',
    )
  }
  // The composed entry id names the settings section; a bare-plugin composition
  // falls back to this plugin's name.
  const sectionNs = ctx.fiber.entry?.options.id ?? name
  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: 'DeepSeek', settingsNs: sectionNs, settingsPath: [] },
  ])
  const refresh = registerDeepSeekProvider(ctx, PROVIDER, {
    options, providerName: 'DeepSeek',
    resolveAuth: async connection => ({ headers: { 'x-api-key': await resolveApiKey(connection) } }),
    discoverModels: async (provider) => {
      const connection = options()
      try { await resolveApiKey(connection) }
      catch (error) {
        if (error instanceof LlmError && error.code === 'MISSING_CREDENTIAL') return []
        throw error
      }
      return connection.models.map(model => catalogModelInfo(provider, model))
    },
  })
  // The section schema validates plain yml values, so the section's base layer
  // is the plain projection of the composition entry, not its resolved
  // references; the source it hands back carries those references again.
  const entry = plainOptions(config) as unknown as Config
  ctx.inject(['settings'], (settingsCtx) => {
    // A volatile schema resolves to `Config`'s `Volatile` refs, which the
    // settings seam cannot infer from a schema whose input is the raw value.
    settingsCtx.settings.installSection(ctx, sectionNs, Config as unknown as z<Config>, entry, {
      setSource: (source) => {
        current = source
      },
      onChange: refresh,
    })
  })
}
