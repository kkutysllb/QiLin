/**
 * Formation arithmetic for the squad chip and the Team page's formation graph:
 * which agents belong to one conversation's family, the tidy-tree geometry the
 * graph draws, and the aggregate facts the chip states.
 *
 * Pure over Session list rows, Session projections, and live Session statuses:
 * no React, no services, no stores.
 */
import type { SessionListState, SessionSummary } from '@qilin-agent/api-session-controller/client'
import type { SessionStatusSnapshot } from '@qilin-agent/client-ui-session/client'
import type { SessionId } from '@qilin-agent/session/types'
import type { AgentMessageRecord, TeamProjection } from '@qilin-agent/agent-team/client'
import type {} from '@qilin-agent/token-meter/client'
import type { TurnStats } from '@qilin-agent/session-turn-outline/types'
import type { TranslateNS } from '@qilin-agent/client-ui-slots'
import type { NS } from './locales.ts'

/** Per-agent turn activity; `done` needs the child's last turn to have completed. */
export type SquadActivity = 'running' | 'done' | 'idle'

/** One durable child creation mode, mirrored from the catalog row. */
export type SquadMode = 'one-shot' | 'continuable' | 'unknown' | 'external'

/** The three heuristic composition buckets a card bar draws. */
export interface SquadBreakdown {
  readonly systemTokens: number
  readonly toolsTokens: number
  readonly messageTokens: number
}

/** One agent drawn in the formation. */
export interface SquadAgent {
  readonly id: SessionId
  readonly label: string
  readonly parentId?: SessionId
  /** Depth from the family root; the root is 0. */
  readonly depth: number
  /** Top-level branch index; the root keeps -1 and is drawn as the Lead. */
  readonly family: number
  /** Display ordinal: 0 for the Lead, 1-based sibling position for every child. */
  readonly ordinal: number
  readonly activity: SquadActivity
  readonly mode?: SquadMode
  /** The conversation currently on screen. */
  readonly isCurrent: boolean
  /** The family root this conversation delegates from. */
  readonly isLead: boolean
  readonly model?: string
  readonly tokens?: number
  /** Active-turn milliseconds as of the last folded projection cut. */
  readonly durationMs?: number
  /** Whole-log step and turn totals, when the turn-stats projection is composed. */
  readonly totals?: SquadTotals
  /** Inbound peer messages this agent received, when the messages projection is composed. */
  readonly messages?: readonly AgentMessageRecord[]
  /** Durable delegation time from the parent's catalog, when the row carries one. */
  readonly createdAt?: number
  /** Latest durable activity time from the Session summary. */
  readonly updatedAt?: number
  /** Context occupancy in whole percent, when both the pressure and the window are known. */
  readonly pressure?: number
  /** Heuristic composition of the next request, when the meter has reported one. */
  readonly breakdown?: SquadBreakdown
}

/** Everything the family is read from. */
export interface SquadInput {
  readonly byId: Readonly<Record<SessionId, SessionSummary>>
  readonly projections: SessionListState['projectionsBySession']
  readonly statuses: SessionStatusSnapshot
  readonly sessionId: SessionId
}

/** Counts the chip and the page headline state. */
export interface SquadCounts {
  readonly agents: number
  readonly running: number
  readonly tokens: number
  readonly members: number
  readonly tasks: number
}

/** One placed agent card. */
export interface SquadPoint {
  readonly id: SessionId
  readonly x: number
  readonly y: number
}

/** One parent-to-child edge drawn behind the cards. */
export interface SquadLink {
  readonly to: SessionId
  readonly running: boolean
  /** Hue index of the child, so an edge carries its branch colour. */
  readonly hue: number
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
}

/** Absolute geometry of the formation canvas. */
export interface SquadLayout {
  readonly width: number
  readonly height: number
  readonly cardW: number
  readonly points: readonly SquadPoint[]
  readonly links: readonly SquadLink[]
}

/** One delegation row of the collaboration timeline. */
export interface DelegationRow {
  readonly agent: SquadAgent
  readonly parentLabel: string
  readonly time: number
}

/** One row of the collaboration timeline: a delegation or one peer message. */
export type CollaborationEvent = {
  /** Stable row identity: the delegation target or the message id. */
  readonly id: string
  readonly time: number
  readonly senderLabel: string
  /** The agent the row is about; its activity dot and label come from here. */
  readonly target: SquadAgent
} & (
  | { readonly kind: 'delegation' }
  | { readonly kind: 'message'; readonly text: string }
)

/** One share of a card's occupancy bar. */
export interface SquadBarSegment {
  readonly key: 'system' | 'tools' | 'messages' | 'free'
  readonly share: number
}

/** Card height, shared with the stylesheet through the `--squad-card-h` custom property. */
export const SQUAD_CARD_H = 112
const LEVEL_GAP = 56
const SLOT_MIN = 176
const SLOT_MAX = 320
const SLOT_GUTTER = 12
const PAD_Y = 6
/** The graph's inner width before its stage has been measured. */
export const SQUAD_STAGE_FALLBACK_WIDTH = 560

/**
 * The family root one Session belongs to, walking the durable parent chain.
 * @param byId - Session rows the page holds.
 * @param sessionId - the Session to resolve.
 * @returns the furthest reachable ancestor, or the Session itself.
 */
export function squadLeadOf(
  byId: Readonly<Record<SessionId, SessionSummary>>,
  sessionId: SessionId,
): SessionId {
  let cursor: SessionId = sessionId
  const seen = new Set<SessionId>([cursor])
  for (;;) {
    const parentId = byId[cursor]?.parentId
    if (parentId === undefined || seen.has(parentId) || byId[parentId] === undefined) return cursor
    seen.add(parentId)
    cursor = parentId
  }
}

type ProjectionValues = SessionListState['projectionsBySession'][SessionId]['values']

/** Sum the four disjoint durable provider-usage buckets. */
function tokenTotal(usage: ProjectionValues['tokenUsage']): number | undefined {
  if (usage === undefined) return undefined
  return usage.uncachedInputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
}

/** Active-turn milliseconds as of the projection cut, or undefined before any turn. */
function durationOf(timing: ProjectionValues['subagentTiming']): number | undefined {
  if (timing === undefined) return undefined
  const open = timing.active === undefined
    ? 0
    : Math.max(0, timing.active.through - timing.active.since)
  const total = timing.settledMs + open
  return total > 0 ? total : undefined
}

/** Whole-percent context occupancy, only when both the pressure and the window are known. */
function pressureOf(pressure: ProjectionValues['contextPressure']): number | undefined {
  if (pressure === undefined) return undefined
  const tokens = pressure.projectedTokens ?? pressure.pressureTokens
  const window = pressure.contextWindow
  if (tokens === undefined || window === undefined || window <= 0) return undefined
  return Math.min(100, Math.round((tokens / window) * 100))
}

/** Whole-log step and turn totals one card and one timeline row state. */
export type SquadTotals = TurnStats

/** The ordering facts of one direct child. */
interface ChildRow {
  readonly id: SessionId
  readonly running: boolean
  readonly updatedAt: number
}

/** Direct children of every Session, from the durable parent links. */
function childrenByParent(byId: Readonly<Record<SessionId, SessionSummary>>): Map<SessionId, ChildRow[]> {
  const children = new Map<SessionId, ChildRow[]>()
  for (const summary of Object.values(byId)) {
    if (summary.parentId === undefined) continue
    const kids = children.get(summary.parentId) ?? []
    kids.push({ id: summary.id, running: summary.running, updatedAt: summary.updatedAt })
    children.set(summary.parentId, kids)
  }
  return children
}

/**
 * Order one parent's children: the durable catalog order wins because it is the
 * order the delegation actually happened in; rows the catalog does not know yet
 * follow, running first and then by their latest activity.
 */
function orderedChildren(
  parentId: SessionId,
  children: ReadonlyMap<SessionId, ChildRow[]>,
  projections: SquadInput['projections'],
): SessionId[] {
  const catalog = projections[parentId]?.values.subagentCatalog ?? []
  const known = catalog.map(entry => entry.id)
  const listed = new Set(known)
  const extra = (children.get(parentId) ?? [])
    .filter(kid => !listed.has(kid.id))
    .sort((left, right) => Number(right.running) - Number(left.running)
      || right.updatedAt - left.updatedAt
      || (left.id < right.id ? -1 : 1))
    .map(kid => kid.id)
  return [...known, ...extra]
}

/**
 * Collect one conversation's agent family, root first.
 * @param input - Session rows, projections, live statuses, and the viewed Session.
 * @returns the root and every reachable descendant in depth-first catalog order.
 */
export function squadAgentsOf(input: SquadInput): SquadAgent[] {
  const { byId, projections, statuses, sessionId } = input
  const lead = squadLeadOf(byId, sessionId)
  const children = childrenByParent(byId)
  const agents: SquadAgent[] = []
  const seen = new Set<SessionId>()

  const visit = (
    id: SessionId,
    parentId: SessionId | undefined,
    depth: number,
    family: number,
    ordinal: number,
  ): void => {
    if (seen.has(id)) return
    seen.add(id)
    const summary = byId[id]
    if (summary !== undefined && summary.blank && !summary.running && id !== lead) return
    // A Session summary carries every summary projection; the per-Session cell
    // adds the summary-excluded ones once the page has read that Session.
    const values: ProjectionValues = {
      ...byId[id]?.projectionValues,
      ...projections[id]?.values,
    }
    const catalogEntry = parentId === undefined
      ? undefined
      : projections[parentId]?.values.subagentCatalog?.find(entry => entry.id === id)
    const identity = values.subagent
    const running = statuses.get(id)?.running ?? summary?.running ?? false
    const completed = !running && values.subagentTiming?.lastTurnCompleted === true
    const label = catalogEntry?.label
      ?? identity?.label
      ?? summary?.title
      ?? summary?.displayTitle
      ?? id
    const mode = catalogEntry?.mode ?? identity?.mode
    const tokens = tokenTotal(values.tokenUsage)
    const durationMs = durationOf(values.subagentTiming)
    const pressure = pressureOf(values.contextPressure)
    const model = values.modelSelection?.next?.model
    const breakdown = values.contextBreakdown
    const stats: SquadTotals | undefined = values.turnStats
    const messages = values.agentMessages?.messages
    agents.push({
      id,
      label,
      ...(parentId === undefined ? {} : { parentId }),
      depth,
      family,
      ordinal,
      activity: running ? 'running' : completed ? 'done' : 'idle',
      ...(mode === undefined ? {} : { mode }),
      isCurrent: id === sessionId,
      isLead: id === lead,
      ...(model === undefined ? {} : { model }),
      ...(tokens === undefined ? {} : { tokens }),
      ...(durationMs === undefined ? {} : { durationMs }),
      ...(pressure === undefined ? {} : { pressure }),
      ...(stats === undefined ? {} : { totals: stats }),
      ...(messages === undefined ? {} : { messages }),
      ...(catalogEntry?.createdAt === undefined ? {} : { createdAt: catalogEntry.createdAt }),
      ...(summary?.updatedAt === undefined ? {} : { updatedAt: summary.updatedAt }),
      ...(breakdown === undefined
        ? {}
        : {
          breakdown: {
            systemTokens: breakdown.systemTokens,
            toolsTokens: breakdown.toolsTokens,
            messageTokens: breakdown.messageTokens,
          },
        }),
    })
    orderedChildren(id, children, projections).forEach((childId, index) => {
      visit(childId, id, depth + 1, depth === 0 ? index : family, index + 1)
    })
  }

  visit(lead, undefined, 0, -1, 0)
  return agents
}

/**
 * Aggregate the formation and its Team for the chip and the page headline.
 * @param agents - the formation as drawn.
 * @param team - the Lead's durable Team projection, when it has one.
 * @returns agent, running, token, member, and task totals.
 */
export function squadCounts(agents: readonly SquadAgent[], team: TeamProjection | undefined): SquadCounts {
  let running = 0
  let tokens = 0
  for (const agent of agents) {
    if (agent.activity === 'running') running += 1
    tokens += agent.tokens ?? 0
  }
  return {
    agents: agents.length,
    running,
    tokens,
    members: team?.members.length ?? 0,
    tasks: team?.tasks.length ?? 0,
  }
}

/**
 * The agent plus its parent and children: the neighbourhood a hover keeps lit.
 * @param agents - the formation as drawn.
 * @param id - the hovered agent.
 * @returns the identities that stay lit.
 */
export function squadNeighborhood(agents: readonly SquadAgent[], id: SessionId): ReadonlySet<SessionId> {
  const related = new Set<SessionId>([id])
  for (const agent of agents) {
    if (agent.parentId === id) related.add(agent.id)
    if (agent.id === id && agent.parentId !== undefined) related.add(agent.parentId)
  }
  return related
}

/**
 * The agent a shared task names as its owner, so a board row can light its own card.
 * @param agents - the formation as drawn.
 * @param ownerName - the task's owner display name.
 * @returns the owning agent identity, when one matches.
 */
export function squadOwnerOf(agents: readonly SquadAgent[], ownerName: string): SessionId | undefined {
  return agents.find(agent => agent.label === ownerName)?.id
}

/**
 * Split one card's occupancy into the composition buckets the meter reported and
 * the free remainder. Without a reported composition the used share stays one
 * bucket, so the bar still reads as occupancy instead of an empty track.
 * @param agent - the agent whose bar is drawn.
 * @returns shares that sum to 1, in draw order.
 */
export function squadBarSegments(agent: SquadAgent): readonly SquadBarSegment[] {
  const used = Math.min(100, Math.max(0, agent.pressure ?? 0)) / 100
  const parts = agent.breakdown
  const total = parts === undefined ? 0 : parts.systemTokens + parts.toolsTokens + parts.messageTokens
  const segments: SquadBarSegment[] = []
  let drawn = 0
  if (total > 0 && parts !== undefined) {
    const buckets: readonly [SquadBarSegment['key'], number][] = [
      ['system', parts.systemTokens],
      ['tools', parts.toolsTokens],
      ['messages', parts.messageTokens],
    ]
    for (const [key, value] of buckets) {
      if (value <= 0) continue
      const share = (value / total) * used
      segments.push({ key, share })
      drawn += share
    }
  } else if (used > 0) {
    segments.push({ key: 'messages', share: used })
    drawn = used
  }
  if (drawn < 1) segments.push({ key: 'free', share: 1 - drawn })
  return segments
}

/**
 * The durable delegation facts the timeline draws, newest first. A row needs a
 * parent and a time: the parent's catalog records when the child was delegated,
 * and a row the catalog has not recorded yet falls back to its latest activity.
 * @param agents - the formation as drawn.
 * @returns one row per delegated agent, newest first.
 */
export function delegationRows(agents: readonly SquadAgent[]): readonly DelegationRow[] {
  const byId = new Map(agents.map(agent => [agent.id, agent]))
  const rows: DelegationRow[] = []
  for (const agent of agents) {
    if (agent.parentId === undefined) continue
    const time = agent.createdAt ?? agent.updatedAt
    if (time === undefined) continue
    rows.push({ agent, parentLabel: byId.get(agent.parentId)?.label ?? agent.parentId, time })
  }
  return rows.sort((left, right) => right.time - left.time
    || (left.agent.id < right.agent.id ? -1 : 1))
}

/**
 * Merge the delegations and the inbound peer messages into one newest-first
 * timeline. Delegations come from durable catalog facts; messages come from
 * each recipient's own `agentMessages` projection, so a message and the row
 * that carried it share the receiving log's clock.
 * @param agents - the formation as drawn.
 * @returns the merged rows, newest first.
 */
export function collaborationEvents(agents: readonly SquadAgent[]): readonly CollaborationEvent[] {
  const labelOf = new Map(agents.map(agent => [agent.id, agent.label]))
  const events: CollaborationEvent[] = []
  for (const row of delegationRows(agents)) {
    events.push({
      id: `delegation:${row.agent.id}`,
      time: row.time,
      kind: 'delegation',
      senderLabel: row.parentLabel,
      target: row.agent,
    })
  }
  for (const agent of agents) {
    for (const message of agent.messages ?? []) {
      events.push({
        id: `message:${message.id}`,
        time: message.time,
        kind: 'message',
        senderLabel: message.senderName ?? labelOf.get(message.senderId) ?? message.senderId,
        target: agent,
        text: message.text,
      })
    }
  }
  return events.sort((left, right) => right.time - left.time
    || (left.id < right.id ? -1 : 1))
}

/**
 * Format one row's local clock time.
 * @param ms - epoch milliseconds.
 * @returns the hour and minute in the browser's zone.
 */
export function formatSquadClock(ms: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(new Date(ms))
}

/** The edges one placement implies: a parent's bottom edge to each child's top edge. */
function linksOf(agents: readonly SquadAgent[], points: readonly SquadPoint[]): SquadLink[] {
  const pointOf = new Map(points.map(point => [point.id, point]))
  const links: SquadLink[] = []
  for (const agent of agents) {
    if (agent.parentId === undefined) continue
    // The DFS emits a parent before its children, so both points exist.
    const from = pointOf.get(agent.parentId) as SquadPoint
    const to = pointOf.get(agent.id) as SquadPoint
    links.push({
      to: agent.id,
      running: agent.activity === 'running',
      hue: agent.family,
      x1: from.x,
      y1: from.y + SQUAD_CARD_H,
      x2: to.x,
      y2: to.y,
    })
  }
  return links
}

/**
 * Lay the formation out for the measured stage width. Leaves take slots on one
 * row per depth level and each parent centers over its children; when the leaves
 * outgrow one row, levels pack into bands instead of overflowing sideways.
 * @param agents - the formation, root first.
 * @param stageWidth - measured stage width in CSS pixels.
 * @returns canvas width, height, card width, card origins, and edges.
 */
export function layoutSquad(agents: readonly SquadAgent[], stageWidth: number): SquadLayout {
  const width = stageWidth > 0 ? stageWidth : SQUAD_STAGE_FALLBACK_WIDTH
  const childrenOf = new Map<SessionId, SquadAgent[]>()
  for (const agent of agents) {
    if (agent.parentId === undefined) continue
    const kids = childrenOf.get(agent.parentId) ?? []
    kids.push(agent)
    childrenOf.set(agent.parentId, kids)
  }
  const slotOf = new Map<SessionId, number>()
  let leaves = 0
  const place = (agent: SquadAgent): number => {
    const kids = childrenOf.get(agent.id) ?? []
    if (kids.length === 0) {
      const slot = leaves
      leaves += 1
      slotOf.set(agent.id, slot)
      return slot
    }
    const first = place(kids[0] as SquadAgent)
    let last = first
    for (const kid of kids.slice(1)) last = place(kid)
    const slot = (first + last) / 2
    slotOf.set(agent.id, slot)
    return slot
  }
  const root = agents[0]
  if (root !== undefined) place(root)
  const leafCount = Math.max(1, leaves)
  const levelH = SQUAD_CARD_H + LEVEL_GAP
  const perLevel = stageWidth > 0 ? Math.max(1, Math.floor(width / SLOT_MIN)) : 0

  if (perLevel > 0 && leafCount > perLevel) {
    const bandSlot = Math.max(SLOT_MIN, Math.min(SLOT_MAX, width / perLevel))
    const canvasWidth = Math.max(width, bandSlot * perLevel)
    const points: SquadPoint[] = []
    let row = 0
    const emit = (band: readonly SquadAgent[], depth: number): void => {
      const inset = (canvasWidth - band.length * bandSlot) / 2
      band.forEach((agent, index) => {
        points.push({ id: agent.id, x: inset + (index + 0.5) * bandSlot, y: PAD_Y + row * levelH })
      })
      row += 1
      let next: SquadAgent[] = []
      const flush = (): void => {
        if (next.length === 0) return
        const packed = next
        next = []
        emit(packed, depth + 1)
      }
      for (const agent of band) {
        const kids = childrenOf.get(agent.id) ?? []
        for (let start = 0; start < kids.length; start += perLevel) {
          const group = kids.slice(start, start + perLevel)
          if (next.length + group.length > perLevel) flush()
          next.push(...group)
          if (next.length === perLevel) flush()
        }
      }
      flush()
    }
    emit([root as SquadAgent], 0)
    return {
      width: canvasWidth,
      height: PAD_Y + Math.max(0, row - 1) * levelH + SQUAD_CARD_H + 16,
      cardW: bandSlot - SLOT_GUTTER,
      points,
      links: linksOf(agents, points),
    }
  }

  const slot = Math.min(SLOT_MAX, Math.max(SLOT_MIN, width / leafCount))
  const cardW = slot - SLOT_GUTTER
  const points = agents.map(agent => ({
    id: agent.id,
    x: ((slotOf.get(agent.id) as number) + 0.5) * slot,
    y: PAD_Y + agent.depth * levelH,
  }))
  const depth = agents.reduce((max, agent) => Math.max(max, agent.depth), 0)
  return {
    width: leafCount * slot,
    height: PAD_Y + depth * levelH + SQUAD_CARD_H + 16,
    cardW,
    points,
    links: linksOf(agents, points),
  }
}

/**
 * Abbreviate one token count for a card or chip.
 * @param value - exact token total.
 * @param t - namespace-bound translate carrying the thousand and million templates.
 * @returns the compact count.
 */
export function formatSquadTokens(value: number, t: TranslateNS<typeof NS>): string {
  const scaled = (next: number): string => (next >= 100 ? String(Math.round(next)) : String(Math.round(next * 10) / 10))
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return t('squad.tokens.thousand', { value: scaled(value / 1_000) })
  return t('squad.tokens.million', { value: scaled(value / 1_000_000) })
}

/**
 * Format one active-turn duration with decreasing precision at larger scales.
 * @param ms - active-turn milliseconds.
 * @param t - namespace-bound translate carrying the duration templates.
 * @returns the compact duration.
 */
export function formatSquadDuration(ms: number, t: TranslateNS<typeof NS>): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1_000)
  const minutes = Math.floor(totalSeconds / 60)
  const hours = Math.floor(minutes / 60)
  if (hours > 0) {
    return t('squad.duration.hours', { hours: String(hours), minutes: String(minutes % 60).padStart(2, '0') })
  }
  if (minutes > 0) {
    return t('squad.duration.minutes', { minutes: String(minutes), seconds: String(totalSeconds % 60).padStart(2, '0') })
  }
  return t('squad.duration.seconds', { seconds: String(totalSeconds) })
}
