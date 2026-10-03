/**
 * Production client composition without the page: mount the Loader over a
 * module system, create every manifest row, wait for quiescence, and audit
 * activation. `AppWebEntry` and the whole-client test carrier both call it.
 * @module @qilin/client-web/src/boot-client
 */
import type { Context } from '@qilin/kylin'
import Loader from '@qilin/kylin-plugin-loader'
import type { BootManifest, ClientModuleLoader } from '@qilin/client-modules/client'
import { STATE_LABELS } from './loader-status.ts'

/** Entry state label as the boot page renders it. */
export type EntryStateLabel = (typeof STATE_LABELS)[keyof typeof STATE_LABELS] | 'loading' | 'failed'

/** Inputs of {@link bootClient}. */
export interface ClientBootOptions {
  /** Fresh root Context that will own the plugin tree. */
  readonly ctx: Context
  /** Module system installed as `loader.internal`. */
  readonly modules: ClientModuleLoader
  /** Parsed manifest whose `plugins` rows become Loader entries (entry name = row id). */
  readonly manifest: BootManifest
  /** Per-entry state reporting (the boot page); omitted when no one renders progress. */
  readonly onEntryState?: (name: string, state: EntryStateLabel) => void
}

/**
 * Compose the client: `ctx.plugin(Loader)`, `loader.internal = modules`, one
 * `loader.create({ name })` per manifest row, `loader.await()`, then
 * {@link assertEntriesActive}. A row whose module cannot be imported is marked
 * failed; the Loader logs its import error and the audit rejects startup.
 * @param options - context, module system, manifest, optional progress sink.
 * @returns resolves after every entry is active; rejects with the audit report otherwise.
 */
export async function bootClient(options: ClientBootOptions): Promise<void> {
  const { ctx, manifest, onEntryState } = options
  await ctx.plugin(Loader)
  const loader = ctx.loader
  loader.internal = options.modules as never

  ctx.on('internal/status', (fiber) => {
    const entry = fiber.entry
    if (entry === undefined || entry.fiber === undefined) return
    onEntryState?.(entry.options.name, STATE_LABELS[entry.fiber.state])
  })

  const rows = manifest.plugins.map(row => row.id)
  for (const name of rows) onEntryState?.(name, 'loading')
  await options.modules.entries.start(loader, manifest)
  for (const entry of loader.entries()) {
    if (entry.fiber === undefined) onEntryState?.(entry.options.name, 'failed')
  }

  await loader.await()
  assertEntriesActive(ctx)
}

/**
 * One retained Loader reason as text. An Error contributes its message, a
 * string itself, and any other value its JSON form, so the audit never prints
 * Object's default `[object Object]` spelling.
 * @param reason - the value the failed fiber retained.
 * @returns the message text.
 */
function reasonText(reason: unknown): string {
  if (reason instanceof Error) return reason.message
  if (reason === null) return 'null'
  if (typeof reason === 'string') return reason
  if (typeof reason === 'number' || typeof reason === 'boolean' || typeof reason === 'bigint' || typeof reason === 'symbol') return String(reason)
  if (typeof reason !== 'object') return Object.prototype.toString.call(reason)
  try {
    return JSON.stringify(reason)
  } catch {
    // A cyclic reason has no JSON form; report its kind instead.
    return Object.prototype.toString.call(reason)
  }
}

/**
 * The reason a failed Loader fiber keeps for itself. The Loader holds it in a
 * private field and logs it through a logger the browser composition does not
 * mount, so the boot audit is the only place a report can read it.
 * @param fiber - the entry's fiber.
 * @returns a `: <message>` suffix, or an empty string when no reason is retained.
 */
function failureReason(fiber: unknown): string {
  const reason = (fiber as { _error?: unknown })._error
  return reason === undefined ? '' : `: ${reasonText(reason)}`
}

/**
 * Reject entries that failed import/apply or still wait on missing services.
 * @param ctx - root Context carrying the Loader.
 * @throws {Error} listing every non-active entry with its reason.
 */
export function assertEntriesActive(ctx: Context): void {
  const failures: string[] = []
  for (const entry of ctx.loader.entries()) {
    const name = entry.options.name
    if (entry.fiber === undefined) {
      failures.push(`${name}: import failed (see console for the import error)`)
      continue
    }
    const state = STATE_LABELS[entry.fiber.state]
    if (state === 'active') continue
    if (state === 'pending') {
      const missing = Object.keys(entry.fiber.inject).filter(service => ctx.get(service) === undefined)
      failures.push(`${name}: pending (waiting for service${missing.length === 1 ? '' : 's'}: ${missing.join(', ') || 'unknown'})`)
    } else {
      failures.push(`${name}: ${state}${failureReason(entry.fiber)}`)
    }
  }
  if (failures.length > 0) {
    throw new Error(`web boot: ${String(failures.length)} entr${failures.length === 1 ? 'y' : 'ies'} did not activate\n${failures.join('\n')}`)
  }
}
