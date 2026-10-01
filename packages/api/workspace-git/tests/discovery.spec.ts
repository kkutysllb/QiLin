/** The discovery endpoints: `isRepo` answers false on every failure, `repoRoot` and `status` refuse a non-repository. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { failureOf, openWorkspace, signal, type Harness } from './harness.ts'

let harness: Harness
let plain: string

beforeEach(async () => {
  harness = await openWorkspace('qilin-workspace-git-discovery-')
  plain = await mkdtemp(join(tmpdir(), 'qilin-workspace-git-plain-'))
})

afterEach(async () => {
  await harness.dispose()
  await rm(plain, { recursive: true, force: true })
})

describe('workspaceGit.isRepo', () => {
  it('reports true inside the initialized workspace repository', async () => {
    await expect(harness.endpoint().isRepo(harness.scope, signal())).resolves.toBe(true)
  })

  it('reports false in a directory no repository contains', async () => {
    await expect(harness.endpoint().isRepo(harness.scopeAt(plain), signal())).resolves.toBe(false)
  })

  it('reports false when the git binary cannot be spawned', async () => {
    const git = harness.endpoint({ gitBin: 'qilin-git-does-not-exist' })
    await expect(git.isRepo(harness.scope, signal())).resolves.toBe(false)
  })
})

describe('workspaceGit.repoRoot and status outside a repository', () => {
  it('names the initialized workspace as the repository root', async () => {
    // rev-parse canonicalizes the temp path (macOS /var → /private/var).
    await expect(harness.endpoint().repoRoot(harness.scope, signal())).resolves.toBe(realpathSync(harness.workspace))
  })

  it('refuses repoRoot outside a repository with not-a-repo', async () => {
    const failure = await failureOf(harness.endpoint().repoRoot(harness.scopeAt(plain), signal()))
    expect(failure.code).toBe('workspace-git/not-a-repo')
  })

  it('refuses status outside a repository with not-a-repo', async () => {
    const failure = await failureOf(harness.endpoint().status(harness.scopeAt(plain), signal()))
    expect(failure.code).toBe('workspace-git/not-a-repo')
  })

  it('reports status on an unborn repository with no branch, no upstream, and no entries', async () => {
    const status = await harness.endpoint().status(harness.scope, signal())
    expect(status.branch).toBeUndefined()
    expect(status.upstream).toBeUndefined()
    expect(status.entries).toEqual([])
  })
})
