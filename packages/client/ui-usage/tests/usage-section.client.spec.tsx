// @vitest-environment jsdom
/** The usage page: what it draws, what folding a series does, and what it says when the read fails. */

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@qilin-agent/client-test-runtime'
import { UsageSection, type UsageSectionComponentProps } from '../src/client/UsageSection.tsx'
import { en } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** The ledger read, answered with the records one test wants or a refusal. */
function answerWith(body: unknown, ok = true): ReturnType<typeof vi.fn> {
  const read = vi.fn(async () => ({ ok, status: ok ? 200 : 503, json: async () => body }))
  vi.stubGlobal('fetch', read)
  return read
}

const unused = (): never => { throw new Error('This isolated section does not consume framework hooks') }

function props(): UsageSectionComponentProps {
  return {
    usePanelInfo: unused, useSessions: unused, useSessionStatus: unused,
    useSessionRetainInfo: unused, useResource: unused, useWorkspaces: unused,
    close: vi.fn(), t: makeTranslate(en),
  } as UsageSectionComponentProps
}

/** A record reported a moment ago, so it lands in the current month and day. */
function record(inputTokens: number, outputTokens: number, cacheReadTokens: number) {
  return { sessionId: 'session-abcdef', turn: 1, inputTokens, outputTokens, cacheReadTokens, at: Date.now() }
}

/** Days the month has shown so far, which is one bar each. */
function daysThisMonth(): number {
  const now = new Date()
  return now.getDate()
}

describe('usage settings section', () => {
  it('draws the month so far, the three stackable series, and the session table', async () => {
    const read = answerWith({
      accountId: 'account-1',
      total: { sessions: 2, turns: 9, inputTokens: 900, outputTokens: 90, cacheReadTokens: 300, cacheWriteTokens: 0, cacheHitRate: 0.25 },
      records: [record(100, 10, 40), record(200, 20, 60)],
      truncated: false,
    })
    const { container } = render(<UsageSection {...props()} />)

    expect(await screen.findByRole('heading', { name: en.title })).toBeTruthy()
    expect(read).toHaveBeenCalledTimes(1)
    // Document-relative on purpose: a tenant deployment serves this route under
    // its own base, so an origin-absolute path would read the root runtime's ledger.
    expect(String(read.mock.calls[0]?.[0])).toMatch(/^api\/usage\/me\?from=\d+$/u)
    // The all-time card reads the ledger total; the month card sums the records.
    // Today and this month both come from the records; every time comes from the
    // ledger total, which is the only figure covering Turns outside the window.
    const card = (label: string): string => screen.getByText(label).parentElement?.textContent ?? ''
    expect(card(en.today)).toContain('430')
    expect(card(en.month)).toContain('430')
    expect(card(en.all)).toContain('1.3k')
    expect(card(en['metric.turns'])).toContain('9')
    // The month so far is one bar per day — quiet days included — each drawn with
    // three bands plus a transparent hit area.
    expect(container.querySelectorAll('g').length).toBe(daysThisMonth())
    expect(container.querySelectorAll('rect').length).toBe(daysThisMonth() * 4)
    // Every series is foldable, and the per-session table names the session.
    for (const label of [en['metric.input'], en['metric.output'], en['metric.cacheRead'], en['metric.hitRate']]) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy()
    }
    expect(screen.getByTitle('session-abcdef')).toBeTruthy()
  })

  it('folds one series out of the stack when its legend entry is clicked', async () => {
    answerWith({
      accountId: 'account-1',
      records: [record(100, 10, 40)],
      total: { sessions: 1, turns: 1, inputTokens: 100, outputTokens: 10, cacheReadTokens: 40, cacheWriteTokens: 0, cacheHitRate: 0.29 },
    })
    const { container } = render(<UsageSection {...props()} />)
    const fold = await screen.findByRole('button', { name: en['metric.input'] })
    expect(fold.getAttribute('aria-pressed')).toBe('true')
    expect(container.querySelectorAll('rect').length).toBe(daysThisMonth() * 4)

    fireEvent.click(fold)

    expect(fold.getAttribute('aria-pressed')).toBe('false')
    // The folded series leaves the stack instead of being drawn invisible.
    expect(container.querySelectorAll('rect').length).toBe(daysThisMonth() * 3)
    fireEvent.click(screen.getByRole('button', { name: en['metric.hitRate'] }))
    expect(container.querySelector('path')).toBeNull()
  })

  it('reads one day back to the reader when its bar is focused or hovered', async () => {
    answerWith({
      accountId: 'account-1',
      records: [record(100, 10, 300)],
      total: { sessions: 1, turns: 1, inputTokens: 100, outputTokens: 10, cacheReadTokens: 300, cacheWriteTokens: 0, cacheHitRate: 0.75 },
    })
    const { container } = render(<UsageSection {...props()} />)
    await screen.findByRole('heading', { name: en.title })
    // The record was reported today, which is the last bar of the month so far.
    const bars = container.querySelectorAll('g')
    const bar = bars[bars.length - 1]
    expect(bar).not.toBeUndefined()
    fireEvent.mouseOver(bar as Element)
    // 300 of 400 prompt tokens came from cache.
    expect(screen.getByText(new RegExp(`${en['metric.hitRate']} 75%`, 'u'))).toBeTruthy()
    fireEvent.mouseOut(bar as Element)
    expect(screen.queryByText(new RegExp(`${en['metric.hitRate']} 75%`, 'u'))).toBeNull()
  })

  it('shows the administrator every account and the deployment total', async () => {
    answerWith({
      scope: 'deployment',
      totals: {
        'account-one-xxxx': { sessions: 1, turns: 3, inputTokens: 100, outputTokens: 10, cacheReadTokens: 40, cacheWriteTokens: 0, cacheHitRate: 0.29 },
        'account-two-yyyy': { sessions: 1, turns: 2, inputTokens: 900, outputTokens: 90, cacheReadTokens: 300, cacheWriteTokens: 0, cacheHitRate: 0.25 },
      },
      total: { sessions: 2, turns: 5, inputTokens: 1000, outputTokens: 100, cacheReadTokens: 340, cacheWriteTokens: 0, cacheHitRate: 0.25 },
      records: [
        { ...record(100, 10, 40), accountId: 'account-one-xxxx' },
        { ...record(900, 90, 300), accountId: 'account-two-yyyy' },
      ],
      truncated: false,
    })
    render(<UsageSection {...props()} />)

    // The administrator reads the deployment, and the table breaks it per account.
    expect(await screen.findByText(en['scope.deployment'])).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: en['table.account'] })).toBeTruthy()
    expect(screen.getByTitle('account-one-xxxx')).toBeTruthy()
    expect(screen.getByTitle('account-two-yyyy')).toBeTruthy()
    expect(screen.getByText(en['metric.turns']).parentElement?.textContent).toContain('2')
  })

  it('says the deployment could not be reached instead of showing zeroes', async () => {
    answerWith({ error: 'nope' }, false)
    render(<UsageSection {...props()} />)
    expect(await screen.findByText(en.unavailable)).toBeTruthy()
  })

  it('says there is no usage yet rather than drawing an empty month', async () => {
    // A Host that reports no records array at all reads as no usage yet.
    answerWith({ accountId: 'account-1', total: undefined, truncated: false })
    render(<UsageSection {...props()} />)
    expect(await screen.findByText(en['chart.empty'])).toBeTruthy()
  })

  it('treats a record that reports no cache buckets as zero', async () => {
    answerWith({
      accountId: 'account-1',
      total: { sessions: 1, turns: 1, inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, cacheHitRate: 0 },
      records: [{ sessionId: 'session-abcdef', turn: 1, inputTokens: 100, outputTokens: 10, at: Date.now() }],
      truncated: false,
    })
    render(<UsageSection {...props()} />)
    expect(await screen.findByRole('heading', { name: en.title })).toBeTruthy()
    // Prompt tokens the provider did not report as cached still count as uncached input.
    const card = (label: string): string => screen.getByText(label).parentElement?.textContent ?? ''
    expect(card(en.today)).toContain('110')
    expect(card(en.today)).toContain('0%')
  })

  it('marks a truncated read, omits an unnamed account, and ranks the sessions by tokens', async () => {
    answerWith({
      // No accountId and no ledger total: the page falls back to its own placeholder
      // and to the month it can compute from the records.
      records: [
        { ...record(10, 1, 0), sessionId: 'session-cheap' },
        { ...record(1_000, 100, 1), sessionId: 'session-rich' },
      ],
      truncated: true,
    })
    render(<UsageSection {...props()} />)

    expect(await screen.findByText(en.truncated)).toBeTruthy()
    expect(screen.getByText(/account —/u)).toBeTruthy()
    const rows = screen.getAllByRole('row')
    expect(rows[1]?.textContent).toContain('session-')
    // The most expensive session heads the table; a sub-10% hit rate keeps one decimal.
    expect(rows[1]?.textContent).toContain('session-')
    // A sub-10% rate keeps one decimal so the cell does not read as zero.
    expect(screen.getByRole('table').textContent).toContain('0.1%')
    const titles = Array.from(document.querySelectorAll('td[title]')).map(cell => cell.getAttribute('title'))
    expect(titles).toEqual(['session-rich', 'session-cheap'])
  })

  it('reads one day back on focus and walks the bars with the arrow keys', async () => {
    answerWith({
      accountId: 'account-1',
      total: { sessions: 1, turns: 1, inputTokens: 100, outputTokens: 10, cacheReadTokens: 40, cacheWriteTokens: 0, cacheHitRate: 0.29 },
      records: [record(100, 10, 40)],
      truncated: false,
    })
    const { container } = render(<UsageSection {...props()} />)
    await screen.findByRole('heading', { name: en.title })
    const bars = Array.from(container.querySelectorAll('g'))
    const last = bars[bars.length - 1]
    if (last === undefined) throw new Error('the chart drew no bar')

    fireEvent.mouseOver(last)
    expect(screen.getByText(new RegExp(`${en['metric.hitRate']} 29%`, 'u'))).toBeTruthy()
    fireEvent.mouseOut(last)
    expect(screen.queryByText(new RegExp(`${en['metric.hitRate']} 29%`, 'u'))).toBeNull()

    // A focused bar reads its own day, and keeps reading it when the pointer leaves.
    act(() => { last.focus() })
    expect(screen.getByText(new RegExp(`${en['metric.hitRate']} 29%`, 'u'))).toBeTruthy()
    // The readout follows the latest gesture: the pointer leaving clears it.
    fireEvent.mouseOver(last)
    fireEvent.mouseOut(last)
    expect(screen.queryByText(new RegExp(`${en['metric.hitRate']} 29%`, 'u'))).toBeNull()

    fireEvent.keyDown(last, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(bars[bars.length - 2])
    fireEvent.keyDown(bars[bars.length - 2] as Element, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(last)
    fireEvent.keyDown(last, { key: 'Escape' })
    expect(screen.queryByText(new RegExp(`${en['metric.hitRate']} 29%`, 'u'))).toBeNull()

    fireEvent.keyDown(last, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(last)
    act(() => { last.blur() })
    expect(screen.queryByText(new RegExp(`${en['metric.hitRate']} 29%`, 'u'))).toBeNull()
  })

  it('reports nothing for a read its own unmount aborted', async () => {
    const gate = Promise.withResolvers<Response>()
    vi.stubGlobal('fetch', vi.fn(() => gate.promise))
    const view = render(<UsageSection {...props()} />)
    expect(screen.getByText(en.loading)).toBeTruthy()

    view.unmount()
    gate.reject(new Error('the read was aborted'))
    await Promise.resolve()
    await Promise.resolve()

    // An aborted read belongs to the page the reader left: it neither loads nor fails.
    expect(view.container.innerHTML).toBe('')
  })
})
