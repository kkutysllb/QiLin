/** The hub's handoff cap under concurrent arrivals, over its real HTTP surface. */

import { createServer, type Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { accountsFilePath, AccountStore } from '@qilin-agent/accounts-local'
import type { TenantHandle, TenantRuntimeOptions, TenantRuntimeStatus } from '../src/tenant-runtime.ts'
import { runTenantsServe } from '../src/tenants.ts'

const roots: string[] = []
const running: (() => Promise<void>)[] = []

afterEach(async () => {
  for (const stop of running.splice(0)) await stop()
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

/**
 * One runtime stand-in that really serves HTTP, so the hub's proxy has a target.
 * Every start and stop lands in the shared log, which is how a test sees the
 * order the hub enforced the cap in.
 */
function recordingRuntime(options: TenantRuntimeOptions, log: string[]): TenantHandle {
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
      starts: state === 'stopped' && server === undefined ? 0 : 1,
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

/** A deployment home whose roster holds the named accounts. */
async function deploymentHome(usernames: readonly string[]): Promise<{ home: string; ids: Map<string, string> }> {
  const root = await mkdtemp(join(tmpdir(), 'qilin-handoff-'))
  roots.push(root)
  const home = join(root, 'home')
  const store = await AccountStore.open(accountsFilePath(home))
  const ids = new Map<string, string>()
  for (const username of usernames) ids.set(username, (await store.add({ username }, 'password-1')).id)
  return { home, ids }
}

describe('handoff cap over the hub surface', () => {
  it('reclaims before it starts when two handoffs arrive at once', { timeout: 60_000 }, async () => {
    const { home, ids } = await deploymentHome(['alice', 'bob'])
    const log: string[] = []
    const created = new Map<string, TenantHandle>()
    const controller = new AbortController()
    const listening = Promise.withResolvers<string>()
    const serving = runTenantsServe({
      host: '127.0.0.1',
      port: 0,
      home,
      profile: 'qilin',
      idleMilliseconds: 0,
      maxTenants: 1,
      restartBackoffMilliseconds: 60_000,
      singleOrigin: true,
      registration: 'closed',
      patches: [],
      appArguments: [],
      signal: controller.signal,
      onListening: (url) => { listening.resolve(url) },
      createRuntime: (runtimeOptions) => {
        const runtime = recordingRuntime(runtimeOptions, log)
        created.set(runtimeOptions.accountId, runtime)
        return runtime
      },
    })
    running.push(async () => { controller.abort(); await serving })
    const hub = await listening.promise

    const cookie = (username: string): string => `qilin_tenant=${ids.get(username) ?? ''}`
    const [alice, bob] = await Promise.all([
      fetch(hub, { headers: { cookie: cookie('alice') } }),
      fetch(hub, { headers: { cookie: cookie('bob') } }),
    ])
    // A cap of one means two simultaneous handoffs can leave the loser without a
    // runtime: the reclaim may stop the very runtime its request was heading to.
    // What must hold is the cap, and that every answer a runtime gave names the
    // account whose cookie asked for it.
    for (const [response, username] of [[alice, 'alice'], [bob, 'bob']] as const) {
      expect([200, 503]).toContain(response.status)
      if (response.status === 200) expect(await response.text()).toBe('served ' + String(ids.get(username)))
    }
    expect([alice.status, bob.status]).toContain(200)

    // The cap held: the second start could only follow a reclaim, which is what
    // serializing the handoffs buys. Without it both would have found no running
    // runtime to reclaim and started, leaving two alive past a cap of one.
    const starts = log.filter(entry => entry.startsWith('start:'))
    const stops = log.filter(entry => entry.startsWith('stop:'))
    expect(starts).toHaveLength(2)
    expect(stops).toHaveLength(1)
    expect(log.indexOf(stops[0] as string)).toBeGreaterThan(log.indexOf(starts[0] as string))
    expect(log.indexOf(stops[0] as string)).toBeLessThan(log.indexOf(starts[1] as string))

    // And the hub reports what the cap allowed.
    const status = await (await fetch(new URL('/status', hub))).json() as { maxTenants: number; alive: number }
    expect(status.maxTenants).toBe(1)
    expect(status.alive).toBeLessThanOrEqual(1)

    // The aborted signal ends the deployment the way a termination signal does.
    controller.abort()
    expect(await serving).toBe(0)
    for (const runtime of created.values()) expect(runtime.status().state).toBe('stopped')
  })
})
