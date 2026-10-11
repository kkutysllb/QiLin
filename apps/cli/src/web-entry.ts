/**
 * The deployment entry: one public address, one supervisor, and one runtime per
 * account.
 *
 * Every profile that serves a browser address is a deployment: `qilin web` and
 * the product surface `qilin` both come here. This process binds the address a
 * browser reaches, terminates TLS when the invocation carries a certificate and
 * key, and starts one child runtime per account on demand. A child boots the same
 * profile with {@link TENANT_VARIABLE} set, so the application is what a runtime
 * process runs and the supervisor is what the deployment runs.
 *
 * Runtimes stay on loopback: the public address is the supervisor's. That is
 * why this entry serves every account through its own origin rather than
 * redirecting a browser to a runtime port — a redirect target a client cannot
 * reach is not a deployment.
 *
 * The entry reads the deployment's own flags and hands every other argument to
 * each runtime's command line, so an application flag reaches the process that
 * implements it instead of being dropped here. `--patch` is the exception it
 * forwards as a launcher flag, because an overlay applies to the composition
 * each runtime boots.
 *
 * The desktop shell boots the product profile in-process through
 * `profile-boot`, so it never reaches this module and keeps serving one
 * account directly.
 * @module @qilin-agent/cli/web-entry
 */

import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { LOOPBACK_HOSTS, TENANT_VARIABLE } from './tenant-runtime.ts'
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
 * Addresses that mean "every interface". The served application refuses them
 * because binding every interface exposes remote execution to the network, and
 * the deployment address is the only address a browser reaches.
 */
const WILDCARD_HOSTS: readonly string[] = ['0.0.0.0', '::', '[::]', '*']

/** Deployment flags that accumulate every occurrence instead of keeping the first. */
const REPEATABLE_VALUE_FLAGS: readonly string[] = ['--patch']

/** Deployment flags that carry a value. */
const VALUE_FLAGS: readonly string[] = [
  '--host',
  '--port',
  '--patch',
  '--tls-cert',
  '--tls-key',
  '--tenant-profile',
  '--idle-ms',
  '--max-tenants',
  '--restart-backoff-ms',
  '--tenant-host',
  '--registration',
]

/** Deployment flags that stand alone. */
const SWITCH_FLAGS: readonly string[] = ['--no-open', '--per-account-ports', '-h', '--help']

/** Certificate chain and private key the deployment address serves with. */
export interface DeploymentTls {
  /** PEM certificate chain file. */
  readonly certFile: string
  /** Unencrypted PEM private key file. */
  readonly keyFile: string
}

/** What one deployment invocation asks the entry to serve. */
export interface DeploymentOptions {
  /** Interface the public address binds. */
  readonly host: string
  /** Port the public address binds; 0 lets the OS pick one. */
  readonly port: number
  /** Profile each account's runtime boots. */
  readonly tenantProfile: string
  /** Idle window after which an account's runtime is reclaimed. */
  readonly idleMilliseconds: number
  /** Most account runtimes alive at once; 0 keeps every one. */
  readonly maxTenants: number
  /** First wait before retrying a runtime that failed to start. */
  readonly restartBackoffMilliseconds: number
  /** Serve every account through the public address instead of per-account origins. */
  readonly singleOrigin: boolean
  /** Interface each account's runtime binds; loopback serves one public address. */
  readonly tenantHost: string | undefined
  /** Who may create accounts on this deployment. */
  readonly registration: 'open' | 'closed'
  /** TLS the public address terminates with, when the invocation named a key pair. */
  readonly tls: DeploymentTls | undefined
  /** Whether the invocation asked for help instead of serving. */
  readonly help: boolean
  /** Overlay files the deployment arguments name, as absolute paths, in argv order. */
  readonly patches: readonly string[]
  /** Arguments belonging to the served application, in argv order. */
  readonly appArguments: readonly string[]
}

/** What the launcher resolved for one deployment boot. */
export interface WebEntryInvocation {
  /** Arguments for the served application, after the launcher's own flags. */
  readonly args: readonly string[]
  /** Profile this deployment serves. */
  readonly profile: string
  /** Overlay files applied to every runtime's composition, in argv order. */
  readonly patches: readonly string[]
  /** Shipped template named by `--from-default-profile`, which this entry refuses. */
  readonly fromDefaultProfile?: string | undefined
}

/** Deployment arguments the entry read, and the arguments left to the application. */
interface SplitArguments {
  /** First value seen for each single-valued flag. */
  readonly values: ReadonlyMap<string, string>
  /** Every value seen for each repeatable flag, in argv order. */
  readonly lists: ReadonlyMap<string, readonly string[]>
  /** Flags present without a value. */
  readonly switches: ReadonlySet<string>
  /** Arguments no deployment flag claims. */
  readonly appArguments: readonly string[]
}

/**
 * Split one invocation's arguments into the deployment's own flags and the
 * application's.
 * @param args - the arguments after the launcher's own flags.
 * @returns the deployment values, its repeatable lists, its switches, and the application's arguments.
 * @throws Error when a deployment flag that carries a value names none.
 */
function splitArguments(args: readonly string[]): SplitArguments {
  const values = new Map<string, string>()
  const lists = new Map<string, string[]>()
  const switches = new Set<string>()
  const appArguments: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    const token = args[index] ?? ''
    const separator = token.indexOf('=')
    const name = separator === -1 ? token : token.slice(0, separator)
    const inline = separator === -1 ? undefined : token.slice(separator + 1)
    if (SWITCH_FLAGS.includes(name)) {
      if (inline !== undefined) throw new Error(`qilin web: ${name} takes no value, received ${JSON.stringify(token)}`)
      switches.add(name)
      continue
    }
    if (VALUE_FLAGS.includes(name)) {
      const value = inline ?? args[index + 1]
      if (inline === undefined) index += 1
      if (value === undefined || (inline === undefined && value.startsWith('--'))) {
        throw new Error(`qilin web: ${name} needs a value`)
      }
      if (REPEATABLE_VALUE_FLAGS.includes(name)) {
        lists.set(name, [...lists.get(name) ?? [], value])
        continue
      }
      if (!values.has(name)) values.set(name, value)
      continue
    }
    appArguments.push(token)
  }
  return { values, lists, switches, appArguments }
}

/**
 * One whole-number deployment flag.
 * @param values - the deployment values the invocation named.
 * @param name - the flag to read.
 * @param fallback - the value to use when the flag is absent.
 * @param minimum - the smallest accepted value.
 * @returns the parsed value.
 * @throws Error when the flag is present but not a whole number at or above the floor.
 */
function wholeNumber(values: ReadonlyMap<string, string>, name: string, fallback: number, minimum: number): number {
  const raw = values.get(name)
  if (raw === undefined) return fallback
  if (!/^[0-9]+$/u.test(raw) || Number(raw) < minimum) {
    throw new Error(`qilin web: ${name} needs a whole number of at least ${String(minimum)}, received ${JSON.stringify(raw)}`)
  }
  return Number(raw)
}

/**
 * The certificate and key the public address serves with.
 * @param values - the deployment values the invocation named.
 * @returns the resolved pair, or undefined when the invocation named none.
 * @throws Error when only one of the two flags is present.
 */
function tlsOptions(values: ReadonlyMap<string, string>): DeploymentTls | undefined {
  const certFile = values.get('--tls-cert')
  const keyFile = values.get('--tls-key')
  if (certFile === undefined && keyFile === undefined) return undefined
  if (certFile === undefined || keyFile === undefined) {
    throw new Error('qilin web: --tls-cert and --tls-key must be supplied together')
  }
  return { certFile: resolve(certFile), keyFile: resolve(keyFile) }
}

/**
 * Read who may create accounts on this deployment.
 *
 * A loopback address is this machine's own, so the product's form may create the
 * accounts it is asked to; an address other machines reach answers the same
 * question with the operator, who runs `qilin tenants add` where the decision is
 * deliberate.
 * @param values - the deployment values the invocation named.
 * @param host - interface the public address binds.
 * @returns the effective policy.
 * @throws Error when the flag names a policy this deployment does not have.
 */
function registrationPolicy(values: ReadonlyMap<string, string>, host: string): 'open' | 'closed' {
  const named = values.get('--registration')
  if (named === undefined) return LOOPBACK_HOSTS.includes(host) ? 'open' : 'closed'
  if (named !== 'open' && named !== 'closed') {
    throw new Error(`qilin web: --registration is open or closed, received ${JSON.stringify(named)}`)
  }
  return named
}

/**
 * Read one deployment invocation.
 * @param args - the arguments after the launcher's own flags.
 * @param servedProfile - profile this deployment serves when the invocation names none.
 * @returns what the entry should serve.
 * @throws Error when a named flag cannot be honoured.
 */
export function deploymentOptions(args: readonly string[], servedProfile: string): DeploymentOptions {
  const { values, lists, switches, appArguments } = splitArguments(args)
  const host = values.get('--host') ?? DEFAULT_HOST
  // Help answers for the deployment, so it is printed whatever else the
  // invocation names, and nothing else about it is read.
  if (switches.has('-h') || switches.has('--help')) {
    return {
      host,
      port: DEFAULT_PORT,
      tenantProfile: values.get('--tenant-profile') ?? servedProfile,
      idleMilliseconds: DEFAULT_IDLE_MILLISECONDS,
      maxTenants: 0,
      restartBackoffMilliseconds: DEFAULT_RESTART_BACKOFF_MILLISECONDS,
      singleOrigin: !switches.has('--per-account-ports'),
      tenantHost: values.get('--tenant-host'),
      registration: LOOPBACK_HOSTS.includes(host) ? 'open' : 'closed',
      tls: undefined,
      help: true,
      patches: (lists.get('--patch') ?? []).map(path => resolve(path)),
      appArguments,
    }
  }
  if (WILDCARD_HOSTS.includes(host)) {
    throw new Error(`qilin web: --host ${host} is an unspecified (wildcard) address, which is not supported: bind one concrete address instead`)
  }
  const singleOrigin = !switches.has('--per-account-ports')
  const tls = tlsOptions(values)
  if (tls !== undefined && !singleOrigin) {
    throw new Error('qilin web: --tls-cert terminates TLS at this address, so it cannot be combined with --per-account-ports')
  }
  return {
    host,
    port: wholeNumber(values, '--port', DEFAULT_PORT, 0),
    // A deployment serves a named profile's app per account; the entry's own
    // reads and the served application do not change with it.
    tenantProfile: values.get('--tenant-profile') ?? servedProfile,
    idleMilliseconds: wholeNumber(values, '--idle-ms', DEFAULT_IDLE_MILLISECONDS, 0),
    maxTenants: wholeNumber(values, '--max-tenants', 0, 0),
    restartBackoffMilliseconds: wholeNumber(values, '--restart-backoff-ms', DEFAULT_RESTART_BACKOFF_MILLISECONDS, 0),
    singleOrigin,
    tenantHost: values.get('--tenant-host'),
    registration: registrationPolicy(values, host),
    tls,
    help: false,
    patches: (lists.get('--patch') ?? []).map(path => resolve(path)),
    appArguments,
  }
}

/**
 * Whether this process is the deployment entry rather than one account's runtime.
 * @returns true when no tenant marker is present.
 */
export function isWebEntry(): boolean {
  return process.env[TENANT_VARIABLE] === undefined
}

/**
 * The deployment's own help, which the served application's help cannot answer
 * for: this process owns the address every account is reached through.
 * @returns the help text.
 */
function helpText(): string {
  return [
    'Usage: qilin --profile web [deployment options] [app options...]',
    '       qilin [deployment options] [app options...]',
    '',
    'Serve one public address, with one isolated runtime per account.',
    '',
    'Deployment options:',
    `  --host <host>              address to bind (default ${DEFAULT_HOST}); wildcard addresses are refused`,
    `  --port <port>              listen port; 0 lets the OS pick one (default ${String(DEFAULT_PORT)})`,
    '  --patch <path>             extra patch-list overlay every runtime boots with (repeatable)',
    '  --tls-cert <file>          PEM server certificate chain; requires --tls-key',
    '  --tls-key <file>           unencrypted PEM private key; requires --tls-cert',
    '  --tenant-profile <name>    profile each account runtime boots (default: the served profile)',
    '  --tenant-host <host>       interface each account runtime binds (default loopback)',
    '  --per-account-ports        give every account an origin of its own',
    `  --idle-ms <ms>             reclaim an idle runtime after this long; 0 keeps every one (default ${String(DEFAULT_IDLE_MILLISECONDS)})`,
    '  --max-tenants <count>      most runtimes alive at once; 0 keeps every one',
    '  --restart-backoff-ms <ms>  first wait before retrying a runtime that failed to start',
    '  --registration open|closed who may create accounts (default open on a loopback address, closed otherwise)',
    '  --no-open                  do not open the address in the default browser',
    '  -h, --help                 print this help',
    '',
    'Every other argument passes to the command line of each account runtime.',
    '',
    'Examples:',
    '  qilin web                                   serve the deployment on 127.0.0.1:8790',
    '  qilin web --port 8080 --no-open             serve another port without opening a browser',
    '  qilin web --tls-cert ./chain.pem --tls-key ./key.pem',
    '                                             serve HTTPS, terminating TLS here',
    '  qilin web --patch ./overlay.yml             compose every runtime with one overlay',
    '',
  ].join('\n')
}

/**
 * Hand the deployment's address to the operating system's default browser.
 *
 * The launcher is the platform's own, the same call the Web application makes
 * for its runtime; it is repeated here because this process is the deployment
 * rather than a runtime, and the CLI does not depend on that bundle.
 * @param url - the address to open.
 * @returns nothing once the launcher is started.
 */
function openAddress(url: string): void {
  const [command, ...args]: [string, ...string[]] = process.platform === 'darwin'
    ? ['open', url]
    : process.platform === 'win32'
      ? ['cmd', '/c', 'start', '', url]
      : ['xdg-open', url]
  const child = spawn(command, args, { stdio: 'ignore', detached: true })
  // A missing launcher (a container without a desktop) is a fact the operator
  // needs, and an unhandled 'error' would end the deployment instead.
  child.once('error', (error: Error) => {
    process.stderr.write(`qilin web: could not open ${url}: ${String(error)}\n`)
  })
  child.unref()
}

/**
 * Serve the deployment: the public address, and one runtime per account.
 * @param invocation - the served profile, its overlays, and the app's arguments.
 * @returns the process exit code.
 * @throws Error when the invocation names a flag the deployment cannot honour.
 */
export async function runWebEntry(invocation: WebEntryInvocation): Promise<number> {
  if (invocation.fromDefaultProfile !== undefined) {
    throw new Error('qilin web: --from-default-profile initializes a custom profile, and a deployment serves a shipped profile; omit it')
  }
  const options = deploymentOptions(invocation.args, invocation.profile)
  if (options.help) {
    process.stdout.write(helpText())
    return 0
  }
  return await runTenantsServe({
    host: options.host,
    port: options.port,
    profile: options.tenantProfile,
    idleMilliseconds: options.idleMilliseconds,
    maxTenants: options.maxTenants,
    restartBackoffMilliseconds: options.restartBackoffMilliseconds,
    singleOrigin: options.singleOrigin,
    tenantHost: options.tenantHost,
    registration: options.registration,
    // The child starts in its own tenant directory, so an overlay path relative
    // to the operator's directory has to travel absolute.
    patches: [...invocation.patches, ...options.patches].map(path => resolve(path)),
    appArguments: options.appArguments,
    ...options.tls === undefined ? {} : { tls: options.tls },
    // The deployment opens the address it serves, exactly as a single runtime
    // opens the address it serves; --no-open is the operator declining it.
    ...invocation.args.includes('--no-open')
      ? {}
      : {
        onListening: (url: string) => {
          try {
            openAddress(url)
          } catch (error: unknown) {
            process.stderr.write(`qilin web: could not open ${url}: ${String(error)}\n`)
          }
        },
      },
  })
}
