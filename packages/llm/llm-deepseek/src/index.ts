/** Register DeepSeek Messages with live configuration and request-local credentials. */
import type {} from '@qilin/settings'
import type z from '@qilin/schemastery'
import type { Context } from '@qilin/kylin'
import { assertUsableApiKey, LlmError, resolveImageAttachmentAccess } from '@qilin/llm'
import type {} from '@qilin/fs'
import { launchEnvironmentOf } from '@qilin/launch-environment'
import { deepEqualJson } from '@qilin/util-values'
import { getOrCreateAnonymousUserId, type AnonymousUserId } from '@qilin/anonymous-user-id'
import { DeepSeekAdapter } from './adapter.ts'
import { Config, plainOptions, resolveAdapterOptions } from './config.ts'
import type { ResolvedDeepSeekOptions } from './config.ts'

export { Config, plainOptions, resolveAdapterOptions, PUBLIC_BASE_URL } from './config.ts'
export type { Options, ResolvedDeepSeekOptions } from './config.ts'
export {
  DEFAULT_CONTEXT_WINDOW,
  DEFAULT_FILE_EXPIRY_SECONDS,
  DEFAULT_FILE_QUOTA_CLEANUP_BATCH,
  DEFAULT_FILE_REFRESH_MARGIN_SECONDS,
  DEFAULT_FILES_API_TIMEOUT_MS,
  DEFAULT_IMAGE_OFFLOAD_BYTE_QUANTUM,
  DEFAULT_IMAGE_OFFLOAD_COUNT_QUANTUM,
  DEFAULT_INLINE_IMAGE_OFFLOAD_BYTE_QUANTUM,
  DEFAULT_MAX_INLINE_REQUEST_IMAGE_BYTES,
  DEFAULT_MAX_TOKENS,
  DEFAULT_STREAM_IDLE_TIMEOUT_MS,
} from './defaults.ts'
export { DeepSeekAdapter } from './adapter.ts'
export type { DeepSeekAdapterOptions, DeepSeekCatalogModel, DeepSeekConnectionOptions } from './types.ts'
export {
  DEFAULT_LOW_DETAIL_IMAGE_PIXEL_BUDGET,
  DEFAULT_MAX_IMAGES_PER_REQUEST,
  DEFAULT_MAX_REQUEST_FILES_BYTES,
  DEFAULT_REQUEST_IMAGE_MAX_BYTES,
  REQUEST_IMAGE_MAX_DIMENSION,
  deepSeekImageRequestPricing,
  resolveRequestImageMaxBytes,
  resolveRequestImageTarget,
} from './request-pricing.ts'
export { deepSeekImageTokens, deepSeekRequestImageDimensions } from './image-tokens.ts'
export { DeepSeekFileStore, MAX_IMAGE_BYTES } from './file-store.ts'
export type { DeepSeekFileConnection, DeepSeekFilePolicy, DeepSeekFileReference } from './file-store.ts'
export { DeepSeekFilesClient, MAX_FILE_EXPIRY_SECONDS, MAX_FILE_UPLOAD_BYTES, MAX_STORED_FILE_BYTES, MAX_STORED_FILE_COUNT, MIN_FILE_EXPIRY_SECONDS } from './files-api.ts'
export type { DeepSeekFileObject, DeepSeekFilePage } from './files-api.ts'
export { DeepSeekFileId } from './file-id.ts'
export type { DeepSeekFileId as DeepSeekFileIdType } from './file-id.ts'
export { DeepSeekUploadIndex, deepSeekFileScope } from './upload-index.ts'
export type { DeepSeekUploadRecord } from './upload-index.ts'
export type { RequestDefaults } from './types.ts'

export const name = 'llm-deepseek'
export const inject = ['llm']

const NS = 'llm-deepseek'
const PROVIDER = 'deepseek-official'

export function apply(ctx: Context, config: Config): void {
  // The active section source: the settings provider's resolved namespace while
  // one is attached, this composition entry otherwise.
  let current: () => Config = () => config
  const options = (): ResolvedDeepSeekOptions => resolveAdapterOptions(plainOptions(current()), launchEnvironmentOf(ctx))
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

  let userId: AnonymousUserId | undefined
  const resolveUserId = (): AnonymousUserId => userId ??= getOrCreateAnonymousUserId()
  const adapter = new DeepSeekAdapter({
    options,
    onReplayDegrade: ({ provider, model, reason }) => {
      ctx.logger.warn(`llm-deepseek: unusable Messages replay state on assistant history for route "${provider}/${model}"; sending provider-neutral content (${reason})`)
    },
    resolveApiKey,
    resolveUserId,
    resolveAttachments: () => ctx.get('attachments'),
    resolveImageAccess: (attachments, ref) => resolveImageAttachmentAccess(
      attachments,
      hostPath => ctx.get('fs')?.processPathFromHostPath(hostPath),
      ref,
    ),
    prepareExtensions: (request) => {
      const extensions = ctx.get('deepseekLlmApiExtensions')
      return extensions?.prepare(request)
        ?? Promise.resolve({ fields: {}, accept: () => Promise.resolve() })
    },
  })
  ctx.llm.registerConfigurableProviders([
    { provider: PROVIDER, displayName: 'DeepSeek', settingsNs: NS, settingsPath: [] },
  ])
  // Route effects bind to this apply fiber via the stable `ctx` reference,
  // even when a swap runs inside the scoped settings callback below.
  const registration = ctx.llm.registerAdapter([PROVIDER], adapter)
  let registeredPolicy = options().retryPolicy
  const ensureRegistrationFacts = (): void => {
    let policy: ResolvedDeepSeekOptions['retryPolicy']
    try {
      policy = options().retryPolicy
    } catch (error) {
      // A stored config the resolver refuses keeps the current registration; each request fails on its own resolve.
      ctx.logger.warn(error)
      return
    }
    if (deepEqualJson(policy, registeredPolicy)) return
    // The registry captures the retry policy at registration, so it is the one
    // fact per-request resolution cannot refresh. `replace` re-reads it in one
    // synchronous registry section: disposing and re-registering instead would
    // publish an empty route set between the two, and an observer that reacted
    // to it would see this provider disappear and come back.
    registration.replace([PROVIDER])
    registeredPolicy = policy
  }

  // The section schema validates plain yml values, so the section's base layer
  // is the plain projection of the composition entry, not its resolved
  // references; the source it hands back carries those references again.
  const entry = plainOptions(config) as unknown as Config
  ctx.inject(['settings'], (settingsCtx) => {
    // A volatile schema resolves to `Config`'s `Volatile` refs, which the
    // settings seam cannot infer from a schema whose input is the raw value.
    settingsCtx.settings.installSection(ctx, NS, Config as unknown as z<Config>, entry, {
      setSource: (source) => {
        current = source
      },
      onChange: ensureRegistrationFacts,
    })
  })
}
