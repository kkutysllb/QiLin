/** The gh endpoints: binary and login probes, the pull-request list, create, and merge against a stubbed gh. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { failureOf, openWorkspace, signal, type Harness } from './harness.ts'

let harness: Harness

beforeEach(async () => {
  harness = await openWorkspace('qilin-workspace-git-gh-')
})

afterEach(async () => {
  await harness.dispose()
})

describe('workspaceGit.ghAvailable', () => {
  it('answers true when the gh binary answers --version', async () => {
    const stub = await harness.stubGh({ stdout: 'gh version 2.63.0\n' })
    expect(await harness.endpoint({ ghBin: stub.bin }).ghAvailable(harness.scope, signal())).toBe(true)
  })

  it('answers false when the gh binary is missing', async () => {
    const git = harness.endpoint({ ghBin: join(harness.workspace, 'no-such-gh') })
    expect(await git.ghAvailable(harness.scope, signal())).toBe(false)
  })
})

describe('workspaceGit.ghAuthStatus', () => {
  it('reports the logged-in account gh names on stderr', async () => {
    const stub = await harness.stubGh({ stderr: '✓ Logged in to github.com account monalisa (keyring)\n' })
    const status = await harness.endpoint({ ghBin: stub.bin }).ghAuthStatus(harness.scope, signal())
    expect(status.authenticated).toBe(true)
    expect(status.account).toBe('monalisa')
    expect(status.message).toContain('monalisa')
  })

  it('reports unauthenticated with the first stderr line when gh exits nonzero', async () => {
    const stub = await harness.stubGh({ stderr: '✗ Failed to log in to github.com\naccount file not found\n', code: 1 })
    const status = await harness.endpoint({ ghBin: stub.bin }).ghAuthStatus(harness.scope, signal())
    expect(status).toEqual({ authenticated: false, message: '✗ Failed to log in to github.com' })
  })

  it('reports unauthenticated with the spawn failure when gh is missing', async () => {
    const git = harness.endpoint({ ghBin: join(harness.workspace, 'no-such-gh') })
    const status = await git.ghAuthStatus(harness.scope, signal())
    expect(status.authenticated).toBe(false)
    expect(status.account).toBeUndefined()
    expect(status.message.length).toBeGreaterThan(0)
  })
})

describe('workspaceGit.ghListPrs', () => {
  it('refuses a state outside the three words before anything runs', async () => {
    const failure = await failureOf(harness.endpoint().ghListPrs(harness.scope, 'merged' as 'open', signal()))
    expect(failure.code).toBe('gateway/bad-request')
  })

  it('refuses a workspace outside a work tree as not-a-repo', async () => {
    const stub = await harness.stubGh({ stdout: '[]' })
    const failure = await failureOf(
      harness.endpoint({ ghBin: stub.bin }).ghListPrs(harness.scopeAt(join(harness.workspace, 'no-repo')), 'open', signal()),
    )
    expect(failure.code).toBe('workspace-git/not-a-repo')
  })

  it('parses the rows gh prints', async () => {
    const fixture = JSON.stringify([
      {
        number: 7,
        title: 'Fix parser',
        headRefName: 'fix/parser',
        baseRefName: 'main',
        isDraft: false,
        updatedAt: '2026-09-30T08:00:00Z',
        author: { login: 'monalisa' },
      },
    ])
    const stub = await harness.stubGh({ stdout: fixture })
    const prs = await harness.endpoint({ ghBin: stub.bin }).ghListPrs(harness.scope, 'open', signal())
    expect(prs).toEqual([
      {
        number: 7,
        title: 'Fix parser',
        headRefName: 'fix/parser',
        baseRefName: 'main',
        isDraft: false,
        updatedAt: '2026-09-30T08:00:00Z',
        author: 'monalisa',
      },
    ])
  })

  it('maps a nonzero gh exit to command-failed with its stderr', async () => {
    const stub = await harness.stubGh({ stderr: 'no git remotes found\n', code: 1 })
    const failure = await failureOf(harness.endpoint({ ghBin: stub.bin }).ghListPrs(harness.scope, 'open', signal()))
    expect(failure.code).toBe('workspace-git/command-failed')
    const details = failure.details as { command: string; stderr: string }
    expect(details.command).toContain(' pr list --state open')
    expect(details.stderr).toContain('no git remotes found')
  })

  it('asks gh with the state, the configured limit, and the fixed field list', async () => {
    const stub = await harness.stubGh({ stdout: '[]' })
    await harness.endpoint({ ghBin: stub.bin, maxListEntries: 25 }).ghListPrs(harness.scope, 'closed', signal())
    expect(await stub.recorded()).toEqual([
      'pr',
      'list',
      '--state',
      'closed',
      '--limit',
      '25',
      '--json',
      'number,title,headRefName,baseRefName,isDraft,updatedAt,author',
    ])
  })
})

describe('workspaceGit.ghCreatePr', () => {
  it('refuses a blank title before anything runs', async () => {
    const failure = await failureOf(harness.endpoint().ghCreatePr(harness.scope, '  ', 'body', '', signal()))
    expect(failure.code).toBe('workspace-git/bad-pr-title')
    expect(failure.details).toEqual({ field: 'title', length: 0 })
  })

  it('refuses a blank body before anything runs', async () => {
    const failure = await failureOf(harness.endpoint().ghCreatePr(harness.scope, 'title', '', '', signal()))
    expect(failure.code).toBe('workspace-git/bad-pr-title')
    expect(failure.details).toEqual({ field: 'body', length: 0 })
  })

  it('refuses a title past the fixed bound', async () => {
    const failure = await failureOf(
      harness.endpoint().ghCreatePr(harness.scope, 'x'.repeat(501), 'body', '', signal()),
    )
    expect(failure.code).toBe('workspace-git/bad-pr-title')
    expect(failure.details).toEqual({ field: 'title', length: 501 })
  })

  it('returns the number and URL gh printed', async () => {
    const stub = await harness.stubGh({ stdout: 'Creating pull request for monalisa into main in qilin/api\nhttps://github.com/qilin/api/pull/9\n' })
    const created = await harness.endpoint({ ghBin: stub.bin }).ghCreatePr(harness.scope, 'Fix parser', 'It parses.', 'main', signal())
    expect(created).toEqual({ number: 9, url: 'https://github.com/qilin/api/pull/9' })
  })

  it('passes caller text as one fixed argv element that no shell reinterprets', async () => {
    const stub = await harness.stubGh({ stdout: 'https://github.com/qilin/api/pull/3\n' })
    const hostile = '; rm -rf .'
    await harness.endpoint({ ghBin: stub.bin }).ghCreatePr(harness.scope, hostile, '`id` $(id)', '', signal())
    expect(await stub.recorded()).toEqual(['pr', 'create', '--title', hostile, '--body', '`id` $(id)'])
    expect(existsSync(join(harness.workspace, 'rm'))).toBe(false)
  })

  it('omits --base when base is empty and refuses a base spelling an option', async () => {
    const stub = await harness.stubGh({ stdout: 'https://github.com/qilin/api/pull/4\n' })
    await harness.endpoint({ ghBin: stub.bin }).ghCreatePr(harness.scope, 'title', 'body', '', signal())
    expect(await stub.recorded()).toEqual(['pr', 'create', '--title', 'title', '--body', 'body'])
    const refusal = await failureOf(harness.endpoint().ghCreatePr(harness.scope, 'title', 'body', '--upload-pack=x', signal()))
    expect(refusal.code).toBe('workspace-git/bad-branch')
  })

  it('maps a create answer without a URL to command-failed', async () => {
    const stub = await harness.stubGh({ stdout: 'created without printing an address\n' })
    const failure = await failureOf(harness.endpoint({ ghBin: stub.bin }).ghCreatePr(harness.scope, 'title', 'body', '', signal()))
    expect(failure.code).toBe('workspace-git/command-failed')
    const details = failure.details as { stderr: string }
    expect(details.stderr).toContain('gh printed no pull-request URL')
  })
})

describe('workspaceGit.ghMergePr', () => {
  it('refuses a number that is not a positive integer', async () => {
    for (const number of [0, 1.5]) {
      const failure = await failureOf(harness.endpoint().ghMergePr(harness.scope, number, 'squash', signal()))
      expect(failure.code).toBe('gateway/bad-request')
    }
  })

  it('refuses a method outside the four words', async () => {
    const failure = await failureOf(
      harness.endpoint().ghMergePr(harness.scope, 12, 'fast-forward' as 'squash', signal()),
    )
    expect(failure.code).toBe('gateway/bad-request')
  })

  it('merges with the requested strategy flag on a fixed argv', async () => {
    const stub = await harness.stubGh({})
    await harness.endpoint({ ghBin: stub.bin }).ghMergePr(harness.scope, 12, 'squash', signal())
    expect(await stub.recorded()).toEqual(['pr', 'merge', '12', '--squash'])
  })

  it('passes no strategy flag when the method is empty', async () => {
    const stub = await harness.stubGh({})
    await harness.endpoint({ ghBin: stub.bin }).ghMergePr(harness.scope, 12, '', signal())
    expect(await stub.recorded()).toEqual(['pr', 'merge', '12'])
  })

  it('maps a nonzero gh exit to command-failed', async () => {
    const stub = await harness.stubGh({ stderr: 'no pull request found for branch "x"\n', code: 1 })
    const failure = await failureOf(harness.endpoint({ ghBin: stub.bin }).ghMergePr(harness.scope, 12, 'merge', signal()))
    expect(failure.code).toBe('workspace-git/command-failed')
    const details = failure.details as { command: string; stderr: string }
    expect(details.command).toContain('pr merge 12 --merge')
    expect(details.stderr).toContain('no pull request found')
  })
})
