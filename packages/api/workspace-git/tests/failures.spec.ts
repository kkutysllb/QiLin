/** The refusal and failure paths: validated refusals, command failures with trimmed stderr, and the missing binary. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { failureOf, openWorkspace, signal, type Harness } from './harness.ts'

let harness: Harness

beforeEach(async () => {
  harness = await openWorkspace('qilin-workspace-git-failures-')
  await writeFile(join(harness.workspace, 'seed.txt'), 'seed\n', 'utf8')
  await harness.git(['add', '.'])
  await harness.git(['commit', '-m', 'seed'])
})

afterEach(async () => {
  await harness.dispose()
})

describe('workspaceGit — validated refusals', () => {
  it('refuses a blank commit message before running anything', async () => {
    const failure = await failureOf(harness.endpoint().commit(harness.scope, '   ', signal()))
    expect(failure.code).toBe('workspace-git/bad-message')
    expect(failure.details).toMatchObject({ length: 0 })
  })

  it('refuses a commit message above 2000 characters after trimming', async () => {
    const failure = await failureOf(harness.endpoint().commit(harness.scope, `x${'.'.repeat(2000)}`, signal()))
    expect(failure.code).toBe('workspace-git/bad-message')
    expect(failure.details).toMatchObject({ length: 2001 })
  })

  it('refuses a createBranch name with characters outside the accepted set', async () => {
    const failure = await failureOf(
      harness.endpoint().createBranch(harness.scope, 'bad;name', '', signal()),
    )
    expect(failure.code).toBe('workspace-git/bad-branch')
    expect(failure.details).toMatchObject({ branch: 'bad;name' })
  })

  it('refuses a wire-delivered absent path like an empty one', async () => {
    const failure = await failureOf(
      harness.endpoint().discard(harness.scope, undefined as never, signal()),
    )
    expect(failure.code).toBe('workspace-git/bad-path')
    expect(failure.details).toEqual({ path: '' })
  })

  it('refuses a wire-delivered absent branch name', async () => {
    const failure = await failureOf(
      harness.endpoint().checkout(harness.scope, undefined as never, signal()),
    )
    expect(failure.code).toBe('workspace-git/bad-branch')
    expect(failure.details).toEqual({ branch: '' })
  })

  it('refuses a wire-delivered absent pull-request title like a blank one', async () => {
    const failure = await failureOf(
      harness.endpoint().ghCreatePr(harness.scope, undefined as never, 'body', '', signal()),
    )
    expect(failure.code).toBe('workspace-git/bad-pr-title')
    expect(failure.details).toEqual({ field: 'title', length: 0 })
  })
})

describe('workspaceGit — command failures', () => {
  it('maps a missing git binary to command-failed with the spawn error as stderr', async () => {
    const failure = await failureOf(
      harness.endpoint({ gitBin: 'qilin-git-does-not-exist' }).commit(harness.scope, 'attempted', signal()),
    )
    expect(failure.code).toBe('workspace-git/command-failed')
    expect((failure.details as { command: string }).command).toContain('commit')
    expect((failure.details as { stderr: string }).stderr.length).toBeGreaterThan(0)
  })

  it('maps an empty-index commit to command-failed with the exit code', async () => {
    const failure = await failureOf(harness.endpoint().commit(harness.scope, 'nothing staged', signal()))
    expect(failure.code).toBe('workspace-git/command-failed')
    const details = failure.details as { command: string; code?: number; stderr: string }
    expect(details.command).toContain('git commit')
    expect(typeof details.code).toBe('number')
  })

  it('carries git stderr on a push without a configured remote', async () => {
    const failure = await failureOf(harness.endpoint().push(harness.scope, false, signal()))
    expect(failure.code).toBe('workspace-git/command-failed')
    const details = failure.details as { command: string; stderr: string }
    expect(details.command).toBe('git push')
    expect(details.stderr).toContain('fatal')
  })

  it('trims the carried stderr to the configured character cap', async () => {
    const failure = await failureOf(
      harness.endpoint({ maxStderrChars: 10 }).push(harness.scope, false, signal()),
    )
    expect((failure.details as { stderr: string }).stderr.length).toBeLessThanOrEqual(10)
  })

  it('maps a pull without an upstream to command-failed', async () => {
    const failure = await failureOf(harness.endpoint().pull(harness.scope, signal()))
    expect(failure.code).toBe('workspace-git/command-failed')
    expect((failure.details as { command: string }).command).toBe('git pull')
  })

  it('maps a failing status command to command-failed after the repository probe passes', async () => {
    const stub = await harness.stubGit({
      'rev-parse': { stdout: 'true\n' },
      status: { code: 128, stderr: 'fatal: bad object refs/heads/x\n' },
    })
    const failure = await failureOf(harness.endpoint({ gitBin: stub.bin }).status(harness.scope, signal()))
    expect(failure.code).toBe('workspace-git/command-failed')
    const details = failure.details as { command: string; stderr: string }
    expect(details.command).toContain(' status --porcelain=v1')
    expect(details.stderr).toContain('fatal')
  })

  it('maps a failing branch listing to command-failed after the repository probe passes', async () => {
    const stub = await harness.stubGit({
      'rev-parse': { stdout: 'true\n' },
      'for-each-ref': { code: 1, stderr: 'fatal: bad ref\n' },
    })
    const failure = await failureOf(harness.endpoint({ gitBin: stub.bin }).branches(harness.scope, signal()))
    expect(failure.code).toBe('workspace-git/command-failed')
    const details = failure.details as { command: string; stderr: string }
    expect(details.command).toContain('for-each-ref')
    expect(details.stderr).toContain('fatal')
  })

  it('maps a failing diff command to command-failed with its stderr', async () => {
    const stub = await harness.stubGit({ diff: { code: 1, stderr: 'fatal: cannot diff\n' } })
    const failure = await failureOf(
      harness.endpoint({ gitBin: stub.bin }).diff(harness.scope, 'seed.txt', false, signal()),
    )
    expect(failure.code).toBe('workspace-git/command-failed')
    const details = failure.details as { command: string; stderr: string }
    expect(details.command).toContain(' diff -- seed.txt')
    expect(details.stderr).toBe('fatal: cannot diff')
  })
})
