import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'

/**
 * Keyless smoke for SOURCE `qilin` execution: run `apps/cli/src/bin.ts`
 * with the exact production runtime vector (`node --import tsx/esm`, the
 * vector the root `qilin` script invokes directly) and assert what a bare
 * invocation resolves to. The Node compatibility matrix runs this
 * WHOLE file, so a Node release changing module hooks or TypeScript handling
 * breaks this gate instead of every developer's `pnpm qilin`; the built-bin
 * suite covers the published `lib/` entry, not this source chain.
 */

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const qilinSourceBin = 'apps/cli/src/bin.ts'

describe('qilin SOURCE launcher (node --import tsx/esm)', () => {
  it('launches the source CLI without building', async () => {
    const rootPackage = JSON.parse(await readFile(new URL('../../../package.json', import.meta.url), 'utf8')) as {
      readonly scripts?: Record<string, string>
    }
    expect(rootPackage.scripts?.qilin).toBe('node --import tsx/esm apps/cli/src/bin.ts')
  })

  it('resolves a bare invocation to the product profile and dumps its tree', async () => {
    // A bare `qilin` boots the product profile, so no `--profile` is required;
    // the dump is the boot-free way to observe that resolution without starting
    // a surface. A private home keeps the run off the developer's own profiles.
    const home = mkdtempSync(join(tmpdir(), 'qilin-source-launch-'))
    try {
      const result = await execa(process.execPath, ['--import', 'tsx/esm', qilinSourceBin, '--dump-config'], {
        cwd: repoRoot,
        env: { QILIN_HOME: home },
        input: '',
        timeout: 25_000,
        killSignal: 'SIGKILL',
        reject: false,
      })
      if (result.timedOut) {
        throw new Error(`qilin source launch did not exit within 25s. stdout:\n${result.stdout}\nstderr:\n${result.stderr}`)
      }
      expect(result.stderr).toBe('')
      expect(result.exitCode).toBe(0)
      // The composed tree names the shipped product layers, and the launcher
      // initialized exactly the product profile under this home.
      expect(result.stdout).toContain('@qilin/base')
      expect(existsSync(join(home, 'profiles', 'qilin', 'package.json'))).toBe(true)
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  }, 30_000)
})
