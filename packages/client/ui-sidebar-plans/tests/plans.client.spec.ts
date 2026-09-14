/**
 * The discovery rules, without a filesystem.
 *
 * What is asserted is the convention: which directories and well-known paths
 * contribute, that a missing entry is normal while a transport failure is not,
 * that identity is the case-folded path, that the list is capped and keeps its
 * order, that a title comes from a bounded head and falls back to the file
 * name, and that the search filters on title or path.
 */
import { describe, expect, it } from 'vitest'
import { RemoteError } from '@qilin/client-test-runtime'
import type { RemoteFailure } from '@qilin/api-remotes/client'
import type { SessionId } from '@qilin/session/types'
import {
  filterPlans, PLAN_FILES, planTitleFromHead, scanPlans, selectPlans,
} from '../src/client/plans.ts'
import type { PlanCandidate, PlanRow } from '../src/client/plans.ts'
import { scriptedReader } from './scripted-reader.client.ts'

const SESSION = 's-1' as SessionId
const ROOT = '/work/app'
/** The well-known member that lives in the workspace's docs directory. */
const DOCS_PLAN = PLAN_FILES[2]
const SIGNAL = new AbortController().signal

/** A transport-level failure, the kind that is not a convention entry's absence. */
const TRANSPORT: RemoteFailure = new RemoteError('gateway/internal', 'socket closed', {})

/** Run one scan over a virtual workspace. */
function scan(workspace: Parameters<typeof scriptedReader>[0] = {}) {
  return scanPlans(SESSION, ROOT, scriptedReader(workspace).reader, SIGNAL)
}

/** One candidate, with its absolute path derived from the display path. */
function candidate(rel: string): PlanCandidate {
  return { path: `${ROOT}/${rel}`, base: rel.slice(rel.lastIndexOf('/') + 1), rel }
}

describe('planTitleFromHead', () => {
  it('takes the first heading of one to three hashes', () => {
    expect(planTitleFromHead('# Ship the panel\n\nbody', 'plan.md')).toBe('Ship the panel')
    expect(planTitleFromHead('intro\n\n## Phase two\n### Later', 'notes.md')).toBe('Phase two')
  })

  it('ignores a deeper heading, a blank one, and a head with no heading', () => {
    expect(planTitleFromHead('#### Too deep', 'roadmap.md')).toBe('roadmap')
    expect(planTitleFromHead('#    ', 'roadmap.md')).toBe('roadmap')
    expect(planTitleFromHead('no heading here', 'ROADMAP.MD')).toBe('ROADMAP')
  })
})

describe('selectPlans', () => {
  it('dedupes by case-folded path, so one file under two spellings lists once', () => {
    const unique = selectPlans([
      candidate('plan.md'),
      candidate('PLAN.md'),
      candidate('plans/plan.md'),
    ])
    expect(unique.map(item => item.rel)).toEqual(['plan.md', 'plans/plan.md'])
  })

  it('caps the list and keeps the discovery order', () => {
    const found = [candidate('a.md'), candidate('b.md'), candidate('c.md')]
    expect(selectPlans(found, 2).map(item => item.rel)).toEqual(['a.md', 'b.md'])
    expect(selectPlans(found).map(item => item.rel)).toEqual(['a.md', 'b.md', 'c.md'])
  })
})

describe('filterPlans', () => {
  const rows: readonly PlanRow[] = [
    { path: '/work/app/plans/alpha.md', base: 'alpha.md', rel: 'plans/alpha.md', title: 'Alpha plan' },
    { path: '/work/app/plan.md', base: 'plan.md', rel: 'plan.md', title: 'Roadmap' },
  ]

  it('keeps every row for a blank query, and matches title or path case-insensitively', () => {
    expect(filterPlans(rows, '   ')).toBe(rows)
    expect(filterPlans(rows, 'ALPHA').map(row => row.rel)).toEqual(['plans/alpha.md'])
    expect(filterPlans(rows, 'roadmap').map(row => row.rel)).toEqual(['plan.md'])
  })

  it('keeps nothing when neither the title nor the path matches', () => {
    expect(filterPlans(rows, 'zzz')).toEqual([])
  })
})

describe('scanPlans', () => {
  it('reads the convention directories one level deep and the well-known documents', async () => {
    const result = await scan({
      dirs: {
        [`${ROOT}/plans`]: [
          { name: 'launch.md', type: 'file' },
          { name: 'notes.txt', type: 'file' },
          { name: 'drafts', type: 'directory' },
          { name: 'README.MD', type: 'file' },
        ],
      },
      heads: {
        [`${ROOT}/plans/launch.md`]: '# Launch plan',
        [`${ROOT}/plans/README.MD`]: 'no heading',
        [`${ROOT}/plan.md`]: '# Workspace plan',
        [`${ROOT}/${DOCS_PLAN}`]: '## Docs plan',
      },
    })
    expect(result.failure).toBeUndefined()
    expect(result.rows.map(row => [row.rel, row.title])).toEqual([
      ['plans/launch.md', 'Launch plan'],
      ['plans/README.MD', 'README'],
      ['plan.md', 'Workspace plan'],
      [DOCS_PLAN, 'Docs plan'],
    ])
    expect(result.rows[0]?.path).toBe(`${ROOT}/plans/launch.md`)
  })

  it('skips a missing convention and a well-known name that is not a regular file', async () => {
    const result = await scan({
      heads: { [`${ROOT}/plan.md`]: '# Only plan' },
      failures: {
        [`${ROOT}/PLAN.md`]: new RemoteError('workspace-file/not-regular-file', 'directory', {
          path: `${ROOT}/PLAN.md`, kind: 'directory',
        }),
      },
    })
    expect(result).toEqual({ rows: [{ path: `${ROOT}/plan.md`, base: 'plan.md', rel: 'plan.md', title: 'Only plan' }] })
  })

  it('lists a document once when a case-insensitive volume answers both spellings', async () => {
    const head = '# One file'
    const result = await scan({
      heads: { [`${ROOT}/plan.md`]: head, [`${ROOT}/PLAN.md`]: head },
    })
    expect(result.rows.map(row => row.rel)).toEqual(['plan.md'])
  })

  it('caps the list at the limit', async () => {
    const entries = Array.from({ length: 25 }, (_value, index) => ({
      name: `plan-${String(index).padStart(2, '0')}.md`, type: 'file' as const,
    }))
    const result = await scan({ dirs: { [`${ROOT}/plans`]: entries } })
    expect(result.rows).toHaveLength(20)
    expect(result.rows[0]?.rel).toBe('plans/plan-00.md')
  })

  it('reports the first failure that is not an absence, and carries what it did find', async () => {
    const result = await scan({
      dirs: { [`${ROOT}/plans`]: [{ name: 'kept.md', type: 'file' }] },
      heads: { [`${ROOT}/plans/kept.md`]: '# Kept' },
      failures: {
        [`${ROOT}/docs/plans`]: TRANSPORT,
        [`${ROOT}/.plans`]: TRANSPORT,
      },
    })
    expect(result.failure).toBe(TRANSPORT)
    expect(result.rows.map(row => row.rel)).toEqual(['plans/kept.md'])
  })

  it('reports a well-known document the endpoint would not even stat', async () => {
    const result = await scan({
      heads: { [`${ROOT}/PLAN.md`]: '# Named' },
      failures: {
        [`${ROOT}/plan.md`]: TRANSPORT,
        [`${ROOT}/${DOCS_PLAN}`]: TRANSPORT,
      },
    })
    expect(result.failure).toBe(TRANSPORT)
    expect(result.rows.map(row => row.rel)).toEqual(['PLAN.md'])
  })

  it('falls back to the file name for a head it cannot read', async () => {
    const result = await scan({
      dirs: { [`${ROOT}/plans`]: [{ name: 'gone.md', type: 'file' }] },
      headFailures: { [`${ROOT}/plans/gone.md`]: new RemoteError('workspace-file/not-text', 'binary', { path: 'p' }) },
    })
    expect(result.rows).toEqual([{
      path: `${ROOT}/plans/gone.md`, base: 'gone.md', rel: 'plans/gone.md', title: 'gone',
    }])
  })

  it('reads only the first page of a document', async () => {
    const script = scriptedReader({ heads: { [`${ROOT}/plan.md`]: '# Head' } })
    await scanPlans(SESSION, ROOT, script.reader, SIGNAL)
    expect(script.read).toHaveBeenCalledWith(
      SESSION, `${ROOT}/plan.md`, { offset: 1, limit: expect.any(Number) }, SIGNAL,
    )
  })
})
