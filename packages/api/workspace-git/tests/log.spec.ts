/** The history endpoints: paging, decoration, one commit's patch, and the argument bounds. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { failureOf, openWorkspace, signal, type Harness } from './harness.ts'

let harness: Harness

beforeEach(async () => {
  harness = await openWorkspace('qilin-workspace-git-log-')
  for (const name of ['one', 'two', 'three']) {
    await writeFile(join(harness.workspace, `${name}.txt`), `${name}\n`, 'utf8')
    await harness.git(['add', '.'])
    await harness.git(['commit', '-m', `commit ${name}`])
  }
})

afterEach(async () => {
  await harness.dispose()
})

describe('workspaceGit.log', () => {
  it('lists commits newest first with their author, date, and decoration', async () => {
    const entries = await harness.endpoint().log(harness.scope, 10, 0, signal())
    expect(entries.map(entry => entry.subject)).toEqual(['commit three', 'commit two', 'commit one'])
    const tip = entries[0]
    expect(tip?.author).toBe('QiLin Test')
    expect(tip?.hash).toMatch(/^[0-9a-f]{40}$/u)
    expect(tip?.short).toHaveLength(7)
    // Git renders a UTC commit date as ISO `Z`, and any other zone as a numeric offset.
    expect(tip?.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:[+-]\d{2}:\d{2}|Z)$/u)
    expect(tip?.refs.length).toBeGreaterThan(0)
    expect(tip?.refs).not.toContain('HEAD')
  })

  it('pages by count and skip', async () => {
    const endpoint = harness.endpoint()
    const page = await endpoint.log(harness.scope, 1, 1, signal())
    expect(page.map(entry => entry.subject)).toEqual(['commit two'])
    expect(await endpoint.log(harness.scope, 10, 3, signal())).toEqual([])
  })

  it('refuses a page size outside 1..100 and a skip outside the non-negative integers', async () => {
    const endpoint = harness.endpoint()
    for (const count of [undefined, 0, 1.5, 101]) {
      const failure = await failureOf(endpoint.log(harness.scope, count, 0, signal()))
      expect(failure.code).toBe('gateway/bad-request')
    }
    for (const skip of [undefined, -1, 1.5]) {
      const failure = await failureOf(endpoint.log(harness.scope, 10, skip, signal()))
      expect(failure.code).toBe('gateway/bad-request')
    }
  })

  it('fails with not-a-repo outside a work tree', async () => {
    const outside = join(harness.workspace, '..', 'outside')
    await mkdir(outside, { recursive: true })
    const failure = await failureOf(harness.endpoint().log(harness.scopeAt(outside), 10, 0, signal()))
    expect(failure.code).toBe('workspace-git/not-a-repo')
  })

  it('fails with command-failed while HEAD has no commits', async () => {
    const fresh = await openWorkspace('qilin-workspace-git-log-fresh-')
    try {
      const failure = await failureOf(fresh.endpoint().log(fresh.scope, 10, 0, signal()))
      expect(failure.code).toBe('workspace-git/command-failed')
    } finally {
      await fresh.dispose()
    }
  })
})

describe('workspaceGit.commitDiff', () => {
  it('reads the patch one commit introduced', async () => {
    const endpoint = harness.endpoint()
    const [tip] = await endpoint.log(harness.scope, 1, 0, signal())
    expect(tip).toBeDefined()
    const patch = await endpoint.commitDiff(harness.scope, tip?.hash, signal())
    expect(patch).toContain('diff --git a/three.txt b/three.txt')
    expect(patch).toContain('+three')
  })

  it('accepts a ref name and a relative revision spelling', async () => {
    const endpoint = harness.endpoint()
    for (const revision of ['HEAD~1', 'HEAD']) {
      const patch = await endpoint.commitDiff(harness.scope, revision, signal())
      expect(patch).toContain('diff --git')
    }
  })

  it('refuses a revision that could spell a git option', async () => {
    const endpoint = harness.endpoint()
    for (const revision of [undefined, '', '--upload-pack=x', 'HEAD;rm -rf /']) {
      const failure = await failureOf(endpoint.commitDiff(harness.scope, revision, signal()))
      expect(failure.code).toBe('gateway/bad-request')
    }
  })

  it('fails with command-failed for a revision the repository does not know', async () => {
    const failure = await failureOf(harness.endpoint().commitDiff(harness.scope, 'deadbeef', signal()))
    expect(failure.code).toBe('workspace-git/command-failed')
  })

  it('fails with too-large when the patch passes the byte cap', async () => {
    const failure = await failureOf(harness.endpoint({ maxDiffBytes: 16 }).commitDiff(harness.scope, 'HEAD', signal()))
    expect(failure.code).toBe('workspace-git/too-large')
    expect(failure.details).toMatchObject({ maxBytes: 16 })
  })

  it('fails with not-a-repo outside a work tree', async () => {
    const outside = join(harness.workspace, '..', 'outside')
    await mkdir(outside, { recursive: true })
    const failure = await failureOf(harness.endpoint().commitDiff(harness.scopeAt(outside), 'HEAD', signal()))
    expect(failure.code).toBe('workspace-git/not-a-repo')
  })
})
