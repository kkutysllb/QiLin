/**
 * The one-time V4 migration command is spent: the Session writer moved to V5,
 * so a corpus run refuses before touching bytes. These specs pin that refusal
 * and the argument surface that still answers.
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { execa } from 'execa'
import { removeFixtureSafely } from './test-fixture-cleanup.ts'

const repository = resolve(import.meta.dirname, '..')
const script = join(repository, 'scripts/migrate-sessions-to-v4.ts')
const directories = new Set<string>()

function temporaryRoot(): string {
  const directory = mkdtempSync(join(tmpdir(), 'qilin-migrate-v4-test-'))
  directories.add(directory)
  return directory
}

async function run(...args: string[]) {
  const result = await execa(process.execPath, ['--import', 'tsx', script, ...args], { cwd: repository, reject: false })
  expect(result.timedOut, result.stderr).toBe(false)
  return result
}

afterEach(() => {
  for (const directory of directories) removeFixtureSafely(directory)
  directories.clear()
})

describe('one-time V4 migration command', () => {
  it('prints its usage and default root for --help', async () => {
    const result = await run('--help')
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('Usage: pnpm run migrate:sessions-to-v4')
    expect(result.stdout).toContain('~/.qilin/sessions')
  })

  it('refuses a corpus under the current V5 writer, converting nothing', async () => {
    const result = await run('--sessions-dir', temporaryRoot())
    expect(result.exitCode).not.toBe(0)
    expect(result.stdout).toContain('requires a V4 Session writer')
    expect(result.stdout).toContain('5 !== 4')
    expect(result.stdout).toContain('converted=0')
  })

  it('rejects an invalid --jobs before opening a corpus', async () => {
    const result = await run('--sessions-dir', join(temporaryRoot(), 'missing'), '--jobs=0')
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('--jobs must be a positive safe integer')
    expect(result.stdout).not.toContain('Session migration')
  })

  it('rejects unknown arguments with the usage', async () => {
    const result = await run('--beside-the-point')
    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain('Usage: pnpm run migrate:sessions-to-v4')
  })
})
