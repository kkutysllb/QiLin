/** The ledger: what it books, what it refuses, and what a torn line costs. */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appendUsage, isUsageReport, parseUsageReport, readUsageTotals, sumUsageTotals, usageFilePath } from '../src/usage-ledger.ts'

const roots: string[] = []

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

async function home(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'qilin-usage-'))
  roots.push(root)
  return root
}

const report = { sessionId: 'session-1', inputTokens: 120, outputTokens: 30, at: 1_700_000_000_000 }

describe('usage ledger', () => {
  it('totals each account separately', async () => {
    const dir = await home()
    expect(await readUsageTotals(dir)).toEqual({})
    await appendUsage(dir, 'account-a', report)
    await appendUsage(dir, 'account-a', { ...report, sessionId: 'session-2', inputTokens: 10, outputTokens: 5, at: report.at + 5 })
    await appendUsage(dir, 'account-b', { ...report, inputTokens: 7, outputTokens: 1 })
    expect(await readUsageTotals(dir)).toEqual({
      'account-a': { sessions: 2, inputTokens: 130, outputTokens: 35, at: report.at + 5 },
      'account-b': { sessions: 1, inputTokens: 7, outputTokens: 1, at: report.at },
    })
  })

  it('takes the latest report per session, so a repeated one never double counts', async () => {
    const dir = await home()
    await appendUsage(dir, 'account-a', report)
    await appendUsage(dir, 'account-a', { ...report, inputTokens: 200, outputTokens: 50, at: report.at + 1 })
    // An out-of-order line does not replace a newer one.
    await appendUsage(dir, 'account-a', { ...report, inputTokens: 1, outputTokens: 1, at: report.at - 1 })
    expect((await readUsageTotals(dir))['account-a']).toEqual({
      sessions: 1, inputTokens: 200, outputTokens: 50, at: report.at + 1,
    })
  })

  it('skips a torn or foreign line instead of hiding the accounts that reported', async () => {
    const dir = await home()
    await appendUsage(dir, 'account-a', report)
    await writeFile(usageFilePath(dir, 'account-a'), [
      JSON.stringify(report),
      '{"sessionId":"torn"',
      JSON.stringify({ hello: 'world' }),
      JSON.stringify({ ...report, sessionId: 'session-2', inputTokens: -1 }),
      '',
    ].join('\n'), 'utf8')
    expect((await readUsageTotals(dir))['account-a']).toEqual({
      sessions: 1, inputTokens: 120, outputTokens: 30, at: report.at,
    })
  })

  it('reads a report only when every field is usable', () => {
    expect(isUsageReport(report)).toBe(true)
    expect(parseUsageReport(JSON.stringify(report))).toEqual(report)
    expect(parseUsageReport('')).toBeUndefined()
    expect(parseUsageReport('not json')).toBeUndefined()
    expect(parseUsageReport('null')).toBeUndefined()
    for (const bad of [
      { ...report, sessionId: '' },
      { ...report, inputTokens: -1 },
      { ...report, outputTokens: 1.5 },
      { ...report, at: -1 },
      { ...report, at: 'now' },
      { sessionId: 'session-1' },
      [],
    ]) expect(isUsageReport(bad)).toBe(false)
  })

  it('sums every account into the deployment total, newest report time winning', () => {
    expect(sumUsageTotals({})).toEqual({ sessions: 0, inputTokens: 0, outputTokens: 0, at: 0 })
    expect(sumUsageTotals({
      a: { sessions: 1, inputTokens: 120, outputTokens: 30, at: 1_000 },
      b: { sessions: 2, inputTokens: 8, outputTokens: 4, at: 3_000 },
    })).toEqual({ sessions: 3, inputTokens: 128, outputTokens: 34, at: 3_000 })
  })
})
