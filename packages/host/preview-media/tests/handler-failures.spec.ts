/**
 * Focused handler coverage for failures a real composition cannot reach
 * deterministically: unknown thrown values, a response that already sent its
 * headers, a backend stat without a reported size, and the route's own
 * method/parameter rejections. The REAL-composition route.spec exercises the
 * served byte surface; this suite pins the error mapping and fallback arms.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { describe, expect, it } from 'vitest'
import type { Context } from '@qilin-agent/kylin'
import { FsTargetKey, type FsTarget } from '@qilin-agent/fs'
import { apply, PREVIEW_MEDIA_PATH, type Config } from '../src/index.ts'

type Handler = (req: IncomingMessage, res: ServerResponse) => Promise<void>

/** One response recording the status, headers, and body the handler wrote. */
class Recorder {
  statusCode = 200
  headersSent = false
  headers: Record<string, string> = {}
  body: Buffer | undefined
  ended = false
  writeHead(status: number, headers: Record<string, string> = {}): this {
    this.statusCode = status
    this.headers = headers
    this.headersSent = true
    return this
  }

  end(body?: Uint8Array | string): this {
    this.ended = true
    this.body = body === undefined ? undefined : Buffer.from(body)
    return this
  }
}

/** One request: method/URL/range headers plus the upload body the route may consume. */
class Request {
  headers: Record<string, string>
  body: Buffer
  constructor(
    readonly method: string,
    readonly url: string | undefined,
    init: { headers?: Record<string, string>; body?: Buffer } = {},
  ) {
    this.headers = init.headers ?? {}
    this.body = init.body ?? Buffer.alloc(0)
  }

  async *[Symbol.asyncIterator](): AsyncGenerator<Buffer> {
    if (this.body.byteLength === 0) return
    yield this.body
  }
}

/** What the fake filesystem reports for a resolved target. */
type Stat = { type: 'file' | 'directory'; size?: number } | undefined

/** The filesystem methods the route consumes, with per-test overrides. */
interface FakeFs {
  resolve: (path: string, options?: { cwd: string }) => FsTarget
  stat: (target: FsTarget) => Stat | Promise<Stat>
  readBytes: () => Buffer
  readByteRange: () => Buffer
  contains: () => boolean
  writeBytes: () => { version: string }
}

interface Harness {
  readonly media: Handler
  readonly upload: Handler
  readonly resolveCalls: string[]
  readonly rejection: { current: number | undefined }
  readonly sessions: Map<string, { header: { cwd?: string } }>
  readonly fs: FakeFs
}

/** Mount the route rows over captured handler functions and a controllable filesystem. */
function mount(config: Config = {}, overrides: Partial<FakeFs> = {}): Harness {
  const handlers: Handler[] = []
  const rejection = { current: undefined as number | undefined }
  const resolveCalls: string[] = []
  const sessions = new Map<string, { header: { cwd?: string } }>([
    ['media-session', { header: { cwd: '/ws' } }],
  ])
  const fs: FakeFs = {
    resolve: (path, options) => { resolveCalls.push(options?.cwd ?? ''); return { targetKey: FsTargetKey(path), displayPath: path } },
    stat: () => ({ type: 'file', size: 3 }),
    readBytes: () => Buffer.from('abc'),
    readByteRange: () => Buffer.from('bc'),
    contains: () => true,
    writeBytes: () => ({ version: 'v1' }),
    ...overrides,
  }
  const fake = {
    effect: (create: () => unknown) => { create(); return () => {} },
    webServer: {
      register: ({ handler }: { handler: Handler }) => { handlers.push(handler); return () => {} },
    },
    connection: { requestRejection: () => rejection.current },
    sessions: { get: (id: string) => sessions.get(id) },
    sandboxPolicy: { workspaceRoot: '/ws' },
    fs,
  }
  apply(fake as Context & typeof fake, config)
  return { media: handlers[0]!, upload: handlers[1]!, resolveCalls, rejection, sessions, fs }
}

/** Invoke one captured handler with the fake request and response. */
async function send(handler: Handler, request: Request, response: Recorder): Promise<void> {
  await handler(request as Request & IncomingMessage, response as Recorder & ServerResponse)
}

const mediaUrl = (query: string): string => `${PREVIEW_MEDIA_PATH}?${query}`
const uploadUrl = (query: string): string => `${PREVIEW_MEDIA_PATH}/upload?${query}`

describe('preview media route failures', () => {
  it('answers the documented method, parameter, and not-found failures', async () => {
    const harness = mount()
    const wrongMethod = new Recorder()
    await send(harness.media, new Request('POST', mediaUrl('sessionId=media-session&path=a.png')), wrongMethod)
    expect(wrongMethod).toMatchObject({ statusCode: 405, headers: { allow: 'GET, HEAD' } })
    const missingQuery = new Recorder()
    await send(harness.media, new Request('GET', undefined), missingQuery)
    expect(missingQuery).toMatchObject({ statusCode: 400 })
    expect(missingQuery.body?.toString()).toBe('sessionId and path are required')
    const directory = mount({}, { stat: () => ({ type: 'directory' }) })
    const notAFile = new Recorder()
    await send(directory.media, new Request('GET', mediaUrl('sessionId=media-session&path=dir')), notAFile)
    expect(notAFile).toMatchObject({ statusCode: 400 })
    expect(notAFile.body?.toString()).toBe('"dir" is a directory')
  })

  it('serves an extensionless file as octet-stream and honours the download disposition', async () => {
    const harness = mount()
    const download = new Recorder()
    await send(harness.media, new Request('GET', mediaUrl('sessionId=media-session&path=image.png&download=1')), download)
    expect(download.statusCode).toBe(200)
    expect(download.headers['content-type']).toBe('image/png')
    expect(download.headers['content-disposition']).toBe("attachment; filename*=UTF-8''image.png")
    const windowsPath = new Recorder()
    await send(harness.media, new Request('GET', mediaUrl('sessionId=media-session&path=a%5Cb.png&download=1')), windowsPath)
    expect(windowsPath.headers['content-disposition']).toBe("attachment; filename*=UTF-8''b.png")
    const noExtension = new Recorder()
    await send(harness.media, new Request('GET', mediaUrl('sessionId=media-session&path=README')), noExtension)
    expect(noExtension.statusCode).toBe(200)
    expect(noExtension.headers['content-type']).toBe('application/octet-stream')
  })

  it('answers a HEAD range request with headers and no body', async () => {
    const harness = mount()
    const res = new Recorder()
    await send(harness.media, new Request('HEAD', mediaUrl('sessionId=media-session&path=a.png'), { headers: { range: 'bytes=0-1' } }), res)
    expect(res.statusCode).toBe(206)
    expect(res.headers['content-range']).toBe('bytes 0-1/3')
    expect(res.body).toBeUndefined()
  })

  it('serves a backend that reports no size through the buffered path', async () => {
    const harness = mount({}, { stat: () => ({ type: 'file' }) })
    const res = new Recorder()
    await send(harness.media, new Request('GET', mediaUrl('sessionId=media-session&path=unknown.bin'), { headers: { range: 'bytes=0-1' } }), res)
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-length']).toBe('3')
  })

  it('falls back to the sandbox root for a session without a recorded cwd, and to the default media limit', async () => {
    const harness = mount()
    harness.sessions.set('bare', { header: {} })
    const res = new Recorder()
    await send(harness.media, new Request('GET', mediaUrl('sessionId=bare&path=a.png')), res)
    expect(res.statusCode).toBe(200)
    expect(harness.resolveCalls).toContain('/ws')
  })

  it('maps unknown thrown values and an already-sent response to the internal-error line', async () => {
    const unknown = mount({}, { stat: () => { throw 'boom' } })
    const unknownRes = new Recorder()
    await send(unknown.media, new Request('GET', mediaUrl('sessionId=media-session&path=a.png')), unknownRes)
    expect(unknownRes).toMatchObject({ statusCode: 500 })
    expect(unknownRes.body?.toString()).toBe('internal error')
    const sent = mount({}, { stat: () => { throw new Error('boom') } })
    const sentRes = new Recorder()
    sentRes.headersSent = true
    await send(sent.media, new Request('GET', mediaUrl('sessionId=media-session&path=a.png')), sentRes)
    expect(sentRes.statusCode).toBe(200)
    expect(sentRes.body?.toString()).toBe('internal error')
  })

  it('rejects the upload route method, missing target, oversized body, and outside target', async () => {
    const harness = mount({ mediaLimitBytes: 4 })
    const rejection = new Recorder()
    harness.rejection.current = 403
    await send(harness.upload, new Request('PUT', uploadUrl('sessionId=media-session&path=a.bin')), rejection)
    expect(rejection.statusCode).toBe(403)
    harness.rejection.current = undefined
    const wrongMethod = new Recorder()
    await send(harness.upload, new Request('GET', uploadUrl('sessionId=media-session&path=a.bin')), wrongMethod)
    expect(wrongMethod).toMatchObject({ statusCode: 405, headers: { allow: 'PUT' } })
    const missingUrl = new Recorder()
    await send(harness.upload, new Request('PUT', undefined), missingUrl)
    expect(missingUrl).toMatchObject({ statusCode: 400 })
    const oversized = new Recorder()
    await send(harness.upload, new Request('PUT', uploadUrl('sessionId=media-session&path=a.bin'), { body: Buffer.alloc(5) }), oversized)
    expect(oversized).toMatchObject({ statusCode: 400 })
    expect(oversized.body?.toString()).toBe('upload exceeds the media limit')
    const outside = mount({}, { contains: () => false })
    const refused = new Recorder()
    await send(outside.upload, new Request('PUT', uploadUrl('sessionId=media-session&path=a.bin'), { body: Buffer.from('x') }), refused)
    expect(refused).toMatchObject({ statusCode: 403 })
  })
})
