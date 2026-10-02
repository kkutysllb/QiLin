/** The spawn mechanics: the configured timeout kills one command, and caller cancellation rejects with its reason. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { failureOf, openWorkspace, signal, type Harness } from './harness.ts'

let harness: Harness

beforeEach(async () => {
  harness = await openWorkspace('qilin-workspace-git-spawn-')
})

afterEach(async () => {
  await harness.dispose()
})

describe('workspaceGit — the configured command timeout', () => {
  it('kills a command past its timeout and reports the kill instead of an exit code', async () => {
    const stub = await harness.stubGit({ commit: { sleepSeconds: 5 } })
    const failure = await failureOf(
      harness.endpoint({ gitBin: stub.bin, timeoutMs: 50 }).commit(harness.scope, 'never lands', signal()),
    )
    expect(failure.code).toBe('workspace-git/command-failed')
    const details = failure.details as { code?: number; stderr: string }
    expect(details.stderr).toContain('the command exceeded its timeout')
    // The kill leaves no exit status, so the details carry none.
    expect(details.code).toBeUndefined()
  })
})

describe('workspaceGit — caller cancellation of an in-flight command', () => {
  it('rejects with the caller abort reason', async () => {
    const stub = await harness.stubGit({ commit: { sleepSeconds: 5 } })
    const controller = new AbortController()
    const pending = harness.endpoint({ gitBin: stub.bin }).commit(harness.scope, 'cancelled', controller.signal)
    controller.abort(new Error('the caller moved on'))
    await expect(pending).rejects.toThrow('the caller moved on')
  })

  it('rejects with its own wording when the abort reason is not an Error', async () => {
    const stub = await harness.stubGit({ commit: { sleepSeconds: 5 } })
    const controller = new AbortController()
    const pending = harness.endpoint({ gitBin: stub.bin }).commit(harness.scope, 'cancelled', controller.signal)
    controller.abort('a bare string reason')
    await expect(pending).rejects.toThrow('the git call was cancelled')
  })
})
