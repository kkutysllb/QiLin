// @vitest-environment jsdom
/**
 * The Team page's formation graph: the chips above the canvas, one card per
 * agent with its live facts, the hover neighbourhood shared with the board, and
 * every way a card opens a conversation.
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
import { SquadFormation, type SquadFormationProps } from '../src/client/SquadFormation.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const LEAD = 'lead' as SessionId
const A = 'a' as SessionId
const B = 'b' as SessionId

type Projections = SessionListState['projectionsBySession']

function row(id: SessionId, parentId: SessionId, extra: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id, displayTitle: id, parentId, origin: 'subagent', running: false, retainedBy: {}, blank: false, updatedAt: 0, ...extra,
  }
}

type ProjectionValues = Projections[SessionId]['values']

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

function snapshot(values: ProjectionValues): Projections[SessionId] {
  return { state: 'ready', error: null, values }
}

interface BenchOptions {
  readonly team?: TeamProjection
  readonly statuses?: SessionStatusSnapshot
  readonly projections?: Projections
  readonly hoveredOwner?: string
  /** Restrict the row map, e.g. to a Lead with no delegated child. */
  readonly onlyLead?: boolean
  /** How many delegated children the row map holds (default 2). */
  readonly children?: number
  /** The conversation on screen; a child session makes the Lead a background card. */
  readonly sessionId?: SessionId
}

function bench(options: BenchOptions = {}) {
  const projections: Projections = options.projections ?? {
    [LEAD]: snapshot({
      agentTeam: options.team ?? {
        members: [
          { id: LEAD, name: 'lead', role: 'lead', phase: 'active' },
          { id: A, name: 'alpha', role: 'teammate', phase: 'active' },
        ],
        tasks: [],
      },
      subagentCatalog: [
        { id: A, createdAt: 0, mode: 'continuable', label: 'alpha' },
        { id: B, createdAt: 0, mode: 'one-shot', label: 'beta' },
      ],
      tokenUsage: { uncachedInputTokens: 100, outputTokens: 200, cacheReadTokens: 0, cacheWriteTokens: 0 },
      contextPressure: pressure({ projectedTokens: 75, contextWindow: 100 }),
    }),
    [A]: snapshot({
      modelSelection: { lastUsed: null, next: { provider: 'p', model: 'deepseek-chat' } },
      subagentTiming: { settledMs: 65_000 },
      tokenUsage: { uncachedInputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
    }),
  }
  const leadRow = { id: LEAD, displayTitle: 'lead', running: true, retainedBy: {}, blank: false, updatedAt: 0 }
  const childIds: SessionId[] = Array.from(
    { length: options.children ?? 0 },
    (_, index) => `child-${String(index)}` as SessionId,
  )
  const byId: Record<SessionId, SessionSummary> = options.onlyLead === true
    ? { [LEAD]: leadRow }
    : options.children === undefined
      ? { [LEAD]: leadRow, [A]: row(A, LEAD), [B]: row(B, LEAD) }
      : Object.fromEntries([
        [LEAD, leadRow],
        ...childIds.map(id => [id, { ...row(id, LEAD), displayTitle: id }] as const),
      ])
  const sessions = createSnapshotStore<SessionListState>({
    ids: [LEAD, A, B], byId, phase: 'ready', projectionsBySession: projections,
  })
  const statuses = createSnapshotStore<SessionStatusSnapshot>(
    options.statuses ?? new Map([[A, { running: true, pendingInteraction: undefined, completionUnread: false }]]),
  )
  const onHoverOwner = vi.fn()
  const openAgent = vi.fn()
  const refreshAgent = vi.fn()
  const props: SquadFormationProps = {
    sessionId: options.sessionId ?? LEAD,
    useSessions: bindSnapshotSelector(sessions),
    useSessionStatus: bindSnapshotSelector(statuses),
    hoveredOwner: options.hoveredOwner,
    onHoverOwner,
    openAgent,
    refreshAgent,
    t: makeTranslate(zh, commonZh),
  }
  return { props, onHoverOwner, openAgent, refreshAgent, sessions, statuses }
}

function card(id: SessionId): HTMLElement {
  return document.querySelector(`[data-squad-agent="${id}"]`) as HTMLElement
}

describe('SquadFormation', () => {
  it('states the formation and Team totals above the canvas', () => {
    render(<SquadFormation {...bench().props} />)
    expect(screen.getByText('3 Agent')).toBeDefined()
    expect(screen.getByText('2 运行中')).toBeDefined()
    expect(screen.getByText(/^团队 · 2 成员/u)).toBeDefined()
  })

  it('omits the passive chips that carry no fact', () => {
    const b = bench({
      statuses: new Map(),
      projections: {
        [LEAD]: snapshot({ subagentCatalog: [{ id: B, createdAt: 0, mode: 'one-shot', label: 'beta' }] }),
      },
    })
    render(<SquadFormation {...b.props} />)
    expect(screen.queryByText(/^团队/u)).toBeNull()
    expect(screen.queryByText(/tokens/u)).toBeNull()
    expect(screen.getByText('1 运行中')).toBeDefined()
  })

  it('draws every agent with its activity, tokens, model, and mode', () => {
    render(<SquadFormation {...bench().props} />)
    expect(card(LEAD).getAttribute('aria-label')).toContain('运行中')
    expect(card(A).getAttribute('aria-label')).toContain('1m05s')
    expect(card(A).textContent).toContain('deepseek-chat')
    expect(card(A).textContent).toContain('20')
    expect(card(B).textContent).toContain('beta')
    expect(card(B).textContent).toContain('一次性')
    expect(card(B).getAttribute('aria-label')).toContain('空闲')
    expect(card(B).textContent).toContain('—')
    expect(card(A).getAttribute('data-squad-dim')).toBeNull()
  })

  it('draws occupancy as a composition bar and marks the Lead and the current conversation', () => {
    render(<SquadFormation {...bench().props} />)
    const used = card(LEAD).querySelector('[data-squad-segment="messages"]') as HTMLElement
    expect(used.style.width).toBe('75%')
    const free = card(LEAD).querySelector('[data-squad-segment="free"]') as HTMLElement
    expect(free.style.width).toBe('25%')
    expect(card(LEAD).textContent).toContain('当前')
    expect(card(LEAD).textContent).toContain('75%')
    expect(card(B).querySelector('[data-squad-segment="free"]')).not.toBeNull()
    expect(card(B).querySelector('[data-squad-segment="messages"]')).toBeNull()
  })

  it('states the bar legend and the running edge marker', () => {
    render(<SquadFormation {...bench().props} />)
    expect(screen.getByText('系统提示词')).toBeDefined()
    expect(screen.getByText('工具定义')).toBeDefined()
    expect(screen.getByText('消息')).toBeDefined()
    expect(screen.getByText('空闲窗口')).toBeDefined()
    expect(screen.getByText('运行中连线')).toBeDefined()
  })

  it('reflows the canvas to the measured stage width', () => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 })
    const b = bench()
    render(<SquadFormation {...b.props} />)
    const canvas = document.querySelector('[data-squad-formation] > div > div') as HTMLElement
    expect(canvas.style.width).toBe('640px')
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth
  })

  it('lights one agent neighbourhood and fades the rest while hovering it', () => {
    const b = bench()
    render(<SquadFormation {...b.props} />)
    fireEvent.mouseEnter(card(A))
    expect(b.onHoverOwner).toHaveBeenCalledWith('alpha')
    expect(card(A).getAttribute('data-squad-dim')).toBeNull()
    expect(card(LEAD).getAttribute('data-squad-dim')).toBeNull()
    expect(card(B).getAttribute('data-squad-dim')).toBe('')
    expect(document.querySelector('[data-squad-edge="a"]')?.getAttribute('data-squad-lit')).toBe('')
    fireEvent.mouseLeave(card(A))
    expect(b.onHoverOwner).toHaveBeenLastCalledWith(undefined)
    expect(card(B).getAttribute('data-squad-dim')).toBeNull()
  })

  it('lights the card a board row points at, through the owner name', () => {
    const b = bench()
    const { rerender } = render(<SquadFormation {...b.props} />)
    rerender(<SquadFormation {...b.props} hoveredOwner="alpha" />)
    expect(card(A).getAttribute('data-squad-dim')).toBeNull()
    expect(card(B).getAttribute('data-squad-dim')).toBe('')
    rerender(<SquadFormation {...b.props} hoveredOwner="nobody" />)
    expect(card(B).getAttribute('data-squad-dim')).toBeNull()
  })

  it('separates the occupancy bands and marks a background Lead', () => {
    const b = bench({
      sessionId: A,
      statuses: new Map(),
      projections: {
        [LEAD]: snapshot({
          subagentCatalog: [{ id: A, createdAt: 0, mode: 'continuable', label: 'alpha' }],
          contextPressure: pressure({ projectedTokens: 96, contextWindow: 100 }),
        }),
        [A]: snapshot({
          subagentTiming: { settledMs: 0, lastTurnCompleted: true },
          contextPressure: pressure({ pressureTokens: 40, contextWindow: 100 }),
        }),
        [B]: snapshot({ subagentTiming: { settledMs: 0, lastTurnCompleted: true } }),
      },
    })
    render(<SquadFormation {...b.props} />)
    expect(card(LEAD).querySelector('[data-squad-segment="messages"]')).not.toBeNull()
    expect(card(LEAD).textContent).toContain('96%')
    expect((card(LEAD).querySelector('[data-squad-pct]') as HTMLElement).getAttribute('style'))
      .toContain('--qilin-alias-state-error-primary')
    expect((card(A).querySelector('[data-squad-segment="messages"]') as HTMLElement).style.width).toBe('40%')
    expect(card(LEAD).textContent).toContain('主 Agent')
    expect(card(A).getAttribute('aria-label')).toContain('已完成')
    expect(card(B).textContent).toContain('—')
  })

  it('lights the neighbourhood from keyboard focus', () => {
    const b = bench()
    render(<SquadFormation {...b.props} />)
    fireEvent.focus(card(A))
    expect(b.onHoverOwner).toHaveBeenCalledWith('alpha')
    expect(card(B).getAttribute('data-squad-dim')).toBe('')
    fireEvent.blur(card(A))
    expect(b.onHoverOwner).toHaveBeenLastCalledWith(undefined)
  })

  it('asks the Host once for a drawn child whose summary-excluded facts are missing', () => {
    const b = bench()
    const { rerender } = render(<SquadFormation {...b.props} />)
    // The Lead already carries pressure; the children do not, so each is asked about once.
    expect(b.refreshAgent.mock.calls).toEqual([[A], [B]])
    rerender(<SquadFormation {...b.props} />)
    expect(b.refreshAgent).toHaveBeenCalledTimes(2)
    // A later callback identity re-runs the effect; already asked agents stay quiet.
    const refreshAgain = vi.fn()
    rerender(<SquadFormation {...b.props} refreshAgent={refreshAgain} />)
    expect(refreshAgain).not.toHaveBeenCalled()
  })

  it('bounds how many agents one mount asks about', () => {
    const b = bench({ children: 20 })
    render(<SquadFormation {...b.props} />)
    expect(b.refreshAgent).toHaveBeenCalledTimes(16)
  })

  it('does not ask without the refresh callback', () => {
    const b = bench()
    render(<SquadFormation {...b.props} refreshAgent={undefined} />)
    expect(b.refreshAgent).not.toHaveBeenCalled()
  })

  it('opens the Lead by identity and a child through its durable address', () => {
    const b = bench()
    render(<SquadFormation {...b.props} />)
    fireEvent.click(card(LEAD))
    fireEvent.click(card(A))
    expect(b.openAgent.mock.calls).toEqual([
      [LEAD],
      [{ parentSessionId: LEAD, childSessionId: A, mode: 'continuable' }],
    ])
  })

  it('addresses a child without a known mode as unknown', () => {
    const b = bench({
      projections: {
        [LEAD]: snapshot({ subagentCatalog: [] }),
      },
    })
    render(<SquadFormation {...b.props} />)
    fireEvent.click(card(B))
    expect(b.openAgent).toHaveBeenCalledWith({ parentSessionId: LEAD, childSessionId: B, mode: 'unknown' })
  })

  it('opens a focused card from the keyboard and ignores other keys', () => {
    const b = bench()
    render(<SquadFormation {...b.props} />)
    fireEvent.keyDown(card(A), { key: 'a' })
    expect(b.openAgent).not.toHaveBeenCalled()
    fireEvent.keyDown(card(A), { key: 'Enter' })
    fireEvent.keyDown(card(A), { key: ' ' })
    expect(b.openAgent).toHaveBeenCalledTimes(2)
  })

  it('explains an empty formation and measures the stage it draws on', () => {
    class Observer {
      observe = vi.fn()
      disconnect = vi.fn()
    }
    vi.stubGlobal('ResizeObserver', Observer)
    const b = bench({ projections: { [LEAD]: snapshot({}) }, onlyLead: true, statuses: new Map() })
    render(<SquadFormation {...b.props} />)
    expect(screen.getByText(zh['squad.solo'])).toBeDefined()
    expect(screen.getByText('1 Agent')).toBeDefined()
  })

  it('still draws without a resize observer', () => {
    vi.stubGlobal('ResizeObserver', undefined)
    render(<SquadFormation {...bench().props} />)
    expect(card(LEAD)).not.toBeNull()
  })
})
