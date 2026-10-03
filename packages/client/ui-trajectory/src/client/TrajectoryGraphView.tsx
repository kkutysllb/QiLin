/**
 * Trajectory graph view: the ledger drawn as a live node and edge flow, with
 * the ledger-order replay, record search, the edge-kind legend, canvas zoom
 * and pan, and the structured record inspector.
 *
 * Motion is data-driven, not decorative: a record that is still moving pulses
 * and every edge that delivers data into it carries a dashed flow, while the
 * replay control walks the ledger in the order the events actually happened —
 * pacing each hop by the recorded timestamps (clamped, so a 30-second tool
 * call does not freeze the replay), dimming the records the cursor has not
 * reached, and flying one packet per hop along the hop's real edge path
 * (`<animateMotion path>`).
 */
import { useEffect, useMemo, useRef, useState,
  type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import {
  IconChevronDownOutline14, IconCloseOutline16, IconFullscreenOutline16,
  IconGaugeOutline16, IconPaperclipOutline16, IconPauseOutline16, IconPlayOutline16, IconStopFill16,
  ImageLightbox, MarkdownText,
} from '@qilin/client-ui-primitives'
import type { ImageLightboxLabels } from '@qilin/client-ui-primitives'
import type { MessageImageLoader } from '@qilin/client-ui-conversation/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@qilin/client-ui-slots'
// Type-only: the 'sidebar.right.pane.tab' SlotMap row.
import type {} from '@qilin/client-ui-sidebar-right/client'
import type { TrajectoryKey, TrajectoryTranslate } from './locales.ts'
import {
  ZOOM_MAX, ZOOM_MIN, ZOOM_WHEEL_STEP, anchoredScroll, clamp, hopDelay, nextSpeed,
  zoomedBy,
} from './trajectory-graph-canvas.ts'
import { attachmentPresentation, prettyJson } from './trajectory-graph-inspector.ts'
import { ellipsize, layoutTrajectoryGraph, type LaidOutGraphNode } from './trajectory-graph-layout.ts'
import {
  buildTrajectoryGraph, searchTrajectoryNodes, slowestTools, windowTrajectoryGraph,
  type TrajectoryAttachment, type TrajectoryGraphEdgeKind,
  type TrajectoryGraphNodeKind, type TrajectoryGraphNodeStatus, type TrajectoryLane,
  type TrajectoryToolDetail, type TrajectoryTokens,
} from './trajectory-graph.ts'
import css from './TrajectoryGraphView.module.css'

/** Records kept in the render window; a session's ledger is unbounded. */
const RENDER_LIMIT = 400

/** Leaders the slowest-tools statistic ranks. */
const SLOWEST_LIMIT = 3

/** The lanes in presentation order. */
const LANES: readonly TrajectoryLane[] = ['input', 'model', 'tool']

/** The edge kinds in legend order. */
const EDGE_KINDS: readonly TrajectoryGraphEdgeKind[] = ['prompt', 'result', 'dispatch', 'subcall', 'loop']

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

/** Localized name of each edge kind. */
const EDGE_KEY: Readonly<Record<TrajectoryGraphEdgeKind, TrajectoryKey>> = {
  prompt: 'graph.edge.prompt',
  result: 'graph.edge.result',
  dispatch: 'graph.edge.dispatch',
  subcall: 'graph.edge.subcall',
  loop: 'graph.edge.loop',
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

/** The token-bucket breakdown one record or the session total reports. */
function tokenBreakdown(tokens: TrajectoryTokens, t: TrajectoryTranslate): readonly string[] {
  const parts: string[] = []
  if (tokens.input !== undefined) parts.push(`${t('usage.input')} ${tokens.input}`)
  if (tokens.cacheRead !== undefined) parts.push(`${t('usage.cached')} ${tokens.cacheRead}`)
  if (tokens.cacheWrite !== undefined) parts.push(`${t('usage.cacheCreated')} ${tokens.cacheWrite}`)
  if (tokens.output !== undefined) parts.push(`${t('usage.output')} ${tokens.output}`)
  if (tokens.reasoning !== undefined) parts.push(`${t('usage.reasoning')} ${tokens.reasoning}`)
  return parts
}

/** Image and file counts of one attachment list. */
function attachmentCounts(attachments: readonly TrajectoryAttachment[]): { images: number; files: number } {
  let images = 0
  let files = 0
  for (const attachment of attachments) {
    if (attachment.kind === 'image') images += 1
    else files += 1
  }
  return { images, files }
}

/** The structural image reference the authorized loader keys on. */
function imageRefOf(attachment: TrajectoryAttachment): Parameters<MessageImageLoader>[0] {
  return {
    attachmentId: attachment.attachmentId,
    ...(attachment.mediaType === undefined ? {} : { mediaType: attachment.mediaType }),
    ...(attachment.bytes === undefined ? {} : { bytes: attachment.bytes }),
    ...(attachment.width === undefined ? {} : { width: attachment.width }),
    ...(attachment.height === undefined ? {} : { height: attachment.height }),
    ...(attachment.name === undefined ? {} : { name: attachment.name }),
  } as Parameters<MessageImageLoader>[0]
}

/**
 * The chip's attachment count pills: one per non-zero kind (images tinted,
 * files neutral), tucked into the chip's top-right corner. The pill width
 * tracks the digit count; the tooltip carries the kind breakdown. The caller
 * renders the pills only when the record carries at least one attachment.
 */
function attachmentCountPills(
  attachments: readonly TrajectoryAttachment[],
  chipWidth: number,
  t: TrajectoryTranslate,
): ReactNode {
  const { images, files } = attachmentCounts(attachments)
  const pills: { key: string; count: number; className: string | undefined }[] = []
  if (images > 0) pills.push({ key: 'img', count: images, className: css.nodeCountImg })
  if (files > 0) pills.push({ key: 'file', count: files, className: css.nodeCountFile })
  const widths = pills.map(pill => 9 + String(pill.count).length * 5.5)
  const total = widths.reduce((sum, width) => sum + width, 0) + (pills.length - 1) * 3
  let x = chipWidth - total - 4
  return (
    <g>
      {pills.map((pill, index) => {
        const width = widths[index] ?? 0
        const left = x
        x += width + 3
        return (
          <g key={pill.key}>
            <rect className={pill.className} x={left} y={2} width={width} height={9} rx={4.5} />
            <text className={css.nodeCountText} x={left + width / 2} y={9.2} textAnchor="middle">{pill.count}</text>
          </g>
        )
      })}
      <title>{t('graph.attachment.counts', { images, files })}</title>
    </g>
  )
}

/** One replay session's cursor. */
interface ReplayState {
  /** How many ledger records are lit. */
  index: number
  playing: boolean
  speed: number
}

/** Session-bound image loader injected beside the trajectory locale seat. */
export interface TrajectoryGraphViewInjected {
  /** Session-authorized image URL loader with its synchronous cache read. */
  loadImage: MessageImageLoader
  /** Reveal the ledger page this graph draws, in the same pane. */
  openLedger: () => void
}

/** The graph body's composed props: the Sidebar tab seat, its image loader, the ledger control, and the trajectory locale. */
export type TrajectoryGraphViewProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & InjectFace<TrajectoryGraphViewInjected>
  & PropsLocale<'trajectory'>

/**
 * Render one session's trajectory ledger as a node and edge graph.
 * @param props - the Sidebar tab seat's runtime share, the authorized image
 * loader, the ledger control, and the trajectory locale.
 * @returns The graph body, or its empty and hint states.
 */
export function TrajectoryGraphView(
  { useTrajectory, loadImage, openLedger, t }: TrajectoryGraphViewProps,
): ReactNode {
  const snapshot = useTrajectory(value => value)
  const graph = useMemo(() => buildTrajectoryGraph(snapshot, t), [snapshot, t])
  const windowed = useMemo(() => windowTrajectoryGraph(graph, RENDER_LIMIT), [graph])
  const layout = useMemo(() => layoutTrajectoryGraph(windowed.graph), [windowed])
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  const scaleRef = useRef(1)
  const [scale, setScale] = useState(1)
  const [follow, setFollow] = useState(true)
  const [paused, setPaused] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [replay, setReplay] = useState<ReplayState | null>(null)
  const [query, setQuery] = useState('')
  const [matchIndex, setMatchIndex] = useState(0)
  const [pinnedEdgeKind, setPinnedEdgeKind] = useState<TrajectoryGraphEdgeKind | null>(null)
  const [hoverEdgeKind, setHoverEdgeKind] = useState<TrajectoryGraphEdgeKind | null>(null)
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const urlCacheRef = useRef<Record<string, string>>({})
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null)

  const modelById = useMemo(
    () => new Map(windowed.graph.nodes.map(node => [node.id, node])),
    [windowed],
  )
  const laidById = useMemo(
    () => new Map(layout.nodes.map(laid => [laid.node.id, laid])),
    [layout],
  )
  const edgeById = useMemo(
    () => new Map(layout.edges.map(edge => [edge.id, edge])),
    [layout],
  )
  const timeline = windowed.graph.timeline

  const selected = selectedId === null ? undefined : modelById.get(selectedId)
  /** The edge that delivered the selected record, so its delivery reads on the canvas. */
  const selectedEdgeId = selected === undefined
    ? null
    : windowed.graph.timeline.find(step => step.nodeId === selected.id)?.edgeId ?? null

  // Search: match model over the windowed graph; Enter cycles the matches
  // (a new query resets the cursor to the first hit).
  const matches = useMemo(() => searchTrajectoryNodes(windowed.graph, query), [windowed, query])
  const matchIds = useMemo(() => new Set(matches), [matches])
  const jumpMatch = (delta: number): void => {
    if (matches.length === 0) return
    const next = (((matchIndex + delta) % matches.length) + matches.length) % matches.length
    setMatchIndex(next)
    const id = matches[next]
    if (id === undefined) return
    setSelectedId(id)
    setFollow(false)
    setReplay(current => (current === null ? null : { ...current, playing: false }))
    const element = canvasRef.current
    const laid = laidById.get(id)
    if (element === null || laid === undefined) return
    centerInView(element, laid, scale)
  }

  /** The edge kind in focus: the legend pin wins over the hover highlight. */
  const focusEdgeKind = pinnedEdgeKind ?? hoverEdgeKind

  // Follow the tail: pin the canvas to the newest record as data lands.
  useEffect(() => {
    if (!follow || replay !== null) return
    const canvas = canvasRef.current
    if (canvas === null) return
    canvas.scrollTop = canvas.scrollHeight
  }, [follow, replay, layout])

  // Replay cursor: one hop per recorded interval. The hop into the next
  // record waits that record's own incoming gap (clamped); the final hop
  // repeats the last record's gap so the walk can park fully lit.
  useEffect(() => {
    if (replay === null || !replay.playing) return
    if (replay.index >= timeline.length) {
      setReplay(current => (current === null ? null : { ...current, playing: false }))
      return
    }
    const timer = setTimeout(() => {
      setReplay(current => (current === null ? null : { ...current, index: current.index + 1 }))
    }, hopDelay(timeline, Math.min(replay.index + 1, timeline.length - 1), replay.speed))
    return () => { clearTimeout(timer) }
  }, [replay, timeline])

  // Keep the replay's current record in view.
  useEffect(() => {
    if (replay === null || replay.index === 0) return
    const element = canvasRef.current
    const step = timeline[replay.index - 1]
    if (element === null || step === undefined) return
    const laid = laidById.get(step.nodeId)
    if (laid === undefined) return
    centerInView(element, laid, scale)
  }, [replay, laidById, scale, timeline])

  // Ctrl/⌘ + wheel zooms, anchored at the pointer; a plain wheel keeps
  // scrolling the canvas.
  useEffect(() => {
    const element = canvasRef.current
    if (element === null) return
    const onWheel = (event: WheelEvent): void => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault()
      setFollow(false)
      setReplay(current => (current === null ? null : { ...current, playing: false }))
      const rect = element.getBoundingClientRect()
      zoomBy(event.deltaY > 0 ? 1 / ZOOM_WHEEL_STEP : ZOOM_WHEEL_STEP,
        event.clientX - rect.left, event.clientY - rect.top)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => { element.removeEventListener('wheel', onWheel) }
  }, [])

  // Drag-to-pan (window listeners, so pointer capture never swallows a node click).
  useEffect(() => {
    if (!dragging) return
    const move = (event: globalThis.PointerEvent): void => {
      const start = dragRef.current
      const element = canvasRef.current
      if (start === null || element === null) return
      const dx = event.clientX - start.x
      const dy = event.clientY - start.y
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
        setFollow(false)
        setReplay(current => (current === null ? null : { ...current, playing: false }))
      }
      element.scrollLeft = start.left - dx
      element.scrollTop = start.top - dy
    }
    const stop = (): void => {
      dragRef.current = null
      setDragging(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
    window.addEventListener('pointercancel', stop)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      window.removeEventListener('pointercancel', stop)
    }
  }, [dragging])

  // Authorized thumbnails for the selected record's images: peek the shared
  // cache first (Chat and Trajectory share one authorized read), then resolve
  // asynchronously; a failed read leaves the row with its icon.
  useEffect(() => {
    const images = selected?.attachments?.filter(attachment => attachment.kind === 'image') ?? []
    if (images.length === 0) return
    let cancelled = false
    const publish = (id: string, url: string): void => {
      if (cancelled || url === '' || urlCacheRef.current[id] === url) return
      urlCacheRef.current[id] = url
      setImageUrls(current => (current[id] === url ? current : { ...current, [id]: url }))
    }
    for (const attachment of images) {
      if (urlCacheRef.current[attachment.attachmentId] !== undefined) continue
      const peeked = loadImage.peek?.(imageRefOf(attachment))
      if (peeked !== undefined && peeked !== '') {
        publish(attachment.attachmentId, peeked)
        continue
      }
      void loadImage(imageRefOf(attachment))
        .then((url) => { publish(attachment.attachmentId, url) })
        .catch(() => { /* a failed authorized read leaves this row icon-only */ })
    }
    return () => { cancelled = true }
  }, [selected, loadImage])

  /** Change the scale, keeping the canvas point at the given viewport offsets fixed. */
  function zoomBy(factor: number, offsetInViewportX?: number, offsetInViewportY?: number): void {
    const element = canvasRef.current
    const current = scaleRef.current
    const next = zoomedBy(current, factor)
    if (next === current) return
    scaleRef.current = next
    setScale(next)
    if (element === null || offsetInViewportX === undefined || offsetInViewportY === undefined) return
    element.scrollLeft = anchoredScroll(offsetInViewportX, element.scrollLeft, current, next)
    element.scrollTop = anchoredScroll(offsetInViewportY, element.scrollTop, current, next)
  }

  /** Fit the full graph width into the canvas. */
  const fitToWidth = (): void => {
    const element = canvasRef.current
    if (element === null) return
    setFollow(false)
    setReplay(current => (current === null ? null : { ...current, playing: false }))
    const width = element.clientWidth > 4 ? element.clientWidth - 4 : element.clientWidth
    const next = width > 0 && layout.width > 0 ? clamp(width / layout.width, ZOOM_MIN, ZOOM_MAX) : 1
    scaleRef.current = next
    setScale(next)
  }

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    const element = canvasRef.current
    if (element === null) return
    dragRef.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop }
    setDragging(true)
  }

  const startReplay = (): void => {
    setFollow(false)
    setReplay(current => (current === null
      ? { index: 0, playing: true, speed: 1 }
      : { ...current, index: current.index >= timeline.length ? 0 : current.index, playing: true }))
  }

  const select = (id: string): void => {
    setSelectedId(current => (current === id ? null : id))
  }

  const selectionMeta = selected === undefined
    ? []
    : [
      `${t('graph.sequence')} ${selected.seq}`,
      t('graph.time') + ' ' + (selected.time > 0 ? clockLabel(selected.time) : t('graph.unrecorded')),
      ...(selected.durationMs === undefined
        ? []
        : [t('graph.duration') + ' ' + durationLabel(selected.durationMs, t)]),
      ...(selected.tokens === undefined
        ? []
        : [t('graph.tokens') + ' ' + t('unit.tokens', { value: tokenTotal(selected.tokens) })]),
    ]
  const markdownLabels = useMemo(() => ({
    code: { copyLabel: t('graph.markdown.copy'), copiedLabel: t('graph.markdown.copied') },
    mermaid: {
      diagramLabel: t('graph.markdown.diagram'),
      enlargedLabel: t('graph.markdown.enlarged'),
    },
    footnotes: t('graph.markdown.footnotes'),
  }), [t])
  const lightboxLabels = useMemo<ImageLightboxLabels>(() => ({
    dialog: t('graph.lightbox'),
    close: t('graph.lightbox.close'),
  }), [t])
  const slowest = useMemo(() => slowestTools(windowed.graph, SLOWEST_LIMIT), [windowed])
  const statTokens = windowed.graph.stats.tokens
  const statBreakdown = tokenBreakdown(statTokens, t).join(' · ')

  return (
    <div className={cx(css.root, paused && css.paused)}>
      <div className={css.toolbar} role="toolbar" aria-label={t('graph.toolbar')}>
        <button
          type="button"
          className={css.tool}
          aria-label={t('graph.fit')}
          title={t('graph.fit')}
          onClick={fitToWidth}
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
        <button
          type="button"
          className={css.tool}
          aria-label={t('graph.zoom.out')}
          title={t('graph.zoom.out')}
          onClick={() => { setFollow(false); zoomBy(1 / ZOOM_WHEEL_STEP) }}
        >
          <span className={css.glyph}>−</span>
        </button>
        <button
          type="button"
          className={css.tool}
          aria-label={t('graph.zoom.in')}
          title={t('graph.zoom.in')}
          onClick={() => { setFollow(false); zoomBy(ZOOM_WHEEL_STEP) }}
        >
          <span className={css.glyph}>+</span>
        </button>
        <button
          type="button"
          className={css.tool}
          aria-label={replay?.playing === true ? t('graph.replay.pause') : t('graph.replay')}
          title={replay?.playing === true ? t('graph.replay.pause') : t('graph.replay')}
          onClick={() => {
            // A parked replay restarts; a mid-walk pause toggles.
            if (replay === null || replay.index >= timeline.length) startReplay()
            else setReplay(current => (current === null ? null : { ...current, playing: !current.playing }))
          }}
        >
          {replay?.playing === true ? <IconPauseOutline16 size={14} /> : <IconPlayOutline16 size={14} />}
        </button>
        <button
          type="button"
          className={css.tool}
          aria-label={t('graph.replay.speed')}
          title={t('graph.replay.speed')}
          disabled={replay === null}
          onClick={() => {
            setReplay(current => (current === null ? null : { ...current, speed: nextSpeed(current.speed) }))
          }}
        >
          ×{replay?.speed ?? 1}
        </button>
        {replay !== null && (
          <button
            type="button"
            className={css.tool}
            aria-label={t('graph.replay.stop')}
            title={t('graph.replay.stop')}
            onClick={() => { setReplay(null) }}
          >
            <IconStopFill16 size={12} />
          </button>
        )}
        <button
          type="button"
          className={css.tool}
          aria-label={t('graph.openLedger')}
          title={t('graph.openLedger')}
          onClick={openLedger}
        >
          <IconGaugeOutline16 size={14} />
        </button>
        <span className={css.spacer} />
        <span className={css.stat}>{t('graph.stats.nodes', { count: windowed.graph.stats.nodes })}</span>
        <span className={css.stat}>{t('graph.stats.edges', { count: windowed.graph.stats.edges })}</span>
        <span className={css.stat}>{t('graph.stats.turns', { count: windowed.graph.stats.turns })}</span>
        <span className={css.stat} title={statBreakdown}>
          {t('graph.stats.tokens', { count: tokenTotal(statTokens) })}
        </span>
        {slowest.length > 0 && slowest[0] !== undefined && (
          <span
            className={css.stat}
            title={slowest.map(leader =>
              t('graph.stats.leader', { name: leader.name, duration: durationLabel(leader.durationMs, t) }),
            ).join('\n')}
          >
            {t('graph.stats.slowest', {
              name: slowest[0].name,
              duration: durationLabel(slowest[0].durationMs, t),
            })}
          </span>
        )}
        {graph.live && <span className={css.liveDot} aria-hidden="true" />}
      </div>
      <div className={css.legend}>
        <div className={css.legendChips}>
          {LANES.map(lane => (
            <span key={lane} className={css.legendItem}>
              <span className={cx(css.legendDot, LANE_CLASS[lane])} aria-hidden="true" />
              {t(LANE_KEY[lane])}
            </span>
          ))}
          <span className={cx(css.legendItem, css.legendEdgeHint)} aria-hidden="true">·</span>
          {EDGE_KINDS.map(kind => (
            <button
              key={kind}
              type="button"
              className={css.legendEdge}
              aria-pressed={pinnedEdgeKind === kind}
              title={t('graph.edge.hint')}
              onClick={() => { setPinnedEdgeKind(current => (current === kind ? null : kind)) }}
            >
              <span className={css.legendEdgeDot} data-kind={kind} aria-hidden="true" />
              {t(EDGE_KEY[kind])}
            </button>
          ))}
        </div>
        <input
          className={css.search}
          value={query}
          placeholder={t('graph.search')}
          spellCheck={false}
          aria-label={t('graph.search')}
          onChange={(event) => { setQuery(event.currentTarget.value); setMatchIndex(0) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              jumpMatch(event.shiftKey ? -1 : 1)
            } else if (event.key === 'Escape') {
              setQuery('')
              setMatchIndex(0)
            }
          }}
        />
        {query.trim() !== '' && (
          <span className={cx(css.searchCount, matches.length === 0 && css.searchNone)}>
            {matches.length > 0
              ? t('graph.search.count', { index: matchIndex + 1, total: matches.length })
              : t('graph.search.none')}
          </span>
        )}
      </div>
      {windowed.graph.nodes.length === 0
        ? <div className={css.empty}>{t('graph.empty')}</div>
        : (
          <>
            <div ref={canvasRef} className={cx(css.canvas, dragging && css.canvasDragging)} onPointerDown={onPointerDown}>
              <svg
                className={css.svg}
                width={Math.round(layout.width * scale)}
                height={Math.round(layout.height * scale)}
                viewBox={`0 0 ${layout.width} ${layout.height}`}
                role="img"
                aria-label={t('graph.canvas')}
              >
                {layout.bands.map(band => (band.turn === null ? null : (
                  <g key={`band:${band.turn}:${band.from}`}>
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
                {layout.edges.map((edge) => {
                  const from = laidById.get(edge.from)
                  const replayHidden = replay !== null && from !== undefined && from.index >= replay.index
                  const hot = hoverId !== null && (edge.from === hoverId || edge.to === hoverId)
                  // A pinned or hovered kind keeps its edges and dims every other one.
                  const kindFocused = focusEdgeKind === edge.kind
                  const kindDimmed = focusEdgeKind !== null && !kindFocused
                  return (
                    <g key={edge.id}>
                      <path
                        className={css.edgeHit}
                        d={edge.d}
                        onMouseEnter={() => { setHoverEdgeKind(edge.kind) }}
                        onMouseLeave={() => {
                          setHoverEdgeKind(current => (current === edge.kind ? null : current))
                        }}
                      />
                      <path
                        className={cx(
                          css.edge,
                          EDGE_CLASS[edge.kind],
                          edge.live && css.edgeLive,
                          (replayHidden || kindDimmed) && css.edgeDim,
                          hot && css.edgeHot,
                          kindFocused && css.edgeKindHot,
                          edge.id === selectedEdgeId && css.edgeSelected,
                        )}
                        d={edge.d}
                      />
                    </g>
                  )
                })}
                {layout.nodes.map((laid) => {
                  const node = laid.node
                  const badge = node.badge
                  const replayHidden = replay !== null && laid.index >= replay.index
                  // An active query dims every non-matching record.
                  const searchDimmed = query.trim() !== '' && !matchIds.has(node.id)
                  const hot = hoverId === node.id || selectedId === node.id
                  return (
                    <g
                      key={node.id}
                      className={cx(
                        css.node,
                        node.live && css.nodeLive,
                        (replayHidden || searchDimmed) && css.nodeDim,
                        hot && css.nodeHot,
                      )}
                      data-kind={node.kind}
                      transform={`translate(${laid.x} ${laid.y})`}
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
                      onMouseEnter={() => { setHoverId(node.id) }}
                      onMouseLeave={() => { setHoverId(current => (current === node.id ? null : current)) }}
                      onFocus={() => { setHoverId(node.id) }}
                      onBlur={() => { setHoverId(current => (current === node.id ? null : current)) }}
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
                      {node.attachments !== undefined && node.attachments.length > 0
                        && attachmentCountPills(node.attachments, laid.w, t)}
                    </g>
                  )
                })}
                {/* The replay's current hop: one packet, flying once per record. */}
                {replay !== null && replay.index > 0 && (() => {
                  const step = timeline[replay.index - 1]
                  const edge = step?.edgeId === null || step?.edgeId === undefined
                    ? undefined
                    : edgeById.get(step.edgeId)
                  if (step === undefined || edge === undefined) return null
                  return (
                    <circle key={`hop:${replay.index}`} className={css.packetHot} r={3.2} aria-hidden="true">
                      <animateMotion
                        dur={`${Math.max(0.12, hopDelay(timeline, replay.index - 1, replay.speed) / 1000)}s`}
                        repeatCount="1"
                        fill="freeze"
                        path={edge.d}
                      />
                    </circle>
                  )
                })()}
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
                {selected.attachments === undefined || selected.attachments.length === 0 ? null : (
                  <div className={css.attachments}>
                    {selected.attachments.map((attachment, index) => {
                      const presentation = attachmentPresentation(attachment, index + 1, t)
                      const url = attachment.kind === 'image' ? imageUrls[attachment.attachmentId] : undefined
                      return (
                        <div
                          key={`${attachment.attachmentId}:${index}`}
                          className={css.attachment}
                        >
                          {attachment.kind === 'image'
                            ? (url === undefined
                              ? <span className={css.attachmentIcon} aria-hidden="true"><IconPaperclipOutline16 size={14} /></span>
                              : (
                                <button
                                  type="button"
                                  className={css.attachmentThumb}
                                  aria-label={t('graph.attachment.view')}
                                  title={t('graph.attachment.view')}
                                  onClick={() => { setLightbox({ url, name: presentation.name }) }}
                                >
                                  <img src={url} alt={presentation.name} loading="lazy" />
                                </button>
                              ))
                            : <span className={css.attachmentIcon} aria-hidden="true"><IconPaperclipOutline16 size={14} /></span>}
                          <span className={css.attachmentText}>
                            <span className={css.attachmentName} title={presentation.name}>{presentation.name}</span>
                            {presentation.meta === ''
                              ? null
                              : <span className={css.attachmentMeta}>{presentation.meta}</span>}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                )}
                {selected.toolDetail !== undefined
                  ? <ToolInspectorBody tool={selected.toolDetail} t={t} />
                  : selected.detail === undefined || selected.detail === ''
                    ? null
                    : selected.kind === 'assistant'
                      ? (
                        <div className={css.inspectorMarkdown}>
                          <MarkdownText text={selected.detail} labels={markdownLabels} />
                        </div>
                      )
                      : <pre className={css.inspectorBody}>{selected.detail}</pre>}
              </div>
            )}
          </>
        )}
      {lightbox !== null && (
        <ImageLightbox
          src={lightbox.url}
          alt={lightbox.name}
          labels={lightboxLabels}
          onClose={() => { setLightbox(null) }}
        />
      )}
    </div>
  )
}

/**
 * The structured tool inspector: a header line (name · call id · error state
 * · pending marker), the call arguments as a collapsible pretty-printed JSON
 * block, and the settled result as plain text.
 */
function ToolInspectorBody({ tool, t }: {
  tool: TrajectoryToolDetail
  t: TrajectoryTranslate
}): ReactNode {
  const prettyArgs = tool.argsRaw === undefined ? '' : prettyJson(tool.argsRaw)
  return (
    <div className={css.toolBody}>
      <div className={css.toolHead}>
        <span className={css.toolName}>{tool.name}</span>
        {tool.callId !== undefined && <span className={css.toolCallId}>{tool.callId}</span>}
        {tool.isError === true && <span className={css.toolError}>{t('status.failed')}</span>}
        {tool.resultText === undefined && <span className={css.toolPending}>{t('graph.tool.pending')}</span>}
      </div>
      {prettyArgs === '' ? null : (
        <details className={css.toolArgs}>
          <summary>{t('graph.tool.args')}</summary>
          <pre className={css.inspectorBody}>{prettyArgs}</pre>
        </details>
      )}
      {tool.resultText === undefined ? null : (
        <div className={css.toolResult}>
          <div className={css.toolResultLabel}>{t('graph.result')}</div>
          <pre className={css.inspectorBody} data-error={tool.isError === true}>{tool.resultText}</pre>
        </div>
      )}
    </div>
  )
}

/** Bring one placed record into the canvas viewport, centered when outside it. */
function centerInView(element: HTMLDivElement, laid: LaidOutGraphNode, scale: number): void {
  const top = laid.y * scale
  const bottom = (laid.y + laid.h) * scale
  if (top < element.scrollTop || bottom > element.scrollTop + element.clientHeight) {
    element.scrollTop = Math.max(0, top - element.clientHeight / 2)
  }
}
