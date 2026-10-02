/**
 * The tasks graph canvas: layered node cards joined by bezier edges, drag to
 * pan, wheel zoom-to-cursor, double-click to fit, node cards that drag off
 * their auto-layout spots, and a bottom-right control cluster (zoom, arrange,
 * fit, reset).
 *
 * Pure presentation over the view model: every shared fact — the section's
 * form, the expanded aggregates, the arrangement, the manual offsets, the
 * camera — lives in the declared graph store and reaches this component
 * through its `useStore` / `actions` shares. Gesture-internal records are
 * component-local refs.
 *
 * Interaction notes:
 * - a pan or node drag that travelled past {@link CLICK_SLOP} is a drag, not a
 *   click: the node's click handler reads the gesture records and skips
 *   navigation for a moved pointer;
 * - wheel zoom keeps the canvas point under the cursor stationary and needs a
 *   non-passive native listener, attached through the wrap ref;
 * - the auto-fit frames the content until the user pans or zooms; an arrange
 *   hands steering back by clearing the camera.
 */
import clsx from 'clsx'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, ReactNode } from 'react'
import type { PropsLocale, PropsStore, TranslateNS } from '@qilin/client-ui-slots'
import type { NS } from './locales.ts'
import {
  dragOffsets, hasOffsets, layoutTasksGraph,
  TASK_NODE_BAR_H, TASK_NODE_TOP_H, TASK_NODE_W,
  type NodeOffsets, type TaskLayoutMode,
} from './tasks-graph-layout.ts'
import type { TaskNodeVM, TasksGraphModel } from './tasks-graph-model.ts'
import type { createTasksGraphStore, TasksGraphCamera } from './tasks-graph-store.ts'
import css from './TasksGraph.module.css'

/** The store handle type the view's props share derives from. */
type TasksGraphStore = ReturnType<typeof createTasksGraphStore>

/** The view's composed props: the model, the node gesture, the copy, and the store shares. */
export type TasksGraphViewProps =
  & {
    /** The view model the canvas lays out. */
    readonly model: TasksGraphModel
    /** One node activation, already routed by the page. */
    readonly onNodeClick: (node: TaskNodeVM) => void
  }
  & PropsLocale<typeof NS>
  & PropsStore<TasksGraphStore>

/** Drag distance under which a pointer sequence still counts as a click, in px. */
const CLICK_SLOP = 4
/** Zoom clamps. */
const K_MIN = 0.2
const K_MAX = 2.5
/** The widest zoom a fit frames at; deeper zoom is the user's choice. */
const FIT_K_MAX = 1.25
/** The camera the canvas starts from, before the first fit. */
const START_CAMERA: TasksGraphCamera = { k: 1, tx: 0, ty: 0, userAdjusted: false }

/** The camera and translate the canvas renders at. */
type CameraView = { readonly k: number; readonly tx: number; readonly ty: number }

/** One canvas pan gesture in flight. */
interface PanGesture {
  x: number
  y: number
  moved: number
}

/** One node drag gesture in flight. */
interface NodeGesture {
  readonly nodeId: string
  x: number
  y: number
  moved: number
  /** The offsets captured when the gesture started; deltas compute from here. */
  readonly base: NodeOffsets
  /** Whether the node's descendants ride along. */
  readonly subtree: boolean
}

/**
 * The badge word one node kind carries.
 * @param node - the node the card draws.
 * @param t - namespace-bound translate.
 * @returns the badge word.
 */
function badgeOf(node: TaskNodeVM, t: TranslateNS<typeof NS>): string {
  switch (node.kind) {
    case 'main': return t('graph.badge.main')
    case 'subagent': return t('graph.badge.subagent')
    case 'done-agg': return t('graph.badge.done')
    case 'standby-agg': return t('graph.badge.standby')
    case 'placeholder': return t('graph.badge.placeholder')
    case 'diagnostic': return t('graph.badge.diagnostic')
    case 'run': return t('graph.badge.run')
    case 'phase': return t('graph.badge.phase')
    case 'member': return t('graph.badge.member')
  }
}

/**
 * The label one card draws, with the synthesized stand-ins for unread and
 * unphased nodes.
 * @param node - the node the card draws.
 * @param t - namespace-bound translate.
 * @returns the label text.
 */
function labelOf(node: TaskNodeVM, t: TranslateNS<typeof NS>): string {
  if (node.kind === 'phase' && node.label === '') return t('graph.unphased')
  return node.label === '' ? t('graph.loading') : node.label
}

/**
 * The status line one card draws in its bottom bar.
 * @param node - the node the card draws.
 * @param t - namespace-bound translate.
 * @returns the status text.
 */
function statusOf(node: TaskNodeVM, t: TranslateNS<typeof NS>): string {
  switch (node.kind) {
    case 'done-agg':
    case 'standby-agg':
      return `${badgeOf(node, t)} ${node.childCount ?? ''}`.trim()
    case 'placeholder':
      return t('graph.loading')
    case 'phase':
      return `${node.childCount ?? 0}`
    case 'member':
      // A running member shows its liveness; a settled one shows its outcome,
      // falling back to the kind word when the run recorded none.
      if (node.running) return t('graph.status.running')
      return node.secondary !== '' ? node.secondary : t('graph.badge.member')
    case 'main':
    case 'subagent':
    case 'run':
    case 'diagnostic':
      return node.running ? t('graph.status.running') : t('graph.status.idle')
  }
}

/**
 * Truncate a display string to roughly fit one card line.
 * @param text - the full text.
 * @param max - the character budget.
 * @returns the elided text.
 */
function ellipsize(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text
}

/** The CSS class table indexes per key, so a class read may miss. */
function kindClassOf(node: TaskNodeVM): string | undefined {
  switch (node.kind) {
    case 'done-agg': return css.nodeDone
    case 'standby-agg': return css.nodeStandby
    case 'placeholder': return css.nodePlaceholder
    case 'phase': return css.nodePhase
    case 'run': return css.nodeRun
    default: return css.node
  }
}

/**
 * Whether a node activates: subagent cards and synthesized members navigate,
 * aggregates toggle their fold, the main card opens the root, and a
 * placeholder asks the page to read its level. Diagnostics, runs, and phases
 * draw but do not activate.
 * @param node - the node the card draws.
 * @returns whether the card activates on click or keyboard.
 */
function clickableOf(node: TaskNodeVM): boolean {
  return node.kind === 'main' || node.kind === 'subagent' || node.kind === 'member'
    || node.kind === 'placeholder' || node.aggregateKey !== undefined
}

/**
 * The tasks graph canvas.
 * @param props - the model, the node gesture, the copy, and the store shares.
 * @returns the canvas and its control cluster.
 */
export function TasksGraphView({
  model, onNodeClick, useStore, actions, t,
}: TasksGraphViewProps): ReactNode {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const camera = useStore(state => state.camera)
  // Gesture handlers run between renders; the ref is the frame they read and
  // move forward, so consecutive events never compute from a stale camera.
  const cameraRef = useRef<TasksGraphCamera | undefined>(camera)
  cameraRef.current = camera
  const offsets = useStore(state => state.offsets)
  const mode = useStore(state => state.mode)
  const [panning, setPanning] = useState(false)
  const [draggingNode, setDraggingNode] = useState<string | null>(null)
  const panRef = useRef<PanGesture | null>(null)
  const nodeDragRef = useRef<NodeGesture | null>(null)

  const layout = useMemo(() => layoutTasksGraph(model, offsets, mode), [model, offsets, mode])
  const view: CameraView = camera ?? START_CAMERA
  const userAdjusted = camera?.userAdjusted ?? false

  /** Put one camera frame in force, ahead of the render and in the store. */
  const moveCamera = useCallback((next: CameraView, adjusted: boolean): void => {
    const frame: TasksGraphCamera = { ...next, userAdjusted: adjusted }
    cameraRef.current = frame
    actions.cameraMoved(frame)
  }, [actions])

  /** Center the content box in the viewport at a readable zoom. */
  const fit = useCallback((): void => {
    const el = wrapRef.current
    // jsdom and unmounted frames measure zero, which is the fit's no-op.
    /* v8 ignore next -- fit runs only from events a mounted canvas raised. */
    const vw = el?.clientWidth ?? 0
    /* v8 ignore next -- fit runs only from events a mounted canvas raised. */
    const vh = el?.clientHeight ?? 0
    if (vw <= 0 || vh <= 0) return
    const k = Math.min(FIT_K_MAX, Math.max(K_MIN, Math.min(vw / layout.width, vh / layout.height)))
    moveCamera({
      k,
      // The content box can start above or left of the origin once a node is
      // dragged there; the fit subtracts that origin so nothing is cut off.
      tx: (vw - layout.width * k) / 2 - layout.minX * k,
      ty: Math.max(8, (vh - layout.height * k) / 2) - layout.minY * k,
    }, false)
  }, [layout, moveCamera])

  // Auto-fit: frame the content while the user has not taken the camera over.
  // Model growth, an arrange, and a node drag all rebuild the layout, and each
  // reframes once; a manual pan or zoom stops the steering.
  useEffect(() => {
    if (userAdjusted) return
    fit()
  }, [fit, userAdjusted])

  // Reframe after the pane resizes, unless the user holds the camera or a pan
  // is mid-gesture.
  useEffect(() => {
    const el = wrapRef.current
    /* v8 ignore next -- the wrap ref is set before effects run. */
    if (el === null) return
    /* v8 ignore next -- a real browser defines ResizeObserver. */
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(() => {
      if (!userAdjusted && panRef.current === null) fit()
    })
    observer.observe(el)
    return () => { observer.disconnect() }
  }, [fit, userAdjusted])

  // Wheel zoom-to-cursor needs a non-passive native listener: React's onWheel
  // cannot preventDefault reliably.
  useEffect(() => {
    const el = wrapRef.current
    /* v8 ignore next -- the wrap ref is set before effects run. */
    if (el === null) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const current = cameraRef.current ?? START_CAMERA
      const k = Math.min(K_MAX, Math.max(K_MIN, current.k * Math.exp(-event.deltaY * 0.0015)))
      const rect = el.getBoundingClientRect()
      const px = event.clientX - rect.left
      const py = event.clientY - rect.top
      // Keep the canvas point under the cursor stationary: adjust the
      // translate by the zoom change times the cursor offset from the origin.
      moveCamera({
        k,
        tx: px - ((px - current.tx) / current.k) * k,
        ty: py - ((py - current.ty) / current.k) * k,
      }, true)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { el.removeEventListener('wheel', onWheel) }
  }, [moveCamera])

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return
    panRef.current = { x: event.clientX, y: event.clientY, moved: 0 }
    setPanning(true)
  }, [])

  // The pan's move and lift ride the window — deliberately without pointer
  // capture, which would retarget the following click away from the node
  // cards. The gesture record keeps the accumulated travel the node click
  // handler reads to tell a drag from a click.
  useEffect(() => {
    if (!panning) return
    const onMove = (event: PointerEvent): void => {
      const drag = panRef.current
      /* v8 ignore next -- the effect subscribes only while the record exists. */
      if (drag === null) return
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      drag.moved += Math.abs(dx) + Math.abs(dy)
      drag.x = event.clientX
      drag.y = event.clientY
      if (drag.moved <= CLICK_SLOP) return
      const current = cameraRef.current ?? START_CAMERA
      moveCamera({ k: current.k, tx: current.tx + dx, ty: current.ty + dy }, true)
    }
    const onUp = (): void => { setPanning(false) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [panning, moveCamera])

  // Node dragging: the same window-listener pattern as the pan, for the same
  // no-capture reason. A card follows the pointer one-to-one at any zoom, so
  // the deltas divide by it; offsets always compute from the frame captured at
  // gesture start, so a long drag cannot accumulate rounding drift.
  useEffect(() => {
    if (draggingNode === null) return
    const onMove = (event: PointerEvent): void => {
      const drag = nodeDragRef.current
      /* v8 ignore next -- the effect subscribes only while the record exists. */
      if (drag === null) return
      const dx = event.clientX - drag.x
      const dy = event.clientY - drag.y
      drag.moved = Math.abs(dx) + Math.abs(dy)
      if (drag.moved < CLICK_SLOP) return
      const k = (cameraRef.current ?? START_CAMERA).k
      actions.offsetsDragged(dragOffsets(model, drag.base, drag.nodeId, dx / k, dy / k, drag.subtree))
    }
    const onUp = (): void => { setDraggingNode(null) }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [draggingNode, model, actions])

  const startNodeDrag = useCallback((event: ReactPointerEvent, nodeId: string): void => {
    if (event.button !== 0) return
    event.stopPropagation()
    nodeDragRef.current = {
      nodeId,
      x: event.clientX,
      y: event.clientY,
      moved: 0,
      base: offsets,
      // The default gesture carries the whole subtree; Alt moves the single card.
      subtree: !event.altKey,
    }
    setDraggingNode(nodeId)
  }, [offsets])

  /** Zoom by one step around the viewport's center. */
  const zoomBy = useCallback((factor: number): void => {
    const el = wrapRef.current
    /* v8 ignore next -- a control click implies a mounted canvas. */
    const cx = (el?.clientWidth ?? 0) / 2
    /* v8 ignore next -- a control click implies a mounted canvas. */
    const cy = (el?.clientHeight ?? 0) / 2
    const current = cameraRef.current ?? START_CAMERA
    const k = Math.min(K_MAX, Math.max(K_MIN, current.k * factor))
    moveCamera({
      k,
      tx: cx - ((cx - current.tx) / current.k) * k,
      ty: cy - ((cy - current.ty) / current.k) * k,
    }, true)
  }, [moveCamera])

  // The arrange drops the manual offsets and the camera together, so the
  // auto-fit above frames the fresh arrangement on its next pass.
  const arrange = useCallback((next: TaskLayoutMode): void => {
    actions.modeArranged(next)
  }, [actions])

  const resetOffsets = useCallback((): void => {
    actions.offsetsReset()
  }, [actions])

  return (
    <div
      ref={wrapRef}
      className={css.wrap}
      data-tasks-graph=""
      onPointerDown={onPointerDown}
      onDoubleClick={fit}
    >
      <svg className={css.svg}>
        <g data-tasks-graph-frame="" transform={`translate(${view.tx} ${view.ty}) scale(${view.k})`}>
          {layout.edges.map(edge => <path key={edge.id} d={edge.d} className={css.edge} />)}
          {layout.nodes.map((box) => {
            const node = box.node
            const clickable = clickableOf(node)
            const name = `${node.label} ${node.secondary}`.trim()
            return (
              <g
                key={node.id}
                data-tasks-graph-node={node.id}
                transform={`translate(${box.x} ${box.y})`}
                className={clsx(kindClassOf(node), draggingNode === node.id && css.nodeDragging)}
                onPointerDown={(event) => { startNodeDrag(event, node.id) }}
                onClick={() => {
                  const panned = panRef.current?.moved ?? 0
                  const dragged = nodeDragRef.current?.moved ?? 0
                  panRef.current = null
                  nodeDragRef.current = null
                  // A pan or a node drag that actually moved must not activate.
                  if (panned >= CLICK_SLOP || dragged >= CLICK_SLOP) return
                  if (clickable) onNodeClick(node)
                }}
                onKeyDown={clickable
                  ? (event) => {
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    onNodeClick(node)
                  }
                  : undefined}
                role={clickable ? 'button' : undefined}
                tabIndex={clickable ? 0 : undefined}
                aria-label={name}
                aria-current={node.current ? 'true' : undefined}
                aria-disabled={!clickable ? 'true' : undefined}
              >
                <rect width={TASK_NODE_W} height={TASK_NODE_TOP_H + TASK_NODE_BAR_H} rx={8} className={css.card} />
                <line x1={0} y1={TASK_NODE_TOP_H} x2={TASK_NODE_W} y2={TASK_NODE_TOP_H} className={css.sep} />
                <text x={10} y={15} className={css.badge}>{badgeOf(node, t)}</text>
                <text x={10} y={32} className={css.label}>
                  {ellipsize(labelOf(node, t), 24)}
                  {node.childCount !== undefined ? ` +${node.childCount}` : ''}
                </text>
                <rect y={TASK_NODE_TOP_H} width={TASK_NODE_W} height={TASK_NODE_BAR_H} className={css.bar} />
                <circle
                  cx={12}
                  cy={TASK_NODE_TOP_H + TASK_NODE_BAR_H / 2}
                  r={3}
                  className={node.running ? css.dotRunning : css.dotIdle}
                />
                <text x={20} y={TASK_NODE_TOP_H + TASK_NODE_BAR_H / 2 + 3.5} className={css.status}>
                  {statusOf(node, t)}
                </text>
                <title>{name}</title>
              </g>
            )
          })}
        </g>
      </svg>
      <div className={css.controls} data-tasks-graph-controls="" onPointerDown={(event) => { event.stopPropagation() }}>
        <button type="button" aria-label={t('graph.zoomIn')} onClick={() => { zoomBy(1.25) }}>＋</button>
        <button type="button" aria-label={t('graph.zoomOut')} onClick={() => { zoomBy(0.8) }}>－</button>
        <span className={css.modes} role="group" aria-label={t('graph.arrange')}>
          {(['tree', 'compact', 'grid'] as const).map(value => (
            <button
              key={value}
              type="button"
              data-tasks-graph-mode={value}
              aria-pressed={mode === value}
              className={clsx(css.mode, mode === value && css.modeActive)}
              title={t('graph.arrange')}
              onClick={() => { arrange(value) }}
            >
              {t(`graph.mode.${value}`)}
            </button>
          ))}
        </span>
        <button type="button" aria-label={t('graph.fit')} onClick={fit}>{t('graph.fit')}</button>
        {hasOffsets(offsets) && (
          <button
            type="button"
            className={css.reset}
            aria-label={t('graph.resetLayout')}
            title={t('graph.resetLayout')}
            data-tasks-graph-reset=""
            onClick={resetOffsets}
          >
            ⟲ {t('graph.resetLayout')}
          </button>
        )}
      </div>
    </div>
  )
}
