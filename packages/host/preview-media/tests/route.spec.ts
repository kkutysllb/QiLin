/**
 * REAL-composition coverage: a test-only cordis.yml booted through the
 * vendored Loader mounts the webserver, the connection fence, the sandboxed
 * filesystem, and the preview-media rows. Every assertion observes the served
 * HTTP surface — authenticated media reads (200/206/416/404/400, the
 * whole-file cap), the upload route (a contained PUT publishing under an
 * explicit workspace-write policy, 403 for targets outside the session
 * workspace, the body cap, method and parameter errors), and route release on
 * fiber disposal (HMR safety).
 */

import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import Loader from '@qilin-agent/kylin-plugin-loader'
import Include from '@qilin-agent/kylin-plugin-include'
import * as Connection from '@qilin-agent/client-connection'
import LocalCredentials from '@qilin-agent/credentials-local'
import HttpServer from '@qilin-agent/host-webserver'
import * as FrontendStatic from '@qilin-agent/host-frontend-static'
import SessionStore, { SessionId } from '@qilin-agent/session'
import SessionProjectionRegistry from '@qilin-agent/session-projection'
import SandboxPolicyService from '@qilin-agent/sandbox-policy'
import SandboxedFileSystem from '@qilin-agent/fs-sandbox'
import * as PreviewMedia from '../src/index.ts'

const MEDIA_LIMIT = 1024
/** 16 known bytes: long enough for windowed ranges, short enough to serve whole. */
const PNG = new Uint8Array(Array.from({ length: 16 }, (_, i) => i))

let root: string | undefined
let workspace: string | undefined
let outside: string | undefined
let context: Context | undefined
let port = 0
let cookie = ''

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'qilin-preview-media-'))
  workspace = join(root, 'ws')
  outside = join(root, 'out')
  await mkdir(workspace)
  await mkdir(outside)
  await writeFile(join(workspace, 'image.png'), PNG)
  await writeFile(join(workspace, 'big.bin'), Buffer.alloc(MEDIA_LIMIT + 1, 7))
  // A minimal index document so the frontend-static row serves the entry path;
  // the connection fence runs its launch-token exchange on that path.
  await writeFile(join(root, 'index.html'), '<head></head><body>shell</body>')
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    "- name: '@qilin-agent/credentials-local'",
    '  config:',
    `    path: '${join(root, '.credentials.yaml')}'`,
    '    watch: false',
    "- name: '@qilin-agent/host-webserver'",
    '  config:',
    "    host: '127.0.0.1'",
    '    port: 0',
    "- name: '@qilin-agent/client-connection'",
    '- id: frontend',
    "  name: '@qilin-agent/host-frontend-static'",
    '  config:',
    `    distIndex: '${join(root, 'index.html')}'`,
    "- name: '@qilin-agent/session'",
    "- name: '@qilin-agent/session-projection'",
    "- name: '@qilin-agent/sandbox-policy'",
    '  config:',
    `    workspaceRoot: '${workspace}'`,
    "- name: '@qilin-agent/fs-sandbox'",
    '  config:',
    `    cwd: '${workspace}'`,
    '- id: preview-media',
    "  name: '@qilin-agent/host-preview-media'",
    '  config:',
    `    mediaLimitBytes: ${String(MEDIA_LIMIT)}`,
    '',
  ].join('\n'))
  context = new Context()
  context.baseUrl = pathToFileURL(root).href + '/'
  await context.plugin(Loader)
  context.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['@qilin-agent/credentials-local', LocalCredentials],
    ['@qilin-agent/host-webserver', HttpServer],
    ['@qilin-agent/client-connection', Connection],
    ['@qilin-agent/host-frontend-static', FrontendStatic],
    ['@qilin-agent/session', SessionStore],
    ['@qilin-agent/session-projection', SessionProjectionRegistry],
    ['@qilin-agent/sandbox-policy', SandboxPolicyService],
    ['@qilin-agent/fs-sandbox', SandboxedFileSystem],
    ['@qilin-agent/host-preview-media', PreviewMedia],
  ])
  const internal: Partial<NonNullable<typeof context.loader.internal>> = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  }
  context.loader.internal = internal as NonNullable<typeof context.loader.internal>
  await context.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await context.loader.await()
  context.sessions.create(SessionId('media-session'), { meta: { cwd: workspace } })
  port = context.webServer.port
  const launchUrl = context.connection.authenticatedUrl(`http://127.0.0.1:${String(port)}`)
  const exchange = await fetch(launchUrl, { redirect: 'manual' })
  const setCookie = exchange.headers.get('set-cookie')
  if (setCookie === null) throw new Error(`authenticated frontend did not set a cookie: ${String(exchange.status)} ${exchange.headers.get('location') ?? ''} ${JSON.stringify([...exchange.headers.entries()])}`)
  cookie = setCookie.split(';', 1)[0]!
}, 60_000)

afterAll(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
})

/** Issue one request as the authenticated browser; returns status, headers subset, and bytes. */
async function media(
  path: string, init?: RequestInit,
): Promise<{ status: number; type: string | null; range: string | null; body: Buffer }> {
  const headers = new Headers(init?.headers)
  headers.set('cookie', cookie)
  const response = await fetch(`http://127.0.0.1:${String(port)}${path}`, { ...init, headers })
  return {
    status: response.status,
    type: response.headers.get('content-type'),
    range: response.headers.get('content-range'),
    body: Buffer.from(await response.arrayBuffer()),
  }
}

/** Query string for complete pairs; values are URL-encoded. */
const params = (...pairs: Array<readonly [string, string]>) =>
  `?${pairs.map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join('&')}`
const mediaQuery = (path: string) => params(['sessionId', 'media-session'], ['path', path])

it('gates every media byte behind the connection fence', async () => {
  const anonymous = await fetch(`http://127.0.0.1:${String(port)}${PreviewMedia.PREVIEW_MEDIA_PATH}${mediaQuery('image.png')}`)
  expect(anonymous.status).toBe(401)
})

it('serves whole files, windowed ranges, and the documented failures', async () => {
  expect(await media(`${PreviewMedia.PREVIEW_MEDIA_PATH}${mediaQuery('image.png')}`)).toMatchObject({
    status: 200,
    type: 'image/png',
  })
  const whole = await media(`${PreviewMedia.PREVIEW_MEDIA_PATH}${mediaQuery('image.png')}`)
  expect(new Uint8Array(whole.body)).toEqual(PNG)
  const head = await media(`${PreviewMedia.PREVIEW_MEDIA_PATH}${mediaQuery('image.png')}`, { method: 'HEAD' })
  expect(head.status).toBe(200)
  expect(head.body.byteLength).toBe(0)
  const partial = await media(`${PreviewMedia.PREVIEW_MEDIA_PATH}${mediaQuery('image.png')}`, { headers: { range: 'bytes=2-5' } })
  expect(partial.status).toBe(206)
  expect(partial.range).toBe(`bytes 2-5/${String(PNG.length)}`)
  expect(new Uint8Array(partial.body)).toEqual(PNG.slice(2, 6))
  const unsatisfiable = await media(`${PreviewMedia.PREVIEW_MEDIA_PATH}${mediaQuery('image.png')}`, { headers: { range: 'bytes=100-200' } })
  expect(unsatisfiable.status).toBe(416)
  expect(unsatisfiable.range).toBe(`bytes */${String(PNG.length)}`)
  // A ranged window on an over-cap file is exempt from the whole-file cap.
  const windowed = await media(`${PreviewMedia.PREVIEW_MEDIA_PATH}${mediaQuery('big.bin')}`, { headers: { range: 'bytes=0-3' } })
  expect(windowed.status).toBe(206)
  expect(await media(`${PreviewMedia.PREVIEW_MEDIA_PATH}${mediaQuery('big.bin')}`)).toMatchObject({ status: 400 })
  expect(await media(`${PreviewMedia.PREVIEW_MEDIA_PATH}${mediaQuery('missing.png')}`)).toMatchObject({ status: 404 })
  expect(await media(`${PreviewMedia.PREVIEW_MEDIA_PATH}${params(['sessionId', 'media-session'], ['path', ''])}`)).toMatchObject({ status: 400 })
  expect(await media(`${PreviewMedia.PREVIEW_MEDIA_PATH}${params(['sessionId', 'no-such-session'], ['path', 'image.png'])}`)).toMatchObject({ status: 404 })
})

it('publishes a contained upload and refuses targets outside the session workspace', async () => {
  const upload = (path: string, body: Uint8Array, init?: RequestInit) =>
    media(`${PreviewMedia.PREVIEW_MEDIA_PATH}/upload${mediaQuery(path)}`, { method: 'PUT', body: Buffer.from(body), ...init })
  const bytes = new Uint8Array([200, 0, 13, 10, 255])
  const published = await upload('dropped/upload.bin', bytes)
  expect(published.status).toBe(200)
  expect(JSON.parse(published.body.toString('utf8'))).toMatchObject({ ok: true, path: 'dropped/upload.bin' })
  expect(new Uint8Array(await readFile(join(workspace!, 'dropped', 'upload.bin')))).toEqual(bytes)
  const served = await media(`${PreviewMedia.PREVIEW_MEDIA_PATH}${mediaQuery('dropped/upload.bin')}`)
  expect(served.status).toBe(200)
  expect(new Uint8Array(served.body)).toEqual(bytes)

  // An absolute target outside the workspace and a traversal out of it are
  // both refused before any byte reaches the filesystem.
  const absolute = await upload(join(outside!, 'escape.bin'), bytes)
  expect(absolute.status).toBe(403)
  const traversal = await upload('../escape.bin', bytes)
  expect(traversal.status).toBe(403)
  expect(await readFile(join(workspace!, 'dropped', 'upload.bin'))).toEqual(Buffer.from(bytes))

  const overLimit = await upload('over.bin', new Uint8Array(MEDIA_LIMIT + 1))
  expect(overLimit.status).toBe(400)
  expect(await media(`${PreviewMedia.PREVIEW_MEDIA_PATH}/upload${mediaQuery('x.bin')}`)).toMatchObject({ status: 405 })
  expect(await media(`${PreviewMedia.PREVIEW_MEDIA_PATH}/upload${params(['sessionId', 'no-such-session'], ['path', 'x.bin'])}`, { method: 'PUT', body: 'x' })).toMatchObject({ status: 404 })
})

it('releases both routes when the preview-media row is disposed (HMR safety)', async () => {
  const entry = [...context!.loader.entries()].find(e => e.options.id === 'preview-media')
  expect(entry).toBeDefined()
  await entry!.fiber!.dispose()
  // Both paths now fall through to the frontend-static fallback: missing GET
  // is a bare 404, non-GET/HEAD is a bare 405 — neither carries a MediaError
  // body, proving the named routes no longer own these paths.
  const get = await media(`${PreviewMedia.PREVIEW_MEDIA_PATH}${mediaQuery('image.png')}`)
  expect(get.status).toBe(404)
  expect(get.body.byteLength).toBe(0)
  const put = await media(`${PreviewMedia.PREVIEW_MEDIA_PATH}/upload${mediaQuery('x.bin')}`, { method: 'PUT', body: 'x' })
  expect(put.status).toBe(405)
  expect(put.body.byteLength).toBe(0)
})
