/**
 * The deployment entry: one public address, one supervisor, and one runtime per
 * account.
 *
 * Every profile that serves a browser address is a deployment: `qilin web` and
 * the product surface `qilin` both come here. This process binds the address a
 * browser reaches, serves the sign-in form, and starts one child runtime per
 * account on demand. A child boots the same profile with
 * {@link TENANT_VARIABLE} set, so the application is what a runtime process runs
 * and the supervisor is what the deployment runs.
 *
 * Runtimes stay on loopback: the public address is the supervisor's. That is
 * why this entry serves every account through its own origin rather than
 * redirecting a browser to a runtime port — a redirect target a client cannot
 * reach is not a deployment.
 *
 * The desktop shell boots the product profile in-process through
 * `profile-boot`, so it never reaches this module and keeps serving one
 * account directly.
 * @module @qilin-agent/cli/web-entry
 */

import { TENANT_VARIABLE } from './tenant-runtime.ts'
import { runTenantsServe } from './tenants.ts'

/** The profiles whose boot is a deployment of the product surface. */
export const ENTRY_PROFILES: readonly string[] = ['qilin', 'web']

/** Idle window a deployment gets before it sets one. */
const DEFAULT_IDLE_MILLISECONDS = 1_800_000

/** Where the public address binds when the invocation names none. */
const DEFAULT_HOST = '127.0.0.1'

/** Which port the public address binds when the invocation names none. */
const DEFAULT_PORT = 8790

/** First wait before retrying a runtime that failed to start. */
const DEFAULT_RESTART_BACKOFF_MILLISECONDS = 1000

/**
 * One optional whole-number flag of the deployment invocation.
 * @param args - the profile's inner arguments.
 * @param name - the flag to read.
 * @param fallback - the value to use when the flag is absent.
 * @param minimum - the smallest accepted value.
 * @returns the parsed value.
 * @throws Error when the flag is present but not a whole number at or above the floor.
 */
function wholeNumber(args: readonly string[], name: string, fallback: number, minimum: number): number {
  const raw = argument(args, name)
  if (raw === undefined) return fallback
  if (!/^[0-9]+$/u.test(raw) || Number(raw) < minimum) {
    throw new Error(`qilin web: ${name} needs a whole number of at least ${String(minimum)}, received ${JSON.stringify(raw)}`)
  }
  return Number(raw)
}

/**
 * Whether this process is the deployment entry rather than one account's runtime.
 * @returns true when no tenant marker is present.
 */
export function isWebEntry(): boolean {
  return process.env[TENANT_VARIABLE] === undefined
}

/** One flag read out of the profile's own arguments. */
function argument(args: readonly string[], name: string): string | undefined {
  const inline = args.find(value => value.startsWith(`${name}=`))
  if (inline !== undefined) return inline.slice(name.length + 1)
  const index = args.indexOf(name)
  return index === -1 ? undefined : args[index + 1]
}

/**
 * Serve the deployment: the public address, and one runtime per account.
 * @param args - the profile's inner arguments, which carry the app's own flags.
 * @returns the process exit code.
 * @throws Error when a flag the invocation names is not a usable value.
 */
export async function runWebEntry(args: readonly string[], servedProfile: string): Promise<number> {
  const host = argument(args, '--host') ?? DEFAULT_HOST
  const port = wholeNumber(args, '--port', DEFAULT_PORT, 0)
  return await runTenantsServe({
    host,
    port,
    // A deployment serves a named profile's app per account; the entry's own
    // reads and the sign-in form do not change with it.
    profile: argument(args, '--tenant-profile') ?? servedProfile,
    idleMilliseconds: wholeNumber(args, '--idle-ms', DEFAULT_IDLE_MILLISECONDS, 0),
    maxTenants: wholeNumber(args, '--max-tenants', 0, 0),
    restartBackoffMilliseconds: wholeNumber(args, '--restart-backoff-ms', DEFAULT_RESTART_BACKOFF_MILLISECONDS, 0),
    // Every tenant is reached through the address the browser already has.
    singleOrigin: true,
  })
}
