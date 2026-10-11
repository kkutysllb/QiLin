/** The deployment's token ledger: per-Turn identity, windows, and what a total means. */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  appendUsage,
  capUsageRecords,
  isUsageReport,
  parseUsageReport,
  readUsageRecords,
  readUsageTotal,
  readUsageTotals,
  readUsageWindow,
  sumUsageTotals,
  usageFilePath,
} from '../src/usage-ledger.ts'

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

/** One empty deployment home. */
async function deployment(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'qilin-usage-'))
  roots.push(root)
  return root
}

const report = { sessionId: 'session-1', turn: 1, inputTokens: 120, outputTokens: 30, at: 1_700_000_000_000 }

describe('usage ledger', () => {
  it('adds up each Turn of each account and keeps the accounts apart', async () => {
    const home = await deployment()
    await appendUsage(home, 'account-a', report)
    await appendUsage(home, 'account-a', { ...report, turn: 2, inputTokens: 10, outputTokens: 5, at: report.at + 5 })
    await appendUsage(home, 'account-b', { ...report, inputTokens: 7, outputTokens: 1 })
    expect(await readUsageTotals(home)).toEqual({
      'account-a': {
        sessions: 1, turns: 2, inputTokens: 130, outputTokens: 35,
        cacheReadTokens: 0, cacheWriteTokens: 0, cacheHitRate: 0, at: report.at + 5,
      },
      'account-b': {
        sessions: 1, turns: 1, inputTokens: 7, outputTokens: 1,
        cacheReadTokens: 0, cacheWriteTokens: 0, cacheHitRate: 0, at: report.at,
      },
    })
  })

  it('counts one Turn once, keeping the later line and ignoring an out-of-order one', async () => {
    const home = await deployment()
    await appendUsage(home, 'account-a', report)
    // The same Turn reported again, and a stale report for it arriving late.
    await appendUsage(home, 'account-a', { ...report, inputTokens: 200, outputTokens: 50, at: report.at + 1 })
    await appendUsage(home, 'account-a', { ...report, inputTokens: 1, outputTokens: 1, at: report.at - 1 })
    expect(await readUsageTotal(home, 'account-a')).toEqual({
      sessions: 1, turns: 1, inputTokens: 200, outputTokens: 50,
      cacheReadTokens: 0, cacheWriteTokens: 0, cacheHitRate: 0, at: report.at + 1,
    })
  })

  it('windows the records by report time', async () => {
    const home = await deployment()
    await appendUsage(home, 'account-a', { ...report, turn: 1, at: 1_000 })
    await appendUsage(home, 'account-a', { ...report, turn: 2, at: 2_000, inputTokens: 5 })
    await appendUsage(home, 'account-a', { ...report, turn: 3, at: 3_000, inputTokens: 50 })
    const windowed = await readUsageTotal(home, 'account-a', { from: 2_000, to: 2_999 })
    // One Turn inside the window, so a session spanning months lands in each.
    expect(windowed.turns).toBe(1)
    expect(windowed.inputTokens).toBe(5)
    expect(await readUsageTotal(home, 'account-a', { from: 9_000 })).toMatchObject({ turns: 0, inputTokens: 0 })
    expect((await readUsageRecords(home, 'account-a', { from: 2_000 })).map(record => record.turn)).toEqual([2, 3])
  })

  it('totals the cache buckets and the hit rate they imply', async () => {
    const home = await deployment()
    await appendUsage(home, 'account-a', { ...report, turn: 1, inputTokens: 100, cacheReadTokens: 300, cacheWriteTokens: 20 })
    // A Turn that reported no cache bucket contributes nothing to those sums.
    await appendUsage(home, 'account-a', { ...report, turn: 2, inputTokens: 100 })
    expect(await readUsageTotal(home, 'account-a')).toMatchObject({
      inputTokens: 200, cacheReadTokens: 300, cacheWriteTokens: 20,
      // 300 served from cache out of 200 uncached + 300 cached prompt tokens.
      cacheHitRate: 0.6,
    })
  })

  it('skips a torn, foreign, or malformed line instead of hiding the accounts that reported', async () => {
    const home = await deployment()
    await appendUsage(home, 'account-a', report)
    await writeFile(usageFilePath(home, 'account-a'), [
      '{"sessionId":"torn"',
      JSON.stringify({ ...report, turn: 2, inputTokens: -1 }),
      JSON.stringify({ sessionId: 'foreign', turn: 1, inputTokens: 1, outputTokens: 1, at: 1, note: 'extra field' }),
      '',
    ].join('\n'), { flag: 'a' })
    const total = await readUsageTotal(home, 'account-a')
    // The foreign line is a report too, so it counts; the torn and impossible ones do not.
    expect(total.turns).toBe(2)
    expect(total.inputTokens).toBe(121)
  })

  it('reads a report only when every field is usable', () => {
    expect(parseUsageReport(JSON.stringify(report))).toEqual(report)
    expect(parseUsageReport(JSON.stringify({ ...report, turn: 3, cacheReadTokens: 5 })))
      .toEqual({ ...report, turn: 3, cacheReadTokens: 5 })
    for (const line of ['', 'not json', '{"sessionId":"torn"']) expect(parseUsageReport(line)).toBeUndefined()
    for (const bad of [
      { ...report, sessionId: '' },
      { ...report, inputTokens: -1 },
      { ...report, outputTokens: 1.5 },
      { ...report, at: -1 },
      // A Turn number and the cache buckets are part of the format.
      { sessionId: 'session-1', inputTokens: 1, outputTokens: 1, at: 1 },
      { ...report, turn: 'first' },
      { ...report, cacheReadTokens: -1 },
      { sessionId: 'session-1' },
      null,
      'a string',
    ]) expect(isUsageReport(bad)).toBe(false)
  })

  it('sums every account into the deployment total, hit rate included', () => {
    expect(sumUsageTotals({})).toEqual({
      sessions: 0, turns: 0, inputTokens: 0, outputTokens: 0,
      cacheReadTokens: 0, cacheWriteTokens: 0, cacheHitRate: 0, at: 0,
    })
    const empty = {
      cacheReadTokens: 0, cacheWriteTokens: 0, cacheHitRate: 0, turns: 0,
      sessions: 0, inputTokens: 0, outputTokens: 0, at: 0,
    }
    expect(sumUsageTotals({
      a: { ...empty, turns: 1, sessions: 1, inputTokens: 100, outputTokens: 30, cacheReadTokens: 100, cacheHitRate: 0.5, at: 1_000 },
      b: { ...empty, turns: 2, sessions: 2, inputTokens: 8, outputTokens: 4, at: 3_000 },
    })).toEqual({
      sessions: 3, turns: 3, inputTokens: 108, outputTokens: 34,
      cacheReadTokens: 100, cacheWriteTokens: 0, cacheHitRate: 100 / 208, at: 3_000,
    })
  })

  it('reads the records oldest first', async () => {
    const home = await deployment()
    await appendUsage(home, 'account-a', { ...report, turn: 2, at: 2_000 })
    await appendUsage(home, 'account-a', { ...report, turn: 1, at: 1_000 })
    expect((await readUsageRecords(home, 'account-a')).map(record => record.at)).toEqual([1_000, 2_000])
    expect(await readUsageRecords(home, 'account-missing')).toEqual([])
  })

  it('reads the window a query asks for, and refuses one it cannot', () => {
    expect(readUsageWindow(new URLSearchParams())).toEqual({})
    expect(readUsageWindow(new URLSearchParams('from=1000&to=2000'))).toEqual({ from: 1_000, to: 2_000 })
    // An empty bound is absent rather than zero.
    expect(readUsageWindow(new URLSearchParams('from=&to='))).toEqual({})
    // A bound that is not a whole non-negative millisecond, and inverted bounds,
    // are refused instead of being read as "everything".
    for (const query of ['from=abc', 'from=-1', 'to=1.5', 'from=2000&to=1000']) {
      expect(readUsageWindow(new URLSearchParams(query))).toBeUndefined()
    }
  })

  it('sends the newest records a cap allows and says what it dropped', () => {
    expect(capUsageRecords([1, 2, 3], 5)).toEqual({ records: [1, 2, 3], truncated: false })
    expect(capUsageRecords([1, 2, 3], 3)).toEqual({ records: [1, 2, 3], truncated: false })
    expect(capUsageRecords([1, 2, 3], 2)).toEqual({ records: [2, 3], truncated: true })
    expect(capUsageRecords([1, 2, 3], 0)).toEqual({ records: [], truncated: true })
    expect(capUsageRecords([], 0)).toEqual({ records: [], truncated: false })
  })
})
