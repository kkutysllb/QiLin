/** Assembled keyless snapshots for the browser handoff: the deployment entry, and the account runtime it hands off to. */

import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'
import { startupUrl } from './startup-url.ts'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const builtBin = join(repoRoot, 'apps/cli/lib/bin.js')
const frontendIndex = join(repoRoot, 'apps/web/dist/index.html')
const openerHook = new URL('./fixtures/web-browser-open/register.mjs', import.meta.url).href
// The URL line and the handoff notice both carry the patchable product label
// (`web-runtime.label`), so neither is asserted by name.
const handoffNotice = 'opening the default browser; pass --no-open to disable'
const tempRoots: string[] = []
const builtArtifactsExist = existsSync(builtBin) && existsSync(frontendIndex)

if (process.env.QILIN_EXAMPLE_MODE === 'lib' && !builtArtifactsExist) {
  throw new Error('qilin web browser-open snapshot requires built CLI and Web artifacts in lib mode')
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** What the account runtime's module-hook opener recorded for one handoff. */
interface BrowserOpenRecord {
  url: string
  status: number
  bootManifest: boolean
  apiKeyPresent: boolean
  qilinHomePresent: boolean
}

/** One running child whose streams a snapshot reads until it settles. */
interface Running {
  readonly output: () => string
  readonly errors: () => string
  readonly settled: () => boolean
  readonly exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
  readonly stop: () => Promise<{ code: number | null; signal: NodeJS.Signals | null }>
}

function normalizeLocalUrl(url: string): string {
  return url
    .replace(/:\d+/u, ':{{port}}')
    .replace(/token=[^&]+/u, 'token={{token}}')
}

/** Poll a condition the child process is expected to reach. */
async function waitFor<T>(read: () => T | undefined, what: string, timeoutMs = 30_000): Promise<T> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const value = read()
    if (value !== undefined) return value
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`)
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}

/** Start the built CLI and collect both streams until it is stopped. */
function start(cliArgs: string[], env: Record<string, string>, cwd: string, nodeArgs: string[] = []): Running {
  const child = spawn(process.execPath, [...nodeArgs, builtBin, ...cliArgs], {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let stdout = ''
  let stderr = ''
  child.stdout.setEncoding('utf8').on('data', (chunk: string) => { stdout += chunk })
  child.stderr.setEncoding('utf8').on('data', (chunk: string) => { stderr += chunk })
  let exited = false
  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.once('close', (code, signal) => { exited = true; resolve({ code, signal }) })
  })
  const stop = async (): Promise<{ code: number | null; signal: NodeJS.Signals | null }> => {
    if (exited) return await exit
    child.kill('SIGTERM')
    const settled = await Promise.race([
      exit,
      new Promise<undefined>(resolve => setTimeout(() =>{  resolve(undefined) }, 15_000)),
    ])
    if (settled !== undefined) return settled
    child.kill('SIGKILL')
    return await exit
  }
  return { output: () => stdout, errors: () => stderr, settled: () => exited, exit, stop }
}

/**
 * Write a platform opener that records the address instead of launching it.
 * @param root - directory the record file and the stub live under.
 * @returns the directory to put first on PATH, and the record file path.
 */
function recordingOpener(root: string): { dir: string; record: string } {
  const dir = join(root, 'opener-bin')
  mkdirSync(dir, { recursive: true })
  const record = join(root, 'opened-urls')
  const script = join(dir, 'open')
  writeFileSync(script, `#!/bin/sh\nprintf '%s\\n' "$1" >> '${record}'\n`)
  chmodSync(script, 0o755)
  return { dir, record }
}

/** The deployment's startup line: one public address, serving every account. */
const DEPLOYMENT_URL = /qilin tenants: (https?:\/\/\S+)/u

/** A fresh harness home under one temp root, with the env a keyless snapshot needs. */
function freshRoot(prefix: string): { root: string; env: Record<string, string> } {
  const root = mkdtempSync(join(tmpdir(), prefix))
  tempRoots.push(root)
  return {
    root,
    env: {
      QILIN_HOME: join(root, '.qilin'),
      QILIN_AGENTS_HOME: join(root, '.agents'),
      QILIN_TELEMETRY_DISABLED: '1',
      DEEPSEEK_API_KEY: 'keyless-browser-open-no-call',
      NODE_NO_WARNINGS: '1',
      SSH_CONNECTION: '',
      SSH_TTY: '',
    },
  }
}

describe.skipIf(!builtArtifactsExist)('qilin web browser-open assembled snapshot', () => {
  it('hands the deployment address to the platform opener and serves it', async () => {
    const { root, env } = freshRoot('qilin-web-browser-open-snapshot-')
    const opener = recordingOpener(root)
    const app = start(['web', '--port', '0'], { ...env, PATH: `${opener.dir}:${process.env.PATH ?? ''}` }, root)
    try {
      // The deployment hands the bare address to the platform opener: it prints no
      // workspace token, because the address is the only door a browser uses.
      const url = await waitFor(() => DEPLOYMENT_URL.exec(app.output())?.[1], 'the deployment URL')
      await waitFor(
        () => existsSync(opener.record) ? true : undefined,
        'the platform opener to receive the address',
      )
      expect(readFileSync(opener.record, 'utf8').trim().split('\n')).toEqual([url])
      expect(normalizeLocalUrl(url)).toBe('http://127.0.0.1:{{port}}/')
      const page = await fetch(url, { redirect: 'manual' })
      expect(page.status).toBe(200)
      expect(await page.text()).not.toBe('')
      expect(app.errors()).not.toContain('could not open')
      expect((await app.stop()).code).toBe(0)
    } finally {
      await app.stop()
    }
  })

  it('leaves the platform opener untouched under --no-open', async () => {
    const { root, env } = freshRoot('qilin-web-browser-open-no-open-')
    const opener = recordingOpener(root)
    const app = start(['web', '--port', '0', '--no-open'], { ...env, PATH: `${opener.dir}:${process.env.PATH ?? ''}` }, root)
    try {
      const url = await waitFor(() => DEPLOYMENT_URL.exec(app.output())?.[1], 'the deployment URL')
      expect((await fetch(url, { redirect: 'manual' })).status).toBe(200)
      // --no-open is the operator declining the handoff: nothing reaches the opener.
      await new Promise(resolve => setTimeout(resolve, 1_000))
      expect(existsSync(opener.record)).toBe(false)
      expect((await app.stop()).code).toBe(0)
    } finally {
      await app.stop()
    }
  })

  it('reports an opener that cannot start and keeps serving', async () => {
    const { root, env } = freshRoot('qilin-web-browser-open-failure-snapshot-')
    const emptyBin = join(root, 'empty-bin')
    mkdirSync(emptyBin)
    // No launcher on PATH: starting it is a platform error, not a start failure.
    const app = start(['web', '--port', '0'], { ...env, PATH: emptyBin }, root)
    try {
      const url = await waitFor(() => DEPLOYMENT_URL.exec(app.output())?.[1], 'the deployment URL')
      const diagnostic = await waitFor(
        () => app.errors().split(/\r?\n/u).find(line => line.startsWith('qilin web: could not open ')),
        'the launcher diagnostic',
      )
      expect(diagnostic).toContain(url)
      expect((await fetch(url, { redirect: 'manual' })).status).toBe(200)
      expect((await app.stop()).code).toBe(0)
    } finally {
      await app.stop()
    }
  })

  it('hands the reachable page to the default browser from the account runtime', async () => {
    const { root, env } = freshRoot('qilin-web-browser-open-runtime-snapshot-')
    const app = start(['web', '--port', '0'], { ...env, QILIN_TENANT: '1' }, root, ['--import', openerHook])
    try {
      const run = await app.exit
      // The fixture opener signs in through the shipped account gate, opens the
      // workspace document, and ends the runtime once it recorded the handoff.
      const readyUrl: string | undefined = startupUrl(app.output())
      const openLine = app.output().split('\n').find(line => line.startsWith('qilin browser-open: '))
      expect({ exitCode: run.code, stderr: app.errors(), readyUrl: readyUrl === undefined ? undefined : 'present', openLine: openLine === undefined ? undefined : 'present' })
        .toEqual({ exitCode: 0, stderr: '', readyUrl: 'present', openLine: 'present' })
      expect(readyUrl).toMatch(/^https?:\/\//u)
      expect(app.output()).toContain(handoffNotice)
      const opened = JSON.parse(openLine!.slice('qilin browser-open: '.length)) as BrowserOpenRecord
      expect({
        openedUrl: normalizeLocalUrl(opened.url),
        status: opened.status,
        bootManifest: opened.bootManifest,
        apiKeyPresent: opened.apiKeyPresent,
      }).toEqual({
        openedUrl: 'http://127.0.0.1:{{port}}/workspace?token={{token}}',
        status: 200,
        bootManifest: true,
        apiKeyPresent: false,
      })
      expect(normalizeLocalUrl(readyUrl!)).toBe('http://127.0.0.1:{{port}}/workspace?token={{token}}')
    } finally {
      await app.stop()
    }
  })

  it('prints the launcher reason and the manual URL from the account runtime', async () => {
    const { root, env } = freshRoot('qilin-web-browser-open-runtime-failure-')
    const app = start(['web', '--port', '0'], {
      ...env,
      QILIN_TENANT: '1',
      BROWSER_OPEN_TEST_FAILURE: 'fixture desktop unavailable',
      QILIN_BROWSER_OPEN_TEST_EXIT_ON_FAILURE: '1',
    }, root, ['--import', openerHook])
    try {
      const run = await app.exit
      expect(run.code).toBe(0)
      const readyUrl = startupUrl(app.output())
      const diagnostic = app.errors().split(/\r?\n/u)
        .find(line => line.startsWith('web-app: could not open the default browser because '))
      expect({
        diagnostic,
        opened: app.output().includes('qilin browser-open: '),
        opening: app.output().includes(handoffNotice),
        readyUrl: readyUrl === undefined ? undefined : normalizeLocalUrl(readyUrl),
      }).toEqual({
        diagnostic: 'web-app: could not open the default browser because fixture desktop unavailable; use the qilin URL printed at startup',
        opened: false,
        opening: true,
        readyUrl: 'http://127.0.0.1:{{port}}/workspace?token={{token}}',
      })
    } finally {
      await app.stop()
    }
  })

  it('prints the host URL without launching a browser in a VS Code Remote SSH session', async () => {
    const { root, env } = freshRoot('qilin-web-browser-open-ssh-')
    const app = start(['web', '--port', '0'], {
      ...env,
      QILIN_TENANT: '1',
      SSH_CONNECTION: '10.0.0.2 55 10.0.0.9 22',
      QILIN_BROWSER_OPEN_TEST_EXIT_ON_READY: '1',
    }, root, ['--import', openerHook])
    try {
      const run = await app.exit
      const readyUrl = startupUrl(app.output())
      expect({
        exitCode: run.code,
        opened: app.output().includes('qilin browser-open: '),
        opening: app.output().includes(handoffNotice),
        readyUrl: readyUrl === undefined ? undefined : normalizeLocalUrl(readyUrl),
        stderr: app.errors(),
      }).toEqual({
        exitCode: 0,
        opened: false,
        opening: false,
        readyUrl: 'http://127.0.0.1:{{port}}/workspace?token={{token}}',
        stderr: '',
      })
    } finally {
      await app.stop()
    }
  })

  it('rejects a project browser command before starting the account runtime', async () => {
    const { root, env } = freshRoot('qilin-web-browser-open-env-')
    // A project .env may not decide how this process starts or reaches the network.
    writeFileSync(join(root, '.env'), 'BROWSER=/usr/bin/false\n')
    const app = start(['web', '--port', '0'], { ...env, QILIN_TENANT: '1' }, root, ['--import', openerHook])
    try {
      const run = await app.exit
      // The failure is a plain load error, so it reaches stderr through the
      // runtime's uncaught-error report; only the reason is asserted.
      const diagnostic = app.errors().split(/\r?\n/u)
        .find(line => line.startsWith('Error: qilin: '))
        ?.replace(/^Error: qilin: .*[/\\]\.env/u, 'qilin: {{root}}/.env')
      expect({
        exitCode: run.code,
        diagnostic,
        opened: app.output().includes('qilin browser-open: '),
        opening: app.output().includes(handoffNotice),
        ready: startupUrl(app.output()) !== undefined,
      }).toEqual({
        exitCode: 1,
        diagnostic: 'qilin: {{root}}/.env sets "BROWSER", which only the launching environment may set (it decides how this process starts, where its code and instructions load from, or how it reaches the network); export BROWSER instead of putting it in a .env file',
        opened: false,
        opening: false,
        ready: false,
      })
    } finally {
      await app.stop()
    }
  })
})
