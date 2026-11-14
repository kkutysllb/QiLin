/**
 * `office_read`: the model-facing read-only view of an Office document.
 * @module @qilin-agent/tool-office-read
 */

import Schema from '@qilin-agent/schemastery'
import type { Context } from '@qilin-agent/kylin'
import { applyOfficeReadTool } from './office-read.ts'

export { applyOfficeReadTool, renderOfficeContent } from './office-read.ts'
export type { OfficeReadToolConfig, OfficeReadValue } from './office-read.ts'

/** Plugin name the Loader reports. */
export const name = 'tool-office-read'

/** Services the Office reading tool needs: the tool registry and the filesystem backend. */
export const inject = ['tools', 'fs']

/** Deployment-varying bounds; every field has a default a deployment may narrow. */
export interface Config {
  /** Largest document the tool reads, in bytes. */
  maxBytes: number
}

/** Default read cap for one document, in bytes. */
export const DEFAULT_MAX_BYTES = 48 * 1_024 * 1_024

/**
 * Register the tool.
 * @param ctx - composing plugin context; execution uses its `fs` service.
 * @param config - bounds applied before the reader opens a document.
 */
export function apply(ctx: Context, config: Config): void {
  const maxBytes = config.maxBytes
  if (!Number.isInteger(maxBytes) || maxBytes < 1) throw new Error('tool-office-read: maxBytes must be a positive integer')
  applyOfficeReadTool(ctx, { maxBytes })
}

/** Config schema; `maxBytes` is the only deployment-varying bound. */
export const Config: Schema<Config> = Schema.object({
  maxBytes: Schema.number().default(DEFAULT_MAX_BYTES).description('Largest Office document the tool reads, in bytes.'),
})
