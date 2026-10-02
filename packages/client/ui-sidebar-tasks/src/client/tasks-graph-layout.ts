/**
 * Pure layered layout for the tasks graph: depth rows, leaf-packed horizontal
 * ordering (parents centered over their subtrees), cubic parent→child edges,
 * and the content bounding box the canvas fits to.
 *
 * Folded and unhydrated groups arrive as leaf nodes (aggregate and placeholder
 * kinds) — the view model has already applied the expansion state before this
 * runs. Framework-free: every function is a pure mapping from the view model
 * to rectangles.
 */
import type { TaskNodeVM, TasksGraphModel } from './tasks-graph-model.ts'

/** Node card metrics in px at zoom 1: the card is a top segment plus a bottom bar. */
export const TASK_NODE_W = 208
/** Height of the card's top segment (badge line plus label line). */
export const TASK_NODE_TOP_H = 46
/** Height of the card's bottom status bar. */
export const TASK_NODE_BAR_H = 20
/** Total card height. */
export const TASK_NODE_H = TASK_NODE_TOP_H + TASK_NODE_BAR_H

/**
 * Arrangement modes (the arrange control):
 *
 * - `tree` — the hierarchical default, parents centered over their subtrees;
 * - `compact` — the same hierarchy with tighter gaps, for deep trees on a
 *   narrow pane;
 * - `grid` — depth rows packed into a column grid, wrapping after
 *   {@link GRID_MAX_COLS}, which keeps a wide fan-out readable.
 */
export type TaskLayoutMode = 'tree' | 'compact' | 'grid'

/** Per-mode gaps: horizontal between siblings / vertical between depth rows. */
const MODE_GAPS: Record<TaskLayoutMode, { h: number; v: number }> = {
  tree: { h: 36, v: 64 },
  compact: { h: 14, v: 38 },
  grid: { h: 10, v: 26 },
}

/** Grid mode wraps a depth row after this many columns. */
export const GRID_MAX_COLS = 6

/** One laid-out node: the view-model node plus its canvas rectangle. */
export interface TaskNodeBox {
  readonly node: TaskNodeVM
  readonly x: number
  readonly y: number
  readonly w: number
  readonly h: number
}

/** One laid-out edge: parent bottom-center → child top-center, as a cubic curve. */
export interface TaskEdgePath {
  /** `${from}->${to}`; also the SVG element key. */
  readonly id: string
  /** The SVG path data. */
  readonly d: string
  /** The child node id. */
  readonly to: string
}

/** One manual position delta for one node (what a drag writes). */
export interface NodeOffset {
  readonly x: number
  readonly y: number
}

/** Manual node offsets by node id, relative to the auto layout. */
export type NodeOffsets = Readonly<Record<string, NodeOffset>>

/** The laid-out graph: node boxes, edge paths, and the content bounding box. */
export interface TasksGraphLayout {
  readonly nodes: readonly TaskNodeBox[]
  readonly edges: readonly TaskEdgePath[]
  /** Content box size; a dragged node can push it beyond the auto layout. */
  readonly width: number
  readonly height: number
  /** Content box origin; negative once a node is dragged up or left of 0,0. */
  readonly minX: number
  readonly minY: number
}

/**
 * Lay out the view model.
 * @param model - the view model (pre-order nodes plus the children index).
 * @param offsets - manual node offsets applied after auto placement.
 * @param mode - the arrangement mode.
 * @returns node boxes, edge paths, and the content box.
 */
export function layoutTasksGraph(
  model: TasksGraphModel,
  offsets: NodeOffsets = {},
  mode: TaskLayoutMode = 'tree',
): TasksGraphLayout {
  const boxes: TaskNodeBox[] = []
  const edges: TaskEdgePath[] = []
  const boxOf = new Map<string, TaskNodeBox>()
  let maxDepth = 0
  const vGap = MODE_GAPS[mode].v
  const hGap = MODE_GAPS[mode].h
  const rowSpan = TASK_NODE_H + vGap

  /** Place one subtree at `offsetX`; returns the width it occupies. */
  const placeAt = (node: TaskNodeVM, depth: number, offsetX: number): number => {
    maxDepth = Math.max(maxDepth, depth)
    const kids = model.childrenOf[node.id] ?? []
    const y = depth * rowSpan
    if (kids.length === 0) {
      const box = { node, x: offsetX, y, w: TASK_NODE_W, h: TASK_NODE_H }
      boxes.push(box)
      boxOf.set(node.id, box)
      return TASK_NODE_W
    }
    let childX = offsetX
    let childEnd = offsetX
    for (const kid of kids) {
      const w = placeAt(kid, depth + 1, childX)
      childX += w + hGap
      childEnd = Math.max(childEnd, childX - hGap)
    }
    const subtreeWidth = childEnd - offsetX
    const box = {
      node,
      x: offsetX + (subtreeWidth - TASK_NODE_W) / 2,
      y,
      w: TASK_NODE_W,
      h: TASK_NODE_H,
    }
    boxes.push(box)
    boxOf.set(node.id, box)
    return subtreeWidth
  }

  /** Pre-measure one subtree's occupied width, for root centering. */
  const measure = (id: string): number => {
    const kids = model.childrenOf[id] ?? []
    if (kids.length === 0) return TASK_NODE_W
    let w = 0
    for (const kid of kids) w += measure(kid.id) + hGap
    return Math.max(TASK_NODE_W, w - hGap)
  }

  const rootNode = model.nodes[0]
  let width = TASK_NODE_W
  if (mode === 'grid') {
    // Depth rows wrapped into a column grid: dense and predictable, at the
    // cost of parent centering (edges still connect the same pairs).
    const byDepth = new Map<number, TaskNodeVM[]>()
    for (const node of model.nodes) {
      const row = byDepth.get(node.depth)
      if (row === undefined) byDepth.set(node.depth, [node])
      else row.push(node)
    }
    let cursorY = 0
    for (const depth of [...byDepth.keys()].sort((left, right) => left - right)) {
      /* v8 ignore next -- every keyed depth has a row. */
      const row = byDepth.get(depth) ?? []
      const cols = Math.min(GRID_MAX_COLS, row.length)
      const rowWidth = cols * TASK_NODE_W + (cols - 1) * hGap
      row.forEach((node, index) => {
        const col = index % cols
        const line = Math.floor(index / cols)
        const box = {
          node,
          x: col * (TASK_NODE_W + hGap),
          y: cursorY + line * rowSpan,
          w: TASK_NODE_W,
          h: TASK_NODE_H,
        }
        boxes.push(box)
        boxOf.set(node.id, box)
      })
      width = Math.max(width, rowWidth)
      cursorY += Math.ceil(row.length / cols) * rowSpan
      maxDepth = Math.max(maxDepth, depth)
    }
  } else if (rootNode !== undefined) {
    // One root: the subtree packs from the origin and the root centers itself
    // over its descendants, so the content box starts at x=0.
    const roots = model.childrenOf[rootNode.id] ?? []
    let span = 0
    for (const kid of roots) span += measure(kid.id) + hGap
    span = Math.max(span - hGap, TASK_NODE_W)
    placeAt(rootNode, 0, 0)
    width = span + hGap * 2
  }

  // Manual offsets move the box after placement, so edges and the content
  // bounding box below are computed from what the user actually sees.
  let minX = 0
  let minY = 0
  let maxX = 0
  let maxY = 0
  const placed = boxes.map((box) => {
    const offset = offsets[box.node.id]
    if (offset === undefined) return box
    return { ...box, x: box.x + offset.x, y: box.y + offset.y }
  })
  for (const box of placed) {
    boxOf.set(box.node.id, box)
    minX = Math.min(minX, box.x)
    minY = Math.min(minY, box.y)
    maxX = Math.max(maxX, box.x + box.w)
    maxY = Math.max(maxY, box.y + box.h)
  }

  // Edges: parent bottom-center → child top-center, after placement.
  for (const box of placed) {
    for (const kid of model.childrenOf[box.node.id] ?? []) {
      const child = boxOf.get(kid.id)
      /* v8 ignore next -- placement places every child before this walk. */
      if (child === undefined) continue
      const x1 = box.x + box.w / 2
      const y1 = box.y + box.h
      const x2 = child.x + child.w / 2
      const y2 = child.y
      const bend = Math.max(vGap / 2, 18)
      edges.push({
        id: `${box.node.id}->${kid.id}`,
        d: `M ${x1} ${y1} C ${x1} ${y1 + bend}, ${x2} ${y2 - bend}, ${x2} ${y2}`,
        to: kid.id,
      })
    }
  }

  const height = Math.max(maxY, (maxDepth + 1) * rowSpan)
  return {
    nodes: placed,
    edges,
    width: Math.max(width, maxX),
    height,
    minX,
    minY,
  }
}

/**
 * Every id in one node's subtree, the node itself first.
 * @param model - the view model, for the children graph.
 * @param nodeId - the subtree root.
 * @returns the subtree ids in depth-first order.
 */
export function subtreeIds(
  model: Pick<TasksGraphModel, 'childrenOf'>,
  nodeId: string,
): string[] {
  const ids: string[] = []
  const walk = (id: string): void => {
    ids.push(id)
    for (const kid of model.childrenOf[id] ?? []) walk(kid.id)
  }
  walk(nodeId)
  return ids
}

/**
 * The offsets after dragging one node by (dx, dy).
 *
 * Always computed from the offsets captured when the gesture started plus the
 * total delta, so a long drag cannot accumulate rounding drift. With
 * `subtree` the descendants ride along — the default, since a card that owns
 * other cards moves them naturally; the Alt key drags the single card.
 * @param model - the view model, for the children graph.
 * @param base - the offsets captured at gesture start.
 * @param nodeId - the dragged node.
 * @param dx - the total horizontal delta.
 * @param dy - the total vertical delta.
 * @param subtree - whether the node's descendants move too.
 * @returns the next offsets.
 */
export function dragOffsets(
  model: Pick<TasksGraphModel, 'childrenOf'>,
  base: NodeOffsets,
  nodeId: string,
  dx: number,
  dy: number,
  subtree: boolean,
): NodeOffsets {
  const next: Record<string, NodeOffset> = { ...base }
  for (const id of subtree ? subtreeIds(model, nodeId) : [nodeId]) {
    const current = base[id] ?? { x: 0, y: 0 }
    next[id] = { x: current.x + dx, y: current.y + dy }
  }
  return next
}

/**
 * Whether any manual offset is in effect; drives the reset affordance.
 * @param offsets - the offsets in force.
 * @returns whether at least one node is displaced.
 */
export function hasOffsets(offsets: NodeOffsets): boolean {
  return Object.keys(offsets).length > 0
}
