/**
 * The chip's status pill: how much work this Session currently has running.
 *
 * The kit draws it between the chip's glyph and its title and calls it on every
 * strip render, so it reads the two snapshots straight through the standard
 * `useSessions` hook and derives nothing else.
 */
import { useMemo, type ReactNode } from 'react'
import { Tag } from '@qilin/client-ui-primitives'
import type { PropsRuntime } from '@qilin/client-ui-slots'
import type {} from '@qilin/client-ui-session/client'
import { NO_JOBS, activeWorkCount, catalogsOf } from './rows.ts'

/** The badge's composed props: the Session scope's standard kit. */
export type TasksBadgeProps = PropsRuntime<'sidebar.right.pane.tab.badge'>

/**
 * Render the running-work count, or nothing when the Session is idle.
 * @param props - the Session scope's standard props.
 * @returns the count, or null when no subagent and no job is running.
 */
export function TasksBadge({ sessionId, useSessions }: TasksBadgeProps): ReactNode {
  const projections = useSessions(state => state.projectionsBySession)
  const summaries = useSessions(state => state.byId)
  const jobs = useSessions(state => state.jobsBySession[sessionId]) ?? NO_JOBS
  const catalogs = useMemo(
    () => catalogsOf(projections, id => summaries[id]?.running === true),
    [projections, summaries],
  )
  const active = activeWorkCount(catalogs, jobs, sessionId)
  // Zero is the idle state, not a count: the chip draws no empty pill for it.
  return active === 0 ? null : <Tag tone="outline">{active}</Tag>
}
