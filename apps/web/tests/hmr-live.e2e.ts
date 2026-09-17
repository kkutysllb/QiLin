/** Published qilin web + pnpm dev:web → browser HMR, with no page reload. */

import { existsSync, globSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { Context } from '@qilin/kylin'
import type { Fiber } from '@qilin/kylin'
import LocalSubprocessRuntime from '@qilin/subprocess-local'
import type { SubprocessHandle, SubprocessSpawnSpec } from '@qilin/subprocess'
import { readClientBuildRecord } from '../../../scripts/client-build-environment.ts'
import { REPO_ROOT } from './support.ts'

const CLIENT_ARTIFACT_PATTERNS = [
  'apps/web/dist/**/*',
  'packages/*/*/lib/client.js',
  'packages/*/*/lib/client.js.map',
  'packages/*/*/lib/client.*.js',
  'packages/*/*/lib/client.*.js.map',
]

/** Return every artifact that `pnpm run dev:web` can rewrite. */
function clientArtifactPaths(): string[] {
  return globSync(CLIENT_ARTIFACT_PATTERNS, { cwd: REPO_ROOT })
    .map(path => join(REPO_ROOT, path))
    .filter(path => statSync(path).isFile())
    .sort()
}

function spawnSpec(argv: readonly string[], cwd: string, env?: Record<string, string>): SubprocessSpawnSpec {
  return {
    argv,
    cwd,
    stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
    graceMs: 5_000,
    ...env === undefined ? {} : { env },
  }
}

function waitForOutput(child: SubprocessHandle, pattern: RegExp, label: string): Promise<string> {
  return new Promise((resolveReady, reject) => {
    let output = ''
    let settled = false
    const cleanup = (): void => {
      clearTimeout(timer)
      child.stdout?.off('data', onData)
      child.stderr?.off('data', onData)
    }
    const resolveOnce = (value: string): void => {
      if (settled) return
      settled = true
      cleanup()
      resolveReady(value)
    }
    const rejectOnce = (error: Error): void => {
      if (settled) return
      settled = true
      cleanup()
      reject(error)
    }
    const onData = (chunk: Buffer): void => {
      output += chunk.toString()
      const match = pattern.exec(output)
      if (match === null) return
      resolveOnce(match[1] ?? match[0])
    }
    const timer = setTimeout(() => { rejectOnce(new Error(`${label} not ready:\n${output}`)) }, 60_000)
    child.stdout?.on('data', onData)
    child.stderr?.on('data', onData)
    void child.done.then((outcome) => {
      rejectOnce(new Error(`${label} exited before ready (${JSON.stringify(outcome)}):\n${output}`))
    }, (error: unknown) => {
      rejectOnce(new Error(`${label} failed before ready:\n${output}`, { cause: error }))
    })
  })
}

async function stopTree(child: SubprocessHandle): Promise<void> {
  child.terminate()
  const stopped = await child.waitForExit(AbortSignal.timeout(15_000))
  if (!stopped) throw new Error('managed process range did not stop after termination escalation')
  await child.done
}

it('hot-reloads a real client-plugin source edit without refreshing the page', async () => {
  const world = await mkdtemp(join(tmpdir(), 'qilin-web-hmr-world-'))
  const sourcePath = join(REPO_ROOT, 'packages/client/ui-conversation/src/client/locales.ts')
  const binPath = join(REPO_ROOT, 'apps/cli/lib/bin.js')
  if (!existsSync(binPath)) throw new Error('HMR browser test needs the built qilin bin; run pnpm run build first')
  const clientBuildEnvironment = readClientBuildRecord(REPO_ROOT).environment
  const originalClientArtifacts = await Promise.all(clientArtifactPaths()
    .map(async path => [path, await readFile(path)] as const))
  const originalClientArtifactPaths = new Set(originalClientArtifacts.map(([path]) => path))
  const originalSource = await readFile(sourcePath)
  const oldText = 'QiLin'
  const sourceNeedle = "'hero.headline': 'QiLin'"
  const newText = `HMR UPDATED ${'x'.repeat(80)}`
  // Both locale dictionaries carry the wordmark, so every occurrence moves: the
  // edit must not depend on which dictionary the page's locale resolves.
  const updatedSource = originalSource.toString().replaceAll(sourceNeedle, `'hero.headline': '${newText}'`)
  if (updatedSource === originalSource.toString()) throw new Error(`HMR source lacks ${JSON.stringify(sourceNeedle)}`)

  const subprocessCtx = new Context()
  let subprocessFiber: Fiber | undefined
  let watcher: SubprocessHandle | undefined
  let host: SubprocessHandle | undefined
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined
  const failures: unknown[] = []
  try {
    subprocessFiber = await subprocessCtx.plugin(LocalSubprocessRuntime)
    watcher = subprocessCtx.subprocess.spawn(spawnSpec(
      ['pnpm', 'run', 'dev:web'],
      REPO_ROOT,
      { ...clientBuildEnvironment },
    ))
    await waitForOutput(watcher, /dev-web: watching/, 'pnpm run dev:web')
    // The shipped surface gates the application behind a local account, and this
    // scenario is about client-plugin reloading: the harness home's own patch
    // layer turns the gate off, exactly as the scaffold lane does for its
    // scenarios, so the fresh home reaches the application itself.
    await mkdir(join(world, '.qilin'), { recursive: true })
    await writeFile(join(world, '.qilin', 'cordis.patch.yml'), [
      '- id: accounts',
      '  config:',
      '    enabled: false',
      '',
    ].join('\n'))
    host = subprocessCtx.subprocess.spawn(spawnSpec(
      [process.execPath, binPath, 'web', '--no-open', '--port', '0'],
      world,
      {
        DEEPSEEK_API_KEY: 'keyless-hmr-no-call',
        QILIN_HOME: join(world, '.qilin'),
      },
    ))
    const baseUrl = await waitForOutput(host, /qilin web: (http:\/\/[^\s]+)/, 'built qilin web')
    browser = await chromium.launch()
    const page = await browser.newPage()
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(String(error)))
    await page.goto(baseUrl, { waitUntil: 'load' })
    // The sidebar brand prints the product name too, so both waits anchor on
    // the hero's ambient wordmark rather than page-wide text.
    const wordmark = page.locator('[class*="watermark"]')
    await wordmark.filter({ hasText: oldText }).waitFor({ timeout: 15_000 })
    const pageIdentity = await page.evaluate(() => {
      // In-page code: an import would not survive serialization, and the page
      // entropy source available in every context is getRandomValues.
      const identity = Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, '0')).join('')
      Object.defineProperty(window, '__qilinHmrPageIdentity', { value: identity })
      return identity
    })

    await writeFile(sourcePath, updatedSource)
    await wordmark.filter({ hasText: newText }).waitFor({ timeout: 30_000 })
    expect(await page.evaluate(() => (window as Window & { __qilinHmrPageIdentity?: string }).__qilinHmrPageIdentity))
      .toBe(pageIdentity)
    expect(pageErrors).toEqual([])
  } catch (error) {
    failures.push(error)
  } finally {
    await writeFile(sourcePath, originalSource).catch((error: unknown) => failures.push(error))
    if (watcher !== undefined) await stopTree(watcher).catch((error: unknown) => failures.push(error))
    if (host !== undefined) await stopTree(host).catch((error: unknown) => failures.push(error))
    await browser?.close().catch((error: unknown) => failures.push(error))
    await subprocessFiber?.dispose().catch((error: unknown) => failures.push(error))
    await Promise.all(clientArtifactPaths()
      .filter(path => !originalClientArtifactPaths.has(path))
      .map(async (path) => { await rm(path, { force: true }) }))
      .catch((error: unknown) => failures.push(error))
    await Promise.all(originalClientArtifacts.map(async ([path, content]) => {
      await writeFile(path, content)
    })).catch((error: unknown) => failures.push(error))
    try {
      readClientBuildRecord(REPO_ROOT)
    } catch (error) {
      failures.push(error)
    }
    await rm(world, { recursive: true, force: true }).catch((error: unknown) => failures.push(error))
  }
  if (failures.length > 0) throw new AggregateError(failures, 'HMR browser test or cleanup failed')
}, 120_000)
