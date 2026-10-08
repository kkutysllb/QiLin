/**
 * The page's injected face: each action performs exactly the service or Remote
 * call the body's gesture means, and the jobs face passes through untouched.
 */
import { describe, expect, it, vi } from 'vitest'
import type { SessionId } from '@qilin-agent/session/types'
import type { SubagentAddress } from '@qilin-agent/subagent/client'
import { tasksFace } from '../src/client/face.ts'
import { sid } from './fixtures.client.ts'

/** The address one catalog row carries. */
const ADDRESS: SubagentAddress = {
  parentSessionId: sid('s-root'), childSessionId: sid('s-child'), mode: 'continuable',
}

describe('tasksFace', () => {
  /** One face over recording services. */
  function harness() {
    const sessions = {
      openSubagent: vi.fn<(target: SessionId | SubagentAddress) => void>(),
      refreshProjections: vi.fn<(id: SessionId) => Promise<void>>(async () => undefined),
    }
    const subagents = {
      interruptByParent: vi.fn(async () => ({ ok: true as const, value: { accepted: true as const } })),
    }
    const jobs = {
      hooks: { jobs: { getSnapshot: () => ({ rows: {}, observed: {} }), subscribe: () => () => {} } },
      watchRows: vi.fn(() => () => {}),
    }
    return { face: tasksFace(sessions, subagents, jobs), sessions, subagents, jobs }
  }

  it('opens both a catalog address and a bare Session id', () => {
    const { face, sessions } = harness()
    face.openChild(ADDRESS)
    expect(sessions.openSubagent).toHaveBeenCalledWith(ADDRESS)
    face.openChild(sid('s-root'))
    expect(sessions.openSubagent).toHaveBeenCalledWith(sid('s-root'))
  })

  it('re-reads a parent catalog without making the body await it', () => {
    const { face, sessions } = harness()
    face.refresh(sid('s-root'))
    expect(sessions.refreshProjections).toHaveBeenCalledWith(sid('s-root'))
  })

  it('interrupts through the durable continuable delivery', () => {
    const { face, subagents } = harness()
    face.interruptChild(sid('s-child'), sid('s-root'))
    expect(subagents.interruptByParent).toHaveBeenCalledWith(sid('s-child'), sid('s-root'), 'continuable')
  })

  it('passes the jobs roster and watcher through untouched', () => {
    const { face, jobs } = harness()
    expect(face.hooks).toBe(jobs.hooks)
    expect(face.watchRows).toBe(jobs.watchRows)
  })
})
