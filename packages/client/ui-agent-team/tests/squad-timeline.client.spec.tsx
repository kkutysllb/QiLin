// @vitest-environment jsdom
/**
 * The collaboration timeline panel: the durable delegation rows it states, the
 * step and mode facts each row carries, and the empty notice before any
 * delegation exists.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { SessionId } from '@qilin-agent/session/types'
import type { SessionListState, SessionSummary } from '@qilin-agent/api-session-controller/client'
import type { SessionStatusSnapshot } from '@qilin-agent/client-ui-session/client'
import { createSnapshotStore } from '@qilin-agent/client-store'
import { bindSnapshotSelector, makeTranslate } from '@qilin-agent/client-test-runtime'
import { zh as commonZh } from '@qilin-agent/client-locale/src/locales/zh.ts'
import { SquadTimeline, type SquadTimelineProps } from '../src/client/SquadTimeline.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const LEAD = 'lead' as SessionId
const A = 'a' as SessionId
const B = 'b' as SessionId

function row(id: SessionId, extra: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id, displayTitle: id, parentId: LEAD, origin: 'subagent', running: false,
    retainedBy: {}, blank: false, updatedAt: 0, ...extra,
  }
}

function bench(options: { delegated?: boolean; running?: boolean } = {}) {
  const delegated = options.delegated ?? true
  const byId: Record<SessionId, SessionSummary> = {
    [LEAD]: { id: LEAD, displayTitle: 'lead', running: false, retainedBy: {}, blank: false, updatedAt: 0 },
    ...delegated
      ? { [A]: row(A, { updatedAt: 5 }), [B]: row(B, { updatedAt: 9 }) }
      : {},
  }
  const sessions = createSnapshotStore<SessionListState>({
    ids: Object.keys(byId) as SessionId[],
    byId,
    phase: 'ready',
    projectionsBySession: {
      [LEAD]: {
        state: 'ready', error: null,
        values: {
          subagentCatalog: delegated
            ? [
              { id: A, createdAt: 1_000, mode: 'continuable', label: 'alpha' },
              { id: B, createdAt: 2_000, mode: 'one-shot', label: 'beta' },
            ]
            : [],
        },
      },
      [A]: { state: 'ready', error: null, values: { turnStats: { turns: 1, steps: 5 } } },
      [B]: { state: 'ready', error: null, values: { subagentTiming: { settledMs: 0, lastTurnCompleted: true } } },
    },
  })
  const statuses = createSnapshotStore<SessionStatusSnapshot>(options.running === true
    ? new Map([[A, { running: true, pendingInteraction: undefined, completionUnread: false }]])
    : new Map())
  const props: SquadTimelineProps = {
    sessionId: LEAD,
    useSessions: bindSnapshotSelector(sessions),
    useSessionStatus: bindSnapshotSelector(statuses),
    t: makeTranslate(zh, commonZh),
  }
  return { props, sessions, statuses }
}

describe('SquadTimeline', () => {
  it('states the empty notice before any delegation exists', () => {
    render(<SquadTimeline {...bench({ delegated: false }).props} />)
    expect(screen.getByText(zh['squad.timeline.empty'])).toBeDefined()
    expect(document.querySelector('[data-squad-timeline]')).toBeNull()
  })

  it('rows the delegations newest first with the mode and step count', () => {
    render(<SquadTimeline {...bench().props} />)
    const rows = Array.from(document.querySelectorAll('[data-squad-event]'))
    expect(rows.map(element => element.getAttribute('data-squad-target'))).toEqual([B, A])
    expect(rows[1]?.textContent).toContain(zh['squad.timeline.row'].replace('{parent}', 'lead').replace('{child}', 'alpha'))
    expect(rows[1]?.textContent).toContain('5 步')
    expect(rows[1]?.textContent).toContain(zh['squad.mode.continuable'])
    expect(rows[0]?.textContent).toContain(zh['squad.mode.oneShot'])
    expect(rows[0]?.textContent).not.toContain('步')
    expect(rows.every(element => element.getAttribute('data-squad-kind') === 'delegation')).toBe(true)
  })

  it('rows a received peer message with its sender and preview', () => {
    const b = bench()
    const projections = b.sessions.getSnapshot().projectionsBySession
    b.sessions.set({
      ...b.sessions.getSnapshot(),
      projectionsBySession: {
        ...projections,
        [A]: {
          state: 'ready',
          error: null,
          values: {
            turnStats: { turns: 1, steps: 5 },
            agentMessages: {
              messages: [
                { id: 'm1', time: 3_000, kind: 'team-message', senderId: LEAD, senderName: 'lead', text: 'please review the draft' },
              ],
            },
          },
        },
      },
    })
    render(<SquadTimeline {...b.props} />)
    const first = document.querySelector('[data-squad-timeline] > li') as HTMLElement
    expect(first.getAttribute('data-squad-kind')).toBe('message')
    expect(first.getAttribute('data-squad-target')).toBe(A)
    expect(first.textContent).toContain('lead → alpha')
    expect(first.textContent).toContain('please review the draft')
  })

  it('reflects the child activity in its row dot', () => {
    render(<SquadTimeline {...bench({ running: true }).props} />)
    const rows = Array.from(document.querySelectorAll('[data-squad-event]'))
    expect(rows[1]?.querySelector('[data-state="ongoing"]')).not.toBeNull()
    expect(rows[0]?.querySelector('[data-state="done"]')).not.toBeNull()
  })
})
