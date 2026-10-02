/** Client-safe Agent Teams roster and task views plus the `agentTeam` projection vocabulary. */

/**
 * Pull the write face's wire failure codes into every client program, so the
 * `agentTeams` namespace's `RemoteFailure` union names the Team domain codes.
 */
export type { TeamRejectedFailureDetails } from './remote.ts'

export type {
  TeamMemberPhase,
  TeamMemberProjection,
  TeamMemberView,
  TeamProjection,
  TeamTaskId,
  TeamTaskStatus,
  TeamTaskView,
} from './types.ts'
