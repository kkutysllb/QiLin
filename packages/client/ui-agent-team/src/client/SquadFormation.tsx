/**
 * The Team page's formation graph: one card per agent of the conversation's
 * family over a tidy tree of branch-coloured edges. Running edges pulse, a
 * hovered card keeps its parent and children lit, and every card opens that
 * agent's conversation.
 *
 * The stage is measured, so the tree re-flows on every width change and packs
 * levels into bands when the leaves outgrow one row. Read-only over the Session
 * list, projections, and live statuses; the board below shares the hovered
 * owner so a row and its card light each other.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import type { SessionId } from '@qilin-agent/session/types'
import type { SessionTarget } from '@qilin-agent/api-session-controller/client'
import type { UseSessionStatus, UseSessions } from '@qilin-agent/client-ui-session/client'
import { StateDot } from '@qilin-agent/client-ui-primitives'
import type { TranslateNS } from '@qilin-agent/client-ui-slots'
import {
  formatSquadDuration, formatSquadTokens, layoutSquad, squadBarSegments, squadNeighborhood, squadOwnerOf,
  type SquadAgent, type SquadLink,
} from './squad-model.ts'
import { useFormation } from './use-formation.ts'
import type { NS } from './locales.ts'
import css from './SquadFormation.module.css'

/** Join the class names that apply, keeping the stylesheet lookup order. */
function cx(...names: readonly (string | false | undefined)[]): string {
  return names.filter((name): name is string => typeof name === 'string' && name !== '').join(' ')
}

/** Branch hues, cycled by top-level branch index; the Lead keeps the brand accent. */
const BRANCH_HUES: readonly string[] = [
  'var(--qilin-alias-brand-primary)',
  'var(--qilin-static-green-500)',
  'var(--qilin-static-amber-500)',
  'var(--qilin-static-violet-400)',
  'var(--qilin-alias-state-error-primary)',
  'var(--qilin-static-blue-400)',
]



/** Branch colour for one agent: the family root reads as the Lead. */
function squadHue(agent: SquadAgent): string {
  if (agent.isLead) return BRANCH_HUES[0] as string
  return BRANCH_HUES[Math.abs(agent.family) % BRANCH_HUES.length] as string
}

/** Occupancy colour: amber past 70%, red past 90%. */
function pressureColor(percent: number): string {
  if (percent >= 90) return 'var(--qilin-alias-state-error-primary)'
  if (percent >= 70) return 'var(--qilin-static-amber-500)'
  return 'var(--qilin-static-green-500)'
}

/** The address one card opens: the Lead by identity, every child by its durable address. */
function targetOf(agent: SquadAgent): SessionTarget {
  if (agent.parentId === undefined) return agent.id
  return { parentSessionId: agent.parentId, childSessionId: agent.id, mode: agent.mode ?? 'unknown' }
}

/** Creation-mode locale keys, indexed by the mode a row states. */
const MODE_KEYS = {
  'one-shot': 'squad.mode.oneShot',
  continuable: 'squad.mode.continuable',
  unknown: 'squad.mode.unknown',
  external: 'squad.mode.external',
} as const

/** Props of the Team page's formation graph. */
export interface SquadFormationProps {
  /** The conversation the page is attached to. */
  readonly sessionId: SessionId
  readonly useSessions: UseSessions
  readonly useSessionStatus: UseSessionStatus
  /** Owner name highlighted from the board, if any. */
  readonly hoveredOwner: string | undefined
  /** Report the owner a card hover points at. */
  readonly onHoverOwner: (name: string | undefined) => void
  /** Open one agent's conversation. */
  readonly openAgent: (target: SessionTarget) => void
  /**
   * Read one agent's projections. Summary projections already ride the Session
   * list; this asks for the summary-excluded facts a card draws.
   */
  readonly refreshAgent?: ((sessionId: SessionId) => void) | undefined
  readonly t: TranslateNS<typeof NS>
}

interface SquadCardProps {
  readonly agent: SquadAgent
  readonly x: number
  readonly y: number
  readonly width: number
  readonly hovered: boolean
  readonly dimmed: boolean
  readonly onHover: (agent: SquadAgent | undefined) => void
  readonly onOpen: (agent: SquadAgent) => void
  readonly t: TranslateNS<typeof NS>
}

/** One agent card placed on the formation canvas. */
function SquadCard({ agent, x, y, width, hovered, dimmed, onHover, onOpen, t }: SquadCardProps) {
  const tokens = agent.tokens === undefined ? '—' : formatSquadTokens(agent.tokens, t)
  const duration = agent.durationMs === undefined ? undefined : formatSquadDuration(agent.durationMs, t)
  const steps = agent.totals === undefined ? undefined : t('squad.steps', { count: agent.totals.steps })
  const pressure = agent.pressure
  const mode = agent.mode === undefined ? undefined : t(MODE_KEYS[agent.mode])
  const facts = [agent.model, mode].filter(value => value !== undefined).join(' · ')
  const activity = t(agent.activity === 'running'
    ? 'squad.activity.running'
    : agent.activity === 'done' ? 'squad.activity.done' : 'squad.activity.idle')
  const avatarText = agent.isLead ? t('squad.role.leadGlyph') : String(agent.ordinal)
  const open = (): void => { onOpen(agent) }
  return (
    <div
      role="button"
      tabIndex={0}
      className={cx(
        css.card,
        agent.isLead && css.cardLead,
        agent.isCurrent && css.cardCurrent,
        hovered && css.cardHover,
        dimmed && css.cardDim,
      )}
      style={{ left: x - width / 2, top: y, width, '--squad-hue': squadHue(agent) } as CSSProperties}
      data-squad-agent={agent.id}
      data-squad-dim={dimmed ? '' : undefined}
      aria-label={[agent.label, activity, tokens, duration, steps,
        pressure === undefined ? '' : t('squad.pressure', { value: String(pressure) })]
        .filter(value => value !== '' && value !== undefined).join(' ')}
      onClick={open}
      onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
        if (event.key !== 'Enter' && event.key !== ' ') return
        event.preventDefault()
        open()
      }}
      onMouseEnter={() => { onHover(agent) }}
      onMouseLeave={() => { onHover(undefined) }}
      onFocus={() => { onHover(agent) }}
      onBlur={() => { onHover(undefined) }}
    >
      <div className={css.cardHead}>
        <span className={css.avatar} aria-hidden="true">{avatarText}</span>
        <span className={css.cardLabel} title={agent.label}>{agent.label}</span>
        <StateDot
          state={agent.activity === 'running' ? 'ongoing' : agent.activity === 'done' ? 'done' : 'idle'}
          size={9}
        />
        {agent.isCurrent && <span className={css.badge}>{t('squad.current')}</span>}
        {agent.isLead && !agent.isCurrent && <span className={cx(css.badge, css.badgeLead)}>{t('squad.lead')}</span>}
      </div>
      <div className={css.cardFacts} title={facts}>
        {facts === '' ? '—' : facts}
      </div>
      <div className={css.cardMetric}>
        <span className={css.cardTokens}>{tokens}</span>
      </div>
      <div className={css.bar} role="img" aria-label={pressure === undefined ? undefined : t('squad.pressure', { value: String(pressure) })}>
        {squadBarSegments(agent).map(segment => (
          <i
            key={segment.key}
            className={css.barSegment}
            data-squad-segment={segment.key}
            style={{ width: `${segment.share * 100}%` }}
          />
        ))}
      </div>
      <div className={css.cardMeta}>
        <span className={css.cardDuration}>{[duration, steps].filter(value => value !== undefined).join(' · ') || '—'}</span>
        {pressure === undefined
          ? null
          : (
            <span className={css.cardPct} data-squad-pct={pressure} style={{ color: pressureColor(pressure) }}>
              {t('squad.pressure', { value: String(pressure) })}
            </span>
          )}
      </div>
    </div>
  )
}

/** One parent-to-child edge, with the running flow overlay. */
function SquadEdge({ link, lit }: { link: SquadLink; lit: ReadonlySet<SessionId> | null }) {
  const color = BRANCH_HUES[Math.abs(link.hue) % BRANCH_HUES.length] as string
  const bend = Math.min(96, Math.max(24, (link.y2 - link.y1) * 0.5))
  const d = `M ${link.x1} ${link.y1} C ${link.x1} ${link.y1 + bend}, ${link.x2} ${link.y2 - bend}, ${link.x2} ${link.y2}`
  const on = lit !== null && lit.has(link.to)
  return (
    <g data-squad-edge={link.to} data-squad-lit={on ? '' : undefined}>
      <path className={link.running ? cx(css.link, css.linkLive) : css.link} d={d} stroke={color} fill="none" />
      {link.running && <path className={css.flow} d={d} stroke={color} fill="none" />}
      <circle className={css.joint} cx={link.x1} cy={link.y1} r={2} fill={color} />
      <circle className={css.joint} cx={link.x2} cy={link.y2} r={2.5} fill={color} />
    </g>
  )
}

/**
 * Draw the formation graph.
 * @param props - the conversation, the standing Session seats, hover links, navigation, and copy.
 * @returns the chips, legend, scrollable canvas, and the solo hint.
 */
/** Agents one mount may ask the Host about before the page is reopened. */
const REFRESH_LIMIT = 16

export function SquadFormation({
  sessionId, useSessions, useSessionStatus, hoveredOwner, onHoverOwner, openAgent, refreshAgent, t,
}: SquadFormationProps) {
  const [stageWidth, setStageWidth] = useState(0)
  const [hoveredId, setHoveredId] = useState<SessionId | null>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const requested = useRef<Set<SessionId>>(new Set())

  const { agents, team, counts } = useFormation({ sessionId, useSessions, useSessionStatus })
  const layout = useMemo(() => layoutSquad(agents, stageWidth), [agents, stageWidth])
  const ownerId = hoveredOwner === undefined ? undefined : squadOwnerOf(agents, hoveredOwner)
  const litId = hoveredId ?? ownerId ?? null
  const lit = litId === null ? null : squadNeighborhood(agents, litId)

  useEffect(() => {
    const stage = stageRef.current
    /* v8 ignore next -- the stage mounts with the effect that measures it. */
    if (stage === null) return
    const measure = (): void => { setStageWidth(stage.clientWidth) }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => { observer.disconnect() }
  }, [])

  // Summary-excluded facts (occupancy, composition) exist only in a Session's
  // own cell. Ask once per drawn child so its card is not blank; the Lead is
  // the open conversation and already has them.
  useEffect(() => {
    requested.current.clear()
  }, [sessionId])

  useEffect(() => {
    if (refreshAgent === undefined) return
    for (const agent of agents) {
      if (agent.isLead || agent.pressure !== undefined) continue
      if (requested.current.has(agent.id)) continue
      if (requested.current.size >= REFRESH_LIMIT) return
      requested.current.add(agent.id)
      refreshAgent(agent.id)
    }
  }, [agents, refreshAgent])

  const hover = (agent: SquadAgent | undefined): void => {
    setHoveredId(agent === undefined ? null : agent.id)
    onHoverOwner(agent?.label)
  }

  const open = (agent: SquadAgent): void => { openAgent(targetOf(agent)) }

  return (
    <div className={css.root} data-squad-formation>
      <div className={css.chips}>
        <span className={css.chip}>{t('squad.agents', { count: counts.agents })}</span>
        <span className={counts.running > 0 ? cx(css.chip, css.chipLive) : css.chip}>
          {t('squad.running', { count: counts.running })}
        </span>
        {counts.tokens > 0 && (
          <span className={css.chip}>
            {t('squad.tokens', { value: formatSquadTokens(counts.tokens, t) })}
          </span>
        )}
        {team !== undefined && (
          <span className={cx(css.chip, css.chipTeam)}>
            {t('squad.team', { members: counts.members, tasks: counts.tasks })}
          </span>
        )}
      </div>
      <div className={css.legend}>
        {(['system', 'tools', 'messages', 'free'] as const).map(key => (
          <span key={key} className={css.legendItem}>
            <i className={css.legendSwatch} data-squad-swatch={key} />
            {t(`squad.legend.${key}`)}
          </span>
        ))}
        <span className={css.legendItem}>
          <i className={css.legendDash} />
          {t('squad.legend.running')}
        </span>
      </div>
      <div ref={stageRef} className={css.stage} data-squad-stage>
        <div className={cx(css.canvas, lit !== null && css.focus)} style={{ width: layout.width, height: layout.height }}>
          <svg
            className={css.links}
            width={layout.width}
            height={layout.height}
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            aria-hidden="true"
          >
            {layout.links.map(link => <SquadEdge key={link.to} link={link} lit={lit} />)}
          </svg>
          {agents.map((agent) => {
            const point = layout.points.find(candidate => candidate.id === agent.id)
            /* v8 ignore next -- every drawn agent has a point. */
            if (point === undefined) return null
            return (
              <SquadCard
                key={agent.id}
                agent={agent}
                x={point.x}
                y={point.y}
                width={layout.cardW}
                hovered={litId === agent.id}
                dimmed={lit !== null && !lit.has(agent.id)}
                onHover={hover}
                onOpen={open}
                t={t}
              />
            )
          })}
        </div>
      </div>
      {agents.length === 1 && <p className={css.solo}>{t('squad.solo')}</p>}
    </div>
  )
}
