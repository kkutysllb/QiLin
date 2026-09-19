/**
 * Behaviour of the installed-Web-surface boot probe.
 *
 * Every case owns the port, temporary directory, and child it uses: a fixture
 * server is replaced by an injected probe where the assertion is about waiting
 * rather than about HTTP, and the spawned fixtures are real launchers only where
 * the assertion needs one.
 */

import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import {
  probeHtml,
  reserveLoopbackPort,
  verifyInstalledWebSurface,
  waitForHtmlReadiness,
} from './installed-web-surface.ts'

/** Directories and listeners one case acquired, released after each case. */
const acquired = { directories: [] as string[], servers: [] as Server[] }

afterEach(async () => {
  await Promise.all(acquired.servers.splice(0).map(server => new Promise<void>((resolveClose) => {
    server.closeAllConnections()
    server.close(() => { resolveClose() })
  })))
  for (const directory of acquired.directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

afterAll(() => {
  vi.restoreAllMocks()
})

/** Listen on an owned loopback port and return the base URL. */
async function listen(handler: Parameters<typeof createServer>[1]): Promise<string> {
  const server = createServer(handler)
  acquired.servers.push(server)
  await new Promise<void>((resolveListen) => { server.listen(0, '127.0.0.1', () => { resolveListen() }) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('fixture server bound no port')
  return `http://127.0.0.1:${String(address.port)}`
}

/** Write one launcher fixture and return its path. */
function launcherFixture(source: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'qilin-web-surface-spec-'))
  acquired.directories.push(directory)
  const path = join(directory, 'launcher.cjs')
  writeFileSync(path, source)
  return path
}

/** A fixture that serves HTML and prints the authenticated URL on the port it was given. */
const SERVING_LAUNCHER = `
const http = require('node:http')
const port = Number(process.argv[process.argv.indexOf('--port') + 1])
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end('<!doctype html><title>qilin</title>')
})
server.listen(port, '127.0.0.1', () => {
  console.log('qilin: http://127.0.0.1:' + port + '/workspace?token=fixture-token')
})
process.on('SIGTERM', () => { server.close(() => { process.exit(0) }) })
`

describe('installed Web surface probe', () => {
  it('reserves a loopback port that is free immediately afterwards', async () => {
    const port = await reserveLoopbackPort()
    expect(port).toBeGreaterThan(0)
    const server = createServer()
    acquired.servers.push(server)
    await new Promise<void>((resolveListen, rejectListen) => {
      server.once('error', rejectListen)
      server.listen(port, '127.0.0.1', () => { resolveListen() })
    })
  })

  it('accepts only a non-empty HTML document', async () => {
    const html = await listen((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end('<!doctype html><title>ok</title>')
    })
    const json = await listen((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' })
      response.end('{"ok":true}')
    })
    const empty = await listen((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
      response.end('   ')
    })
    const failure = await listen((_request, response) => {
      response.writeHead(503, { 'content-type': 'text/html; charset=utf-8' })
      response.end('<p>starting</p>')
    })

    expect(await probeHtml(`${html}/`)).toEqual({ ok: true })
    expect(await probeHtml(`${json}/`)).toEqual({ ok: false, detail: 'content-type "application/json"' })
    expect(await probeHtml(`${empty}/`)).toMatchObject({ ok: false, detail: 'empty HTML body' })
    expect(await probeHtml(`${failure}/`)).toMatchObject({ ok: false, detail: 'status 503' })
  })

  it('reports an unreachable listener as a failed probe rather than throwing', async () => {
    const port = await reserveLoopbackPort()
    const result = await probeHtml(`http://127.0.0.1:${String(port)}/`, 1_000)
    expect(result.ok).toBe(false)
    expect(result.detail).toBeTypeOf('string')
  })

  it('waits through failed attempts until one answers', async () => {
    const answers = [{ ok: false, detail: 'status 503' }, { ok: false, detail: 'status 404' }, { ok: true }]
    let attempts = 0
    await waitForHtmlReadiness({
      url: 'http://127.0.0.1:1/',
      timeoutMs: 5_000,
      pollMs: 1,
      probe: async () => answers[attempts++] ?? { ok: true },
    })
    expect(attempts).toBe(3)
  })

  it('fails when the booted process dies before answering', async () => {
    await expect(waitForHtmlReadiness({
      url: 'http://127.0.0.1:1/',
      timeoutMs: 5_000,
      pollMs: 1,
      probe: async () => ({ ok: false, detail: 'status 503' }),
      liveness: () => 'exit 1 signal null',
    })).rejects.toThrow(/exited before answering .*exit 1 signal null/)
  })

  it('fails when the deadline passes with no answer', async () => {
    const diag = await listen((_request, response) => {
      response.writeHead(503, { 'content-type': 'text/html; charset=utf-8' })
      response.end('<p>starting</p>')
    })
    await expect(waitForHtmlReadiness({ url: `${diag}/`, timeoutMs: 10, pollMs: 1 }))
      .rejects.toThrow(/did not answer .* within 10ms: status 503/)
  })

  it('boots a served fixture, reads its printed URL, and terminates it', async () => {
    const launcher = launcherFixture(SERVING_LAUNCHER)
    const surface = await verifyInstalledWebSurface({
      command: process.execPath,
      args: port => [launcher, '--no-open', '--port', String(port)],
      cwd: tmpdir(),
      env: process.env,
      timeoutMs: 30_000,
    })

    expect(surface.landingUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
    expect(surface.appUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/workspace\?token=fixture-token$/)
    expect(surface.appUrl.startsWith(surface.landingUrl)).toBe(true)
    expect(existsSync(launcher)).toBe(true)
  })

  it('rejects a fixture that exits before serving', async () => {
    const launcher = launcherFixture('process.exit(3)\n')
    await expect(verifyInstalledWebSurface({
      command: process.execPath,
      args: port => [launcher, '--port', String(port)],
      cwd: tmpdir(),
      env: process.env,
      timeoutMs: 30_000,
      printedUrlTimeoutMs: 500,
    })).rejects.toThrow(/exited before/)
  })

  it('rejects a served fixture that prints no authenticated URL', async () => {
    const launcher = launcherFixture(`
const http = require('node:http')
const port = Number(process.argv[process.argv.indexOf('--port') + 1])
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end('<!doctype html><title>qilin</title>')
})
server.listen(port, '127.0.0.1')
`)
    await expect(verifyInstalledWebSurface({
      command: process.execPath,
      args: port => [launcher, '--port', String(port)],
      cwd: tmpdir(),
      env: process.env,
      timeoutMs: 30_000,
      printedUrlTimeoutMs: 500,
    })).rejects.toThrow(/printed no authenticated URL within 500ms/)
  })

  it('rejects a fixture that prints a port other than the reserved one', async () => {
    const launcher = launcherFixture(`
const http = require('node:http')
const port = Number(process.argv[process.argv.indexOf('--port') + 1])
const server = http.createServer((request, response) => {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
  response.end('<!doctype html><title>qilin</title>')
})
server.listen(port, '127.0.0.1', () => {
  console.log('qilin: http://127.0.0.1:' + (port + 1) + '/?token=fixture-token')
})
process.on('SIGTERM', () => { server.close(() => { process.exit(0) }) })
`)
    await expect(verifyInstalledWebSurface({
      command: process.execPath,
      args: port => [launcher, '--port', String(port)],
      cwd: tmpdir(),
      env: process.env,
      timeoutMs: 30_000,
      printedUrlTimeoutMs: 5_000,
    })).rejects.toThrow(/printed port \d+ but was told to bind \d+/)
  })
})
