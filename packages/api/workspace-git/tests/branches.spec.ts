/** The branch endpoints: the listing with its current marker, branch creation, checkout, and the list cap. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { failureOf, openWorkspace, signal, type Harness } from './harness.ts'

let harness: Harness

beforeEach(async () => {
  harness = await openWorkspace('qilin-workspace-git-branches-')
  await writeFile(join(harness.workspace, 'seed.txt'), 'seed\n', 'utf8')
  await harness.git(['add', '.'])
  await harness.git(['commit', '-m', 'seed'])
})

afterEach(async () => {
  await harness.dispose()
})

describe('workspaceGit.branches', () => {
  it('lists the initial branch as current with no upstream', async () => {
    const listing = await harness.endpoint().branches(harness.scope, signal())
    expect(listing.truncated).toBe(false)
    expect(listing.branches).toHaveLength(1)
    expect(listing.branches[0]).toMatchObject({ current: true, ahead: 0, behind: 0 })
    expect(listing.branches[0]?.upstream).toBeUndefined()
    expect(typeof listing.branches[0]?.name).toBe('string')
  })

  it('cuts the listing at the configured cap and reports the cut', async () => {
    const git = harness.endpoint({ maxListEntries: 2 })
    for (const name of ['b1', 'b2', 'b3']) await git.createBranch(harness.scope, name, '', signal())
    const listing = await git.branches(harness.scope, signal())
    expect(listing.branches).toHaveLength(2)
    expect(listing.truncated).toBe(true)
  })
})

describe('workspaceGit.createBranch and checkout', () => {
  it('creates a branch from the current one and switches to it by name', async () => {
    const git = harness.endpoint()
    await git.createBranch(harness.scope, 'feature', '', signal())
    await git.checkout(harness.scope, 'feature', signal())
    await expect(git.status(harness.scope, signal())).resolves.toMatchObject({ branch: 'feature' })
    const listing = await git.branches(harness.scope, signal())
    expect(listing.branches.find(branch => branch.name === 'feature')).toMatchObject({ current: true })
  })

  it('creates a branch from a named starting point', async () => {
    const git = harness.endpoint()
    await git.createBranch(harness.scope, 'base', '', signal())
    await git.createBranch(harness.scope, 'side', 'base', signal())
    const listing = await git.branches(harness.scope, signal())
    expect(listing.branches.map(branch => branch.name)).toContain('side')
  })

  it('refuses a branch name that could spell a git option', async () => {
    const failure = await failureOf(harness.endpoint().checkout(harness.scope, '--upload-pack=x', signal()))
    expect(failure.code).toBe('workspace-git/bad-branch')
  })
})
