/** The upstream face: publishing with `--set-upstream`, the status position it enables, and its graceful loss. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { openWorkspace, signal, type Harness } from './harness.ts'

let harness: Harness

beforeEach(async () => {
  harness = await openWorkspace('qilin-workspace-git-upstream-')
  await writeFile(join(harness.workspace, 'seed.txt'), 'seed\n', 'utf8')
  await harness.git(['add', '.'])
  await harness.git(['commit', '-m', 'seed'])
  // A bare sibling of the workspace as the origin: pushing to it configures a
  // real upstream, so the position commands answer from real git.
  await harness.git(['init', '--bare', '../origin.git'])
  await harness.git(['remote', 'add', 'origin', '../origin.git'])
})

afterEach(async () => {
  await harness.dispose()
})

describe('workspaceGit.push with setUpstream', () => {
  it('publishes the current branch to origin as its own upstream', async () => {
    const branch = (await harness.git(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
    await expect(harness.endpoint().push(harness.scope, true, signal())).resolves.toBeUndefined()
    await expect(harness.git(['rev-parse', '--abbrev-ref', '@{upstream}'])).resolves.toBe(`origin/${branch}\n`)
  })
})

describe('workspaceGit.status — the upstream position', () => {
  it('reports zero ahead and behind once the branch tracks origin', async () => {
    const git = harness.endpoint()
    await git.push(harness.scope, true, signal())
    await expect(git.status(harness.scope, signal())).resolves.toMatchObject({ upstream: { ahead: 0, behind: 0 } })
  })

  it('counts a local commit as one ahead of the upstream', async () => {
    const git = harness.endpoint()
    await git.push(harness.scope, true, signal())
    await writeFile(join(harness.workspace, 'next.txt'), 'next\n', 'utf8')
    await git.stage(harness.scope, 'next.txt', signal())
    await git.commit(harness.scope, 'second', signal())
    await expect(git.status(harness.scope, signal())).resolves.toMatchObject({ upstream: { ahead: 1, behind: 0 } })
  })
})

describe('workspaceGit.status — when the ahead/behind counts cannot be read', () => {
  it('drops the upstream instead of failing the status answer', async () => {
    // The stub answers every rev-parse, so the upstream name resolves; only
    // the count command fails, and the status must survive without a position.
    const stub = await harness.stubGit({
      'rev-parse': { stdout: 'true\n' },
      'rev-list': { code: 128, stderr: 'fatal: bad revision\n' },
    })
    const status = await harness.endpoint({ gitBin: stub.bin }).status(harness.scope, signal())
    expect(status.upstream).toBeUndefined()
    // The last invocation being rev-list proves the position stage ran and degraded.
    expect((await stub.recorded())[0]).toBe('rev-list')
  })
})
