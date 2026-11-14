/** Day buckets, rates, fold state, and the stacked-bar geometry they drive. */

import { describe, expect, it } from 'vitest'
import {
  cacheHitRate,
  formatTokens,
  localDay,
  summarize,
  toggleSeries,
  usageByAccount,
  usageByDay,
  usageChart,
  USAGE_SERIES,
  type UsageRecord,
} from '../src/client/chart.ts'

const DAY = 24 * 60 * 60 * 1000

function record(at: number, inputTokens: number, outputTokens: number, cacheReadTokens = 0): UsageRecord {
  return { sessionId: 'session-1', turn: 1, inputTokens, outputTokens, cacheReadTokens, at }
}

/** Midnight local time of the day one time falls on. */
function midnight(at: number): Date {
  const date = new Date(at)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

describe('usage chart data', () => {
  it('buckets records into local days and keeps quiet days in the range', () => {
    const start = midnight(Date.parse('2026-03-01T12:00:00'))
    const days = usageByDay([
      record(start.getTime() + 1_000, 10, 1),
      record(start.getTime() + 2_000, 5, 2, 3),
      record(start.getTime() + DAY + 3_600_000, 7, 4),
      // Outside the range: neither endpoint nor any day between them.
      record(start.getTime() - DAY, 999, 999),
    ], start, new Date(start.getTime() + 2 * DAY))
    expect(days.map(day => day.day)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03'])
    expect(days[0]).toMatchObject({ inputTokens: 15, outputTokens: 3, cacheReadTokens: 3 })
    // A day nothing was reported on is a zero bar, not a missing one.
    expect(days[2]).toMatchObject({ inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 })
  })

  it('reads the hit rate from prompt traffic alone', () => {
    expect(cacheHitRate(0, 0)).toBe(0)
    expect(cacheHitRate(50, 50)).toBe(0.5)
    // Cache writes are not prompt traffic served from cache.
    expect(summarize([{ ...record(0, 100, 20, 300), cacheWriteTokens: 40 }])).toMatchObject({
      inputTokens: 100, outputTokens: 20, cacheReadTokens: 300, cacheWriteTokens: 40,
      totalTokens: 460, cacheHitRate: 0.75,
    })
  })

  it('groups a deployment-wide read by account, most expensive first', () => {
    const accounts = usageByAccount([
      { ...record(0, 100, 10), accountId: 'account-a' },
      { ...record(0, 10, 1), accountId: 'account-b' },
      { ...record(0, 5, 5), accountId: 'account-a' },
    ])
    expect(accounts.map(entry => entry.accountId)).toEqual(['account-a', 'account-b'])
    expect(accounts[0]).toMatchObject({ inputTokens: 105, outputTokens: 15, totalTokens: 120 })
    // A record the read carried no tag for still belongs somewhere.
    expect(usageByAccount([record(0, 1, 1)]).map(entry => entry.accountId)).toEqual(['\u2014'])
  })

  it('folds one series without losing the others, and reports them in draw order', () => {
    expect(toggleSeries([], 'outputTokens')).toEqual(['outputTokens'])
    expect(toggleSeries(['outputTokens'], 'outputTokens')).toEqual([])
    expect(toggleSeries(['cacheReadTokens'], 'inputTokens')).toEqual(['inputTokens', 'cacheReadTokens'])
  })

  it('stacks the visible series into pixel columns and folds a series out of them', () => {
    const start = midnight(Date.parse('2026-03-01T00:00:00'))
    const days = usageByDay([
      record(start.getTime(), 100, 50, 50),
      record(start.getTime() + DAY, 200, 0, 0),
    ], start, new Date(start.getTime() + DAY))

    const chart = usageChart(days, { width: 600, height: 232 })
    expect(chart.bars).toHaveLength(2)
    expect(chart.bars[0]?.bands.map(band => band.series)).toEqual([...USAGE_SERIES])
    // The tallest day sets a round peak: 200 reads as 200, so the axis labels
    // stay whole numbers.
    expect(chart.peakTokens).toBe(200)
    // Plot box: axis padding is reserved, the rest is the drawing area.
    expect(chart.plot).toEqual({ left: 46, top: 8, right: 560, bottom: 208, width: 514, height: 200 })
    // Bands stack upward from the baseline, bottom band lowest.
    const [input, output, cache] = chart.bars[1]?.bands ?? []
    expect((input?.y ?? 0) + (input?.height ?? 0)).toBeCloseTo(chart.plot.bottom)
    expect((output?.y ?? 0) + (output?.height ?? 0)).toBeCloseTo(input?.y ?? 0)
    expect((cache?.y ?? 0) + (cache?.height ?? 0)).toBeCloseTo(output?.y ?? 0)
    // A 200-token day fills the plot; the 100-token input band is half of it.
    expect(input?.height).toBeCloseTo(200)
    // The bar caps at a readable width and stays centered in its day's step.
    expect(chart.bars[1]?.barWidth).toBe(24)
    expect((chart.bars[1]?.barX ?? 0) + (chart.bars[1]?.barWidth ?? 0) / 2)
      .toBeCloseTo((chart.bars[1]?.x ?? 0) + (chart.bars[1]?.width ?? 0) / 2)
    expect(chart.ticks.map(tick => tick.label)).toEqual(['0', '50', '100', '150', '200'])
    expect(chart.rateTicks.map(tick => tick.label)).toEqual(['0%', '50%', '100%'])
    // Both days billed prompt tokens, so the rate line joins both.
    expect(chart.ratePoints).toHaveLength(2)
    expect(chart.ratePath.split(' ')[0]).toBe('M')
    expect(chart.xLabels.map(label => label.day)).toEqual(['2026-03-01', '2026-03-02'])

    // A quiet day carries no rate point: the line skips it rather than dropping
    // a spike to zero percent.
    const quiet = usageChart(usageByDay(records(), start, new Date(start.getTime() + 2 * DAY)), { width: 600, height: 232 })
    expect(quiet.ratePoints).toHaveLength(2)
    expect(quiet.ratePath.match(/M /g)).toHaveLength(2)

    // Folding a series drops its band and rescales what remains.
    const folded = usageChart(days, { width: 600, height: 232, hidden: ['outputTokens'] })
    expect(folded.bars[1]?.bands.map(band => band.series)).toEqual(['inputTokens', 'cacheReadTokens'])
    expect(folded.peakTokens).toBe(200)
  })

  /** Three days: two with prompt traffic around one quiet day. */
  function records(): UsageRecord[] {
    return [
      record(midnight(Date.parse('2026-03-01T00:00:00')).getTime(), 100, 10, 100),
      record(midnight(Date.parse('2026-03-03T00:00:00')).getTime(), 100, 10, 100),
    ]
  }

  it('draws an empty range as an empty chart rather than a broken path', () => {
    const chart = usageChart([], { width: 600, height: 232 })
    expect(chart.bars).toEqual([])
    expect(chart.ratePath).toBe('')
    expect(chart.ratePoints).toEqual([])
    expect(chart.peakTokens).toBe(1)
    expect(chart.xLabels).toEqual([])
  })

  it('shortens a token count for a card, a tick, or a cell', () => {
    expect(formatTokens(0)).toBe('0')
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(1_500)).toBe('1.5k')
    expect(formatTokens(2_400_000)).toBe('2.4M')
  })

  it('names the local day of a report time', () => {
    const at = Date.parse('2026-03-01T23:30:00')
    expect(localDay(at)).toBe('2026-03-01')
  })
})
