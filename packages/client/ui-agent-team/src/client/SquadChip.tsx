import type {} from '@qilin-agent/client-ui-session-status/client'
/**
 * The conversation header's squad chip: states the conversation's agent family
 * and its Team, and opens the Team page in the right Sidebar. The page owns the
 * formation graph and the shared task board; this chip owns no surface itself.
 */
import { useMemo } from 'react'
import type { SessionId } from '@qilin-agent/session/types'
import { IconUsersOutlineRegular, StateDot } from '@qilin-agent/client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@qilin-agent/client-ui-slots'
import type {} from '@qilin-agent/client-ui-conversation/client'
import { squadAgentsOf, squadCounts, squadLeadOf } from './squad-model.ts'
import { NS } from './locales.ts'
import css from './SquadChip.module.css'

/** Business actions supplied by the browser plugin. */
export interface SquadChipInjected {
  /** Open the Team page for one conversation in the right Sidebar. */
  readonly openTeam: (sessionId: SessionId) => void
}

/** Full props of the squad conversation-header action. */
export type SquadChipProps =
  PropsRuntime<'conversation.session.header.actions'> & SquadChipInjected & PropsLocale<typeof NS>

/**
 * Draw the squad chip.
 * @param props - Session standard props, the injected navigation, and the translator.
 * @returns the trigger naming the formation and its Team.
 */
export function SquadChip({ sessionId, useSessions, useSessionStatus, openTeam, t }: SquadChipProps) {
  const byId = useSessions(state => state.byId)
  const projections = useSessions(state => state.projectionsBySession)
  const statuses = useSessionStatus(value => value)
  const lead = useMemo(() => squadLeadOf(byId, sessionId), [byId, sessionId])
  const team = projections[lead]?.values.agentTeam
  const agents = useMemo(
    () => squadAgentsOf({ byId, projections, statuses, sessionId }),
    [byId, projections, statuses, sessionId],
  )
  const counts = squadCounts(agents, team)
  const label = team === undefined
    ? [t('squad.trigger'), t('squad.agents', { count: counts.agents })].join(' · ')
    : [
      t('squad.trigger'),
      t('squad.members', { count: counts.members }),
      t('squad.agents', { count: counts.agents }),
    ].join(' · ')
  return (
    <button
      type="button"
      className={css.trigger}
      data-squad-chip
      title={label}
      onClick={() => { openTeam(sessionId) }}
    >
      <IconUsersOutlineRegular size={14} />
      {counts.running > 0 && <StateDot state="ongoing" size={8} />}
      <span className={css.label}>{label}</span>
    </button>
  )
}
