/**
 * The live sources both tasks surfaces read: the Session list's summaries and
 * running-subagent catalogs, and this Session's background-job rows.
 *
 * The surface owns the roster subscription for as long as it draws, so the hook
 * keeps it here rather than in either component.
 */
import { useEffect, useMemo } from 'react'
import type { SessionListState } from '@qilin/api-session-controller/client'
import type { JobView } from '@qilin/jobs/view'
import type { UseSessions } from '@qilin/client-ui-session/client'
import type { InjectFace } from '@qilin/client-ui-slots'
import type { SessionId } from '@qilin/session/types'
import type { TasksJobsFace } from './face.ts'
import { NO_JOBS, catalogsOf } from './rows.ts'

/** The seats the hook reads: the standing Session list and the injected jobs roster. */
type WorkSeats = Pick<InjectFace<TasksJobsFace>, 'useJobs' | 'watchRows'> & {
  readonly useSessions: UseSessions
}

/**
 * Read the Session list and the job roster once per render and derive the
 * running-work catalogs from them.
 * @param sessionId - the Session whose job rows and subagent topology to read.
 * @param seats - the standing Session list, the bound jobs roster, and its watcher.
 * @returns this Session's job rows, the Session list summaries the surfaces fold over, and the running catalogs keyed by Session.
 */
export function useWorkSources(
  sessionId: SessionId,
  seats: WorkSeats,
): {
  readonly jobs: readonly JobView[]
  readonly summaries: SessionListState['byId']
  readonly catalogs: ReturnType<typeof catalogsOf>
} {
  const { useSessions, useJobs, watchRows } = seats
  const projections = useSessions(state => state.projectionsBySession)
  const summaries = useSessions(state => state.byId)
  const jobs = useJobs(state => state.rows[sessionId]) ?? NO_JOBS
  useEffect(() => watchRows(sessionId), [sessionId, watchRows])
  const catalogs = useMemo(
    () => catalogsOf(projections, id => summaries[id]?.running === true),
    [projections, summaries],
  )
  return { jobs, summaries, catalogs }
}
