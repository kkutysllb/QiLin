/** Reporting one settled Turn's usage to the deployment that started the runtime. */

import { createServer, type Server } from 'node:http'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import type { Session, SessionEvent } from '@qilin-agent/session'
import * as UsageReport from '../src/index.ts'

const URL_VARIABLE = 'QILIN_USAGE_URL'
const TOKEN_VARIABLE = 'QILIN_USAGE_TOKEN'
const previous = { url: process.env[URL_VARIABLE], token: process.env[TOKEN_VARIABLE] }

/** One endpoint a runtime can report to, recording every body it received. */
interface Endpoint {
  readonly url: string
  readonly bodies: Record<string, unknown>[]
  readonly requests: { method: string | undefined; url: string | undefined; authorization: string | undefined }[]
  readonly stop: () => Promise<void>
  status: number
  /** Body a read is answered with. */
  body: unknown
}

const endpoints: Endpoint[] = []
const contexts: Context[] = []

beforeEach(() => {
  Reflect.deleteProperty(process.env, URL_VARIABLE)
  Reflect.deleteProperty(process.env, TOKEN_VARIABLE)
})

afterEach(async () => {
  for (const ctx of contexts.splice(0)) await ctx.fiber.dispose()
  for (const endpoint of endpoints.splice(0)) await endpoint.stop()
  if (previous.url === undefined) Reflect.deleteProperty(process.env, URL_VARIABLE)
  else process.env[URL_VARIABLE] = previous.url
  if (previous.token === undefined) Reflect.deleteProperty(process.env, TOKEN_VARIABLE)
  else process.env[TOKEN_VARIABLE] = previous.token
})

/** Start an endpoint that records what it is sent. */
async function recordingEndpoint(): Promise<Endpoint> {
  const bodies: Record<string, unknown>[] = []
  const requests: Endpoint['requests'][number][] = []
  const server: Server = createServer((request, response) => {
    requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization })
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      if (request.method === 'POST') bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>)
      response.writeHead(recorded.status, { 'content-type': 'application/json' })
      response.end(JSON.stringify(recorded.body ?? {}))
    })
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', () => { resolve() }) })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  const recorded: Endpoint = {
    url: `http://127.0.0.1:${String(port)}/report`,
    bodies,
    requests,
    status: 200,
    body: { accountId: 'account-1', total: { turns: 4 } },
    stop: async () => { await new Promise<void>((resolve) => { server.close(() => { resolve() }) }) },
  }
  endpoints.push(recorded)
  return recorded
}

function event(seq: number, type: string, data: unknown): SessionEvent {
  return { seq, time: seq, type, data } as unknown as SessionEvent
}

const ACCOUNTED = { inputTokens: 100, outputTokens: 20, totalTokens: 170, cacheReadTokens: 50 }

/** One complete Turn whose single attempt reported exactly those buckets. */
function settledTurn(usage: Record<string, number> = ACCOUNTED): SessionEvent[] {
  const message = event(3, 'assistant/message', {
    turn: 1,
    step: 1,
    stream: [
      { type: 'chunk', time: 3, chunk: { type: 'block-start', index: 0, blockType: 'text' } },
      { type: 'chunk', time: 3, chunk: { type: 'usage', usage } },
    ],
    message: {
      id: 'message-3',
      role: 'assistant',
      content: [{ type: 'text', text: 'done' }],
      source: { kind: 'model', provider: 'deepseek', model: 'deepseek-chat' },
    },
    usage,
  })
  return [
    event(1, 'turn/start', { turn: 1 }),
    event(2, 'step/start', { turn: 1, step: 1 }),
    message,
    event(90, 'step/end', { turn: 1, step: 1 }),
    event(91, 'turn/end', { turn: 1, reason: { kind: 'completed' } }),
  ]
}

/** One route a plugin contributed, as the fake web transport received it. */
interface RegisteredRoute {
  readonly path: string
  readonly methods: readonly string[]
  readonly fetch: (request: Request) => Promise<Response>
}

/** Boot the plugin the way a deployment's runtime would, optionally with a web transport. */
async function boot(environment: { url?: string; token?: string }, routes?: RegisteredRoute[]): Promise<Context> {
  if (environment.url !== undefined) process.env[URL_VARIABLE] = environment.url
  if (environment.token !== undefined) process.env[TOKEN_VARIABLE] = environment.token
  const ctx = new Context()
  contexts.push(ctx)
  if (routes !== undefined) {
    ctx.provide('connection', {
      fetch: {
        register: (route: RegisteredRoute) => { routes.push(route); return async () => {} },
      },
    } as never)
  }
  await ctx.plugin(UsageReport)
  return ctx
}

const SESSION = { id: 'session-1' } as unknown as Session

describe('usage reporting', () => {
  it('reports one settled Turn with its cache buckets', async () => {
    const endpoint = await recordingEndpoint()
    const ctx = await boot({ url: endpoint.url, token: 'token-1' })
    for (const event of settledTurn()) ctx.emit('session/event', SESSION, event)
    await vi.waitFor(() => { expect(endpoint.bodies).toHaveLength(1) })
    expect(endpoint.bodies[0]).toMatchObject({
      sessionId: 'session-1',
      turn: 1,
      inputTokens: 100,
      outputTokens: 20,
      cacheReadTokens: 50,
    })
    expect(typeof endpoint.bodies[0]?.at).toBe('number')
  })

  it('stays silent when the deployment named no endpoint', async () => {
    const ctx = await boot({})
    const warn = vi.spyOn(ctx.logger, 'warn')
    for (const event of settledTurn()) ctx.emit('session/event', SESSION, event)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(warn).not.toHaveBeenCalled()
  })

  it('sends nothing for a Turn whose attempts never reported usage', async () => {
    const endpoint = await recordingEndpoint()
    const ctx = await boot({ url: endpoint.url, token: 'token-1' })
    const turn = settledTurn()
    // Drop the usage from both the message and its stream: the derivation then
    // has no exact total, so there is nothing to report rather than a guess.
    const stripped = turn.map((entry) => {
      if (entry.type !== 'assistant/message') return entry
      const data = entry.data as { stream: { chunk: { type: string } }[] }
      return event(entry.seq, entry.type, {
        ...(entry.data as object),
        usage: undefined,
        stream: data.stream.filter(item => item.chunk.type !== 'usage'),
      })
    })
    for (const entry of stripped) ctx.emit('session/event', SESSION, entry)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(endpoint.bodies).toHaveLength(0)
  })

  it('keeps the session running when the deployment refuses the report', async () => {
    const endpoint = await recordingEndpoint()
    endpoint.status = 500
    const ctx = await boot({ url: endpoint.url, token: 'token-1' })
    const warn = vi.spyOn(ctx.logger, 'warn')
    for (const event of settledTurn()) ctx.emit('session/event', SESSION, event)
    await vi.waitFor(() => { expect(endpoint.bodies).toHaveLength(1) })
    await vi.waitFor(() => { expect(warn).toHaveBeenCalledTimes(1) })
    expect(String(warn.mock.calls[0]?.[0])).toContain('refused one report')
  })

  it('answers the browser its own usage, asking the ledger with its own credential', async () => {
    const endpoint = await recordingEndpoint()
    const routes: RegisteredRoute[] = []
    await boot({ url: endpoint.url, token: 'token-1' }, routes)
    expect(routes.map(route => route.path)).toEqual(['/api/usage/me'])
    expect(routes[0]?.methods).toEqual(['GET'])

    const answered = await (routes[0] as RegisteredRoute).fetch(new Request('http://runtime.invalid/api/usage/me?from=5000'))
    expect(answered.status).toBe(200)
    expect(await answered.json()).toEqual({ accountId: 'account-1', total: { turns: 4 } })
    // The read asks the ledger with this runtime's credential, and passes the
    // window through rather than reading all of it.
    expect(endpoint.requests).toHaveLength(1)
    expect(endpoint.requests[0]).toMatchObject({ method: 'GET', url: '/report?from=5000', authorization: 'Bearer token-1' })
  })

  it('serves no read for a runtime with no web transport', async () => {
    const endpoint = await recordingEndpoint()
    const ctx = await boot({ url: endpoint.url, token: 'token-1' })
    for (const event of settledTurn()) ctx.emit('session/event', SESSION, event)
    // Reporting does not depend on the transport being there.
    await vi.waitFor(() => { expect(endpoint.bodies).toHaveLength(1) })
  })

  it('reports an unreachable ledger as that, not as an account with no usage', async () => {
    const endpoint = await recordingEndpoint()
    const routes: RegisteredRoute[] = []
    await boot({ url: endpoint.url, token: 'token-1' }, routes)
    await endpoint.stop()
    const answered = await (routes[0] as RegisteredRoute).fetch(new Request('http://runtime.invalid/api/usage/me'))
    expect(answered.status).toBe(503)
    expect(await answered.json()).toMatchObject({ error: { code: 'ledger-unavailable' } })
  })
})
