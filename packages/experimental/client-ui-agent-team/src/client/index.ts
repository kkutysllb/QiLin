/** Browser entry for the experimental Agent Teams write bridge, popover, and Team page. */

import type { Context as ClientContext } from '@qilin-agent/kylin'
import teamRemote from '@qilin-agent/experimental-agent-team/remote'
import { mountAgentTeamUi } from './mount.ts'

export { inject } from './mount.ts'
export type { TeamActionInjected, TeamActionProps } from './TeamAction.tsx'
export type { TeamBodyProps } from './TeamBody.tsx'
export type { TeamKey } from './locales.ts'

/**
 * Mount the experimental `agentTeams` namespace and register the Team UI.
 * @param ctx - Client runtime.
 * @returns complete UI and Remote disposer.
 */
export async function apply(ctx: ClientContext): Promise<() => Promise<void>> {
  return await mountAgentTeamUi(ctx, teamRemote)
}
