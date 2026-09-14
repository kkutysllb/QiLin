/**
 * Pure layout for the trajectory graph: ledger order becomes the vertical axis
 * and the actor swimlane becomes the horizontal one, so the agent loop reads as
 * the curve that leaves the tool lane and comes back to the model lane.
 *
 * Three lanes run top to bottom, time flowing downward:
 *
 *   input (user, context)   model (request, assistant)   tool (calls, results)
 *
 * Every row holds exactly one record, and a turn boundary reserves a header
 * band above its first row. The module decides row heights, lane positions,
 * nested-call offsets, band extents, and one cubic path per edge. It decides no
 * copy and no colour, so it stays free of React and of the locale dictionaries
 * and runs in a plain Node environment.
 */

import type {
  TrajectoryGraph, TrajectoryGraphEdgeKind, TrajectoryGraphNode, TrajectoryGraphNodeKind,
  TrajectoryLane,
} from './trajectory-graph.ts'

/** Geometry of one swimlane. */
interface LaneGeometry {
  /** Center x of a top-level node. */
  cx: number
  /** Node width. */
  w: number
}

/** The three-lane geometry, tuned for a right-Sidebar-width canvas. */
const LANES: Readonly<Record<TrajectoryLane, LaneGeometry>> = {
  input: { cx: 62, w: 108 },
  model: { cx: 186, w: 140 },
  tool: { cx: 310, w: 108 },
}

/** Deepest nesting the tool lane offsets for. */
const MAX_DEPTH = 3

/** Default geometry; tests pin these values. */
const DEFAULTS = {
  width: 372,
  rowHeight: 44,
  nodeHeight: 30,
  bandHeight: 22,
  padding: 10,
} as const

/** Geometry overrides for one layout pass. */
export interface TrajectoryGraphLayoutOptions {
  /** Virtual canvas width in SVG user units. */
  width?: number
  /** Vertical pitch of one record row. */
  rowHeight?: number
  /** Node height. */
  nodeHeight?: number
  /** Vertical space one turn header reserves. */
  bandHeight?: number
  /** Space above the first row and below the last. */
  padding?: number
}

/** One positioned record. */
export interface LaidOutGraphNode {
  /** The record this node draws. */
  readonly node: TrajectoryGraphNode
  /** Left edge. */
  readonly x: number
  /** Top edge. */
  readonly y: number
  readonly w: number
  readonly h: number
}

/** One routed edge. */
export interface LaidOutGraphEdge {
  readonly id: string
  readonly kind: TrajectoryGraphEdgeKind
  /** Whether the edge still carries moving data, which drives its animation. */
  readonly live: boolean
  readonly from: string
  readonly to: string
  /** SVG path data, also usable as the motion path of a flowing packet. */
  readonly d: string
}

/** One placed turn band. */
export interface LaidOutBand {
  /** Turn number, or null for records outside every turn. */
  readonly turn: number | null
  /** Top edge of the band, above its header when it has one. */
  readonly y: number
  readonly height: number
  /** First record index inside the band. */
  readonly from: number
  /** One past the last record index inside the band. */
  readonly to: number
}

/** The complete laid-out graph. */
export interface TrajectoryGraphLayout {
  readonly width: number
  readonly height: number
  readonly nodes: readonly LaidOutGraphNode[]
  readonly edges: readonly LaidOutGraphEdge[]
  readonly bands: readonly LaidOutBand[]
}

/** A band while the pass still accumulates its height. */
type MutableBand = { -readonly [K in keyof LaidOutBand]: LaidOutBand[K] }

/** Keep a value inside a closed range. */
function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value
}

/** Full-width CJK and fullwidth ranges, counted as two latin columns. */
// oxlint-disable-next-line @stylistic/max-len -- a character-class literal cannot wrap without changing the expression
const WIDE = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/

/**
 * Cut a chip label to the width the chip can actually draw.
 *
 * SVG has no text overflow, and a text node wider than its chip bleeds into the
 * neighbouring lane. Counting CJK glyphs as two latin columns keeps both
 * scripts inside the box.
 * @param text - the label.
 * @param maxWidth - available width in user units.
 * @param fontSize - the chip's font size.
 * @returns The label, ellipsized when it does not fit.
 */
export function ellipsize(text: string, maxWidth: number, fontSize: number): string {
  const column = fontSize * 0.56
  let used = 0
  let out = ''
  for (const char of text) {
    const width = WIDE.test(char) ? column * 1.75 : column
    if (used + width > maxWidth) return out + '…'
    out += char
    used += width
  }
  return out
}

/** Nested sub-calls step right inside the tool lane so ownership reads at a glance. */
function laneOffset(kind: TrajectoryGraphNodeKind, depth: number): { dx: number; shrink: number } {
  const nested = kind === 'tool' || kind === 'running-call'
  return nested ? { dx: depth * 10, shrink: depth * 12 } : { dx: 0, shrink: 0 }
}

/** Tool nesting depth lookup, taken from the subcall edges the projection emitted. */
function subCallDepthOf(graph: TrajectoryGraph): (id: string) => number {
  const parentOf = new Map<string, string>()
  for (const edge of graph.edges) {
    if (edge.kind === 'subcall') parentOf.set(edge.to, edge.from)
  }
  const depths = new Map<string, number>()
  const walk = (id: string, guard: Set<string>): number => {
    const cached = depths.get(id)
    if (cached !== undefined) return cached
    if (guard.has(id)) return 0
    const parent = parentOf.get(id)
    if (parent === undefined) {
      depths.set(id, 0)
      return 0
    }
    guard.add(id)
    const depth = Math.min(walk(parent, guard) + 1, MAX_DEPTH)
    depths.set(id, depth)
    return depth
  }
  return id => walk(id, new Set())
}

/** Route one edge as a cubic, splitting on the vertical and the horizontal gap. */
function edgePath(kind: TrajectoryGraphEdgeKind, x1: number, y1: number, x2: number, y2: number): string {
  const dy = y2 - y1
  const dx = x2 - x1
  if (dy <= 4) {
    // Same row, or a backwards link: sweep out to the right and back in.
    const rail = Math.max(x1, x2) + 28
    return 'M ' + x1 + ' ' + y1 + ' C ' + rail + ' ' + (y1 + 24) + ', ' + rail + ' '
      + (y2 - 24) + ', ' + x2 + ' ' + y2
  }
  if (Math.abs(dx) < 2) {
    return 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + (y1 + dy * 0.4) + ', ' + x2 + ' '
      + (y2 - dy * 0.4) + ', ' + x2 + ' ' + y2
  }
  const k = clamp(dy * 0.45, 10, 64)
  if (kind === 'loop') {
    // The agent loop: leave the tool lane, ride a rail to the right, then cut
    // back into the model lane.
    const rail = 26
    return 'M ' + x1 + ' ' + y1 + ' C ' + (x1 + rail) + ' ' + (y1 + k) + ', '
      + (x2 + rail * 1.4) + ' ' + (y2 - k) + ', ' + x2 + ' ' + y2
  }
  return 'M ' + x1 + ' ' + y1 + ' C ' + x1 + ' ' + (y1 + k) + ', ' + x2 + ' ' + (y2 - k)
    + ', ' + x2 + ' ' + y2
}

/**
 * Lay out one graph projection.
 * @param graph - the projection to place, already windowed by the caller.
 * @param options - geometry overrides.
 * @returns Positioned nodes, routed edges, and placed turn bands.
 */
export function layoutTrajectoryGraph(
  graph: TrajectoryGraph,
  options: TrajectoryGraphLayoutOptions = {},
): TrajectoryGraphLayout {
  const width = options.width ?? DEFAULTS.width
  const rowHeight = options.rowHeight ?? DEFAULTS.rowHeight
  const nodeHeight = options.nodeHeight ?? DEFAULTS.nodeHeight
  const bandHeight = options.bandHeight ?? DEFAULTS.bandHeight
  const padding = options.padding ?? DEFAULTS.padding

  const depthOf = subCallDepthOf(graph)
  const nodes: LaidOutGraphNode[] = []
  const byId = new Map<string, LaidOutGraphNode>()
  const bands: LaidOutBand[] = []
  let bandStart: MutableBand | null = null
  let bandIndex = 0
  let cursor = padding

  for (const [index, node] of graph.nodes.entries()) {
    const band = graph.bands[bandIndex]
    if (band !== undefined && band.from === index) {
      bandIndex += 1
      if (bandStart !== null) {
        bandStart.height = cursor - bandStart.y
        bands.push(bandStart)
      }
      bandStart = { turn: band.turn, y: cursor, height: 0, from: band.from, to: band.to }
      // A turn reserves its header space above its first row; records outside
      // every turn (a standalone compaction) get none.
      if (band.turn !== null) cursor += bandHeight
    }
    const lane = LANES[node.lane]
    const depth = depthOf(node.id)
    const offset = laneOffset(node.kind, depth)
    const w = lane.w - offset.shrink
    const laid: LaidOutGraphNode = {
      node,
      x: lane.cx + offset.dx - w / 2,
      y: cursor + (rowHeight - nodeHeight) / 2,
      w,
      h: nodeHeight,
    }
    nodes.push(laid)
    byId.set(node.id, laid)
    cursor += rowHeight
  }
  if (bandStart !== null) {
    bandStart.height = cursor - bandStart.y
    bands.push(bandStart)
  }

  const edges: LaidOutGraphEdge[] = []
  for (const edge of graph.edges) {
    const from = byId.get(edge.from)
    const to = byId.get(edge.to)
    if (from === undefined || to === undefined) continue
    // Attach to the source's bottom edge and the target's top edge, so a packet
    // visibly leaves one record and lands on the next.
    edges.push({
      id: edge.id,
      kind: edge.kind,
      live: edge.live,
      from: edge.from,
      to: edge.to,
      d: edgePath(
        edge.kind,
        from.x + from.w / 2,
        from.y + from.h,
        to.x + to.w / 2,
        to.y,
      ),
    })
  }

  return { width, height: cursor + padding, nodes, edges, bands }
}
