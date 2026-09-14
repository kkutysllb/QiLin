/** Trajectory graph view: the ledger drawn as a live node and edge flow. */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  IconChevronDownOutline14, IconCloseOutline16, IconFullscreenOutline16,
  IconPauseOutline16, IconPlayOutline16,
} from '@qilin/client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@qilin/client-ui-slots'
// Type-only: the 'sidebar.right.pane.tab' SlotMap row.
import type {} from '@qilin/client-ui-sidebar-right/client'
import type { TrajectoryKey, TrajectoryTranslate } from './locales.ts'
import { ellipsize, layoutTrajectoryGraph } from './trajectory-graph-layout.ts'
import {
  buildTrajectoryGraph, windowTrajectoryGraph, type TrajectoryGraphEdgeKind,
  type TrajectoryGraphNodeKind, type TrajectoryGraphNodeStatus, type TrajectoryLane,
  type TrajectoryTokens,
} from './trajectory-graph.ts'
import css from './TrajectoryGraphView.module.css'

/** Records kept in the render window; a session's ledger is unbounded. */
const RENDER_LIMIT = 400

/** The lanes in presentation order. */
const LANES: readonly TrajectoryLane[] = ['input', 'model', 'tool']

/** Localized name of each node kind. */
const KIND_KEY: Readonly<Record<TrajectoryGraphNodeKind, TrajectoryKey>> = {
  system: 'graph.node.system',
  user: 'graph.node.user',
  steering: 'graph.node.steering',
  context: 'graph.node.context',
  command: 'graph.node.command',
  request: 'graph.node.request',
  'compact-request': 'graph.node.compactionRequest',
  assistant: 'graph.node.assistant',
  partial: 'graph.node.streaming',
  tool: 'graph.node.tool',
  'running-call': 'graph.node.runningCall',
  compaction: 'graph.node.compaction',
  retry: 'graph.node.retryScheduled',
  error: 'graph.node.error',
  'max-tokens': 'graph.node.maxTokens',
  unknown: 'graph.node.unknown',
}

/** Localized name of each lane. */
const LANE_KEY: Readonly<Record<TrajectoryLane, TrajectoryKey>> = {
  input: 'graph.lane.input',
  model: 'graph.lane.model',
  tool: 'graph.lane.tool',
}

/** Swatch class of each lane; the sheet may name none. */
const LANE_CLASS: Readonly<Record<TrajectoryLane, string | undefined>> = {
  input: css.laneInput,
  model: css.laneModel,
  tool: css.laneTool,
}

/** Edge class of each chain kind; the sheet may name none. */
const EDGE_CLASS: Readonly<Record<TrajectoryGraphEdgeKind, string | undefined>> = {
  prompt: css.edgePrompt,
  result: css.edgeResult,
  dispatch: css.edgeDispatch,
  subcall: css.edgeSubcall,
  loop: css.edgeLoop,
}

/** Localized name of each node lifecycle. */
const STATUS_KEY: Readonly<Record<TrajectoryGraphNodeStatus, TrajectoryKey>> = {
  idle: 'graph.status.idle',
  running: 'graph.status.running',
  complete: 'status.completed',
  error: 'status.failed',
  interrupted: 'graph.status.interrupted',
}

/** Join the class names that are present; an absent sheet class joins as nothing. */
function cx(...parts: readonly (string | undefined | false)[]): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ')
}

/** Clock label of one record, in the reader's local time. */
function clockLabel(ms: number): string {
  const date = new Date(ms)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds())
}

/** Duration label, in the unit the value reads best in. */
function durationLabel(ms: number, t: TrajectoryTranslate): string {
  return ms < 1000
    ? t('unit.milliseconds', { value: Math.round(ms) })
    : t('unit.seconds', { value: (ms / 1000).toFixed(1) })
}

/** Total reported tokens of one record. */
function tokenTotal(tokens: TrajectoryTokens): number {
  return (tokens.input ?? 0) + (tokens.cacheRead ?? 0) + (tokens.cacheWrite ?? 0)
    + (tokens.output ?? 0) + (tokens.reasoning ?? 0)
}

/** The graph body's composed props: the Sidebar tab seat and the trajectory locale. */
export type TrajectoryGraphViewProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsLocale<'trajectory'>

/**
 * Render one session's trajectory ledger as a node and edge graph.
 * @param props - the Sidebar tab seat's runtime share and the trajectory locale.
 * @returns The graph body, or its empty and hint states.
 */
export function TrajectoryGraphView({ useTrajectory, t }: TrajectoryGraphViewProps): ReactNode {
  const snapshot = useTrajectory(value => value)
  const graph = useMemo(() => buildTrajectoryGraph(snapshot, t), [snapshot, t])
  const windowed = useMemo(() => windowTrajectoryGraph(graph, RENDER_LIMIT), [graph])
  const layout = useMemo(() => layoutTrajectoryGraph(windowed.graph), [windowed])
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const [fit, setFit] = useState(true)
  const [follow, setFollow] = useState(true)
  const [paused, setPaused] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const modelById = useMemo(
    () => new Map(windowed.graph.nodes.map(node => [node.id, node])),
    [windowed],
  )
  const selected = selectedId === null ? undefined : modelById.get(selectedId)
  /** The edge that delivered the selected record, so its delivery reads on the canvas. */
  const selectedEdgeId = selected === undefined
    ? null
    : windowed.graph.timeline.find(step => step.nodeId === selected.id)?.edgeId ?? null

  // Follow the tail: pin the canvas to the newest record as data lands.
  useEffect(() => {
    if (!follow) return
    const canvas = canvasRef.current
    if (canvas === null) return
    canvas.scrollTop = canvas.scrollHeight
  }, [follow, layout])

  const select = (id: string): void => {
    setSelectedId(current => (current === id ? null : id))
  }

  const selectionMeta = selected === undefined
    ? []
    : [
      t('graph.sequence') + ' ' + selected.seq,
      t('graph.time') + ' ' + (selected.time > 0 ? clockLabel(selected.time) : t('graph.unrecorded')),
      ...(selected.durationMs === undefined
        ? []
        : [t('graph.duration') + ' ' + durationLabel(selected.durationMs, t)]),
      ...(selected.tokens === undefined
        ? []
        : [t('graph.tokens') + ' ' + t('unit.tokens', { value: tokenTotal(selected.tokens) })]),
    ]

  return (
    <div className={cx(css.root, paused && css.paused)}>
      <div className={css.toolbar} role="toolbar" aria-label={t('graph.toolbar')}>
        <button
          type="button"
          className={css.tool}
          aria-pressed={fit}
          aria-label={t('graph.fit')}
          title={t('graph.fit')}
          onClick={() => { setFit(value => !value) }}
        >
          <IconFullscreenOutline16 size={14} />
        </button>
        <button
          type="button"
          className={css.tool}
          aria-pressed={follow}
          aria-label={t('graph.follow')}
          title={t('graph.follow')}
          onClick={() => { setFollow(value => !value) }}
        >
          <IconChevronDownOutline14 size={14} />
        </button>
        <button
          type="button"
          className={css.tool}
          aria-pressed={paused}
          aria-label={t(paused ? 'graph.resume' : 'graph.pause')}
          title={t(paused ? 'graph.resume' : 'graph.pause')}
          onClick={() => { setPaused(value => !value) }}
        >
          {paused ? <IconPlayOutline16 size={14} /> : <IconPauseOutline16 size={14} />}
        </button>
        <span className={css.spacer} />
        <span className={css.stat}>{t('graph.stats.nodes', { count: windowed.graph.stats.nodes })}</span>
        <span className={css.stat}>{t('graph.stats.edges', { count: windowed.graph.stats.edges })}</span>
        <span className={css.stat}>{t('graph.stats.turns', { count: windowed.graph.stats.turns })}</span>
        <span className={css.stat}>{t('graph.stats.tokens', { count: tokenTotal(windowed.graph.stats.tokens) })}</span>
        {graph.live && <span className={css.liveDot} aria-hidden="true" />}
      </div>
      <div className={css.legend}>
        {LANES.map(lane => (
          <span key={lane} className={css.legendItem}>
            <span className={cx(css.legendDot, LANE_CLASS[lane])} aria-hidden="true" />
            {t(LANE_KEY[lane])}
          </span>
        ))}
      </div>
      {windowed.graph.nodes.length === 0
        ? <div className={css.empty}>{t('graph.empty')}</div>
        : (
          <>
            <div ref={canvasRef} className={css.canvas}>
              <svg
                className={cx(fit ? css.svgFit : css.svg)}
                width={layout.width}
                height={layout.height}
                viewBox={'0 0 ' + layout.width + ' ' + layout.height}
                role="img"
                aria-label={t('graph.canvas')}
              >
                {layout.bands.map(band => (band.turn === null ? null : (
                  <g key={'band:' + band.turn + ':' + band.from}>
                    <rect
                      className={css.band}
                      x={0}
                      y={band.y}
                      width={layout.width}
                      height={band.height}
                      rx={6}
                    />
                    <text className={css.bandLabel} x={8} y={band.y + 14}>
                      {t('turn.label', { turn: band.turn })}
                    </text>
                  </g>
                )))}
                {layout.edges.map(edge => (
                  <path
                    key={edge.id}
                    className={cx(
                      css.edge,
                      EDGE_CLASS[edge.kind],
                      edge.live && css.edgeLive,
                      edge.id === selectedEdgeId && css.edgeSelected,
                    )}
                    d={edge.d}
                  />
                ))}
                {layout.nodes.map((laid) => {
                  const node = laid.node
                  const badge = node.badge
                  return (
                    <g
                      key={node.id}
                      className={cx(
                        css.node,
                        node.live && css.nodeLive,
                        node.id === selectedId && css.nodeSelected,
                      )}
                      data-kind={node.kind}
                      transform={'translate(' + laid.x + ' ' + laid.y + ')'}
                      role="button"
                      tabIndex={0}
                      aria-label={t('graph.nodeAria', {
                        kind: t(KIND_KEY[node.kind]),
                        label: node.label,
                      })}
                      onClick={() => { select(node.id) }}
                      onKeyDown={(event) => {
                        if (event.key !== 'Enter' && event.key !== ' ') return
                        event.preventDefault()
                        select(node.id)
                      }}
                    >
                      <rect className={css.nodeRect} width={laid.w} height={laid.h} rx={7} />
                      <rect className={css.nodeAccent} width={3} height={laid.h} rx={1.5} />
                      <text
                        className={css.nodeLabel}
                        x={10}
                        y={badge === undefined ? laid.h / 2 + 4 : laid.h / 2 - 1}
                      >
                        {ellipsize(node.label, laid.w - 18, 11)}
                      </text>
                      {badge !== undefined && (
                        <text className={css.nodeBadge} x={10} y={laid.h / 2 + 11}>
                          {ellipsize(badge, laid.w - 18, 9)}
                        </text>
                      )}
                    </g>
                  )
                })}
              </svg>
            </div>
            {windowed.hidden > 0 && (
              <div className={css.note}>{t('graph.windowed', { count: windowed.hidden })}</div>
            )}
            {selected === undefined ? (
              <div className={css.note}>{t('graph.hint')}</div>
            ) : (
              <div className={css.inspector}>
                <div className={css.inspectorHead}>
                  <span className={css.inspectorKind}>{t(KIND_KEY[selected.kind])}</span>
                  <span className={css.inspectorLane}>{t(LANE_KEY[selected.lane])}</span>
                  <span className={css.inspectorStatus} data-status={selected.status}>
                    {t(STATUS_KEY[selected.status])}
                  </span>
                  {selected.live && <span className={css.liveDot} aria-hidden="true" />}
                  <span className={css.spacer} />
                  <button
                    type="button"
                    className={css.tool}
                    aria-label={t('graph.closeDetails')}
                    title={t('graph.closeDetails')}
                    onClick={() => { setSelectedId(null) }}
                  >
                    <IconCloseOutline16 size={14} />
                  </button>
                </div>
                <div className={css.inspectorMeta}>{selectionMeta.join(' · ')}</div>
                {selected.args === undefined ? null : (
                  <div className={css.inspectorSection}>
                    <span className={css.inspectorLabel}>{t('graph.parameters')}</span>
                    <pre className={css.inspectorBody}>{selected.args}</pre>
                  </div>
                )}
                {selected.result === undefined ? null : (
                  <div className={css.inspectorSection}>
                    <span className={css.inspectorLabel}>{t('graph.result')}</span>
                    <pre className={css.inspectorBody}>{selected.result}</pre>
                  </div>
                )}
                {selected.detail === undefined ? null : (
                  <div className={css.inspectorSection}>
                    <pre className={css.inspectorBody}>{selected.detail}</pre>
                  </div>
                )}
              </div>
            )}
          </>
        )}
    </div>
  )
}
