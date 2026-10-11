/** One started deployment over its real HTTP surface, with recording runtimes. */

import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { accountsFilePath, AccountStore } from '@qilin-agent/accounts-local'
import type { TenantHandle, TenantRuntimeOptions, TenantRuntimeStatus } from '../../src/tenant-runtime.ts'
import { runTenantsServe } from '../../src/tenants.ts'

/** A deployment a test drives: the hub, the accounts it holds, and what it did. */
export interface StartedDeployment {
  /** Hub address, ending in a slash. */
  readonly base: string
  /** Deployment home the hub reads and writes. */
  readonly home: string
  /** Account id per username, in the order the fixture created them. */
  readonly accounts: Map<string, string>
  /** Every start and stop, in the order the hub enforced them. */
  readonly log: string[]
  /** The options each account runtime was created with. */
  readonly options: Map<string, TenantRuntimeOptions>
  /** Stop the deployment, wait for it to settle, and remove its home. */
  readonly dispose: () => Promise<void>
}

/** Options one test passes to {@link startDeployment}. */
export interface DeploymentOptions {
  /** Accounts the roster holds, in order. */
  readonly usernames: readonly string[]
  /** Accounts created with the deployment's administrator seat. */
  readonly admins?: readonly string[]
  /** Live runtimes the hub keeps at once; 0 keeps every one. */
  readonly maxTenants: number
  /** Idle window; 0 keeps every runtime and installs no sweep. */
  readonly idleMilliseconds?: number
  /** TLS material the hub terminates its public address with, as the two deployment flags do. */
  readonly tls?: { readonly certFile: string; readonly keyFile: string }
}

/**
 * One runtime stand-in that really serves HTTP, so the hub's proxy has a
 * target, and records every start and stop.
 * @param options - what the hub created it with.
 * @param log - shared start-and-stop log.
 * @returns the handle the hub drives.
 */
export function recordingRuntime(options: TenantRuntimeOptions, log: string[]): TenantHandle {
  let server: Server | undefined
  let origin: string | undefined
  let state: TenantRuntimeStatus['state'] = 'stopped'
  return {
    lastUsedAt: 0,
    status: () => ({
      accountId: options.accountId,
      state,
      pid: undefined,
      origin,
      starts: server === undefined ? 0 : 1,
      detail: '',
      consecutiveFailures: 0,
      retryAt: undefined,
    }),
    async ensure() {
      if (server === undefined) {
        // Starting takes a moment in a real deployment; the delay is what makes
        // the cap's enforcement observable to two handoffs that arrive together.
        await new Promise(resolve => setTimeout(resolve, 50))
        log.push(`start:${options.accountId}`)
        const created = createServer((_request, response) => {
          response.writeHead(200, { 'content-type': 'text/plain' })
          response.end(`served ${options.accountId}`)
        })
        await new Promise<void>((resolve) => { created.listen(0, '127.0.0.1', () => { resolve() }) })
        server = created
        const address = created.address()
        origin = typeof address === 'object' && address !== null ? `http://127.0.0.1:${String(address.port)}` : undefined
        state = 'running'
      }
      return origin ?? ''
    },
    async stop() {
      log.push(`stop:${options.accountId}`)
      state = 'stopped'
      const closing = server
      server = undefined
      origin = undefined
      if (closing !== undefined) {
        await new Promise<void>((resolve) => { closing.closeAllConnections(); closing.close(() => { resolve() }) })
      }
    },
    proxyTarget: () => state === 'running' ? origin : undefined,
  }
}

/**
 * Start one deployment whose runtimes are stand-ins.
 * @param options - the accounts and the bounds the test wants.
 * @returns the started deployment.
 */
export async function startDeployment(options: DeploymentOptions): Promise<StartedDeployment> {
  const root = await mkdtemp(join(tmpdir(), 'qilin-deployment-'))
  const home = join(root, 'home')
  const store = await AccountStore.open(accountsFilePath(home))
  const accounts = new Map<string, string>()
  const admins = new Set(options.admins ?? [])
  for (const username of options.usernames) {
    accounts.set(username, (await store.add({ username }, 'password-1', { admin: admins.has(username) })).id)
  }

  const log: string[] = []
  const runtimes = new Map<string, TenantRuntimeOptions>()
  const controller = new AbortController()
  const listening = Promise.withResolvers<string>()
  const serving = runTenantsServe({
    host: '127.0.0.1',
    port: 0,
    home,
    profile: 'qilin',
    idleMilliseconds: options.idleMilliseconds ?? 0,
    maxTenants: options.maxTenants,
    restartBackoffMilliseconds: 60_000,
    singleOrigin: true,
    registration: 'closed',
    ...options.tls === undefined ? {} : { tls: options.tls },
    patches: [],
    appArguments: [],
    signal: controller.signal,
    onListening: (url) => { listening.resolve(url) },
    createRuntime: (runtimeOptions) => {
      runtimes.set(runtimeOptions.accountId, runtimeOptions)
      return recordingRuntime(runtimeOptions, log)
    },
  })
  const base = await listening.promise
  return {
    base,
    home,
    accounts,
    log,
    options: runtimes,
    dispose: async () => {
      controller.abort()
      await serving
      await rm(root, { recursive: true, force: true })
    },
  }
}

/** The routing cookie one account's browser carries. */
export function routingCookie(id: string): string {
  return `qilin_tenant=${id}`
}
