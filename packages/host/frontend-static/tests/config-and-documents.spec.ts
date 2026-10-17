/**
 * Configuration and public-document coverage: document validation, the
 * entry-path default for an omitted/empty index list, the tenant account
 * attribute, and the served public-document bytes. The REAL-composition spec
 * pins the authenticated index and asset surface; this suite exercises the
 * rows that composition does not configure.
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Context } from '@qilin-agent/kylin'
import { apply, type Config } from '../src/index.ts'

interface Recorder {
  statusCode: number
  headers: Record<string, string>
  body: string | undefined
  writeHead: (status: number, headers?: Record<string, string>) => Recorder
  end: (body?: string | Uint8Array) => Recorder
}

function recorder(): Recorder {
  const res: Recorder = {
    statusCode: 200,
    headers: {},
    body: undefined,
    writeHead(status, headers = {}) { res.statusCode = status; res.headers = headers; return res },
    end(body) { res.body = typeof body === 'string' ? body : body === undefined ? '' : Buffer.from(body).toString(); return res },
  }
  return res
}

let root: string
let distIndex: string

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'qilin-frontend-static-rows-'))
  await mkdir(join(root, 'dist'))
  distIndex = join(root, 'dist', 'index.html')
  await writeFile(distIndex, '<head></head><body>shell</body>')
  await writeFile(join(root, 'dist', 'landing.html'), '<head><title>landing</title></head>')
})

afterAll(async () => {
  if (root !== undefined) await rm(root, { recursive: true, force: true })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

type Fallback = (req: IncomingMessage, res: ServerResponse) => Promise<void>

/** Mount the plugin over a captured fallback seat and a stub connection. */
function mount(config: Config): { serve: Fallback; authorized: () => number } {
  let fallback: Fallback | undefined
  let checks = 0
  const ctx = {
    effect: (create: () => unknown) => { create(); return () => {} },
    connection: {
      entryPath: '/entry',
      authorizeIndex: () => { checks += 1; return true },
    },
    webServer: {
      registerFallback: (handler: Fallback) => { fallback = handler; return () => {} },
      renderIndex: (html: string) => html.replace('<head>', '<head><script>window.__T__=1</script>'),
    },
  } as unknown as Context
  apply(ctx, config)
  if (fallback === undefined) throw new Error('fallback seat was not claimed')
  return { serve: fallback, authorized: () => checks }
}

/** Serve one request through the captured fallback seat. */
async function serve(handler: Fallback, url: string | undefined, method = 'GET'): Promise<Recorder> {
  const res = recorder()
  await handler({ method, url } as IncomingMessage, res as unknown as ServerResponse)
  return res
}

describe('frontend-static configuration', () => {
  it('serves a configured public document with the site base and the account identity', async () => {
    vi.stubEnv('QILIN_ACCOUNT_ID', 'acct-1')
    const mounted = mount({ distIndex, documents: [{ path: '/landing', file: 'landing.html' }] })
    const res = await serve(mounted.serve, '/landing')
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8')
    expect(res.body).toContain('<base href="/">')
    expect(res.body).toContain('<meta name="qilin-account" content="acct-1">')
    expect(mounted.authorized()).toBe(0)
  })

  it('defaults an omitted index list to the transport entry path and /index.html', async () => {
    const mounted = mount({ distIndex })
    for (const path of ['/entry', '/index.html']) {
      const res = await serve(mounted.serve, path)
      expect(res.statusCode).toBe(200)
      expect(res.body).toContain('window.__T__=1')
    }
    expect(mounted.authorized()).toBe(2)
    const miss = await serve(mounted.serve, '/')
    expect(miss.statusCode).toBe(404)
  })

  it('honours an explicit index list and names no account for an empty tenant id', async () => {
    vi.stubEnv('QILIN_ACCOUNT_ID', '')
    const mounted = mount({ distIndex, indexPaths: ['/only'] })
    const res = await serve(mounted.serve, '/only')
    expect(res.statusCode).toBe(200)
    expect(res.body).not.toContain('qilin-account')
    expect((await serve(mounted.serve, '/entry')).statusCode).toBe(404)
  })

  it('rejects malformed document rows at load time', async () => {
    const malformed = [
      { path: 'relative', file: 'index.html' },
      { path: '/trailing/', file: 'index.html' },
      { path: '/double//slash', file: 'index.html' },
      { path: '/index.html', file: 'index.html' },
      { path: '/doc', file: '' },
      { path: '/doc', file: 'a/b' },
      { path: '/doc', file: 'a\\b' },
      { path: '/doc', file: '.' },
      { path: '/doc', file: '..' },
    ]
    for (const document of malformed) {
      expect(() => mount({ distIndex, documents: [document] })).toThrow(/frontend-static:/)
    }
    expect(() => mount({ distIndex, documents: [{ path: '/dup', file: 'a.html' }, { path: '/dup', file: 'b.html' }] })).toThrow(/duplicate document path/)
    expect(() => mount({ distIndex, documents: [{ path: '/', file: 'index.html' }] })).not.toThrow()
  })
})
