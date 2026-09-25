// @vitest-environment jsdom
/**
 * The chip badge: the number of running subagents and jobs beside the chip, and
 * nothing at all while the Session is idle.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import type { SessionSummary } from '@qilin/api-session-controller/client'
import type { SessionId } from '@qilin/session/types'
import { child, job, projection, sid } from './fixtures.client.ts'
import { SESSION, mountBadge } from './mount.client.tsx'

afterEach(cleanup)

/** One Session-list row, so a child's running state is what the badge reads. */
function summary(id: SessionId, running: boolean): SessionSummary {
  return {
    id, displayTitle: id, running, retainedBy: {}, blank: false, updatedAt: 0,
  }
}

describe('TasksBadge', () => {
  it('renders the running subagents and jobs as one number', () => {
    const view = mountBadge({
      projectionsBySession: { [SESSION]: projection([child('busy'), child('idle')]) },
      byId: { [sid('busy')]: summary(sid('busy'), true) },
    }, [job('live'), job('done', { status: 'completed' })])
    expect(view.container.textContent).toBe('2')
  })

  it('renders nothing while no subagent and no job is running', () => {
    const view = mountBadge({
      projectionsBySession: { [SESSION]: projection([child('idle')]) },
    }, [job('done', { status: 'failed' })])
    expect(view.container.textContent).toBe('')
  })

  it('renders nothing for a Session the snapshots do not mention', () => {
    const view = mountBadge({ projectionsBySession: { [sid('other')]: projection([]) } })
    expect(view.container.textContent).toBe('')
  })
})
