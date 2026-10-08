/**
 * The live facts one roster member draws, read the same way by the conversation
 * action's rows and the page's roster: the model its Session selected, its
 * settled status, and whether it is the current Session.
 */
import type { TeamMemberProjection } from '@qilin-agent/experimental-agent-team/client'
import type { UseSessionStatus, UseSessions } from '@qilin-agent/client-ui-session/client'
import type { SessionId } from '@qilin-agent/session/types'
import type { MemberStatus } from './team-model.ts'

/** The two seats the facts come through: the Session list and one Session's status. */
interface MemberSeats {
  readonly useSessions: UseSessions
  readonly useSessionStatus: UseSessionStatus
}

/**
 * Read one member's live facts. An active member with neither a status push nor
 * a running summary is `inactive`; a member in any other phase reports that phase.
 * @param member - the member projection being drawn.
 * @param sessionId - the Session the surface is showing, for the current-member comparison.
 * @param seats - the standing Session list and Session-status seats.
 * @returns the selected model, the settled status, and whether this member is the current Session.
 */
export function useMemberFacts(
  member: TeamMemberProjection,
  sessionId: SessionId,
  seats: MemberSeats,
): { readonly model: string | undefined; readonly status: MemberStatus; readonly isCurrent: boolean } {
  const { useSessions, useSessionStatus } = seats
  const model = useSessions(state => state.projectionsBySession[member.id]?.values.modelSelection?.next?.model)
  const running = useSessionStatus(state => state.get(member.id)?.running)
  const summaryRunning = useSessions(state => state.byId[member.id]?.running)
  const status: MemberStatus = member.phase === 'active'
    ? (running ?? summaryRunning) === true ? 'running' : 'inactive'
    : member.phase
  return { model, status, isCurrent: member.id === sessionId }
}
