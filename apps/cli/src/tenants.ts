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
import { TenantRuntime, type TenantRuntimeStatus } from './tenant-runtime.ts'
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
}

/** Routing cookie the hub sets so later requests, whatever their path, name their tenant. */
const TENANT_COOKIE = 'qilin_tenant'

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

/** Escape one value for the hub's own HTML. */
function escapeHtml(value: string): string {
  const replacements: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
  return value.replace(/[&<>"']/gu, character => replacements[character] ?? character)
}

/**
 * The deployment's sign-in page: the entrance a public address shows.
 *
 * The entry authenticates against the roster, so a visitor never has to know
 * an account's runtime path or port. The session cookie the browser keeps is
 * the runtime's own; this page only decides which runtime the browser reaches.
 * @param error - message to show when a previous attempt failed.
 * @returns the document.
 */
function signinPage(error?: string): string {
  const notice = error === undefined ? '' : `    <p role="alert">${escapeHtml(error)}</p>\n`
  return [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8">',
    '    <meta name="viewport" content="width=device-width, initial-scale=1">',
    '    <title>Sign in</title>',
    '    <style>body{font:15px/1.5 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;background:#faf7f2;color:#2a2a2a}main{width:min(22rem,90vw)}h1{font-size:1.25rem;margin:0 0 1rem}label{display:block;margin:.75rem 0 .25rem;font-size:.85rem;color:#666}input{width:100%;padding:.5rem .6rem;border:1px solid #d8d2c8;border-radius:.4rem;font:inherit;background:#fff}button{margin-top:1.25rem;width:100%;padding:.55rem;border:0;border-radius:.4rem;background:#2a2a2a;color:#fff;font:inherit;cursor:pointer}p[role=alert]{color:#b3261e;font-size:.85rem}</style>',
    '  </head>',
    '  <body>',
    '    <main>',
    '      <h1>Sign in</h1>',
    notice,
    '      <form method="post" action="/signin">',
    '        <label for="identifier">Username or email</label>',
    '        <input id="identifier" name="identifier" autocomplete="username" autofocus required>',
    '        <label for="password">Password</label>',
    '        <input id="password" name="password" type="password" autocomplete="current-password" required>',
    '        <button type="submit">Sign in</button>',
    '      </form>',
    '    </main>',
    '  </body>',
    '</html>',
    '',
  ].join('\n')
}

/** One form value from an urlencoded sign-in body. */
function formValue(body: string, name: string): string {
  for (const pair of body.split('&')) {
    const separator = pair.indexOf('=')
    if (separator === -1) continue
    if (decodeURIComponent(pair.slice(0, separator).replace(/\+/gu, ' ')) === name) {
      return decodeURIComponent(pair.slice(separator + 1).replace(/\+/gu, ' '))
    }
  }
  return ''
}

/** A sign-in body, bounded so a public address cannot buffer an unbounded request. */
const SIGNIN_BODY_LIMIT = 4096

/**
 * Read one sign-in submission.
 * @param request - the browser's request.
 * @returns the decoded body, or undefined when it exceeds the limit.
 */
async function readSigninBody(request: IncomingMessage): Promise<string | undefined> {
  const chunks: Buffer[] = []
  let length = 0
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Buffer)
    length += buffer.length
    if (length > SIGNIN_BODY_LIMIT) return undefined
    chunks.push(buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}
/**
 * The hub's directory page: one link per account, and the first-run state when
 * the shared home has no accounts yet.
 * @param accounts - the shared home's accounts.
 * @returns the document.
 */
function directoryPage(accounts: readonly { readonly username: string }[]): string {
  const rows = accounts
    .map(account => `      <li><a href="/t/${encodeURIComponent(account.username)}">${escapeHtml(account.username)}</a></li>`)
    .join('\n')
  const body = accounts.length === 0
    ? '      <p>This Harness home has no accounts yet. Create one through the ordinary Web surface, then reload this page.</p>'
    : `    <ul>\n${rows}\n    </ul>`
  return [
    '<!doctype html>',
    '<html lang="en">',
    '  <head>',
    '    <meta charset="utf-8">',
    '    <title>qilin tenants</title>',
    '  </head>',
    '  <body>',
    '    <h1>qilin tenants</h1>',
    '    <p>Each account below opens its own runtime. Sessions, tasks, and workspaces stay with the account; plugins and model settings are shared.</p>',
    body,
    '  </body>',
    '</html>',
    '',
  ].join('\n')
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
      restartBackoffMilliseconds: options.restartBackoffMilliseconds,
      log: (line) => { process.stderr.write(`qilin tenants: [${accountId}] ${line}\n`) },
    })
    runtimes.set(accountId, created)
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
   * Sign one visitor in at the deployment's address.
   *
   * The runtime that will serve the account authenticates the credentials, so
   * the roster's password hashes are checked in exactly one place and this
   * process never needs the account's own session. What the entry adds is the
   * routing cookie that every later request is dispatched by.
   * @param response - the browser's answer.
   * @param identifier - the submitted username or email address.
   * @param password - the submitted password.
   */
  const signIn = async (response: ServerResponse, identifier: string, password: string): Promise<void> => {
    const account = (await roster()).byIdentifier(identifier)
    if (account === undefined || password === '') {
      respond(response, 200, 'text/html; charset=utf-8', signinPage('That account and password do not match.'))
      return
    }
    try {
      const runtime = runtimeFor(account.id)
      const launchUrl = await serialize(async () => {
        await makeRoom(runtime)
        return await runtime.ensure()
      })
      const answered = await fetch(new URL('/api/auth/login', new URL(launchUrl).origin), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ identifier, password }),
      })
      if (answered.status !== 200) {
        respond(response, 200, 'text/html; charset=utf-8', signinPage('That account and password do not match.'))
        return
      }
      const session = answered.headers.getSetCookie()
      response.writeHead(303, {
        'cache-control': 'no-store',
        'location': '/',
        'referrer-policy': 'no-referrer',
        'set-cookie': [...session, routingCookie(account.id)],
      })
      response.end()
    } catch (error) {
      process.stderr.write(`qilin tenants: the runtime for ${account.username} did not start: ${String(error)}\n`)
      respond(response, 503, 'text/plain; charset=utf-8', 'qilin tenants: that account is not serving\n')
    }
  }

  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const url = new URL(request.url ?? '/', 'http://qilin.invalid')
    // The hub's own routes answer reads. A proxied path carries whatever method
    // the browser used, because its API calls and its uploads pass through.
    const hubOwnRoute = url.pathname === '/healthz' || url.pathname === '/status' || url.pathname === '/'
    if (request.method === 'POST' && url.pathname === '/signin') {
      const body = await readSigninBody(request)
      if (body === undefined) {
        respond(response, 413, 'text/plain; charset=utf-8', 'qilin tenants: the sign-in body is too large\n')
        return
      }
      await signIn(response, formValue(body, 'identifier').trim(), formValue(body, 'password'))
      return
    }
    if (request.method !== 'GET' && !(options.singleOrigin && !hubOwnRoute)) {
      respond(response, 405, 'text/plain; charset=utf-8', 'qilin tenants: the hub answers reads only\n')
      return
    }
    if (url.pathname === '/healthz') {
      json(response, 200, { ok: true })
      return
    }
    if (url.pathname === '/status') {
      json(response, 200, await status())
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
      // A deployment with no accounts yet states that; a deployment with
      // accounts asks who is arriving instead of listing them.
      respond(response, 200, 'text/html; charset=utf-8', accounts.length === 0 ? directoryPage(accounts) : signinPage())
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
  process.stdout.write(`qilin tenants: http://${printableHost}:${String(port)}/\n`)

  // One sweep reclaims every runtime whose last use is older than the idle
  // window: the child exits, its tenant's data stays on disk under the shared
  // home. A window of 0 keeps every runtime, so no sweep is installed at all —
  // an interval would otherwise reclaim each one on its first tick.
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
