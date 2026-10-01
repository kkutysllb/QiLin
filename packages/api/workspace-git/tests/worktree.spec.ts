/** The worktree endpoints: stage/unstage/commit round-trip, discard, and the diff caps. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { failureOf, openWorkspace, signal, type Harness } from './harness.ts'

let harness: Harness
let workspace: string

beforeEach(async () => {
  harness = await openWorkspace('qilin-workspace-git-worktree-')
  workspace = harness.workspace
  await writeFile(join(workspace, 'base.txt'), 'one\n', 'utf8')
  await harness.git(['add', '.'])
  await harness.git(['commit', '-m', 'init'])
})

afterEach(async () => {
  await harness.dispose()
})

describe('workspaceGit.stage, unstage, commit — the round-trip', () => {
  it('stages a new file, unstages it back to untracked, then stages and commits it away', async () => {
    await writeFile(join(workspace, 'feature.txt'), 'feature\n', 'utf8')
    const git = harness.endpoint()
    await git.stage(harness.scope, 'feature.txt', signal())
    await expect(git.status(harness.scope, signal())).resolves.toMatchObject({
      entries: [{ path: 'feature.txt', staged: true, unstaged: false, untracked: false }],
    })
    await git.unstage(harness.scope, 'feature.txt', signal())
    await expect(git.status(harness.scope, signal())).resolves.toMatchObject({
      entries: [{ path: 'feature.txt', staged: false, unstaged: false, untracked: true }],
    })
    await git.stage(harness.scope, '', signal())
    await git.commit(harness.scope, '  add feature  ', signal())
    const status = await git.status(harness.scope, signal())
    expect(status.entries).toEqual([])
    await expect(harness.git(['log', '-1', '--pretty=%B'])).resolves.toContain('add feature')
  })

  it('staging without a path takes the whole work tree', async () => {
    await writeFile(join(workspace, 'a.txt'), 'a\n', 'utf8')
    await writeFile(join(workspace, 'b.txt'), 'b\n', 'utf8')
    await harness.endpoint().stage(harness.scope, '', signal())
    const status = await harness.endpoint().status(harness.scope, signal())
    expect(status.entries.map(entry => entry.path)).toEqual(['a.txt', 'b.txt'])
    expect(status.entries.every(entry => entry.staged)).toBe(true)
  })
})

describe('workspaceGit.discard', () => {
  it('restores one modified file from the index', async () => {
    await writeFile(join(workspace, 'base.txt'), 'overwritten\n', 'utf8')
    await harness.endpoint().discard(harness.scope, 'base.txt', signal())
    await expect(readFile(join(workspace, 'base.txt'), 'utf8')).resolves.toBe('one\n')
  })

  it('refuses an empty path without running anything', async () => {
    const failure = await failureOf(harness.endpoint().discard(harness.scope, '', signal()))
    expect(failure.code).toBe('workspace-git/bad-path')
    expect(failure.details).toMatchObject({ path: '' })
  })
})

describe('workspaceGit.diff', () => {
  it('returns the worktree diff for one path and an empty diff once it is staged', async () => {
    await writeFile(join(workspace, 'base.txt'), 'two\n', 'utf8')
    const git = harness.endpoint()
    const unstaged = await git.diff(harness.scope, 'base.txt', false, signal())
    expect(unstaged).toContain('diff --git')
    expect(unstaged).toContain('-one')
    await git.stage(harness.scope, 'base.txt', signal())
    await expect(git.diff(harness.scope, 'base.txt', false, signal())).resolves.toBe('')
    const staged = await git.diff(harness.scope, 'base.txt', true, signal())
    expect(staged).toContain('+two')
  })

  it('refuses a diff above the configured byte cap instead of truncating it', async () => {
    await writeFile(join(workspace, 'base.txt'), 'line\n'.repeat(64), 'utf8')
    const failure = await failureOf(
      harness.endpoint({ maxDiffBytes: 8 }).diff(harness.scope, 'base.txt', false, signal()),
    )
    expect(failure.code).toBe('workspace-git/too-large')
    expect(failure.details).toMatchObject({ maxBytes: 8 })
    expect((failure.details as { bytes: number }).bytes).toBeGreaterThan(8)
  })
})
