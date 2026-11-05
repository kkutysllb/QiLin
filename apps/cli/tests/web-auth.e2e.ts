/** Real `qilin web` deployment authentication against a temporary Harness home. */

import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises'
import { request as httpRequest } from 'node:http'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { startupUrl } from './startup-url.ts'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const QILIN_SOURCE_BIN = join(REPO_ROOT, 'apps/cli/src/bin.ts')
const TSX_LOADER = pathToFileURL(createRequire(join(REPO_ROOT, 'package.json')).resolve('tsx')).href

/** The account the deployment holds and the browser signs in as. */
const ACCOUNT = { username: 'alice', password: 'deployment-password-1' } as const

interface RunningWeb {
  readonly child: ChildProcess
  readonly launchUrl: string
  readonly output: () => string
}

interface HttpResult {
  readonly status: number
  readonly body: string
}

function redact(output: string): string {
  return output.replace(/([?&]token=)[^\s)]+/gu, '$1<redacted>')
}

/** Reserve one concrete loopback port, then release it for the CLI process. */
async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = (server.address() as AddressInfo).port
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error === undefined) resolve()
      else reject(error)
    })
  })
  return port
}

function cleanEnvironment(root: string, qilinHome: string): NodeJS.ProcessEnv {
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
    !/(?:KEY|SECRET|TOKEN|PASSWORD)/iu.test(name)))
  return {
    ...env,
    QILIN_AGENTS_HOME: join(root, '.agents'),
    QILIN_HOME: qilinHome,
    QILIN_TELEMETRY_DISABLED: '1',
    NODE_NO_WARNINGS: '1',
    SSH_CONNECTION: '',
    SSH_TTY: '',
    TSX_TSCONFIG_PATH: join(REPO_ROOT, 'tsconfig.json'),
  }
}

/** Spawn one public source CLI invocation, its standard input left to the caller. */
function spawnCli(root: string, qilinHome: string, args: readonly string[]): ChildProcess {
  return spawn(process.execPath, ['--import', TSX_LOADER, QILIN_SOURCE_BIN, ...args], {
    cwd: root,
    env: cleanEnvironment(root, qilinHome),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

/** Add one account to the deployment's roster through its own command. */
async function createAccount(root: string, qilinHome: string, username: string, password: string): Promise<void> {
  const child = spawnCli(root, qilinHome, ['tenants', 'add', username, '--password-stdin'])
  let output = ''
  child.stdout?.on('data', (chunk: Buffer) => { output = `${output}${String(chunk)}`.slice(-100_000) })
  child.stderr?.on('data', (chunk: Buffer) => { output = `${output}${String(chunk)}`.slice(-100_000) })
  child.stdin?.end(`${password}\n`)
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (exitCode) => { resolve(exitCode) })
  })
  if (code !== 0) throw new Error(`qilin tenants add exited with ${String(code)}:\n${redact(output)}`)
}

/** Start the public source CLI and wait for its deployment address. */
async function startWeb(root: string, qilinHome: string, port: number): Promise<RunningWeb> {
  const child = spawnCli(root, qilinHome, ['web', '--no-open', '--port', String(port)])
  let output = ''
  const launchUrl = await new Promise<string>((resolve, reject) => {
    let settled = false
    const fail = (error: Error): void => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    }
    const timer = setTimeout(() => {
      fail(new Error(`qilin web did not become ready:\n${redact(output)}`))
    }, 90_000)
    const append = (chunk: Buffer | string): void => {
      output = `${output}${String(chunk)}`.slice(-100_000)
      const url = startupUrl(output)
      if (settled || url === undefined) return
      settled = true
      clearTimeout(timer)
      resolve(url)
    }
    child.stdout?.on('data', append)
    child.stderr?.on('data', append)
    child.once('error', (error) => {
      fail(error)
    })
    child.once('exit', (code) => {
      fail(new Error(`qilin web exited before readiness (${String(code)}):\n${redact(output)}`))
    })
  })
  return { child, launchUrl, output: () => output }
}

async function stopWeb(running: RunningWeb): Promise<void> {
  if (running.child.exitCode !== null) return
  const exited = new Promise<void>((resolve) => { running.child.once('exit', () => { resolve() }) })
  running.child.kill('SIGTERM')
  const forced = setTimeout(() => { running.child.kill('SIGKILL') }, 10_000)
  forced.unref()
  await exited
  clearTimeout(forced)
}

/** POST one real Remote envelope while controlling the wire Host header. */
function describeSettings(port: number, host: string, cookie?: string): Promise<HttpResult> {
  const body = JSON.stringify({
    type: 'client-request',
    rpcId: 'web-auth-real-cli',
    method: 'settings/describe',
    payload: { args: {} },
  })
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      hostname: '127.0.0.1',
      port,
      path: '/api/settings/describe',
      method: 'POST',
      headers: {
        host,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        ...cookie === undefined ? {} : { cookie },
      },
    }, (res) => {
      const chunks: Uint8Array[] = []
      res.on('data', (chunk: Buffer) => { chunks.push(chunk) })
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') })
      })
    })
    req.once('error', reject)
    req.end(body)
  })
}

/** Sign in through the application's own endpoint, as the sign-in form does. */
async function signIn(origin: string, identifier: string, password: string): Promise<string> {
  const response = await fetch(new URL('/api/auth/login', origin), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  })
  const body = await response.text()
  if (response.status !== 200) throw new Error(`sign-in answered ${String(response.status)}: ${body}`)
  // The answer carries the account session and clears any earlier routing
  // selector; the session is what identifies the browser afterwards.
  const session = response.headers.getSetCookie().find(cookie => cookie.startsWith('qilin-session-'))
  if (session === undefined) throw new Error('sign-in omitted the account session cookie')
  return session
}

describe('qilin web deployment authentication through the real CLI', () => {
  it('rejects a forged loopback Host and preserves the account session across restart', { timeout: 240_000 }, async () => {
    const root = await mkdtemp(join(tmpdir(), 'qilin-web-auth-real-cli-'))
    const qilinHome = join(root, '.qilin')
    await mkdir(qilinHome, { recursive: true })
    // The deployment authenticates every visitor through the application's own
    // account gate, so the browser's session is an account session.
    await createAccount(root, qilinHome, ACCOUNT.username, ACCOUNT.password)
    const port = await freePort()
    let first: RunningWeb | undefined
    let second: RunningWeb | undefined
    try {
      first = await startWeb(root, qilinHome, port)
      const firstUrl = new URL(first.launchUrl)
      expect(firstUrl.origin).toBe(`http://127.0.0.1:${String(port)}`)
      // The printed address is the deployment's front door: the product's
      // landing page, never a credential-bearing runtime handoff.
      expect(firstUrl.pathname).toBe('/')
      expect(firstUrl.search).toBe('')

      const landing = await fetch(first.launchUrl)
      expect(landing.status).toBe(200)
      expect(landing.headers.get('content-type')).toContain('text/html')

      // A signed-out document request goes to the landing page carrying the
      // document it asked for, not to the workbench.
      const gated = await fetch(new URL('/workspace', first.launchUrl), { redirect: 'manual' })
      expect(gated.status).toBe(302)
      expect(gated.headers.get('location')).toBe('/?next=%2Fworkspace')

      // A forged loopback spelling is a different authority, so it reaches no
      // session and no application.
      expect(await describeSettings(port, `localhost:${String(port)}`)).toEqual({
        status: 401,
        body: 'unauthorized',
      })

      const setCookie = await signIn(first.launchUrl, ACCOUNT.username, ACCOUNT.password)
      expect(setCookie).toContain('HttpOnly')
      expect(setCookie).toContain('SameSite=Strict')
      expect(setCookie).not.toContain('Secure')
      const cookie = setCookie.split(';', 1)[0]!

      const workspace = await fetch(new URL('/workspace', first.launchUrl), {
        headers: { cookie },
        redirect: 'manual',
      })
      expect(workspace.status).toBe(200)
      expect(workspace.headers.get('content-type')).toContain('text/html')

      const authenticated = await describeSettings(port, firstUrl.host, cookie)
      expect(authenticated.status).toBe(200)
      const authenticatedBody = JSON.parse(authenticated.body) as unknown
      expect(authenticatedBody).toMatchObject({
        type: 'server-response',
        rpcId: 'web-auth-real-cli',
        result: { ok: true, value: { namespaces: expect.any(Array) as unknown } },
      })

      // The session cookie is bound to the authority it was issued for, so the
      // forged spelling stays unauthorized even with the real cookie attached.
      expect((await describeSettings(port, `localhost:${String(port)}`, cookie)).status).toBe(401)

      // The signing secret survives the process, so a restarted deployment
      // keeps the same browser signed in and prints the same address.
      await stopWeb(first)
      first = undefined
      second = await startWeb(root, qilinHome, port)
      expect(new URL(second.launchUrl).href).toBe(firstUrl.href)
      const restarted = await describeSettings(port, firstUrl.host, cookie)
      expect(restarted.status).toBe(200)
      expect(JSON.parse(restarted.body) as unknown).toMatchObject({
        type: 'server-response',
        rpcId: 'web-auth-real-cli',
        result: { ok: true },
      })

      const credentialMode = (await stat(join(qilinHome, 'auth', 'session-secret.json'))).mode & 0o777
      expect(credentialMode).toBe(0o600)
    } catch (error) {
      const evidence = [first?.output(), second?.output()].filter(value => value !== undefined).join('\n')
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${redact(evidence)}`, { cause: error })
    } finally {
      if (second !== undefined) await stopWeb(second)
      if (first !== undefined) await stopWeb(first)
      await rm(root, { recursive: true, force: true })
    }
  })
})
