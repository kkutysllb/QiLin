/**
 * `qilin tenants serve`: one hub over a shared Harness home, one isolated Web
 * runtime per account. Sessions, tasks, and workspaces stay with the account
 * that owns them; plugins, model settings, credentials, and the account file
 * stay shared, so every tenant runtime is that one deployment.
 *
 * The hub authenticates nobody: a handoff is a redirect, not a credential.
 * Each tenant runtime keeps the shared home's account gate and admits only its
 * own account, so the sign-in happens at the runtime and the runtime is the
 * boundary. The hub must be reachable where its account list is not a secret —
 * it binds loopback by default and lists usernames.
 *
 * Idle reclamation counts from the last handoff. A browser that reached a tenant
 * origin keeps talking to that origin directly, which the hub cannot observe, so
 * a deployment that leaves long-lived tabs open raises `--idle-ms` or disables
 * reclamation with 0; `--single-origin` moves that same traffic through the hub
 * instead, and reclamation then counts proxied requests.
 *
 * With `--single-origin` the hub serves one origin and routes by a routing
 * cookie it sets at the handoff: `/api`, the mux upgrade, and media requests are
 * absolute paths on the page origin, so only cookie routing can attribute them
 * to a tenant. The cookie selects a runtime, it does not authorize: the runtime
 * still answers with its own account gate, so a forged cookie reaches a
 * runtime that does not recognize the caller.
 *
 * `--max-tenants` bounds how many runtimes live at once: a handoff that would
 * exceed the bound reclaims the least recently used one, and every tenant's
 * Sessions stay on disk. A runtime that fails to start is not retried on every
 * visit: the hub doubles a wait per consecutive failure, and `/status` reports
 * the count and the earliest retry.
 * @module @qilin-agent/cli/tenants
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { accountsFilePath, AccountStore } from '@qilin-agent/accounts-local'
import { resolveQilinHome } from '@qilin-agent/home-paths'
import { BOOTSTRAP_DIRECTORY, TenantRuntime, type TenantRuntimeStatus } from './tenant-runtime.ts'
import { forwardedHeaders, hubAcceptsOrigin, proxyRequest, relayAnswer, relayUpgrade } from './tenant-proxy.ts'

/** What `qilin tenants serve` was asked to do. */
export interface TenantsServeOptions {
  /** Interface the hub binds. */
  readonly host: string
  /** Port the hub binds; 0 picks a free one. */
  readonly port: number
  /** Profile each tenant runtime boots. */
  readonly profile: string
  /** Idle window after which a tenant runtime is reclaimed. */
  readonly idleMilliseconds: number
  /**
   * Most tenant runtimes the hub keeps alive at once. 0 keeps every one;
   * starting a runtime past a positive count reclaims the least recently used.
   */
  readonly maxTenants: number
  /**
   * First wait before retrying a runtime that failed to start; one runtime
   * doubles it per consecutive failure. {@link TenantRuntime} owns the ceiling.
   */
  readonly restartBackoffMilliseconds: number
  /**
   * Serve every tenant through the hub's own origin instead of redirecting to a
   * runtime's port: the hub routes each request to the tenant its routing
   * cookie names, so one browser drives one tenant at a time, and reclamation
   * counts real traffic rather than a handoff.
   */
  readonly singleOrigin: boolean
  /**
   * Interface every tenant runtime binds. It defaults to loopback, which is the
   * only reachable interface when {@link singleOrigin} is set: the hub's
   * address is the deployment's only address. A deployment that gives every
   * account an origin of its own names the interface a browser reaches, and
   * each account's cookies then live in their own jar.
   */
  readonly tenantHost?: string | undefined
  /**
   * Called once the address is serving, with the address itself, so the caller
   * that owns the deployment's user-facing behavior can act on it.
   */
  readonly onListening?: ((url: string) => void) | undefined
}

/** Routing cookie the hub sets so later requests, whatever their path, name their tenant. */
const TENANT_COOKIE = 'qilin_tenant'

/** Store key of the runtime a deployment with no accounts uses. */
const BOOTSTRAP_ACCOUNT = 'first-run'

/**
 * The routing cookie one handoff sets.
 *
 * It selects a runtime; it authorizes nothing. The runtime still answers with
 * its own account gate, so the value is an account identity and not a secret,
 * and `HttpOnly` keeps it out of page scripts that have no use for it.
 * @param accountId - account identity the browser should reach from now on.
 * @returns one `Set-Cookie` value.
 */
function routingCookie(accountId: string): string {
  return `${TENANT_COOKIE}=${accountId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`
}

/** The routing cookie's removal, for a browser whose tenant no longer exists. */
function clearedRoutingCookie(): string {
  return `${TENANT_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

/**
 * One cookie value from a request, decoded no further than substitution.
 * @param header - the browser's `Cookie` header.
 * @param name - cookie name to read.
 * @returns the value, or undefined when the browser did not send it.
 */
function cookieValue(header: string | undefined, name: string): string | undefined {
  if (header === undefined) return undefined
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim()
  }
  return undefined
}

/** One answered request. */
function respond(response: ServerResponse, status: number, contentType: string, body: string): void {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-type': contentType,
    'content-length': Buffer.byteLength(body),
  })
  response.end(body)
}

/** One JSON answer. */
function json(response: ServerResponse, status: number, body: unknown): void {
  respond(response, status, 'application/json; charset=utf-8', `${JSON.stringify(body)}\n`)
}

/**
 * Serve the hub until it is asked to stop.
 * @param options - the interface, port, tenant profile, and idle window.
 * @returns the process exit code, 0 after a clean shutdown.
 */
export async function runTenantsServe(options: TenantsServeOptions): Promise<number> {
  const home = resolveQilinHome()
  const binPath = process.argv[1]
  if (binPath === undefined) {
    throw new Error('qilin tenants: the CLI entry path is unknown, so no tenant runtime can be started')
  }
  const runtimes = new Map<string, TenantRuntime>()
  /** Runtimes holding a child, whether or not it has printed its URL yet. */
  const active = (): TenantRuntime[] => [...runtimes.values()]
    .filter(runtime => runtime.status().state === 'running' || runtime.status().state === 'starting')
  const runtimeFor = (accountId: string): TenantRuntime => {
    const existing = runtimes.get(accountId)
    if (existing !== undefined) return existing
    const created = new TenantRuntime({
      home,
      accountId,
      profile: options.profile,
      binPath,
      execArgv: process.execArgv,
      host: options.tenantHost ?? undefined,
      restartBackoffMilliseconds: options.restartBackoffMilliseconds,
      log: (line) => { process.stderr.write(`qilin tenants: [${accountId}] ${line}\n`) },
    })
    runtimes.set(accountId, created)
    return created
  }

  /**
   * The runtime a deployment with no accounts uses, so the product's own
   * first-run form can create the first one.
   * @returns the first-run runtime.
   */
  const bootstrapRuntime = (): TenantRuntime => {
    const existing = runtimes.get(BOOTSTRAP_ACCOUNT)
    if (existing !== undefined) return existing
    const created = new TenantRuntime({
      home,
      accountId: BOOTSTRAP_ACCOUNT,
      directoryName: BOOTSTRAP_DIRECTORY,
      bootstrap: true,
      profile: options.profile,
      binPath,
      execArgv: process.execArgv,
      host: options.tenantHost ?? undefined,
      restartBackoffMilliseconds: options.restartBackoffMilliseconds,
      log: (line) => { process.stderr.write(`qilin tenants: [first-run] ${line}\n`) },
    })
    runtimes.set(BOOTSTRAP_ACCOUNT, created)
    return created
  }

  /**
   * Bring the live runtimes under the cap by reclaiming the least recently used
   * ones. Every tenant's Sessions stay on disk, so reclaiming costs one boot.
   * @param target - the runtime about to start, which is never reclaimed.
   */
  const makeRoom = async (target: TenantRuntime): Promise<void> => {
    if (options.maxTenants <= 0) return
    for (;;) {
      const others = active().filter(runtime => runtime !== target)
      if (others.length < options.maxTenants) return
      const oldest = others
        .filter(runtime => runtime.status().state === 'running')
        .reduce<TenantRuntime | undefined>(
          (least, candidate) => least === undefined || candidate.lastUsedAt <= least.lastUsedAt ? candidate : least,
          undefined,
        )
      // A runtime that is still starting has no last use to compare, so it is
      // left alone: the next handoff reclaims it once it is running.
      if (oldest === undefined) return
      process.stderr.write(`qilin tenants: ${String(options.maxTenants)} runtime(s) are already alive; reclaiming ${oldest.status().accountId} to start ${target.status().accountId}\n`)
      await oldest.stop()
    }
  }

  /** Tail of the serialized handoff queue; one start runs at a time. */
  let handoffQueue: Promise<void> = Promise.resolve()

  /**
   * Serialize handoffs, so two of them cannot both pass the cap and start.
   * @param work - one handoff's start.
   * @returns what the work returned.
   */
  const serialize = <T>(work: () => Promise<T>): Promise<T> => {
    const next = handoffQueue.then(work, work)
    handoffQueue = next.then(() => undefined, () => undefined)
    return next
  }
  const roster = async (): Promise<AccountStore> => await AccountStore.open(accountsFilePath(home))

  const status = async (): Promise<{
    mode: 'handoff' | 'single-origin'
    maxTenants: number
    alive: number
    tenants: (TenantRuntimeStatus & { username: string | null })[]
  }> => {
    const store = await roster()
    return {
      mode: options.singleOrigin ? 'single-origin' : 'handoff',
      maxTenants: options.maxTenants,
      alive: active().length,
      tenants: [...runtimes.values()].map((runtime) => {
        const reported = runtime.status()
        return { ...reported, username: store.byId(reported.accountId)?.username ?? null }
      }),
    }
  }


  /**
   * Resolve the runtime one browser is driving, starting it when it is not serving.
   * @param accountId - the account the browser's routing cookie names.
   * @returns the runtime, or undefined when the roster no longer holds that account.
   */
  const routedRuntime = async (accountId: string): Promise<TenantRuntime | undefined> => {
    if ((await roster()).byId(accountId) === undefined) return undefined
    const runtime = runtimeFor(accountId)
    await serialize(async () => {
      await makeRoom(runtime)
      await runtime.ensure()
    })
    return runtime
  }

  /**
   * Forward one browser request to a runtime and relay its answer.
   * @param request - the browser's request.
   * @param response - the browser's response.
   * @param runtime - the runtime the request belongs to.
   * @param path - path and query to request upstream.
   * @param extraCookies - cookies to add to the answer.
   */
  const forward = async (
    request: IncomingMessage,
    response: ServerResponse,
    runtime: TenantRuntime,
    path: string,
    extraCookies: readonly string[],
  ): Promise<void> => {
    const target = runtime.proxyTarget()
    if (target === undefined) throw new Error('the runtime is not serving')
    // Every proxied request is traffic the hub can see, which is what makes
    // reclamation in this mode measure use rather than a handoff.
    runtime.lastUsedAt = Date.now()
    const answered = await proxyRequest({
      target,
      method: request.method ?? 'GET',
      path,
      headers: request.headers,
      hubAuthority: request.headers.host ?? '',
      body: request,
    })
    const upstreamCookies = answered.headers['set-cookie'] === undefined
      ? []
      : Array.isArray(answered.headers['set-cookie']) ? answered.headers['set-cookie'] : [answered.headers['set-cookie']]
    relayAnswer({ ...answered, headers: { ...answered.headers, 'set-cookie': [...upstreamCookies, ...extraCookies] } }, response)
  }

  /**
   * Hand a request to the runtime a deployment without accounts uses, so the
   * product's own first-run form creates the first account instead of the
   * deployment describing what an operator should type.
   * @param request - the browser's request.
   * @param response - the browser's answer.
   * @param path - request path, preserved so the application sees its own route.
   */
  const serveFirstRun = async (request: IncomingMessage, response: ServerResponse, path: string): Promise<void> => {
    try {
      const runtime = bootstrapRuntime()
      await serialize(async () => {
        await makeRoom(runtime)
        await runtime.ensure()
      })
      await forward(request, response, runtime, path, [])
    } catch (error) {
      process.stderr.write(`qilin tenants: the first-run runtime did not start: ${String(error)}\n`)
      respond(response, 503, 'text/plain; charset=utf-8', 'qilin tenants: this deployment could not start its first-run runtime\n')
    }
  }

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://qilin.invalid')
    if (url.pathname === '/healthz') {
      json(response, 200, { ok: true })
      return
    }
    if (url.pathname === '/status') {
      json(response, 200, await status())
      return
    }
    // A deployment with no accounts hands every path to its first-run runtime:
    // the product's own form creates the first account, so the deployment never
    // answers a browser with instructions of its own. The account paths below
    // only exist once a roster does.
    if ((await roster()).all().length === 0) {
      await serveFirstRun(request, response, `${url.pathname}${url.search}`)
      return
    }
    // The hub's own routes answer reads. A proxied path carries whatever method
    // the browser used, because its API calls and its uploads pass through.
    const hubOwnRoute = url.pathname === '/healthz' || url.pathname === '/status' || url.pathname === '/'
    if (request.method !== 'GET' && !(options.singleOrigin && !hubOwnRoute)) {
      respond(response, 405, 'text/plain; charset=utf-8', 'qilin tenants: the hub answers reads only\n')
      return
    }
    if (url.pathname.startsWith('/t/')) {
      const rest = url.pathname.slice('/t/'.length)
      const separator = rest.indexOf('/')
      const username = decodeURIComponent(separator === -1 ? rest : rest.slice(0, separator))
      const account = (await roster()).byIdentifier(username)
      if (account === undefined) {
        respond(response, 404, 'text/plain; charset=utf-8', 'qilin tenants: no such account\n')
        return
      }
      try {
        const runtime = runtimeFor(account.id)
        const launchUrl = await serialize(async () => {
          await makeRoom(runtime)
          return await runtime.ensure()
        })
        // The browser is forwarded to the path it asked for, never to the
        // runtime's launch URL: a launch token hands out a session without
        // credentials, and this deployment authenticates every visitor through
        // the application's own account gate.
        const deeper = separator === -1 ? '/' : url.pathname.slice('/t/'.length + username.length)
        if (!options.singleOrigin) {
          // Every account keeps an origin of its own, so its cookies live in
          // their own jar: one browser authenticates as two accounts at once,
          // and no routing cookie is involved.
          response.writeHead(303, {
            'cache-control': 'no-store',
            'location': `${new URL(launchUrl).origin}${deeper}${url.search}`,
            'referrer-policy': 'no-referrer',
          })
          response.end()
          return
        }
        await forward(request, response, runtime, `${deeper}${url.search}`, [routingCookie(account.id)])
      } catch (error) {
        process.stderr.write(`qilin tenants: the runtime for ${account.username} did not start: ${String(error)}\n`)
        respond(response, 503, 'text/plain; charset=utf-8', `qilin tenants: the runtime for ${account.username} did not start\n`)
      }
      return
    }
    if (options.singleOrigin) {
      const accountId = cookieValue(request.headers.cookie, TENANT_COOKIE)
      // A browser that has chosen no account reaches the sign-in form below,
      // while one that has reaches the runtime that serves it. The account
      // gate sends a signed-out browser to the runtime's own root, which is
      // the same path the form lives on, so the cookie is the whole difference.
      if (accountId !== undefined) {
        try {
          const runtime = await routedRuntime(accountId)
          if (runtime === undefined) {
            // The roster no longer holds that account: drop the cookie so the
            // browser goes back to the directory instead of retrying forever.
            response.writeHead(404, {
              'cache-control': 'no-store',
              'content-type': 'text/plain; charset=utf-8',
              'set-cookie': clearedRoutingCookie(),
            })
            response.end('qilin tenants: the selected tenant no longer exists\n')
            return
          }
          // Signing out ends the runtime's own session; the routing cookie is
          // this deployment's, so it is cleared on the same answer.
          const extra = url.pathname === '/api/auth/logout' ? [clearedRoutingCookie()] : []
          await forward(request, response, runtime, `${url.pathname}${url.search}`, extra)
        } catch (error) {
          process.stderr.write(`qilin tenants: no runtime served ${url.pathname}: ${String(error)}\n`)
          respond(response, 503, 'text/plain; charset=utf-8', 'qilin tenants: that tenant is not serving\n')
        }
        return
      }
    }
    if (url.pathname === '/') {
      const accounts = (await roster()).all()
      // The deployment draws no interface of its own: the application inside an
      // account's runtime owns the landing page, the sign-in form, first-run
      // initialization, and registration. The bare address therefore hands the
      // browser to an runtime. The first roster entry is the deterministic
      // account to start from, and every other account is reachable at its own
      // path.
      const first = accounts[0]
      if (first === undefined) {
        await serveFirstRun(request, response, url.pathname)
        return
      }
      response.writeHead(302, {
        'cache-control': 'no-store',
        'location': `/t/${encodeURIComponent(first.username)}/`,
        'referrer-policy': 'no-referrer',
      })
      response.end()
      return
    }
    respond(response, 404, 'text/plain; charset=utf-8', 'qilin tenants: unknown path\n')
  }

  const server = createServer((request, response) => {
    void handle(request, response).catch((error: unknown) => {
      process.stderr.write(`qilin tenants: request failed: ${String(error)}\n`)
      if (!response.headersSent) respond(response, 500, 'text/plain; charset=utf-8', 'qilin tenants: request failed\n')
      else response.end()
    })
  })

  if (options.singleOrigin) {
    // The mux upgrade is an absolute path on the page origin, so only the
    // routing cookie can name its tenant. The socket is piped, never framed.
    server.on('upgrade', (request, socket, head) => {
      void (async () => {
        if (!hubAcceptsOrigin(request.headers, request.headers.host ?? '')) {
          socket.destroy()
          return
        }
        const accountId = cookieValue(request.headers.cookie, TENANT_COOKIE)
        const runtime = accountId === undefined ? undefined : await routedRuntime(accountId)
        const target = runtime?.proxyTarget()
        if (runtime === undefined || target === undefined) {
          socket.destroy()
          return
        }
        runtime.lastUsedAt = Date.now()
        relayUpgrade(request, socket, head, target, forwardedHeaders(request.headers, new URL(target.origin).host))
      })().catch((error: unknown) => {
        process.stderr.write(`qilin tenants: the upgrade to ${request.url ?? ''} failed: ${String(error)}\n`)
        socket.destroy()
      })
    })
  }

  const listening = Promise.withResolvers<number>()
  server.on('error', (error: Error) => { listening.reject(error) })
  server.listen(options.port, options.host, () => {
    const address = server.address()
    listening.resolve(typeof address === 'object' && address !== null ? address.port : options.port)
  })
  const port = await listening.promise
  const printableHost = options.host === '0.0.0.0' || options.host === '::' ? '127.0.0.1' : options.host
  const address = `http://${printableHost}:${String(port)}/`
  process.stdout.write(`qilin tenants: http://${printableHost}:${String(port)}/\n`)

  // One sweep reclaims every runtime whose last use is older than the idle
  // window: the child exits, its tenant's data stays on disk under the shared
  // home. A window of 0 keeps every runtime, so no sweep is installed at all —
  // an interval would otherwise reclaim each one on its first tick.
  options.onListening?.(address)

  const sweep = Math.max(250, Math.min(Math.floor(options.idleMilliseconds / 4), 30_000))
  const idle = options.idleMilliseconds <= 0 ? undefined : setInterval(() => {
    const now = Date.now()
    for (const runtime of runtimes.values()) {
      if (runtime.status().state !== 'running') continue
      if (now - runtime.lastUsedAt < options.idleMilliseconds) continue
      process.stderr.write(`qilin tenants: reclaiming the idle runtime for ${runtime.status().accountId}\n`)
      void runtime.stop()
    }
  }, sweep)

  const stopping = Promise.withResolvers<number>()
  const shutdown = (): void => {
    void (async () => {
      if (idle !== undefined) clearInterval(idle)
      server.closeAllConnections()
      await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
      await Promise.all([...runtimes.values()].map(async (runtime) => { await runtime.stop() }))
      stopping.resolve(0)
    })()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
  return await stopping.promise
}
