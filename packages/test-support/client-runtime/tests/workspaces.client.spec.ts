/**
 * TestWorkspaces' recorded session-pinning face: the defaults that mirror the
 * production list state, and the stub seat that replaces them.
 */
import { describe, expect, it } from 'vitest'
import type { SessionId } from '@qilin-agent/session/types'
import { TestWorkspaces } from '../src/workspaces.ts'
import type { Stabilizer } from '../src/fixtures.ts'

const stabilize: Stabilizer = async (fn) => { await fn() }
const first = 's1' as SessionId
const second = 's2' as SessionId

describe('TestWorkspaces session pinning', () => {
  it('leads the pin set with each pinned session, newest first', async () => {
    const workspaces = new TestWorkspaces(stabilize)

    await workspaces.pinSession(first)
    await workspaces.pinSession(second)
    expect(workspaces.list.getSnapshot().pinnedSessionIds).toEqual([second, first])

    // Re-pinning moves the session to the front instead of duplicating it.
    await workspaces.pinSession(first)
    expect(workspaces.list.getSnapshot().pinnedSessionIds).toEqual([first, second])
    expect(workspaces.calls).toEqual([
      { method: 'pinSession', args: [first] },
      { method: 'pinSession', args: [second] },
      { method: 'pinSession', args: [first] },
    ])
  })

  it('drops only the unpinned session from the pin set', async () => {
    const workspaces = new TestWorkspaces(stabilize)
    await workspaces.pinSession(first)
    await workspaces.pinSession(second)

    await workspaces.unpinSession(second)

    expect(workspaces.list.getSnapshot().pinnedSessionIds).toEqual([first])
    expect(workspaces.calls).toEqual([
      { method: 'pinSession', args: [first] },
      { method: 'pinSession', args: [second] },
      { method: 'unpinSession', args: [second] },
    ])
  })

  it('lets a stub replace the pinning behavior while still recording the call', async () => {
    const workspaces = new TestWorkspaces(stabilize)
    const stubbed: SessionId[] = []
    workspaces.stub('pinSession', async (sessionId) => { stubbed.push(sessionId) })
    workspaces.stub('unpinSession', async (sessionId) => { stubbed.push(sessionId) })

    await workspaces.pinSession(first)
    await workspaces.unpinSession(first)

    expect(stubbed).toEqual([first, first])
    expect(workspaces.calls).toHaveLength(2)
    expect(workspaces.list.getSnapshot().pinnedSessionIds).toEqual([])
  })
})
