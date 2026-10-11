/**
 * Fixtures the tasks specs share: one direct-child catalog, its child and
 * diagnostic rows, and one background-job row.
 */
import type { SessionProjectionSnapshot } from '@qilin-agent/api-session-controller/client'
import type { JobView } from '@qilin-agent/jobs/view'
import type { SessionId } from '@qilin-agent/session/types'
import type { SubagentCatalogEntry, SubagentListEntry } from '@qilin-agent/subagent/client'
import type { CatalogRow, CatalogSnapshot } from '../src/client/rows.ts'

/**
 * One session id.
 * @param value - the raw id.
 * @returns the same id as the branded type.
 */
export const sid = (value: string): SessionId => value as SessionId

/**
 * One direct-child catalog.
 * @param entries - the catalog's rows.
 * @param state - the read state; ready by default.
 * @param error - the failure a failed read carries.
 * @returns the snapshot the Session list holds for the parent.
 */
export function catalog(
  entries: readonly CatalogRow[],
  state: CatalogSnapshot['state'] = 'ready',
  error: CatalogSnapshot['error'] = null,
): CatalogSnapshot {
  return { entries, state, error }
}

/**
 * One parent's projection snapshot carrying a direct-child catalog.
 * @param entries - the catalog's durable child rows.
 * @param state - the read state; ready by default.
 * @param error - the failure a failed read carries.
 * @returns the snapshot the Session list holds for the parent.
 */
export function projection(
  entries: readonly SubagentListEntry[],
  state: SessionProjectionSnapshot['state'] = 'ready',
  error: SessionProjectionSnapshot['error'] = null,
): SessionProjectionSnapshot {
  return {
    // The catalog projection carries described children only: a diagnostic
    // candidate has no identity the projection can publish.
    values: {
      subagentCatalog: entries.flatMap((entry): SubagentCatalogEntry[] => {
        if (entry.kind === 'diagnostic') return []
        if (entry.mode === 'one-shot') {
          return [entry.label === undefined
            ? { id: entry.id, createdAt: 1, mode: 'one-shot' }
            : { id: entry.id, createdAt: 1, mode: 'one-shot', label: entry.label }]
        }
        if (entry.mode === 'external') {
          return [entry.label === undefined
            ? { id: entry.id, createdAt: 1, mode: 'external' }
            : { id: entry.id, createdAt: 1, mode: 'external', label: entry.label }]
        }
        return [{ id: entry.id, createdAt: 1, mode: 'continuable', label: entry.label ?? entry.id }]
      }),
    },
    state,
    error,
  }
}

/** Options one child fixture accepts. */
export interface ChildOptions {
  readonly mode?: 'one-shot' | 'continuable' | 'external'
  readonly label?: string | undefined
  readonly activity?: 'running' | 'inactive'
  readonly hasChildren?: boolean
}

/**
 * One catalog child row.
 * @param value - the child session id.
 * @param options - mode, label, activity, and whether it has children of its own.
 * @returns the durable direct-child row.
 */
export function child(value: string, options: ChildOptions = {}): SubagentListEntry {
  const shared = {
    id: sid(value),
    activity: options.activity ?? 'inactive' as const,
    hasChildren: options.hasChildren ?? false,
  }
  if (options.mode === 'one-shot') {
    return {
      kind: 'child',
      mode: 'one-shot',
      ...shared,
      ...(options.label === undefined ? {} : { label: options.label }),
    }
  }
  return { kind: 'child', mode: 'continuable', ...shared, label: options.label ?? value }
}

/**
 * One diagnostic row.
 * @param value - the candidate session id.
 * @param reason - why the candidate has no child row.
 * @returns the diagnostic row.
 */
export function diagnostic(
  value: string,
  reason: 'corrupt' | 'unsupported' | 'unavailable' = 'corrupt',
): SubagentListEntry {
  return { kind: 'diagnostic', id: sid(value), reason }
}

/** Options one job fixture accepts. */
export interface JobOptions {
  readonly status?: JobView['status']
  readonly startedAt?: number
  readonly finishedAt?: number
  readonly detail?: string
}

/**
 * One job row.
 * @param value - the job id and label.
 * @param options - status, start, settlement time, and producer detail.
 * @returns the job the Session list holds.
 */
export function job(value: string, options: JobOptions = {}): JobView {
  return {
    id: value as JobView['id'],
    kind: 'bash',
    label: value,
    status: options.status ?? 'running',
    startedAt: options.startedAt ?? 0,
    output: { total: 0, earliest: 0 },
    ...(options.finishedAt === undefined ? {} : { finishedAt: options.finishedAt }),
    ...(options.detail === undefined ? {} : { detail: options.detail }),
  }
}
