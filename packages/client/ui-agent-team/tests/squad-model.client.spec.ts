import { describe, expect, it } from 'vitest'
import type { SessionId } from '@qilin-agent/session/types'
import type { SessionListState, SessionSummary } from '@qilin-agent/api-session-controller/client'
import type { SessionStatusSnapshot } from '@qilin-agent/client-ui-session-status/client'
import { makeTranslate } from '@qilin-agent/client-test-runtime'
import { zh as commonZh } from '@qilin-agent/client-locale/src/locales/zh.ts'
import {
  SQUAD_CARD_H,
  SQUAD_STAGE_FALLBACK_WIDTH,
  collaborationEvents,
  delegationRows,
  formatSquadClock,
  formatSquadDuration,
  formatSquadTokens,
  layoutSquad,
  squadAgentsOf,
  squadBarSegments,
  squadCounts,
  squadLeadOf,
  squadNeighborhood,
  squadOwnerOf,
  type SquadAgent,
} from '../src/client/squad-model.ts'
import { zh } from '../src/client/locales.ts'

const t = makeTranslate(zh, commonZh)
const LEAD = 'lead' as SessionId
const A = 'a' as SessionId
const B = 'b' as SessionId
const A1 = 'a1' as SessionId

type Projections = SessionListState['projectionsBySession']

function summary(id: SessionId, extra: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id, displayTitle: id, running: false, retainedBy: {}, blank: false, updatedAt: 0, ...extra,
  }
}

function row(id: SessionId, parentId: SessionId | undefined, extra: Partial<SessionSummary> = {}): SessionSummary {
  return summary(id, { ...parentId === undefined ? {} : { parentId }, origin: 'subagent', ...extra })
}

type ProjectionValues = SessionListState['projectionsBySession'][SessionId]['values']

/**
 * Build one context-pressure fixture. The projection type carries a type-only
 * summary mark that a literal cannot spell, so the fixture states the facts.
 * @param value - the pressure facts.
 * @returns the value as the projection map declares it.
 */
function pressure(value: {
  readonly pressureTokens?: number
  readonly projectedTokens?: number
  readonly contextWindow?: number
}): NonNullable<ProjectionValues['contextPressure']> {
  return value as NonNullable<ProjectionValues['contextPressure']>
}

/**
 * Build one composition fixture; like the pressure projection it carries a
 * type-only summary mark a literal cannot spell.
 * @param value - the composition facts.
 * @returns the value as the projection map declares it.
 */
function breakdown(value: {
  readonly systemTokens: number
  readonly toolsTokens: number
  readonly messageTokens: number
}): NonNullable<ProjectionValues['contextBreakdown']> {
  return value as NonNullable<ProjectionValues['contextBreakdown']>
}

function snapshot(values: ProjectionValues): Projections[SessionId] {
  return { state: 'ready', error: null, values }
}

describe('squadLeadOf', () => {
  it('walks durable parent links up to the family root', () => {
    const byId = {
      [LEAD]: summary(LEAD),
      [A]: row(A, LEAD),
      [A1]: row(A1, A),
    }
    expect(squadLeadOf(byId, A1)).toBe(LEAD)
    expect(squadLeadOf(byId, LEAD)).toBe(LEAD)
  })

  it('stops at a parent the client has no row for', () => {
    expect(squadLeadOf({ [A]: row(A, 'missing' as SessionId) }, A)).toBe(A)
  })

  it('stops on a parent cycle instead of looping', () => {
    const byId = { [A]: row(A, B), [B]: row(B, A) }
    expect(squadLeadOf(byId, A)).toBe(B)
  })
})

describe('squadAgentsOf', () => {
  it('orders children by the durable catalog and appends rows it does not know', () => {
    const projections: Projections = {
      [LEAD]: snapshot({
        subagentCatalog: [
          { id: B, createdAt: 0, mode: 'continuable', label: 'builder' },
        ],
      }),
    }
    const byId = {
      [LEAD]: summary(LEAD),
      [A]: row(A, LEAD, { running: true }),
      [B]: row(B, LEAD),
    }
    const agents = squadAgentsOf({ byId, projections, statuses: new Map(), sessionId: LEAD })
    expect(agents.map(agent => agent.id)).toEqual([LEAD, B, A])
    expect(agents[1]).toMatchObject({ label: 'builder', mode: 'continuable', family: 0, depth: 1, ordinal: 1 })
    expect(agents[2]).toMatchObject({ label: A, family: 1, activity: 'running', ordinal: 2 })
    expect(agents[0]).toMatchObject({ isLead: true, isCurrent: true, family: -1, depth: 0, ordinal: 0 })
  })

  it('falls back through subagent identity, title, display title, then identity for labels', () => {
    const projections: Projections = {
      [LEAD]: snapshot({ subagentCatalog: [{ id: A, createdAt: 0, mode: 'one-shot' }] }),
      [A]: snapshot({ subagent: { mode: 'one-shot', seq: 1 as never } }),
      [B]: snapshot({ subagent: { mode: 'continuable', label: 'identity-label', seq: 1 as never } }),
    }
    const byId = {
      [LEAD]: summary(LEAD),
      [A]: row(A, LEAD, { title: 'durable-title', displayTitle: 'display-title' }),
      [B]: row(B, LEAD),
      [A1]: row(A1, A, { displayTitle: 'display-only' }),
    }
    const agents = squadAgentsOf({ byId, projections, statuses: new Map(), sessionId: LEAD })
    expect(agents.map(agent => agent.label)).toEqual([LEAD, 'durable-title', 'display-only', 'identity-label'])
  })

  it('skips blank children but keeps a blank viewed Lead', () => {
    const byId = {
      [LEAD]: summary(LEAD, { blank: true }),
      [A]: row(A, LEAD, { blank: true }),
      [B]: row(B, LEAD, { blank: true, running: true }),
    }
    const agents = squadAgentsOf({ byId, projections: {}, statuses: new Map(), sessionId: LEAD })
    expect(agents.map(agent => agent.id)).toEqual([LEAD, B])
  })

  it('reads live activity, tokens, timing, pressure, and model from statuses and projections', () => {
    const projections: Projections = {
      [LEAD]: snapshot({
        subagentCatalog: [{ id: A, createdAt: 0, mode: 'continuable', label: 'alpha' }],
        tokenUsage: { uncachedInputTokens: 10, outputTokens: 5, cacheReadTokens: 2, cacheWriteTokens: 1 },
        modelSelection: { lastUsed: null, next: { provider: 'p', model: 'lead-model' } },
        contextPressure: pressure({ projectedTokens: 45, contextWindow: 100 }),
        subagentTiming: { settledMs: 1_500, active: { since: 0, through: 2_000 } },
      }),
      [A]: snapshot({
        tokenUsage: { uncachedInputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 },
        contextPressure: pressure({ pressureTokens: 80, contextWindow: 100 }),
        subagentTiming: { settledMs: 0, lastTurnCompleted: true },
      }),
    }
    const byId = { [LEAD]: summary(LEAD), [A]: row(A, LEAD, { running: false }) }
    const statuses: SessionStatusSnapshot = new Map([[
      LEAD, { running: true, pendingInteraction: undefined, completionUnread: false, completionFailed: false },
    ]])
    const agents = squadAgentsOf({ byId, projections, statuses, sessionId: LEAD })
    expect(agents[0]).toMatchObject({
      activity: 'running', tokens: 18, durationMs: 3_500, pressure: 45, model: 'lead-model',
    })
    expect(agents[1]).toMatchObject({ activity: 'done', tokens: 2, pressure: 80 })
    expect(agents[1]?.durationMs).toBeUndefined()
  })

  it('reads summary projection values before a child has its own Session cell', () => {
    const byId = {
      [LEAD]: summary(LEAD),
      [A]: row(A, LEAD, {
        projectionValues: {
          tokenUsage: { uncachedInputTokens: 1, outputTokens: 2, cacheReadTokens: 0, cacheWriteTokens: 1 },
          modelSelection: { lastUsed: null, next: { provider: 'p', model: 'child-model' } },
          subagentTiming: { settledMs: 1_500 },
          turnStats: { turns: 2, steps: 5 },
        },
      }),
    }
    const agents = squadAgentsOf({ byId, projections: {}, statuses: new Map(), sessionId: LEAD })
    expect(agents[1]).toMatchObject({
      tokens: 4,
      model: 'child-model',
      durationMs: 1_500,
      totals: { turns: 2, steps: 5 },
    })
    expect(agents[1]?.pressure).toBeUndefined()
  })

  it('carries the inbound peer messages the recipient logged', () => {
    const messages = [
      { id: 'm1', time: 9, kind: 'team-message' as const, senderId: LEAD, senderName: 'lead', text: 'hello' },
    ]
    const projections: Projections = {
      [A]: snapshot({ agentMessages: { messages } }),
    }
    const agents = squadAgentsOf({
      byId: { [LEAD]: summary(LEAD), [A]: row(A, LEAD) }, projections, statuses: new Map(), sessionId: LEAD,
    })
    expect(agents[1]?.messages).toEqual(messages)
    expect(agents[0]?.messages).toBeUndefined()
  })

  it('carries step and turn totals and the durable times a timeline needs', () => {
    const projections: Projections = {
      [LEAD]: snapshot({ subagentCatalog: [{ id: A, createdAt: 111, mode: 'continuable', label: 'alpha' }] }),
      [A]: snapshot({ turnStats: { turns: 2, steps: 9 } }),
    }
    const byId = { [LEAD]: summary(LEAD), [A]: row(A, LEAD, { updatedAt: 222 }) }
    const agents = squadAgentsOf({ byId, projections, statuses: new Map(), sessionId: LEAD })
    expect(agents[1]).toMatchObject({ totals: { steps: 9, turns: 2 }, createdAt: 111, updatedAt: 222 })
    expect(agents[0]?.totals).toBeUndefined()
    expect(agents[0]?.createdAt).toBeUndefined()
  })

  it('carries the reported composition so the card bar can split it', () => {
    const projections: Projections = {
      [LEAD]: snapshot({
        subagentCatalog: [{ id: A, createdAt: 0, mode: 'continuable', label: 'alpha' }],
        contextBreakdown: breakdown({ systemTokens: 100, toolsTokens: 50, messageTokens: 50 }),
      }),
    }
    const agents = squadAgentsOf({
      byId: { [LEAD]: summary(LEAD), [A]: row(A, LEAD) }, projections, statuses: new Map(), sessionId: LEAD,
    })
    expect(agents[0]?.breakdown).toEqual({ systemTokens: 100, toolsTokens: 50, messageTokens: 50 })
    expect(agents[1]?.breakdown).toBeUndefined()
  })

  it('ignores a pressure without a usable window and timing without work', () => {
    const projections: Projections = {
      [LEAD]: snapshot({
        subagentCatalog: [{ id: A, createdAt: 0, mode: 'unknown' }],
        contextPressure: pressure({ projectedTokens: 10 }),
        subagentTiming: { settledMs: 0, active: { since: 10, through: 4 } },
      }),
      [A]: snapshot({ contextPressure: pressure({ pressureTokens: 10, contextWindow: 0 }) }),
    }
    const byId = { [LEAD]: summary(LEAD), [A]: row(A, LEAD) }
    const agents = squadAgentsOf({ byId, projections, statuses: new Map(), sessionId: A })
    expect(agents[0]).toMatchObject({ id: LEAD, activity: 'idle' })
    expect(agents[0]?.pressure).toBeUndefined()
    expect(agents[0]?.durationMs).toBeUndefined()
    expect(agents[1]?.pressure).toBeUndefined()
    expect(agents[1]?.isCurrent).toBe(true)
  })

  it('carries a catalog-only child the row map has not learned yet', () => {
    const projections: Projections = {
      [LEAD]: snapshot({ subagentCatalog: [{ id: 'ghost' as SessionId, createdAt: 0, mode: 'external', label: 'remote' }] }),
    }
    const agents = squadAgentsOf({
      byId: { [LEAD]: summary(LEAD) }, projections, statuses: new Map(), sessionId: LEAD,
    })
    expect(agents[1]).toMatchObject({ id: 'ghost', label: 'remote', mode: 'external', activity: 'idle' })
  })

  it('follows a duplicated catalog row once', () => {
    const projections: Projections = {
      [LEAD]: snapshot({
        subagentCatalog: [
          { id: A, createdAt: 0, mode: 'continuable', label: 'alpha' },
          { id: A, createdAt: 0, mode: 'continuable', label: 'alpha' },
        ],
      }),
    }
    const agents = squadAgentsOf({
      byId: { [LEAD]: summary(LEAD), [A]: row(A, LEAD) }, projections, statuses: new Map(), sessionId: LEAD,
    })
    expect(agents.map(agent => agent.id)).toEqual([LEAD, A])
  })

  it('orders unordered siblings by running work, recency, then identity', () => {
    const byId = {
      [LEAD]: summary(LEAD),
      [A]: row(A, LEAD, { running: true, updatedAt: 5 }),
      ['c' as SessionId]: row('c' as SessionId, LEAD, { running: false, updatedAt: 9 }),
      [B]: row(B, LEAD, { running: false, updatedAt: 9 }),
    }
    const agents = squadAgentsOf({ byId, projections: {}, statuses: new Map(), sessionId: LEAD })
    expect(agents.map(agent => agent.id)).toEqual([LEAD, A, B, 'c' as SessionId])
  })

  it('falls back to the identity when a row carries no display facts', () => {
    const rowWithoutTitle = {
      id: A, parentId: LEAD, running: false, retainedBy: {}, blank: false, updatedAt: 0,
    } as SessionSummary
    const agents = squadAgentsOf({
      byId: { [LEAD]: summary(LEAD), [A]: rowWithoutTitle },
      projections: {},
      statuses: new Map(),
      sessionId: LEAD,
    })
    expect(agents[1]?.label).toBe(A)
  })

  it('breaks a parent cycle between rows', () => {
    const byId = { [LEAD]: summary(LEAD), [A]: row(A, B), [B]: row(B, A) }
    const agents = squadAgentsOf({ byId, projections: {}, statuses: new Map(), sessionId: LEAD })
    expect(agents.map(agent => agent.id)).toEqual([LEAD])
  })
})

describe('squadCounts', () => {
  it('totals agents, running agents, tokens, members, and tasks', () => {
    const agents: SquadAgent[] = [
      { id: LEAD, label: 'lead', depth: 0, family: -1, ordinal: 0, activity: 'running', isCurrent: true, isLead: true, tokens: 5 },
      { id: A, label: 'a', depth: 1, family: 0, ordinal: 1, activity: 'idle', isCurrent: false, isLead: false },
    ]
    expect(squadCounts(agents, undefined)).toEqual({ agents: 2, running: 1, tokens: 5, members: 0, tasks: 0 })
    expect(squadCounts(agents, {
      members: [{ id: LEAD, name: 'lead', role: 'lead', phase: 'active' }],
      tasks: [],
    })).toMatchObject({ members: 1, tasks: 0 })
  })
})

describe('squadNeighborhood and squadOwnerOf', () => {
  const agents: SquadAgent[] = [
    { id: LEAD, label: 'lead', depth: 0, family: -1, ordinal: 0, activity: 'idle', isCurrent: false, isLead: true },
    { id: A, label: 'alpha', parentId: LEAD, depth: 1, family: 0, ordinal: 1, activity: 'idle', isCurrent: false, isLead: false },
    { id: B, label: 'beta', parentId: LEAD, depth: 1, family: 1, ordinal: 2, activity: 'idle', isCurrent: false, isLead: false },
  ]

  it('keeps an agent, its parent, and its children', () => {
    expect([...squadNeighborhood(agents, A)]).toEqual([A, LEAD])
    expect([...squadNeighborhood(agents, LEAD)]).toEqual([LEAD, A, B])
  })

  it('resolves an owner name to its agent', () => {
    expect(squadOwnerOf(agents, 'beta')).toBe(B)
    expect(squadOwnerOf(agents, 'nobody')).toBeUndefined()
  })
})

describe('layoutSquad', () => {
  const agents: SquadAgent[] = [
    { id: LEAD, label: 'lead', depth: 0, family: -1, ordinal: 0, activity: 'running', isCurrent: true, isLead: true },
    { id: A, label: 'alpha', parentId: LEAD, depth: 1, family: 0, ordinal: 1, activity: 'running', isCurrent: false, isLead: false },
    { id: B, label: 'beta', parentId: LEAD, depth: 1, family: 1, ordinal: 2, activity: 'idle', isCurrent: false, isLead: false },
  ]

  it('places leaves on one row and centers the parent over them', () => {
    const layout = layoutSquad(agents, 600)
    const pointOf = (id: SessionId) => layout.points.find(point => point.id === id)
    expect(pointOf(LEAD)?.x).toBe(pointOf(A)!.x + (pointOf(B)!.x - pointOf(A)!.x) / 2)
    expect(pointOf(A)!.y).toBeGreaterThan(pointOf(LEAD)!.y)
    expect(layout.points.map(point => point.id)).toEqual([LEAD, A, B])
    expect(layout.links.map(link => link.to)).toEqual([A, B])
    expect(layout.links[0]).toMatchObject({ running: true, hue: 0 })
    expect(layout.cardW).toBeGreaterThan(0)
  })

  it('draws nothing for an empty formation', () => {
    expect(layoutSquad([], 400)).toEqual({
      width: 320, height: 6 + SQUAD_CARD_H + 16, cardW: 308, points: [], links: [],
    })
  })

  it('falls back to a default stage width and one slot for a solo formation', () => {
    const layout = layoutSquad([agents[0] as SquadAgent], 0)
    expect(layout.width).toBe(320)
    expect(layout.height).toBeGreaterThan(0)
    expect(layout.links).toEqual([])
    expect(SQUAD_STAGE_FALLBACK_WIDTH).toBeGreaterThan(0)
  })

  it('clamps the slot width between its minimum and maximum', () => {
    const wide = layoutSquad(agents, 10_000)
    expect(wide.width).toBe(640)
    expect(wide.cardW).toBe(308)
    const narrow = layoutSquad(agents, 10)
    expect(narrow.width).toBe(176)
    expect(narrow.cardW).toBe(164)
  })

  it('flushes a band when the next group would overflow it', () => {
    const branch = (id: string, parentId: SessionId, ordinal: number, depth: number): SquadAgent => ({
      id: id as SessionId,
      label: id,
      parentId,
      depth,
      family: ordinal,
      ordinal,
      activity: 'idle',
      isCurrent: false,
      isLead: false,
    })
    const kids = [
      branch('one', LEAD, 1, 1),
      branch('two', LEAD, 2, 1),
      branch('one-a', 'one' as SessionId, 1, 2),
      branch('two-a', 'two' as SessionId, 1, 2),
      branch('two-b', 'two' as SessionId, 2, 2),
      branch('two-c', 'two' as SessionId, 3, 2),
    ]
    const layout = layoutSquad([agents[0] as SquadAgent, ...kids], 400)
    expect(layout.points).toHaveLength(7)
    expect(layout.cardW).toBe(188)
    expect(layout.height).toBeGreaterThan(0)
  })

  it('packs levels into bands when the leaves outgrow one row', () => {
    const kids: SquadAgent[] = Array.from({ length: 6 }, (_, index) => ({
      id: `kid-${index}` as SessionId,
      label: `kid ${index}`,
      parentId: LEAD,
      depth: 1,
      family: index,
      ordinal: index + 1,
      activity: 'idle' as const,
      isCurrent: false,
      isLead: false,
    }))
    const layout = layoutSquad([agents[0] as SquadAgent, ...kids], 400)
    expect(layout.width).toBe(400)
    expect(layout.cardW).toBe(188)
    expect(layout.points).toHaveLength(7)
    expect(layout.points.slice(1).map(point => point.y)).toEqual([174, 174, 342, 342, 510, 510])
    expect(layout.height).toBe(6 + 3 * 168 + SQUAD_CARD_H + 16)
    expect(layout.links).toHaveLength(6)
  })
})

describe('delegationRows and formatSquadClock', () => {
  it('orders delegated rows newest first and names their parents', () => {
    const rows = delegationRows([
      { id: LEAD, label: 'lead', depth: 0, family: -1, ordinal: 0, activity: 'idle', isCurrent: true, isLead: true },
      { id: A, label: 'alpha', parentId: LEAD, depth: 1, family: 0, ordinal: 1, activity: 'running', isCurrent: false, isLead: false, createdAt: 100 },
      { id: B, label: 'beta', parentId: LEAD, depth: 1, family: 1, ordinal: 2, activity: 'idle', isCurrent: false, isLead: false, createdAt: 300 },
    ])
    expect(rows.map(row => row.agent.id)).toEqual([B, A])
    expect(rows[0]?.parentLabel).toBe('lead')
    expect(rows[0]?.time).toBe(300)
  })

  it('falls back to the latest activity and drops a child with no time at all', () => {
    const rows = delegationRows([
      { id: LEAD, label: 'lead', depth: 0, family: -1, ordinal: 0, activity: 'idle', isCurrent: true, isLead: true },
      { id: A, label: 'alpha', parentId: LEAD, depth: 1, family: 0, ordinal: 1, activity: 'idle', isCurrent: false, isLead: false, updatedAt: 50 },
      { id: B, label: 'beta', parentId: LEAD, depth: 1, family: 1, ordinal: 2, activity: 'idle', isCurrent: false, isLead: false },
    ])
    expect(rows.map(row => row.agent.id)).toEqual([A])
    expect(rows[0]?.time).toBe(50)
  })

  it('breaks equal times by identity', () => {
    const rows = delegationRows([
      { id: LEAD, label: 'lead', depth: 0, family: -1, ordinal: 0, activity: 'idle', isCurrent: true, isLead: true },
      { id: B, label: 'beta', parentId: LEAD, depth: 1, family: 1, ordinal: 2, activity: 'idle', isCurrent: false, isLead: false, createdAt: 10 },
      { id: A, label: 'alpha', parentId: LEAD, depth: 1, family: 0, ordinal: 1, activity: 'idle', isCurrent: false, isLead: false, createdAt: 10 },
    ])
    expect(rows.map(row => row.agent.id)).toEqual([A, B])
  })

  it('falls back to the parent id when the parent row is absent', () => {
    const rows = delegationRows([
      { id: A, label: 'alpha', parentId: 'missing' as SessionId, depth: 1, family: 0, ordinal: 1, activity: 'idle', isCurrent: false, isLead: false, createdAt: 10 },
    ])
    expect(rows[0]?.parentLabel).toBe('missing' as SessionId)
  })

  it('breaks equal times by identity in both arrival orders', () => {
    const alpha = { id: A, label: 'alpha', parentId: LEAD, depth: 1, family: 0, ordinal: 1, activity: 'idle' as const, isCurrent: false, isLead: false, createdAt: 10 }
    const beta = { id: B, label: 'beta', parentId: LEAD, depth: 1, family: 1, ordinal: 2, activity: 'idle' as const, isCurrent: false, isLead: false, createdAt: 10 }
    expect(delegationRows([alpha, beta]).map(row => row.agent.id)).toEqual([A, B])
    expect(delegationRows([beta, alpha]).map(row => row.agent.id)).toEqual([A, B])
  })

  it('formats one local clock time', () => {
    expect(formatSquadClock(Date.UTC(2026, 10, 14, 3, 4))).toMatch(/\d{1,2}:\d{2}/u)
  })
})

describe('collaborationEvents', () => {
  const base = {
    depth: 1, family: 0, activity: 'idle' as const, isCurrent: false, isLead: false,
  }
  const alpha = {
    ...base,
    id: A,
    label: 'alpha',
    parentId: LEAD,
    ordinal: 1,
    createdAt: 100,
    messages: [
      { id: 'm1', time: 300, kind: 'team-message' as const, senderId: LEAD, senderName: 'lead', text: 'please review' },
    ],
  }
  const beta = { ...base, id: B, label: 'beta', parentId: LEAD, ordinal: 2, createdAt: 200 }
  const lead = {
    id: LEAD, label: 'lead', depth: 0, family: -1, ordinal: 0, activity: 'idle' as const, isCurrent: true, isLead: true,
  }

  it('merges delegations and messages newest first', () => {
    const events = collaborationEvents([lead, alpha, beta])
    expect(events.map(event => event.id)).toEqual(['message:m1', `delegation:${B}`, `delegation:${A}`])
    expect(events[0]).toMatchObject({ kind: 'message', senderLabel: 'lead', text: 'please review' })
    expect(events[1]).toMatchObject({ kind: 'delegation', senderLabel: 'lead' })
    expect(events[1]?.target.id).toBe(B)
  })

  it('names a message sender by durable name, then label, then identity', () => {
    const named = collaborationEvents([lead, {
      ...alpha,
      messages: [{ id: 'm2', time: 1, kind: 'agent-message' as const, senderId: B, text: 'raw' }],
    }, beta])
    expect(named.find(event => event.kind === 'message')?.senderLabel).toBe('beta')
    const unknown = collaborationEvents([lead, {
      ...alpha,
      messages: [{ id: 'm3', time: 1, kind: 'agent-message' as const, senderId: 'ghost' as SessionId, text: 'raw' }],
    }])
    expect(unknown.find(event => event.kind === 'message')?.senderLabel).toBe('ghost')
  })

  it('breaks equal times by row identity in both arrival orders', () => {
    const one = { ...beta, createdAt: 500 }
    const two = { ...alpha, createdAt: 500, messages: [] }
    expect(collaborationEvents([lead, one, two]).map(event => event.id))
      .toEqual([`delegation:${A}`, `delegation:${B}`])
    expect(collaborationEvents([lead, two, one]).map(event => event.id))
      .toEqual([`delegation:${A}`, `delegation:${B}`])
    const later = { ...beta, createdAt: 500 }
    const earlier = { ...alpha, id: '0' as SessionId, createdAt: 500, messages: [] }
    expect(collaborationEvents([lead, later, earlier]).map(event => event.id))
      .toEqual(['delegation:0', `delegation:${B}`])
    expect(collaborationEvents([lead, earlier, later]).map(event => event.id))
      .toEqual(['delegation:0', `delegation:${B}`])
  })

  it('breaks equal message times by row identity in both directions', () => {
    const withMessage = (id: SessionId, messageId: string): SquadAgent => ({
      id,
      label: String(id),
      parentId: LEAD,
      depth: 1,
      family: 0,
      ordinal: 1,
      activity: 'idle',
      isCurrent: false,
      isLead: false,
      messages: [{ id: messageId, time: 700, kind: 'team-message', senderId: LEAD, senderName: 'lead', text: 'same time' }],
    })
    const zeta = withMessage('z' as SessionId, 'm-z')
    const eta = withMessage('b' as SessionId, 'm-a')
    expect(collaborationEvents([lead, zeta, eta]).map(event => event.id))
      .toEqual(['message:m-a', 'message:m-z'])
    expect(collaborationEvents([lead, eta, zeta]).map(event => event.id))
      .toEqual(['message:m-a', 'message:m-z'])
  })

  it('has no rows without delegations or messages', () => {
    expect(collaborationEvents([lead])).toEqual([])
  })
})

describe('squadBarSegments', () => {
  const base: SquadAgent = {
    id: LEAD, label: 'lead', depth: 0, family: -1, ordinal: 0, activity: 'idle', isCurrent: true, isLead: true,
  }

  it('splits the used share by the reported composition and leaves the rest free', () => {
    const segments = squadBarSegments({
      ...base,
      pressure: 50,
      breakdown: { systemTokens: 50, toolsTokens: 30, messageTokens: 20 },
    })
    expect(segments.map(segment => segment.key)).toEqual(['system', 'tools', 'messages', 'free'])
    expect(segments[0]?.share).toBeCloseTo(0.25)
    expect(segments[1]?.share).toBeCloseTo(0.15)
    expect(segments[2]?.share).toBeCloseTo(0.1)
    expect(segments[3]?.share).toBeCloseTo(0.5)
  })

  it('keeps an unreported composition in one used bucket', () => {
    expect(squadBarSegments({ ...base, pressure: 40 })).toEqual([
      { key: 'messages', share: 0.4 },
      { key: 'free', share: 0.6 },
    ])
  })

  it('draws a free track without occupancy', () => {
    expect(squadBarSegments(base)).toEqual([{ key: 'free', share: 1 }])
  })

  it('treats an empty composition as unreported and clamps a full occupancy', () => {
    expect(squadBarSegments({
      ...base,
      pressure: 140,
      breakdown: { systemTokens: 0, toolsTokens: 0, messageTokens: 0 },
    })).toEqual([{ key: 'messages', share: 1 }])
    expect(squadBarSegments({
      ...base,
      pressure: 100,
      breakdown: { systemTokens: 0, toolsTokens: 10, messageTokens: 0 },
    })).toEqual([
      { key: 'tools', share: 1 },
    ])
  })
})

describe('formatting', () => {
  it('abbreviates tokens at the thousand and million steps', () => {
    expect(formatSquadTokens(940, t)).toBe('940')
    expect(formatSquadTokens(1_200, t)).toBe('1.2k')
    expect(formatSquadTokens(120_000, t)).toBe('120k')
    expect(formatSquadTokens(2_500_000, t)).toBe('2.5M')
  })

  it('formats durations with decreasing precision', () => {
    expect(formatSquadDuration(9_400, t)).toBe('9s')
    expect(formatSquadDuration(69_000, t)).toBe('1m09s')
    expect(formatSquadDuration(-5, t)).toBe('0s')
    expect(formatSquadDuration(3_930_000, t)).toBe('1h05m')
  })
})
