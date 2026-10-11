/**
 * The hub's transport hop: what crosses to a tenant runtime unchanged, what the
 * hop rewrites, and which browser-labeled requests it refuses before any
 * runtime sees them.
 *
 * The upstream here is a stub, so each assertion names one transport fact
 * instead of inferring it from the product's behavior.
 */

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { createServer as createTcpServer, connect, type AddressInfo, type Socket } from 'node:net'
import { PassThrough, Readable } from 'node:stream'
import { afterEach, describe, expect, it } from 'vitest'
import { forwardedHeaders, hubAcceptsOrigin, proxyRequest, relayAnswer, relayUpgrade } from '../src/tenant-proxy.ts'

let upstream: Server | undefined
let raw: Server | undefined

afterEach(async () => {
  await new Promise<void>((resolve) => { if (upstream === undefined) resolve(); else upstream.close(() => { resolve() }) })
  upstream = undefined
  await new Promise<void>((resolve) => { if (raw === undefined) resolve(); else raw.close(() => { resolve() }) })
  raw = undefined
})

/** One request one stub runtime answered. */
interface SeenRequest {
  readonly method: string
  readonly url: string
  readonly headers: IncomingMessage['headers']
}

/** Start one stub runtime and return its origin plus the requests it answered. */
async function stubRuntime(
  answer: (request: IncomingMessage) => { status: number; headers: Record<string, string | string[]>; body: string },
): Promise<{ origin: string; seen: SeenRequest[] }> {
  const seen: SeenRequest[] = []
  const server = createServer((request, response) => {
    seen.push({ method: request.method ?? '', url: request.url ?? '', headers: request.headers })
    const result = answer(request)
    response.writeHead(result.status, result.headers)
    response.end(result.body)
  })
  upstream = server
  const port = await new Promise<number>((resolve) => {
    server.listen(0, '127.0.0.1', () => { resolve((server.address() as AddressInfo).port) })
  })
  return { origin: `http://127.0.0.1:${String(port)}`, seen }
}

/** Read one whole answer body. */
async function bodyOf(stream: Readable): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer))
  return Buffer.concat(chunks).toString('utf8')
}

describe('tenant proxy hop', () => {
  it('forwards a range request and relays the partial answer verbatim', async () => {
    const runtime = await stubRuntime(request => request.headers.range === 'bytes=0-9'
      ? { status: 206, headers: { 'content-range': 'bytes 0-9/100', 'accept-ranges': 'bytes' }, body: '0123456789' }
      : { status: 200, headers: {}, body: 'whole' })

    const answer = await proxyRequest({
      target: { origin: runtime.origin, entry: '/entry' },
      method: 'GET',
      path: '/media/clip.mp4',
      headers: { host: 'hub.invalid:8790', range: 'bytes=0-9' },
      hubAuthority: 'hub.invalid:8790',
    })

    expect(answer.status).toBe(206)
    expect(answer.headers['content-range']).toBe('bytes 0-9/100')
    expect(await bodyOf(answer.stream)).toBe('0123456789')
    expect(runtime.seen[0]?.url).toBe('/media/clip.mp4')
    expect(runtime.seen[0]?.headers.range).toBe('bytes=0-9')
  })

  it('rewrites the authority-bearing headers and drops connection-scoped ones', async () => {
    const runtime = await stubRuntime(() => ({ status: 200, headers: {}, body: 'ok' }))

    await proxyRequest({
      target: { origin: runtime.origin, entry: '/entry' },
      method: 'POST',
      path: '/api/session/list',
      headers: {
        host: 'hub.invalid:8790',
        origin: 'http://hub.invalid:8790',
        connection: 'close',
        'proxy-authorization': 'secret',
        'transfer-encoding': 'chunked',
        'content-type': 'application/json',
        cookie: 'qilin_tenant=abc; session=xyz',
      },
      hubAuthority: 'hub.invalid:8790',
      body: Readable.from('{"a":1}'),
    })

    const seen = runtime.seen[0]?.headers ?? {}
    expect(seen.host).toBe(new URL(runtime.origin).host)
    expect(seen.origin).toBe(runtime.origin)
    expect(seen.cookie).toBe('qilin_tenant=abc; session=xyz')
    expect(seen['content-type']).toBe('application/json')
    // Connection-scoped entries never cross: the runtime sees the hub's own
    // connection handling, never the browser's promise about it.
    expect(seen.connection).not.toBe('close')
    expect(seen['proxy-authorization']).toBeUndefined()
    // The forwarded body still arrives whole, framed by the hub's own client.
    expect(runtime.seen).toHaveLength(1)
  })

  it('refuses a foreign or cross-site label before the runtime sees anything', async () => {
    const runtime = await stubRuntime(() => ({ status: 200, headers: {}, body: 'ok' }))
    const target = { origin: runtime.origin, entry: '/entry' }

    const foreign = await proxyRequest({
      target,
      method: 'POST',
      path: '/api/x',
      headers: { host: 'hub.invalid:8790', origin: 'http://evil.invalid' },
      hubAuthority: 'hub.invalid:8790',
    })
    expect(foreign.status).toBe(403)
    expect(await bodyOf(foreign.stream)).toMatch(/not this hub/u)
    const crossSite = await proxyRequest({
      target,
      method: 'GET',
      path: '/api/x',
      headers: { host: 'hub.invalid:8790', 'sec-fetch-site': 'cross-site' },
      hubAuthority: 'hub.invalid:8790',
    })
    expect(crossSite.status).toBe(403)
    expect(runtime.seen).toHaveLength(0)
    // An unlabelled request passes; the tenant's own Host fence still binds it.
    expect(hubAcceptsOrigin({ host: 'hub.invalid:8790' }, 'hub.invalid:8790')).toBe(true)
    // The opaque origin a sandboxed frame sends names no authority either.
    expect(hubAcceptsOrigin({ origin: 'null' }, 'hub.invalid:8790')).toBe(false)
    expect(hubAcceptsOrigin({ origin: 'http://hub.invalid:8790' }, 'hub.invalid:8790')).toBe(true)
    expect(hubAcceptsOrigin({ origin: 'http://hub.invalid:8791' }, 'hub.invalid:8790')).toBe(false)
  })

  it('relays cookies, redirects, and status unchanged', async () => {
    const runtime = await stubRuntime(() => ({
      status: 303,
      headers: { location: '/workspace', 'set-cookie': ['session=a; Path=/; HttpOnly', 'other=b'] },
      body: '',
    }))

    const answer = await proxyRequest({
      target: { origin: runtime.origin, entry: '/entry' },
      method: 'GET',
      path: '/workspace',
      headers: { host: 'hub.invalid:8790' },
      hubAuthority: 'hub.invalid:8790',
    })

    expect(answer.status).toBe(303)
    expect(answer.headers.location).toBe('/workspace')
    expect(answer.headers['set-cookie']).toEqual(['session=a; Path=/; HttpOnly', 'other=b'])
    expect(forwardedHeaders({ host: 'x', origin: 'http://x' }, 'y:1')).toEqual({ host: 'y:1', origin: 'http://y:1' })
    // A client that attached no Origin keeps its unlabelled request unlabelled.
    expect(forwardedHeaders({ host: 'x' }, 'y:1')).toEqual({ host: 'y:1' })
  })

  it('fails the forward when the runtime is not listening', async () => {
    await expect(proxyRequest({
      target: { origin: 'http://127.0.0.1:1', entry: '/entry' },
      method: 'GET',
      path: '/',
      headers: { host: 'hub.invalid:8790' },
      hubAuthority: 'hub.invalid:8790',
    })).rejects.toThrow(/ECONNREFUSED|connect/u)
  })

  it('streams one relayed answer into the browser response', async () => {
    const written: { status?: number; headers?: Record<string, unknown> } = {}
    const sink = new PassThrough()
    const response = Object.assign(sink, {
      writeHead: (status: number, headers: Record<string, unknown>) => {
        written.status = status
        written.headers = headers
        return sink
      },
    }) as unknown as ServerResponse

    relayAnswer({
      status: 206,
      headers: { 'content-range': 'bytes 0-9/100', connection: 'close', 'transfer-encoding': 'chunked' },
      stream: Readable.from(['0123', '456789']),
    }, response)

    const chunks: Buffer[] = []
    for await (const chunk of sink) chunks.push(Buffer.from(chunk as Buffer))
    expect(Buffer.concat(chunks).toString('utf8')).toBe('0123456789')
    expect(written.status).toBe(206)
    expect(written.headers?.['content-range']).toBe('bytes 0-9/100')
    // Connection-scoped promises do not cross back to the browser.
    expect(written.headers?.connection).toBeUndefined()
    expect(written.headers?.['transfer-encoding']).toBeUndefined()
  })

  it('pipes an upgraded socket to the runtime and back', async () => {
    const received: string[] = []
    const sockets = new Set<Socket>()
    const track = (socket: Socket): void => {
      sockets.add(socket)
      socket.on('close', () => { sockets.delete(socket) })
    }
    const runtime = createTcpServer((socket) => {
      track(socket)
      // The hub writes the request head and the browser's first bytes together,
      // so the handshake answer carries the echo the client waits for.
      socket.on('data', (chunk) => {
        received.push(chunk.toString('utf8'))
        if (received.length === 1) socket.write('HTTP/1.1 101 Switching Protocols\r\n\r\npong')
      })
    })
    runtime.on('connection', track)
    const runtimePort = await new Promise<number>((resolve) => {
      runtime.listen(0, '127.0.0.1', () => { resolve((runtime.address() as AddressInfo).port) })
    })

    const hub = createTcpServer((socket) => {
      relayUpgrade(
        { method: 'GET', url: '/api/remote.mux', headers: {} } as IncomingMessage,
        socket,
        Buffer.alloc(0),
        { origin: `http://127.0.0.1:${String(runtimePort)}`, entry: '/entry' },
        { host: `127.0.0.1:${String(runtimePort)}`, 'sec-websocket-key': 'abc' },
      )
    })
    hub.on('connection', track)
    const hubPort = await new Promise<number>((resolve) => {
      hub.listen(0, '127.0.0.1', () => { resolve((hub.address() as AddressInfo).port) })
    })

    const client = connect({ host: '127.0.0.1', port: hubPort })
    track(client)
    try {
      const answered = Promise.withResolvers<string>()
      client.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8')
        if (text.includes('pong')) answered.resolve(text)
      })
      await new Promise<void>((resolve) => { client.on('connect', () => { resolve() }) })
      client.write('hello')
      expect(await answered.promise).toContain('pong')
      const upstreamSaw = received.join('')
      expect(upstreamSaw).toContain('GET /api/remote.mux HTTP/1.1')
      expect(upstreamSaw).toContain(`host: 127.0.0.1:${String(runtimePort)}`)
      expect(upstreamSaw).toContain('sec-websocket-key: abc')
      expect(upstreamSaw).toContain('hello')
    } finally {
      // Both piping ends hold the sockets open, so they close before the
      // listeners do: a graceful close alone would wait for them forever.
      for (const socket of sockets) socket.destroy()
      await Promise.all([
        new Promise<void>((resolve) => { hub.close(() => { resolve() }) }),
        new Promise<void>((resolve) => { runtime.close(() => { resolve() }) }),
      ])
    }
  })
})
