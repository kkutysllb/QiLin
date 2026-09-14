/**
 * REAL-composition coverage: a test-only cordis.yml booted through the
 * vendored Loader mounts the webserver and frontend-static rows, and every
 * assertion observes the served HTTP surface — public documents, explicit
 * index entry points with index taps, asset serving, 404 misses, traversal
 * rejection, 405 on non-GET/HEAD, and seat release on fiber disposal (HMR
 * safety). Configuration rows that cannot compose fail at load instead.
 */

import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { Context } from '@qilin/kylin'
import Loader from '@qilin/kylin-plugin-loader'
import Include from '@qilin/kylin-plugin-include'
import * as Connection from '@qilin/client-connection'
import LocalCredentials from '@qilin/credentials-local'
import HttpServer from '@qilin/host-webserver'
import * as FrontendStatic from '../src/index.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Write a dist fixture and the authenticated Web rows, then boot them through the real Loader. */
async function loadComposition(): Promise<Context> {
  root = await mkdtemp(join(tmpdir(), 'qilin-frontend-static-'))
  const dist = join(root, 'dist')
  await mkdir(dist)
  const distIndex = join(dist, 'index.html')
  await writeFile(distIndex, '<head></head><body>shell</body>')
  await writeFile(join(dist, 'landing.html'), '<head></head><body>landing</body>')
  await writeFile(join(dist, 'app.js'), 'export {}')
  await writeFile(join(dist, 'blob.bin'), 'BLOB')
  await writeFile(join(dist, 'manifest.webmanifest'), '{}')
  await mkdir(join(dist, 'empty'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@qilin/credentials-local'",
    '  config:',
    `    path: '${join(root, '.credentials.yaml')}'`,
    '    watch: false',
    "- name: '@qilin/host-webserver'",
    '  config:',
    "    host: '127.0.0.1'",
    '    port: 0',
    "- name: '@qilin/client-connection'",
    '- id: frontend',
    "  name: '@qilin/host-frontend-static'",
    '  config:',
    `    distIndex: '${distIndex}'`,
    "    indexPaths: ['/workspace', '/index.html']",
    '    documents:',
    "      - { path: '/', file: 'landing.html' }",
    '',
  ].join('\n'))

  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@qilin/credentials-local', LocalCredentials],
    ['@qilin/host-webserver', HttpServer],
    ['@qilin/client-connection', Connection],
    ['@qilin/host-frontend-static', FrontendStatic],
  ])
  context.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  return context
}

/** GET (by default) one path against the running server; returns status, content-type, and the body. */
async function request(port: number, path: string, init?: RequestInit): Promise<{ status: number; type: string | null; body: string }> {
  const response = await fetch(`http://127.0.0.1:${String(port)}${path}`, init)
  return {
    status: response.status,
    type: response.headers.get('content-type'),
    body: await response.text(),
  }
}

describe('real Loader composition', () => {
  it('serves public documents, gated index entries, and files while preserving HTTP error semantics', { timeout: 60_000 }, async () => {
    const loaded = await loadComposition()
    const unloaded = [...loaded.loader.entries()]
      .filter(entry => entry.fiber === undefined && !entry.disabled)
      .map(entry => entry.options.name)
    expect(unloaded).toEqual([])
    const server = loaded.webServer
    const port = server.port
    const launchUrl = loaded.connection.authenticatedUrl(`http://127.0.0.1:${String(port)}`)
    const exchange = await fetch(launchUrl, { redirect: 'manual' })
    expect(exchange.status).toBe(303)
    expect(exchange.headers.get('location')).toBe('/workspace')
    const setCookie = exchange.headers.get('set-cookie')
    if (setCookie === null) throw new Error('authenticated frontend did not set a cookie')
    const cookie = setCookie.split(';', 1)[0]!
    const authenticated = (init?: RequestInit): RequestInit => {
      const headers = new Headers(init?.headers)
      headers.set('cookie', cookie)
      return { ...init, headers }
    }

    // The public document needs no cookie and anchors its assets at the root.
    expect(await request(port, '/')).toMatchObject({
      status: 200,
      type: 'text/html; charset=utf-8',
      body: '<head><base href="/"></head><body>landing</body>',
    })
    // A gated index path without the cookie is refused with the same response.
    expect(await request(port, '/workspace')).toMatchObject({
      status: 401,
      type: 'text/plain; charset=utf-8',
      body: 'qilin web authentication required; reopen the URL printed by qilin web.\n',
    })

    // Real assets with their MIME types; a live rebuild is served on the next read.
    expect(await request(port, '/app.js')).toMatchObject({ status: 200, type: 'text/javascript; charset=utf-8', body: 'export {}' })
    expect(await request(port, '/manifest.webmanifest')).toMatchObject({
      status: 200,
      type: 'application/manifest+json',
      body: '{}',
    })
    expect(await request(port, '/app.js', { method: 'HEAD' })).toEqual({
      status: 200,
      type: 'text/javascript; charset=utf-8',
      body: '',
    })
    await writeFile(join(root!, 'dist', 'app.js'), 'export const rebuilt = true')
    expect(await request(port, '/app.js')).toMatchObject({ status: 200, body: 'export const rebuilt = true' })

    // Unknown extension ships as octet-stream.
    expect(await request(port, '/blob.bin')).toMatchObject({ status: 200, type: 'application/octet-stream', body: 'BLOB' })

    // Each configured index path renders index.html through the registered taps.
    const untap = server.tapIndex(html => html.replace('<head>', '<head><script>window.__T__=1</script>'))
    for (const path of ['/workspace', '/index.html', '/workspace?fixture']) {
      const got = await request(port, path, authenticated())
      expect(got.status).toBe(200)
      expect(got.type).toBe('text/html; charset=utf-8')
      expect(got.body).toContain('__T__')
      expect(got.body).toContain('shell')
    }
    // The public document is served as its own bytes, never through the taps.
    expect((await request(port, '/')).body).not.toContain('__T__')
    expect(await request(port, '/workspace', authenticated({ method: 'HEAD' }))).toEqual({
      status: 200,
      type: 'text/html; charset=utf-8',
      body: '',
    })
    untap()
    expect((await request(port, '/workspace', authenticated())).body).not.toContain('__T__')

    // A missing configured index follows the same empty-404 contract for every
    // entry path and for both supported methods.
    await rm(join(root!, 'dist', 'index.html'))
    for (const path of ['/workspace', '/index.html']) {
      const get = await request(port, path, authenticated())
      const head = await request(port, path, authenticated({ method: 'HEAD' }))
      expect(get).toEqual({ status: 404, type: null, body: '' })
      expect(head).toEqual(get)
    }
    // A missing public document is equally an empty 404.
    await rm(join(root!, 'dist', 'landing.html'))
    expect(await request(port, '/')).toEqual({ status: 404, type: null, body: '' })

    // Ordinary unknown paths and static-resource misses are empty 404s for
    // both GET and HEAD; neither class can be mistaken for the HTML shell.
    const ordinaryMisses = ['/no/such/route', '/empty', '/app.js/child']
    const assetMisses = [
      '/missing.js',
      '/missing.css',
      '/missing.mjs',
      '/missing.js.map',
      '/missing.webmanifest',
      '/missing.manifest',
    ]
    for (const path of [...ordinaryMisses, ...assetMisses]) {
      const get = await request(port, path)
      const head = await request(port, path, { method: 'HEAD' })
      expect(get).toEqual({ status: 404, type: null, body: '' })
      expect(head).toEqual(get)
    }
    expect(await request(port, '/api/no/such/route', authenticated())).toEqual({
      status: 404,
      type: 'text/plain;charset=UTF-8',
      body: 'not found',
    })

    // Traversal outside the dist root is 403, non-GET/HEAD is 405, and a
    // malformed filesystem target still reaches the webserver's 400 guard.
    expect((await request(port, '/..%2f..%2fetc%2fpasswd')).status).toBe(403)
    expect((await request(port, '/app.js', { method: 'POST' })).status).toBe(405)
    expect((await request(port, '/bad%00path')).status).toBe(400)

    // HMR safety: disposing the frontend row releases the fallback seat (the
    // unclaimed webserver answers 404) and the seat is claimable again.
    const frontendEntry = [...loaded.loader.entries()].find(e => e.options.id === 'frontend')
    expect(frontendEntry).toBeDefined()
    await frontendEntry!.fiber?.dispose()
    expect((await request(port, '/no/such/route')).status).toBe(404)
    expect(() => server.registerFallback(() => {})).not.toThrow()
  })
})

describe('configuration', () => {
  const distIndex = join(tmpdir(), 'qilin-frontend-static-config', 'dist', 'index.html')

  /** A context with just enough web surface for the fallback seat claim and the index default. */
  function stubContext(): Context {
    const ctx = new Context()
    ctx.provide('webServer', { registerFallback: () => () => {} } as never)
    ctx.provide('connection', {
      entryPath: '/workspace',
      authorizeIndex: () => true,
    } as never)
    return ctx
  }

  it('admits the default paths and refuses a document row that could escape the dist', () => {
    // The defaults are applied in code because a hand-built config may omit them.
    expect(() => { FrontendStatic.apply(stubContext(), { distIndex }) }).not.toThrow()
    expect(() => { FrontendStatic.apply(stubContext(), {
      distIndex,
      indexPaths: ['/'],
      documents: [{ path: '/', file: 'landing.html' }],
    }) }).toThrow(/both a document and an index path/u)

    const rows: readonly (readonly [string, FrontendStatic.StaticDocument])[] = [
      ['a relative path', { path: 'landing', file: 'landing.html' }],
      ['a trailing slash', { path: '/landing/', file: 'landing.html' }],
      ['an empty segment', { path: '//landing', file: 'landing.html' }],
      ['a nested file', { path: '/landing', file: 'nested/landing.html' }],
      ['a parent file', { path: '/landing', file: '..' }],
      ['a backslash file', { path: '/landing', file: 'nested\\landing.html' }],
    ]
    for (const [name, document] of rows) {
      expect(() => { FrontendStatic.apply(stubContext(), { distIndex, documents: [document] }) }, name)
        .toThrow(/frontend-static/u)
    }
    expect(() => {
      FrontendStatic.apply(stubContext(), {
        distIndex,
        documents: [{ path: '/landing', file: 'a.html' }, { path: '/landing', file: 'b.html' }],
      })
    }).toThrow(/duplicate document path/u)
  })
})
