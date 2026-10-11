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
  readonly stop: () => Promise<void>
  status: number
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
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    request.on('end', () => {
      bodies.push(JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>)
      response.writeHead(recorded.status)
      response.end()
    })
  })
  await new Promise<void>((resolve) => { server.listen(0, '127.0.0.1', () => { resolve() }) })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : 0
  const recorded: Endpoint = {
    url: `http://127.0.0.1:${String(port)}/report`,
    bodies,
    status: 200,
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

/** Boot the plugin the way a deployment's runtime would. */
async function boot(environment: { url?: string; token?: string }): Promise<Context> {
  if (environment.url !== undefined) process.env[URL_VARIABLE] = environment.url
  if (environment.token !== undefined) process.env[TOKEN_VARIABLE] = environment.token
  const ctx = new Context()
  contexts.push(ctx)
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
})
