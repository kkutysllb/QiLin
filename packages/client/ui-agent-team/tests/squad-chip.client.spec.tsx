// @vitest-environment jsdom
/**
 * The squad chip: the formation and Team counts it states, and the Team page it
 * opens in the right Sidebar.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionId } from '@qilin-agent/session/types'
import type { SessionListState, SessionSummary } from '@qilin-agent/api-session-controller/client'
import type { SessionStatusSnapshot } from '@qilin-agent/client-ui-session/client'
import type { TeamProjection } from '@qilin-agent/agent-team/client'
import { createSnapshotStore } from '@qilin-agent/client-store'
import { bindSnapshotSelector, makeTranslate } from '@qilin-agent/client-test-runtime'
import { zh as commonZh } from '@qilin-agent/client-locale/src/locales/zh.ts'
import { SquadChip, type SquadChipProps } from '../src/client/SquadChip.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const LEAD = 'lead' as SessionId
const A = 'a' as SessionId
const TEAM: TeamProjection = {
  members: [
    { id: LEAD, name: 'lead', role: 'lead', phase: 'active' },
    { id: A, name: 'alpha', role: 'teammate', phase: 'active' },
  ],
  tasks: [],
}

function bench(options: {
  team?: TeamProjection
  sessionId?: SessionId
  running?: boolean
} = {}) {
  const sessionId = options.sessionId ?? LEAD
  const byId: Record<SessionId, SessionSummary> = {
    [LEAD]: { id: LEAD, displayTitle: 'lead', running: options.running ?? false, retainedBy: {}, blank: false, updatedAt: 0 },
    [A]: {
      id: A, displayTitle: 'alpha', parentId: LEAD, origin: 'subagent',
      running: false, retainedBy: {}, blank: false, updatedAt: 0,
    },
  }
  const sessions = createSnapshotStore<SessionListState>({
    ids: [LEAD, A],
    byId,
    phase: 'ready',
    projectionsBySession: {
      [LEAD]: { state: 'ready', error: null, values: { agentTeam: options.team ?? TEAM } },
    },
  })
  const statuses = createSnapshotStore<SessionStatusSnapshot>(new Map())
  const openTeam = vi.fn()
  const props: SquadChipProps = {
    sessionId,
    useSessions: bindSnapshotSelector(sessions),
    useSessionStatus: bindSnapshotSelector(statuses),
    openTeam,
    t: makeTranslate(zh, commonZh),
  } as SquadChipProps
  return { props, openTeam, sessions, statuses }
}

describe('SquadChip', () => {
  it('states the Team size and the formation size', () => {
    render(<SquadChip {...bench().props} />)
    const chip = screen.getByRole('button')
    expect(chip.textContent).toBe('队伍 · 2 成员 · 2 Agent')
    expect(chip.getAttribute('title')).toBe('队伍 · 2 成员 · 2 Agent')
  })

  it('states only the formation when the conversation has no Team', () => {
    const b = bench()
    const { rerender } = render(<SquadChip {...b.props} />)
    b.sessions.set({
      ids: [LEAD, A],
      byId: b.sessions.getSnapshot().byId,
      phase: 'ready',
      projectionsBySession: { [LEAD]: { state: 'ready', error: null, values: {} } },
    })
    rerender(<SquadChip {...b.props} />)
    expect(screen.getByRole('button').textContent).toBe('队伍 · 2 Agent')
  })

  it('marks a running formation', () => {
    render(<SquadChip {...bench({ running: true }).props} />)
    expect(document.querySelector('[data-state="ongoing"]')).not.toBeNull()
  })

  it('opens the Team page for the conversation it sits in', () => {
    const b = bench({ sessionId: A })
    render(<SquadChip {...b.props} />)
    fireEvent.click(screen.getByRole('button'))
    expect(b.openTeam).toHaveBeenCalledExactlyOnceWith(A)
    expect(screen.getByRole('button').textContent).toBe('队伍 · 2 成员 · 2 Agent')
  })
})
