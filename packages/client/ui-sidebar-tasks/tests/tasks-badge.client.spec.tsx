// @vitest-environment jsdom
/**
 * The chip badge: the number of running subagents and jobs beside the chip, and
 * nothing at all while the Session is idle.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup } from '@testing-library/react'
import { catalog, child, job, sid } from './fixtures.client.ts'
import { SESSION, mountBadge } from './mount.client.tsx'

afterEach(cleanup)

describe('TasksBadge', () => {
  it('renders the running subagents and jobs as one number', () => {
    const view = mountBadge({
      subagentsByParent: {
        [SESSION]: catalog([child('busy', { activity: 'running' }), child('idle')]),
      },
      jobsBySession: { [SESSION]: [job('live'), job('done', { status: 'completed' })] },
    })
    expect(view.container.textContent).toBe('2')
  })

  it('renders nothing while no subagent and no job is running', () => {
    const view = mountBadge({
      subagentsByParent: { [SESSION]: catalog([child('idle')]) },
      jobsBySession: { [SESSION]: [job('done', { status: 'failed' })] },
    })
    expect(view.container.textContent).toBe('')
  })

  it('renders nothing for a Session the snapshots do not mention', () => {
    const view = mountBadge({ subagentsByParent: { [sid('other')]: catalog([]) } })
    expect(view.container.textContent).toBe('')
  })
})
