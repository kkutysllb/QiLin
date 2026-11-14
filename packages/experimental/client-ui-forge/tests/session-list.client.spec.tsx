// @vitest-environment jsdom
/**
 * Session row icons and hover card section: the worktree the Session works
 * in, and its visible change requests ordered by urgency.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { SessionListState } from '@qilin-agent/api-session-controller/client'
import { createSnapshotStore } from '@qilin-agent/client-store'
import { bindSnapshotSelector, makeTranslate } from '@qilin-agent/client-test-runtime'
import type { BindingState } from '@qilin-agent/experimental-forge-session/types'
import { SessionId } from '@qilin-agent/session/types'
import type { SessionProjectionMap } from '@qilin-agent/session-projection/types'
import { en } from '../src/client/locales.ts'
import { sessionForgeFacts, type ChangeRequestStates } from '../src/client/session-list.ts'
import { HOVER_CHANGE_REQUEST_LIMIT, SessionHoverForge, type SessionHoverForgeProps } from '../src/client/SessionHoverForge.tsx'
import { SessionRowForge, stateLine, type SessionRowForgeProps } from '../src/client/SessionRowForge.tsx'
import css from '../src/client/SessionList.module.css'
import type { ForgeChangeRequestListState } from '../src/types.ts'
import { created, listState as state } from './client-fixtures.client.ts'

afterEach(cleanup)

const t = makeTranslate(en)
const S1 = SessionId('s1')

type Values = Readonly<Partial<SessionProjectionMap>>

function url(number: number): string {
  return `https://github.com/octo/demo/pull/${number}`
}

function binding(number: number, dismissed = false): BindingState {
  return { url: url(number), origin: 'referenced', dismissed }
}

function statesOf(...values: ForgeChangeRequestListState[]): ReadonlyMap<string, ForgeChangeRequestListState> {
  return new Map(values.map(value => [value.url, value]))
}

function listed(values: Values | undefined): SessionListState {
  return {
    ids: [S1],
    byId: { [S1]: { id: S1, displayTitle: 'S1', running: false, blank: false, updatedAt: 0, retainedBy: {}, ...(values === undefined ? {} : { projectionValues: values }) } },
    phase: 'ready',
    projectionsBySession: {},
  }
}

/** Stores behind one row's hooks, which the test replaces to drive renders. */
function stores(values: Values | undefined, states: ReadonlyMap<string, ForgeChangeRequestListState> = new Map()) {
  const sessions = createSnapshotStore<SessionListState>(listed(values))
  const changeRequests = createSnapshotStore<ChangeRequestStates>({ state: states, disconnected: false })
  const props = { sessionId: S1, useSessions: bindSnapshotSelector(sessions), useStates: bindSnapshotSelector(changeRequests), t }
  return { sessions, changeRequests, props }
}

function renderRow(values: Values | undefined, states?: ReadonlyMap<string, ForgeChangeRequestListState>) {
  const { sessions, changeRequests, props } = stores(values, states)
  const view = render(<SessionRowForge {...props as SessionRowForgeProps} />)
  return { view, sessions, changeRequests }
}

function renderHover(values: Values | undefined, states?: ReadonlyMap<string, ForgeChangeRequestListState>) {
  const { props } = stores(values, states)
  return render(<SessionHoverForge {...props as SessionHoverForgeProps} />)
}

describe('sessionForgeFacts', () => {
  it('shares one empty value for every Session whose listed values hold no worktree and no visible change request', () => {
    const empty = sessionForgeFacts({ forgeWorktree: null }, new Map())

    expect(empty).toEqual({ worktree: null, worktreeUnknown: false, changeRequests: [] })
    expect(sessionForgeFacts({ forgeWorktree: null, forgeChangeRequests: [binding(1, true)] }, statesOf(state(1)))).toBe(empty)
  })

  it('reports a worktree unknown while the listed values omit it, as for a Session whose cached summary predates the worktree', () => {
    const facts = sessionForgeFacts(undefined, new Map())

    expect(facts).toEqual({ worktree: null, worktreeUnknown: true, changeRequests: [] })
    expect(sessionForgeFacts({ forgeChangeRequests: [binding(1, true)] }, new Map())).toBe(facts)
    // A listed value — even the null that means "works outside its worktree" — is knowledge.
    expect(sessionForgeFacts({ forgeWorktree: null }, new Map()).worktreeUnknown).toBe(false)
  })

  it('orders visible change requests by urgency, keeping their binding order among equally urgent ones', () => {
    const facts = sessionForgeFacts({
      forgeWorktree: created(),
      forgeChangeRequests: [1, 2, 3, 4, 5, 6, 7, 8].map(number => binding(number, number === 8)),
    }, statesOf(
      state(1, { state: 'merged' }),
      state(2),
      state(4, { checksRollup: 'failure' }),
      state(5, { draft: true }),
      state(6, { state: 'closed' }),
      state(7, { checksRollup: 'pending' }),
      state(8),
    ))

    expect(facts.worktree).toEqual(created())
    expect(facts.changeRequests.map(entry => [entry.url, entry.tone])).toEqual([
      [url(4), 'blocked'], [url(2), 'open'], [url(7), 'open'], [url(5), 'draft'], [url(3), 'unknown'], [url(1), 'merged'], [url(6), 'closed'],
    ])
    expect(facts.changeRequests[4]?.state).toBeUndefined()
    expect(facts.changeRequests[0]?.state).toEqual(state(4, { checksRollup: 'failure' }))
  })
})

describe('SessionRowForge', () => {
  it('shows nothing for a Session that works outside its worktree and has no change requests', () => {
    expect(renderRow({ forgeWorktree: null, forgeChangeRequests: [] }).view.container.innerHTML).toBe('')
  })

  it('marks a row whose listed values omit the worktree, labelled with when it shows', () => {
    renderRow(undefined)

    const mark = screen.getByRole('img', { name: en['list.worktreeUnknown'] })
    expect(mark.getAttribute('data-forge-row-worktree')).toBe('unknown')
    expect(mark.getAttribute('title')).toBe(en['list.worktreeUnknown'])
  })

  it('shows the worktree the Session works in and the state of its most urgent change request with its checks', () => {
    renderRow({ forgeWorktree: created(), forgeChangeRequests: [binding(1), binding(2)] }, statesOf(state(1, { checksRollup: 'pending' }), state(2)))

    expect(screen.getByRole('img', { name: en['list.worktree'] }).getAttribute('data-forge-row-worktree')).toBe('')
    const change = screen.getByRole('img', { name: 'Change request state: Open · Checks running' })
    expect(change.getAttribute('data-forge-row-change')).toBe('open')
    expect(change.querySelector(`.${css.dot}`)?.getAttribute('data-checks')).toBe('pending')
  })

  it('names only the state of a finished or unpolled change request, without a checks dot', () => {
    const merged = renderRow({ forgeWorktree: null, forgeChangeRequests: [binding(1)] }, statesOf(state(1, { state: 'merged', checksRollup: 'failure' })))
    const glyph = screen.getByRole('img', { name: 'Change request state: Merged' })
    expect(glyph.getAttribute('data-forge-row-change')).toBe('merged')
    expect(glyph.querySelector(`.${css.dot}`)).toBeNull()
    expect(screen.queryByRole('img', { name: en['list.worktree'] })).toBeNull()
    expect(screen.queryByRole('img', { name: en['list.worktreeUnknown'] })).toBeNull()
    merged.view.unmount()

    renderRow({ forgeWorktree: null, forgeChangeRequests: [binding(2)] })
    expect(screen.getByRole('img', { name: 'Change request state: Unknown' }).querySelector(`.${css.dot}`)).toBeNull()
  })

  it('follows the listed values and the polled states as they change', () => {
    const { sessions, changeRequests } = renderRow({ forgeWorktree: null, forgeChangeRequests: [binding(1)] })
    screen.getByRole('img', { name: 'Change request state: Unknown' })

    act(() => { changeRequests.set({ state: statesOf(state(1, { mergeability: 'conflicting' })), disconnected: false }) })
    screen.getByRole('img', { name: 'Change request state: Needs attention · Checks passed' })

    act(() => { sessions.set(listed({ forgeWorktree: null, forgeChangeRequests: [binding(1, true)] })) })
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('joins a change request state and its checks in one line', () => {
    const [entry] = sessionForgeFacts({ forgeChangeRequests: [binding(1)] }, statesOf(state(1, { checksRollup: 'none' }))).changeRequests
    expect(entry).toBeDefined()
    if (entry !== undefined) expect(stateLine(entry, t)).toBe('Open')
  })
})

describe('SessionHoverForge', () => {
  it('shows nothing for a Session whose listed values hold no worktree or change requests', () => {
    expect(renderHover({ forgeWorktree: null, forgeChangeRequests: [] }).container.innerHTML).toBe('')
  })

  it('says the worktree shows after opening while the listed values omit it', () => {
    const { container } = renderHover(undefined)

    const note = container.querySelector('[data-forge-session-hover-worktree]')
    expect(note?.getAttribute('data-forge-session-hover-worktree')).toBe('unknown')
    expect(note?.textContent).toBe(en['list.worktreeUnknown'])
    expect(container.querySelectorAll('[data-forge-session-hover-change]')).toHaveLength(0)
  })

  it('keeps the note beside the change requests a Session binds, and drops it once the worktree fact is listed', () => {
    const { container } = renderHover({ forgeChangeRequests: [binding(1)] }, statesOf(state(1)))

    expect(container.querySelector('[data-forge-session-hover-worktree]')?.textContent).toBe(en['list.worktreeUnknown'])
    expect(container.querySelectorAll('[data-forge-session-hover-change]')).toHaveLength(1)
    cleanup()

    const known = renderHover({ forgeWorktree: null, forgeChangeRequests: [binding(1)] }, statesOf(state(1)))
    expect(known.container.querySelector('[data-forge-session-hover-worktree]')).toBeNull()
  })

  it('drops the note for a Session working in the worktree it created', () => {
    expect(renderHover({ forgeWorktree: created() }).container.querySelector('[data-forge-session-hover-worktree]')).toBeNull()
  })

  it('names the worktree branch and what it started from, the requested base or else the short base commit', () => {
    const from = renderHover({ forgeWorktree: created() })
    screen.getByText('dsh/0a1b2c3d')
    screen.getByText('Worktree · from main')
    from.unmount()

    renderHover({ forgeWorktree: created({ from: null, baseCommit: '0123456789abcdef' }) })
    screen.getByText('Worktree · from 0123456')
  })

  it('lists the most urgent change requests with their state and checks, and counts the rest', () => {
    const bindings = [1, 2, 3, 4, 5].map(number => binding(number))
    const { container } = renderHover({ forgeChangeRequests: bindings }, statesOf(
      state(1, { checksRollup: 'failure' }),
      state(2, { state: 'merged' }),
      state(3, { checksRollup: 'pending', title: 'Wire the list' }),
      state(5),
    ))

    const items = [...container.querySelectorAll('[data-forge-session-hover-change]')]
    expect(items).toHaveLength(HOVER_CHANGE_REQUEST_LIMIT)
    expect(items.map(item => item.getAttribute('data-forge-session-hover-change'))).toEqual(['blocked', 'open', 'open'])
    expect(items.map(item => item.querySelector(`.${css.hoverTitle}`)?.textContent)).toEqual(['#1 Change 1', '#3 Wire the list', '#5 Change 5'])
    expect(items.map(item => item.querySelector(`.${css.hoverNote} [aria-hidden]`)?.textContent))
      .toEqual(['Needs attention·Checks failed', 'Open·Checks running', 'Open·Checks passed'])
    expect(items.map(item => item.querySelector(`.${css.visuallyHidden}`)?.textContent))
      .toEqual(['Needs attention · Checks failed', 'Open · Checks running', 'Open · Checks passed'])
    expect(items[0]?.querySelector('[data-checks]')?.getAttribute('data-checks')).toBe('failure')
    screen.getByText('2 more change requests')
  })

  it('names an unpolled change request by its URL, and a finished one by its state alone', () => {
    const { container } = renderHover({ forgeChangeRequests: [binding(1), binding(2)] }, statesOf(state(2, { state: 'closed' })))

    const items = [...container.querySelectorAll('[data-forge-session-hover-change]')]
    expect(items.map(item => item.querySelector(`.${css.hoverTitle}`)?.textContent)).toEqual([url(1), '#2 Change 2'])
    expect(items.map(item => item.querySelector(`.${css.visuallyHidden}`)?.textContent)).toEqual(['Unknown', 'Closed'])
    expect(container.querySelector('[data-checks]')).toBeNull()
    expect(screen.queryByText(/more change requests/)).toBeNull()
  })
})
