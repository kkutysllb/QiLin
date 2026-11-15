/**
 * The Team page's cross-agent collaboration panel: the durable traffic the page
 * holds, newest first — when a parent delegated work to a child, and every peer
 * message an agent received, with its sender and a bounded preview.
 *
 * Both come from durable folds: delegations from the parent's catalog, messages
 * from each recipient's `agentMessages` projection. The panel states what was
 * recorded; it does not invent traffic the projections did not carry.
 */
import { useMemo } from 'react'
import { StateDot } from '@qilin-agent/client-ui-primitives'
import type { TranslateNS } from '@qilin-agent/client-ui-slots'
import { collaborationEvents, formatSquadClock } from './squad-model.ts'
import { useFormation, type FormationSeats } from './use-formation.ts'
import type { NS } from './locales.ts'
import css from './SquadTimeline.module.css'

/** Props of the collaboration timeline. */
export interface SquadTimelineProps extends FormationSeats {
  readonly t: TranslateNS<typeof NS>
}

/** Mode copy for one delegation row, or undefined when the row states none. */
const MODE_KEYS = {
  'one-shot': 'squad.mode.oneShot',
  continuable: 'squad.mode.continuable',
  unknown: 'squad.mode.unknown',
  external: 'squad.mode.external',
} as const

/**
 * Draw the collaboration timeline.
 * @param props - the viewed Session, the standing seats, and the translator.
 * @returns the rows, or the empty notice.
 */
export function SquadTimeline({ sessionId, useSessions, useSessionStatus, t }: SquadTimelineProps) {
  const { agents } = useFormation({ sessionId, useSessions, useSessionStatus })
  const events = useMemo(() => collaborationEvents(agents), [agents])
  if (events.length === 0) return <p className={css.empty}>{t('squad.timeline.empty')}</p>
  return (
    <ol className={css.rows} data-squad-timeline>
      {events.map((event) => {
        const mode = event.target.mode === undefined ? undefined : t(MODE_KEYS[event.target.mode])
        const steps = event.target.totals === undefined ? undefined : t('squad.steps', { count: event.target.totals.steps })
        const facts = event.kind === 'delegation'
          ? [mode, steps].filter(value => value !== undefined).join(' · ')
          : event.text
        return (
          <li
            key={event.id}
            className={css.row}
            data-squad-event={event.id}
            data-squad-kind={event.kind}
            data-squad-target={event.target.id}
          >
            <time className={css.time} dateTime={new Date(event.time).toISOString()}>{formatSquadClock(event.time)}</time>
            <StateDot
              className={css.dot}
              state={event.target.activity === 'running'
                ? 'ongoing'
                : event.target.activity === 'done' ? 'done' : 'idle'}
              size={9}
            />
            <span className={css.text}>
              {event.kind === 'delegation'
                ? t('squad.timeline.row', { parent: event.senderLabel, child: event.target.label })
                : t('squad.timeline.message', { sender: event.senderLabel, target: event.target.label })}
            </span>
            {facts !== '' && <small className={css.facts}>{facts}</small>}
          </li>
        )
      })}
    </ol>
  )
}
