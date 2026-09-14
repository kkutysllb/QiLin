/**
 * Pure projections of the two snapshots the page draws: this Session's
 * direct-child subagent catalogs and its background-job list.
 *
 * Nothing here subscribes, requests, or reads a clock it does not take as a
 * parameter: each function maps a snapshot the Session list already holds onto
 * the rows the page renders. Descendant totals come from the summary lineage
 * (`indexSubagentDescendants`), the only projection that sees subagents below
 * the direct children a catalog reports.
 */
import type { SubagentCatalogSnapshot } from '@qilin/api-session-controller/client'
import type { SessionJob } from '@qilin/api-session-controller/types'
import type { StateDotState } from '@qilin/client-ui-primitives'
import type { TranslateNS } from '@qilin/client-ui-slots'
import type { SessionId } from '@qilin/session/types'
import type { SubagentAddress, SubagentListEntry } from '@qilin/subagent/client'
import type { SubagentDescendantSummary } from './lineage.ts'
import { NS } from './locales.ts'

/** Stable empty job list, so a Session without jobs keeps one array identity. */
export const NO_JOBS: readonly SessionJob[] = []

/** One row the subagents section draws: a catalog child, or a child whose durable record could not be read. */
export type SubagentRow =
  | {
    readonly kind: 'child'
    /** The child's Session id, and the row's stable key. */
    readonly id: SessionId
    /** The durable direct-parent address every action on this row travels through. */
    readonly address: SubagentAddress
    readonly label: string
    /** Nesting level under the section's root Session. */
    readonly depth: number
    readonly running: boolean
  }
  | {
    readonly kind: 'diagnostic'
    readonly id: SessionId
    readonly depth: number
    readonly reason: 'corrupt' | 'unsupported' | 'unavailable'
  }

/**
 * One catalog entry as a row, under the parent whose catalog reported it.
 * @param entry - the catalog's durable direct-child row.
 * @param parentSessionId - the Session the entry is a direct child of.
 * @param depth - nesting level under the section's root.
 * @returns the row the section draws.
 */
function rowOf(entry: SubagentListEntry, parentSessionId: SessionId, depth: number): SubagentRow {
  if (entry.kind === 'diagnostic') {
    return { kind: 'diagnostic', id: entry.id, depth, reason: entry.reason }
  }
  const address: SubagentAddress = entry.mode === 'one-shot'
    ? { parentSessionId, childSessionId: entry.id, mode: 'one-shot' }
    : { parentSessionId, childSessionId: entry.id, mode: 'continuable' }
  return {
    kind: 'child',
    id: entry.id,
    address,
    // A one-shot child may carry no creation label; its id is then the only name it has.
    label: entry.label ?? entry.id,
    depth,
    running: entry.activity === 'running',
  }
}

/**
 * Flatten one Session's subagent topology from the catalogs in hand.
 *
 * A level is one parent's catalog, and the walk descends only into children
 * whose own catalog has been read; a child the page has never opened
 * contributes its own row and no rows below it. Siblings are newest-first
 * because the Host orders a catalog by durable creation time. The seen set
 * makes a repeated or cyclic parent an ordinary skip rather than an endless
 * walk.
 * @param catalogs - direct-child catalogs keyed by parent Session id.
 * @param rootSessionId - the Session the section is rooted at.
 * @returns rows in display order, depth-first.
 */
export function subagentRows(
  catalogs: Readonly<Record<SessionId, SubagentCatalogSnapshot>>,
  rootSessionId: SessionId,
): SubagentRow[] {
  const rows: SubagentRow[] = []
  const seen = new Set<SessionId>()
  const visit = (parentSessionId: SessionId, depth: number): void => {
    const catalog = catalogs[parentSessionId]
    if (catalog === undefined) return
    for (const entry of [...catalog.entries].reverse()) {
      if (seen.has(entry.id)) continue
      seen.add(entry.id)
      rows.push(rowOf(entry, parentSessionId, depth))
      if (entry.kind === 'child' && entry.hasChildren) visit(entry.id, depth + 1)
    }
  }
  visit(rootSessionId, 0)
  return rows
}

/**
 * How many rows the subagents section counts as children. A diagnostic row is a
 * child the Host could not describe, so it is drawn but never counted.
 * @param rows - the section's rows.
 * @returns the number of child rows.
 */
export function childRowCount(rows: readonly SubagentRow[]): number {
  return rows.filter(row => row.kind === 'child').length
}

/**
 * The subagents section's stated total: the direct children the catalog
 * reports, or the descendants the summary lineage records, whichever is
 * greater.
 *
 * The lineage reaches subagents below the direct children, and the catalog is
 * authoritative while the lineage is still converging, so taking the greater
 * of the two is never an undercount during that window.
 * @param children - child rows the catalog reports.
 * @param descendants - lineage totals keyed by possible parent.
 * @param rootSessionId - the Session the section is rooted at.
 * @returns the total the section header states.
 */
export function subagentTotal(
  children: number,
  descendants: ReadonlyMap<SessionId, SubagentDescendantSummary>,
  rootSessionId: SessionId,
): number {
  return Math.max(children, descendants.get(rootSessionId)?.count ?? 0)
}

/** A job the registry still holds open, and whose duration therefore ticks. */
export function isLive(job: SessionJob): boolean {
  return job.status === 'running' || job.status === 'stopping'
}

/**
 * Live rows first in start order, then settled rows newest-first. Two jobs that
 * settled in the same millisecond fall back to the later start, which is the
 * same newest-first reading the settled order already uses, so the sort never
 * depends on the Host's map iteration.
 * @param jobs - the Session's job rows.
 * @returns a new array in display order.
 */
export function orderedJobs(jobs: readonly SessionJob[]): SessionJob[] {
  return [...jobs].sort((left, right) => {
    const liveLeft = isLive(left)
    if (liveLeft !== isLive(right)) return liveLeft ? -1 : 1
    if (liveLeft) return left.startedAt - right.startedAt
    const settled = (right.finishedAt ?? right.startedAt) - (left.finishedAt ?? left.startedAt)
    return settled !== 0 ? settled : right.startedAt - left.startedAt
  })
}

/**
 * Elapsed milliseconds for one job row.
 * @param job - the job.
 * @param now - the clock sample a live duration measures against.
 * @returns its span so far while it runs, its own span once it settled.
 */
export function jobElapsed(job: SessionJob, now: number): number {
  return isLive(job) ? now - job.startedAt : (job.finishedAt ?? job.startedAt) - job.startedAt
}

/**
 * Elapsed time in at most two adjacent units. A background job that outlives an
 * hour is already exceptional, so hours is the widest unit.
 * @param elapsedMs - elapsed milliseconds.
 * @param t - namespace-bound translate.
 * @returns the duration as the dictionary phrases it.
 */
export function formatDuration(elapsedMs: number, t: TranslateNS<typeof NS>): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1_000))
  const seconds = total % 60
  const minutes = Math.floor(total / 60) % 60
  const hours = Math.floor(total / 3_600)
  if (hours > 0) return t('tasks.duration.hours', { hours, minutes })
  if (minutes > 0) return t('tasks.duration.minutes', { minutes, seconds })
  return t('tasks.duration.seconds', { seconds })
}

/** Closed-union exhaustiveness fence for the wire status set. */
/* v8 ignore next 3 -- closed-union backstop; only reached if a status is forged */
function assertNever(value: never): never {
  throw new Error(`unhandled job status: ${JSON.stringify(value)}`)
}

/**
 * Human status word for a row that carries no producer detail.
 * @param status - the wire status.
 * @param t - namespace-bound translate.
 * @returns the word the row shows.
 */
export function jobStatusLabel(status: SessionJob['status'], t: TranslateNS<typeof NS>): string {
  switch (status) {
    case 'running': return t('tasks.status.running')
    case 'stopping': return t('tasks.status.stopping')
    case 'completed': return t('tasks.status.completed')
    case 'killed': return t('tasks.status.killed')
    case 'failed': return t('tasks.status.failed')
    /* v8 ignore next -- closed wire status union */
    default: return assertNever(status)
  }
}

/**
 * Status marker semantics. `stopping` and `killed` share the attention colour:
 * both mean the work ended (or is ending) on request rather than on its own.
 * @param status - the wire status.
 * @returns the state the dot draws.
 */
export function jobDotState(status: SessionJob['status']): StateDotState {
  switch (status) {
    case 'running': return 'ongoing'
    case 'stopping': return 'warning'
    case 'completed': return 'done'
    case 'killed': return 'warning'
    case 'failed': return 'error'
    /* v8 ignore next -- closed wire status union */
    default: return assertNever(status)
  }
}

/**
 * The work a chip badge counts for one Session: direct-child catalog rows whose
 * activity is `running`, plus the jobs the registry still holds open.
 *
 * A chip re-renders on every strip pass, so this reads the two snapshots
 * directly instead of walking the summary lineage; a running grandchild implies
 * its parent is running too, so the direct children already account for work
 * below them.
 * @param catalogs - direct-child catalogs keyed by parent Session id.
 * @param jobs - the Session's job rows.
 * @param sessionId - the Session the chip belongs to.
 * @returns the count, zero when nothing is active.
 */
export function activeWorkCount(
  catalogs: Readonly<Record<SessionId, SubagentCatalogSnapshot>>,
  jobs: readonly SessionJob[],
  sessionId: SessionId,
): number {
  const entries = catalogs[sessionId]?.entries ?? []
  const running = entries.filter(entry => entry.kind === 'child' && entry.activity === 'running').length
  return running + jobs.filter(isLive).length
}
