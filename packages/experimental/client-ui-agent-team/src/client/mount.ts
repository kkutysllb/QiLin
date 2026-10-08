/** Source-safe Agent Teams browser registration: write bridge, popover, and Team page. */

import type { Context as ClientContext } from '@qilin-agent/kylin'
import type { TypertRemoteContribution } from '@qilin-agent/typert-protocol'
import type { SessionId } from '@qilin-agent/session/types'
import type {} from '@qilin-agent/client-locale/client'
import type {} from '@qilin-agent/client-ui-renderer/client'
import type {} from '@qilin-agent/client-ui-session/client'
import type {} from '@qilin-agent/client-ui-sidebar-right/client'
import type {} from '@qilin-agent/client-ui-workspace/client'
import type {} from '@qilin-agent/experimental-agent-team/remote'
import type {} from '@qilin-agent/client-ui-conversation/client'
import { TeamBody, TeamTitle } from './TeamBody.tsx'
import { TeamAction } from './TeamAction.tsx'
import { TEAM_ID, teamDefinition } from './definition.tsx'
import { createTeamPageStore } from './team-page-store.ts'
import { teamOpenTeammate, teamWritesFace, type TeamWriteDeps } from './team-writes.ts'
import { en, NS, zh, type TeamKey } from './locales.ts'

declare module '@qilin-agent/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Agent Teams roster and task-board copy. */
    'agent-team': TeamKey
  }
}

/**
 * Required browser services: navigation, slots, locale, tab registry, and the
 * Remote carrier. The `agentTeams` namespace is absent on purpose — this plugin
 * mounts it, so declaring it here would leave the fiber PENDING forever waiting
 * for its own output.
 */
export const inject = ['sessions', 'uiWorkspace', 'slots', 'locale', 'remote', 'sidebarRightTabs']

/** What the UI registration itself needs: the services above plus the namespace {@link mountAgentTeamUi} mounts first. */
const UI_INJECT = [...inject, 'remote.agentTeams']

/**
 * Register the Team locale dictionaries, the conversation-header action, and
 * the right-Sidebar Team page. The page reads the Lead Session's `agentTeam`
 * projection from the shared Session store and writes through the mounted
 * `agentTeams` Remote namespace; the registration itself performs no call.
 * @param ctx - Client Context carrying the injected services.
 */
export function registerAgentTeamUi(ctx: ClientContext): void {
  const t = ctx.locale.bind(NS)
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'client-ui-agent-team: dictionaries')
  ctx.effect(() => ctx.sidebarRightTabs.register(teamDefinition(t)), 'client-ui-agent-team: team type')
  const sessions = ctx.sessions
  const leadSessionId = (sessionId: SessionId): SessionId => {
    const address = sessions.binding(sessionId)?.session.getSnapshot().subagent?.address
    return address?.parentSessionId ?? sessionId
  }

  const deps: TeamWriteDeps = {
    writer: ctx.remote.agentTeams,
    refreshProjections: (sessionId: SessionId) => sessions.refreshProjections(sessionId),
    leadSessionId,
    mainViewCount: (sessionId: SessionId) => sessions.retainInfo(sessionId).getSnapshot().retainedBy.mainView ?? 0,
    openSession: (target) => { ctx.uiWorkspace.openSession(target) },
  }
  const openTeammate = teamOpenTeammate(deps)

  ctx.slots.inject(
    'conversation.session.header.actions',
    () => ctx.slots.register({
      name: 'conversation.session.header.actions',
      id: 'agent-team',
      order: -20,
      locale: NS,
      inject: () => ({ openTeammate }),
    }, TeamAction),
  )
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab', key: TEAM_ID, locale: NS, store: createTeamPageStore(), inject: teamWritesFace(deps) },
    TeamBody,
  )), 'client-ui-agent-team: team page body')
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab.title', () => ctx.slots.register(
    { name: 'sidebar.right.pane.tab.title', key: TEAM_ID },
    TeamTitle,
  )), 'client-ui-agent-team: team page title')
}

/**
 * Mount the experimental `agentTeams` write namespace and register the UI.
 * @param ctx - Client runtime owning the Remote, dictionaries, slots, and Session store.
 * @param contribution - the generated `agentTeams` Remote definitions.
 * @returns disposer joining the UI and the Remote withdrawal.
 */
export async function mountAgentTeamUi(
  ctx: ClientContext,
  contribution: TypertRemoteContribution,
): Promise<() => Promise<void>> {
  const disposeRemote = await ctx.remote.$mount(contribution)
  const ui = ctx.inject([...UI_INJECT], registerAgentTeamUi)
  try { await ui } catch (error) { await ui.dispose(); await disposeRemote(); throw error }
  return async () => { await ui.dispose(); await disposeRemote() }
}
