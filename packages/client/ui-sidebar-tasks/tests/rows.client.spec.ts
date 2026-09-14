/**
 * The page's pure projections: the subagent topology a catalog set flattens to,
 * the total the section header states, and the job ordering, formatting, and
 * badge counting the rows and the chip read.
 */
import { describe, expect, it } from 'vitest'
import type { TranslateNS } from '@qilin/client-ui-slots'
import { makeTranslate } from '@qilin/client-test-runtime'
import type { SessionId } from '@qilin/session/types'
import type { SubagentDescendantSummary } from '../src/client/lineage.ts'
import { zh } from '../src/client/locales.ts'
import {
  activeWorkCount, childRowCount, formatDuration, isLive, jobDotState, jobElapsed,
  jobStatusLabel, orderedJobs, subagentRows, subagentTotal,
} from '../src/client/rows.ts'
import { catalog, child, diagnostic, job, sid } from './fixtures.client.ts'

const t: TranslateNS<'sidebarTasks'> = makeTranslate(zh)

describe('subagentRows', () => {
  it('walks a level newest-first and descends only where a catalog exists', () => {
    const rows = subagentRows({
      [sid('root')]: catalog([child('old', { hasChildren: true }), child('new')]),
      [sid('old')]: catalog([child('below')]),
    }, sid('root'))
    expect(rows.map(row => [row.id, row.depth])).toEqual([
      [sid('new'), 0],
      [sid('old'), 0],
      [sid('below'), 1],
    ])
  })

  it('leaves a child with no catalog of its own as a leaf', () => {
    const rows = subagentRows({
      [sid('root')]: catalog([child('only', { hasChildren: true })]),
    }, sid('root'))
    expect(rows.map(row => row.id)).toEqual([sid('only')])
  })

  it('stops when a catalog returns a child already walked', () => {
    const rows = subagentRows({
      [sid('root')]: catalog([child('a', { hasChildren: true })]),
      [sid('a')]: catalog([child('root', { hasChildren: true })]),
    }, sid('root'))
    expect(rows.map(row => row.id)).toEqual([sid('a'), sid('root')])
  })

  it('draws a diagnostic row for a child with no readable record', () => {
    const rows = subagentRows({ [sid('root')]: catalog([diagnostic('broken')]) }, sid('root'))
    expect(rows).toEqual([{ kind: 'diagnostic', id: sid('broken'), depth: 0, reason: 'corrupt' }])
  })

  it('carries the catalog address, activity, and mode of every child row', () => {
    const rows = subagentRows({
      [sid('root')]: catalog([
        child('live', { mode: 'continuable', label: 'worker', activity: 'running' }),
        child('once', { mode: 'one-shot' }),
      ]),
    }, sid('root'))
    expect(rows).toEqual([
      {
        kind: 'child',
        id: sid('once'),
        address: { parentSessionId: sid('root'), childSessionId: sid('once'), mode: 'one-shot' },
        label: 'once',
        depth: 0,
        running: false,
      },
      {
        kind: 'child',
        id: sid('live'),
        address: { parentSessionId: sid('root'), childSessionId: sid('live'), mode: 'continuable' },
        label: 'worker',
        depth: 0,
        running: true,
      },
    ])
  })
})

describe('childRowCount, subagentTotal', () => {
  it('counts catalog children only, and states the greater recorded total', () => {
    const rows = subagentRows({
      [sid('root')]: catalog([child('a'), diagnostic('broken')]),
    }, sid('root'))
    const children = childRowCount(rows)
    expect(children).toBe(1)
    const recorded = new Map<SessionId, SubagentDescendantSummary>([
      [sid('root'), { count: 4, runningCount: 1 }],
    ])
    expect(subagentTotal(children, recorded, sid('root'))).toBe(4)
    // The other direction of "greater": children the catalog reports outrun a lineage still converging.
    expect(subagentTotal(5, recorded, sid('root'))).toBe(5)
    expect(subagentTotal(children, new Map(), sid('root'))).toBe(1)
  })
})

describe('job rows', () => {
  it('keeps live jobs first in start order, then settles newest-first', () => {
    const started = job('started-late', { startedAt: 20 })
    const starting = job('started-early', { startedAt: 10 })
    const recent = job('recent', { status: 'completed', startedAt: 0, finishedAt: 90 })
    const older = job('older', { status: 'failed', startedAt: 0, finishedAt: 50 })
    const tied = job('tied', { status: 'killed', startedAt: 30, finishedAt: 50 })
    expect(orderedJobs([recent, starting, tied, started, older]).map(entry => entry.id))
      .toEqual(['started-early', 'started-late', 'recent', 'tied', 'older'])
  })

  it('measures a running job against the clock and a settled one against itself', () => {
    expect(isLive(job('a'))).toBe(true)
    expect(isLive(job('a', { status: 'stopping' }))).toBe(true)
    expect(isLive(job('a', { status: 'completed' }))).toBe(false)
    expect(jobElapsed(job('a', { startedAt: 10 }), 4_010)).toBe(4_000)
    expect(jobElapsed(job('a', { status: 'completed', startedAt: 10, finishedAt: 210 }), 9_999)).toBe(200)
    expect(jobElapsed(job('a', { status: 'killed', startedAt: 10 }), 9_999)).toBe(0)
  })

  it('phrases elapsed time in at most two adjacent units', () => {
    expect(formatDuration(45_000, t)).toBe('45秒')
    expect(formatDuration(125_000, t)).toBe('2分5秒')
    expect(formatDuration(3_725_000, t)).toBe('1小时2分')
    expect(formatDuration(-1_000, t)).toBe('0秒')
  })

  it('names every wire status and gives it a marker', () => {
    expect([
      jobStatusLabel('running', t),
      jobStatusLabel('stopping', t),
      jobStatusLabel('completed', t),
      jobStatusLabel('killed', t),
      jobStatusLabel('failed', t),
    ]).toEqual(['运行中', '正在停止', '已完成', '已取消', '已失败'])
    expect([
      jobDotState('running'),
      jobDotState('stopping'),
      jobDotState('completed'),
      jobDotState('killed'),
      jobDotState('failed'),
    ]).toEqual(['ongoing', 'warning', 'done', 'warning', 'error'])
  })
})

describe('activeWorkCount', () => {
  it('counts running direct children plus the jobs the registry still holds', () => {
    const catalogs = {
      [sid('root')]: catalog([
        child('busy', { activity: 'running' }),
        child('idle'),
        diagnostic('broken'),
      ]),
    }
    expect(activeWorkCount(catalogs, [
      job('live'),
      job('stopping', { status: 'stopping' }),
      job('done', { status: 'completed' }),
    ], sid('root'))).toBe(3)
  })

  it('counts nothing for a Session with no catalog and no live job', () => {
    expect(activeWorkCount({}, [], sid('root'))).toBe(0)
  })
})
