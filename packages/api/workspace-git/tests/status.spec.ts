/** The `status` endpoint on a committed repository with staged, unstaged, and untracked paths. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { openWorkspace, signal, type Harness } from './harness.ts'

let harness: Harness
let workspace: string

beforeEach(async () => {
  harness = await openWorkspace('qilin-workspace-git-status-')
  workspace = harness.workspace
  await writeFile(join(workspace, 'base.txt'), 'base\n', 'utf8')
  await harness.git(['add', '.'])
  await harness.git(['commit', '-m', 'init'])
})

afterEach(async () => {
  await harness.dispose()
})

describe('workspaceGit.status — classification', () => {
  it('reports staged, unstaged, and untracked entries with their porcelain columns', async () => {
    await writeFile(join(workspace, 'base.txt'), 'changed\n', 'utf8')
    await writeFile(join(workspace, 'staged.txt'), 'new\n', 'utf8')
    await harness.endpoint().stage(harness.scope, 'staged.txt', signal())
    await writeFile(join(workspace, 'untracked.txt'), 'mine\n', 'utf8')
    const status = await harness.endpoint().status(harness.scope, signal())
    expect(status.entries).toEqual([
      { path: 'base.txt', index: ' ', worktree: 'M', staged: false, unstaged: true, untracked: false },
      { path: 'staged.txt', index: 'A', worktree: ' ', staged: true, unstaged: false, untracked: false },
      { path: 'untracked.txt', index: '?', worktree: '?', staged: false, unstaged: false, untracked: true },
    ])
  })

  it('names the current branch once the repository has a commit', async () => {
    const status = await harness.endpoint().status(harness.scope, signal())
    expect(typeof status.branch).toBe('string')
    expect(status.branch?.length).toBeGreaterThan(0)
  })

  it('reports no upstream on a branch that tracks nothing', async () => {
    const status = await harness.endpoint().status(harness.scope, signal())
    expect(status.upstream).toBeUndefined()
  })
})
