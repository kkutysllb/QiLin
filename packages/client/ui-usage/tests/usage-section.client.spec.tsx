// @vitest-environment jsdom
/** The usage page: what it draws, what folding a series does, and what it says when the read fails. */

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
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

function props(): UsageSectionComponentProps {
  return { close: vi.fn(), t: makeTranslate(en) } as UsageSectionComponentProps
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
    expect(String(read.mock.calls[0]?.[0])).toContain('/api/usage/me?from=')
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
    answerWith({ accountId: 'account-1', total: undefined, records: [], truncated: false })
    render(<UsageSection {...props()} />)
    expect(await screen.findByText(en['chart.empty'])).toBeTruthy()
  })
})
