/** Wire failure mapping for the Team service's browser write face. */

import { RemoteError } from '@qilin-agent/typert-protocol'
import { TeamError } from './error.ts'

/** Wire details the Team domain carries on its catch-all refusal code. */
export interface TeamRejectedFailureDetails {
  /** The stable Team failure class, as the domain's `TeamError` code names it. */
  readonly code: string
}

declare module '@qilin-agent/typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The wire identity resolves to a Session that is not a Team member. */
    'agent-team/not-a-member': {}
    /**
     * The compare-and-set revision no longer matches the durable task; the
     * mutation was refused. The board projection carries the current revisions.
     */
    'agent-team/stale-revision': {}
    /**
     * The Team domain refused the request for a reason without a dedicated
     * wire code; `code` names the stable Team failure class.
     */
    'agent-team/rejected': TeamRejectedFailureDetails
  }
}

/**
 * Map one Team-domain failure onto the shared Remote failure vocabulary so the
 * browser can branch on a stable code. Unknown values pass through unchanged
 * and surface as `gateway/internal`.
 * @param error - the value thrown by the Team domain operation.
 * @returns the value to rethrow from the wire method.
 */
export function teamWireError(error: unknown): unknown {
  if (!(error instanceof TeamError)) return error
  if (error.code === 'TEAM_TASK_STALE_REVISION') {
    return new RemoteError('agent-team/stale-revision', error.message, {})
  }
  if (error.code === 'TEAM_NOT_MEMBER') {
    return new RemoteError('agent-team/not-a-member', error.message, {})
  }
  return new RemoteError('agent-team/rejected', error.message, { code: error.code })
}
