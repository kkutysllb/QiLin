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
import type { SessionProjectionSnapshot } from '@qilin/api-session-controller/client'
import type { JobView } from '@qilin/jobs/view'
import type { StateDotState } from '@qilin/client-ui-primitives'
import type { TranslateNS } from '@qilin/client-ui-slots'
import type { SessionId } from '@qilin/session/types'
import type { SubagentAddress, SubagentCatalogEntry } from '@qilin/subagent/client'
import type { SubagentDescendantSummary } from './lineage.ts'
import { NS } from './locales.ts'

/** Stable empty job list, so a Session without jobs keeps one array identity. */
export const NO_JOBS: readonly JobView[] = []

/**
 * One row of a parent's direct-child catalog as the page draws it: a described
 * child, or a candidate the Host could not describe.
 */
export type CatalogRow =
  | {
    readonly kind: 'child'
    readonly id: SessionId
    readonly mode: SubagentAddress['mode']
    readonly label?: string
    /** Whether the Session list currently reports the child as running. */
    readonly activity: 'running' | 'inactive'
    /** Whether a catalog below this child has yet to prove it childless. */
    readonly hasChildren: boolean
  }
  | {
    readonly kind: 'diagnostic'
    readonly id: SessionId
    readonly reason: 'corrupt' | 'unsupported' | 'unavailable'
  }

/** One parent's direct-child catalog and the state of its explicit read. */
export interface CatalogSnapshot {
  readonly state: 'loading' | 'ready' | 'error'
  readonly error: { readonly message: string } | null
  readonly entries: readonly CatalogRow[]
}

/** Direct-child catalogs keyed by the Session they describe. */
export type Catalogs = Readonly<Record<SessionId, CatalogSnapshot>>

/**
 * The read state of one parent's catalog, as the page draws it. A snapshot that
 * has not settled is `loading` while it carries no catalog value and `ready`
 * once it does, so a Session the Host described as childless reads as a settled
 * empty catalog rather than as a pending one.
 * @param snapshot - the Session's projection snapshot.
 * @returns the catalog read state.
 */
function catalogState(snapshot: SessionProjectionSnapshot): CatalogSnapshot['state'] {
  if (snapshot.state !== 'idle') return snapshot.state
  return snapshot.values.subagentCatalog === undefined ? 'loading' : 'ready'
}

/**
 * Project the shared per-Session projection snapshots into the catalogs the page draws.
 * @param projections - projection snapshots keyed by Session id.
 * @param running - whether the Session list currently reports a Session as running.
 * @returns one catalog per projected Session.
 */
export function catalogsOf(
  projections: Readonly<Record<SessionId, SessionProjectionSnapshot>>,
  running: (id: SessionId) => boolean,
): Catalogs {
  const catalogs: Record<SessionId, CatalogSnapshot> = {}
  for (const [key, snapshot] of Object.entries(projections)) {
    const id = key as SessionId
    const entries: readonly SubagentCatalogEntry[] = snapshot.values.subagentCatalog ?? []
    catalogs[id] = {
      state: catalogState(snapshot),
      error: snapshot.error,
      entries: entries.map((entry) => {
        const below = projections[entry.id]
        return {
          kind: 'child',
          id: entry.id,
          mode: entry.mode,
          ...(entry.label === undefined ? {} : { label: entry.label }),
          activity: running(entry.id) ? 'running' : 'inactive',
          // Only a settled empty catalog proves a child childless; an unread
          // one keeps its disclosure so the level can still be walked.
          hasChildren: below === undefined
            || catalogState(below) !== 'ready'
            || (below.values.subagentCatalog?.length ?? 0) > 0,
        }
      }),
    }
  }
  return catalogs
}

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
function rowOf(entry: CatalogRow, parentSessionId: SessionId, depth: number): SubagentRow {
  if (entry.kind === 'diagnostic') {
    return { kind: 'diagnostic', id: entry.id, depth, reason: entry.reason }
  }
  const address: SubagentAddress = {
    parentSessionId, childSessionId: entry.id, mode: entry.mode,
  }
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
  catalogs: Catalogs,
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

/**
 * Whether a job remains active in the registry.
 * @param job - the Session job row.
 * @returns whether the job is running or stopping.
 */
export function isLive(job: JobView): boolean {
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
export function orderedJobs(jobs: readonly JobView[]): JobView[] {
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
export function jobElapsed(job: JobView, now: number): number {
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
export function jobStatusLabel(status: JobView['status'], t: TranslateNS<typeof NS>): string {
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
export function jobDotState(status: JobView['status']): StateDotState {
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
  catalogs: Catalogs,
  jobs: readonly JobView[],
  sessionId: SessionId,
): number {
  const entries = catalogs[sessionId]?.entries ?? []
  const running = entries.filter(entry => entry.kind === 'child' && entry.activity === 'running').length
  return running + jobs.filter(isLive).length
}
