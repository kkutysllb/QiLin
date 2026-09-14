/**
 * Fixtures the tasks specs share: one direct-child catalog, its child and
 * diagnostic rows, and one background-job row.
 */
import type { SubagentCatalogSnapshot } from '@qilin/api-session-controller/client'
import type { SessionJob } from '@qilin/api-session-controller/types'
import type { SessionId } from '@qilin/session/types'
import type { SubagentListEntry } from '@qilin/subagent/client'

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
  entries: readonly SubagentListEntry[],
  state: SubagentCatalogSnapshot['state'] = 'ready',
  error: SubagentCatalogSnapshot['error'] = null,
): SubagentCatalogSnapshot {
  return { entries, parentAvailable: true, state, error }
}

/** Options one child fixture accepts. */
export interface ChildOptions {
  readonly mode?: 'one-shot' | 'continuable'
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
  readonly status?: SessionJob['status']
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
export function job(value: string, options: JobOptions = {}): SessionJob {
  return {
    id: value as SessionJob['id'],
    kind: 'bash',
    label: value,
    status: options.status ?? 'running',
    startedAt: options.startedAt ?? 0,
    ...(options.finishedAt === undefined ? {} : { finishedAt: options.finishedAt }),
    ...(options.detail === undefined ? {} : { detail: options.detail }),
  }
}
