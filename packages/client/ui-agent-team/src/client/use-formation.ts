import type {} from '@qilin-agent/client-ui-session-status/client'
/**
 * The one derivation both fleet surfaces read: the conversation's agent family
 * and its Team, from the standing Session seats. Kept as a hook so the graph and
 * the collaboration timeline cannot disagree about which agents exist.
 */
import { useMemo } from 'react'
import type { SessionId } from '@qilin-agent/session/types'
import type { UseSessions } from '@qilin-agent/client-ui-session/client'
import type { UseSessionStatus } from '@qilin-agent/client-ui-session-status/client'
import { squadAgentsOf, squadCounts, squadLeadOf, type SquadAgent, type SquadCounts } from './squad-model.ts'
import type { TeamProjection } from '@qilin-agent/agent-team/client'

/** Props the derivation reads: the viewed Session and the two standing seats. */
export interface FormationSeats {
  readonly sessionId: SessionId
  readonly useSessions: UseSessions
  readonly useSessionStatus: UseSessionStatus
}

/** One conversation's family, its Lead, and its Team. */
export interface Formation {
  readonly agents: readonly SquadAgent[]
  readonly lead: SessionId
  readonly team: TeamProjection | undefined
  readonly counts: SquadCounts
}

/**
 * Read the conversation's formation from the Session list, projections, and
 * live statuses.
 * @param seats - the viewed Session and the standing Session seats.
 * @returns the agents, the Lead identity, the Team projection, and the totals.
 */
export function useFormation(seats: FormationSeats): Formation {
  const { sessionId, useSessions, useSessionStatus } = seats
  const byId = useSessions(state => state.byId)
  const projections = useSessions(state => state.projectionsBySession)
  const statuses = useSessionStatus(value => value)
  const lead = useMemo(() => squadLeadOf(byId, sessionId), [byId, sessionId])
  const team = projections[lead]?.values.agentTeam
  const agents = useMemo(
    () => squadAgentsOf({ byId, projections, statuses, sessionId }),
    [byId, projections, statuses, sessionId],
  )
  const counts = useMemo(() => squadCounts(agents, team), [agents, team])
  return { agents, lead, team, counts }
}
