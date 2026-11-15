/**
 * Agent Teams switch in the Session header, left of Open locally: the profile
 * selects the `@qilin-agent/agent-team-profile` layer, and this is its only
 * control now that the Plugins page leaves the bundle out.
 */

import { useEffect } from 'react'
import { Switch, Tooltip } from '@qilin-agent/client-ui-primitives'
import type { SnapshotStore } from '@qilin-agent/client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@qilin-agent/client-ui-slots'
import type {} from '@qilin-agent/client-ui-conversation/client'
import type { AgentTeamSwitchState } from './agent-team-switch-store.ts'
import css from './AgentTeamSwitch.module.css'

/** Injected dependencies of {@link AgentTeamSwitch}. */
export interface AgentTeamSwitchInjected {
  hooks: {
    /** The bundle selection the switch renders. */
    agentTeamSwitch: SnapshotStore<AgentTeamSwitchState>
  }
  /** Read the Host's current selection. */
  load: () => Promise<void>
  /** Ask the Host to select or deselect the bundle. */
  toggle: (next: boolean) => void
}

/** Props the renderer binds for the header switch. */
export type AgentTeamSwitchProps =
  PropsRuntime<'conversation.session.header.utilities'>
  & PropsLocale<'pluginManager'>
  & InjectFace<AgentTeamSwitchInjected>

/**
 * Render the Agent Teams switch.
 *
 * A Host that does not list the bundle renders nothing: the control exists
 * only where the installation can actually select the layer.
 * @param props - composed header props.
 * @returns the tooltip-wrapped switch, or null where the switch cannot work.
 */
export function AgentTeamSwitch({ useAgentTeamSwitch, load, toggle, t }: AgentTeamSwitchProps) {
  const state = useAgentTeamSwitch(snapshot => snapshot)
  useEffect(() => { void load() }, [load])
  if (state.status === 'idle') return null
  if (state.status === 'unavailable') return null
  const restart = state.notice === 'restart-required'
  // A restart-bound or refused write leaves the selection unchanged, so the
  // switch alone cannot show that the click did anything: name the outcome in
  // the header instead of relying on the hover surface.
  const busy = state.busy
  const notice = state.notice
  const outcome = notice === null
    ? null
    : notice === 'restart-required'
      ? t('agentTeamSwitchRestart')
      : state.detail ?? t('agentTeamSwitchFailed')
  return (
    <Tooltip
      label={restart ? t('agentTeamSwitchRestart') : t('agentTeamSwitchHint')}
      delayMs={400}
      side="bottom"
    >
      <span className={css.control}>
        {/* The switch carries its own name beside it: a bare control in the
          header says nothing about what it turns on. */}
        <span className={css.label}>{t('agentTeamSwitch')}</span>
        <Switch
          checked={state.enabled}
          label={t('agentTeamSwitch')}
          disabled={state.status !== 'ready' || state.busy}
          title={restart
            ? t('agentTeamSwitchRestart')
            : state.notice === 'failed' ? state.detail ?? t('agentTeamSwitchFailed') : undefined}
          onChange={(next) => { toggle(next) }}
        />
        {busy && (
          <span className={css.notice} data-notice="busy" role="status">{t('agentTeamSwitchBusy')}</span>
        )}
        {notice !== null && outcome !== null && (
          <span
            className={css.notice}
            data-notice={notice}
            role="status"
            title={outcome}
          >
            {outcome}
          </span>
        )}
      </span>
    </Tooltip>
  )
}
