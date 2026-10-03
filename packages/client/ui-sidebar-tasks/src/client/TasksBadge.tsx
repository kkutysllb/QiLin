/**
 * The chip's status pill: how much work this Session currently has running.
 *
 * The kit draws it between the chip's glyph and its title and calls it on every
 * strip render, so it reads the two snapshots straight through the standard
 * `useSessions` hook and derives nothing else.
 */
import type { ReactNode } from 'react'
import type { JobsSnapshot } from '@qilin/api-job-controller/client'
import { Tag } from '@qilin/client-ui-primitives'
import type { InjectFace, PropsRuntime } from '@qilin/client-ui-slots'
import type { SessionId } from '@qilin/session/types'
import type {} from '@qilin/client-ui-session/client'
import { activeWorkCount } from './rows.ts'
import { useWorkSources } from './work-sources.ts'

/** The badge's injected face: the background-job roster and its watcher. */
export interface TasksBadgeInjected {
  hooks: {
    /** Client jobs snapshot (rosters and observations) bound by the renderer as useJobs. */
    jobs: {
      getSnapshot(): JobsSnapshot
      subscribe(listener: () => void): () => void
    }
  }
  /**
   * Keep this Session's roster current while the badge is mounted; returns the
   * stop function.
   */
  watchRows: (sessionId: SessionId) => () => void
}

/** The badge's composed props: the Session scope's standard kit and the roster face. */
export type TasksBadgeProps =
  PropsRuntime<'sidebar.right.pane.tab.badge'>
  & InjectFace<TasksBadgeInjected>

/**
 * Render the running-work count, or nothing when the Session is idle.
 * @param props - the Session scope's standard props.
 * @returns the count, or null when no subagent and no job is running.
 */
export function TasksBadge({ sessionId, useSessions, useJobs, watchRows }: TasksBadgeProps): ReactNode {
  const { catalogs, jobs } = useWorkSources(sessionId, { useSessions, useJobs, watchRows })
  const active = activeWorkCount(catalogs, jobs, sessionId)
  // Zero is the idle state, not a count: the chip draws no empty pill for it.
  return active === 0 ? null : <Tag tone="outline">{active}</Tag>
}
