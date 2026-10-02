/**
 * The tasks graph's layout: tree centering, the three arrangement modes,
 * manual offsets, drag math, and the edge paths, over hand-built models.
 *
 * Numbers are pinned where a user could see them wrong (positions, the content
 * box, edge endpoints) and left symbolic elsewhere.
 */
import { describe, expect, it } from 'vitest'
import { GRID_MAX_COLS, TASK_NODE_H, TASK_NODE_W, dragOffsets, hasOffsets, layoutTasksGraph, subtreeIds } from '../src/client/tasks-graph-layout.ts'
import type { NodeOffsets, TaskLayoutMode } from '../src/client/tasks-graph-layout.ts'
import type { TaskNodeVM, TasksGraphModel } from '../src/client/tasks-graph-model.ts'

/**
 * One view-model node with the given id and depth.
 * @param id - the node id.
 * @param depth - the nesting level.
 * @returns the node.
 */
function node(id: string, depth: number): TaskNodeVM {
  return {
    id, kind: 'subagent', parentId: undefined, depth, label: id, secondary: '',
    running: false, current: false, address: undefined, childCount: undefined, aggregateKey: undefined,
  }
}

/**
 * One view model from a parent→children index, nodes in pre-order.
 * @param rootId - the root's id.
 * @param childrenOf - the children index.
 * @returns the model.
 */
function modelOf(rootId: string, childrenOf: Record<string, TaskNodeVM[]>): TasksGraphModel {
  const nodes: TaskNodeVM[] = []
  const walk = (id: string, depth: number): void => {
    nodes.push(node(id, depth))
    for (const kid of childrenOf[id] ?? []) walk(kid.id, depth + 1)
  }
  walk(rootId, 0)
  return { nodes, childrenOf }
}

/** The empty model: a lone main node. */
const LONE = modelOf('root', {})

/**
 * One laid-out box by node id.
 * @param layout - the layout to read.
 * @param id - the node id.
 * @returns the box.
 */
function boxOf(layout: ReturnType<typeof layoutTasksGraph>, id: string) {
  const box = layout.nodes.find(candidate => candidate.node.id === id)
  expect(box, `box ${id}`).toBeDefined()
  return box as NonNullable<typeof box>
}

describe('layoutTasksGraph tree', () => {
  it('places a lone root at the origin with the mode gaps in the content box', () => {
    const layout = layoutTasksGraph(LONE)
    expect(layout.nodes).toEqual([{ node: LONE.nodes[0], x: 0, y: 0, w: TASK_NODE_W, h: TASK_NODE_H }])
    expect(layout.minX).toBe(0)
    expect(layout.minY).toBe(0)
    expect(layout.edges).toEqual([])
  })

  it('centers a parent over its leaf-packed subtree', () => {
    const model = modelOf('root', {
      root: [node('a', 1), node('b', 1)],
    })
    const layout = layoutTasksGraph(model)
    const root = boxOf(layout, 'root')
    const a = boxOf(layout, 'a')
    const b = boxOf(layout, 'b')
    expect(a.x).toBe(0)
    expect(b.x).toBe(TASK_NODE_W + 36)
    // The root's center equals the children's span center.
    expect(root.x + TASK_NODE_W / 2).toBe((a.x + b.x + TASK_NODE_W) / 2)
    // The root row sits at y=0; the children one rowSpan below.
    expect(a.y).toBe(TASK_NODE_H + 64)
    expect(b.y).toBe(TASK_NODE_H + 64)
    expect(root.y).toBe(0)
    expect(layout.width).toBeGreaterThan(b.x + TASK_NODE_W)
  })

  it('nests grandchildren a row below their parent', () => {
    const model = modelOf('root', { root: [node('a', 1)], a: [node('g', 2)] })
    const layout = layoutTasksGraph(model)
    const a = boxOf(layout, 'a')
    const g = boxOf(layout, 'g')
    expect(g.y).toBe(a.y + TASK_NODE_H + 64)
  })

  it('draws one cubic edge per parent→child pair, between the box edges', () => {
    const model = modelOf('root', { root: [node('a', 1), node('b', 1)] })
    const layout = layoutTasksGraph(model)
    expect(layout.edges.map(edge => edge.id).sort()).toEqual(['root->a', 'root->b'])
    const root = boxOf(layout, 'root')
    const a = boxOf(layout, 'a')
    const edge = layout.edges.find(candidate => candidate.id === 'root->a')
    const x1 = root.x + TASK_NODE_W / 2
    const y1 = root.y + TASK_NODE_H
    const x2 = a.x + TASK_NODE_W / 2
    expect(edge?.d).toBe(`M ${x1} ${y1} C ${x1} ${y1 + 32}, ${x2} ${a.y - 32}, ${x2} ${a.y}`)
    expect(edge?.to).toBe('a')
  })

  it('keeps height at one row even when the deepest box ends higher', () => {
    const layout = layoutTasksGraph(LONE)
    expect(layout.height).toBe(TASK_NODE_H + 64)
  })
})

describe('layoutTasksGraph offsets', () => {
  it('moves an offset box and recomputes edges from the moved position', () => {
    const model = modelOf('root', { root: [node('a', 1)] })
    const layout = layoutTasksGraph(model, { a: { x: 10, y: -5 } })
    const a = boxOf(layout, 'a')
    // Auto y is one rowSpan; the offset rides on it.
    expect(a.x).toBe(10)
    expect(a.y).toBe(TASK_NODE_H + 64 - 5)
    const root = boxOf(layout, 'root')
    const edge = layout.edges[0]
    expect(edge?.d).toContain(`M ${root.x + TASK_NODE_W / 2} ${root.y + TASK_NODE_H}`)
    expect(edge?.d).toContain(` ${10 + TASK_NODE_W / 2} ${TASK_NODE_H + 64 - 5}`)
  })

  it('lets a dragged box push the content box negative', () => {
    const layout = layoutTasksGraph(LONE, { root: { x: -300, y: -40 } })
    expect(layout.minX).toBe(-300)
    expect(layout.minY).toBe(-40)
    expect(layout.width).toBeGreaterThan(TASK_NODE_W)
  })

  it('leaves unoffset boxes exactly at their auto positions', () => {
    const plain = layoutTasksGraph(LONE)
    const offset = layoutTasksGraph(LONE, { other: { x: 5, y: 5 } })
    expect(offset.nodes).toEqual(plain.nodes)
  })
})

describe('layoutTasksGraph grid', () => {
  it('packs each depth row left to right and wraps after the column cap', () => {
    const model = modelOf('root', {
      root: Array.from({ length: GRID_MAX_COLS + 1 }, (_, index) => node(`n${index}`, 1)),
    })
    const layout = layoutTasksGraph(model, {}, 'grid')
    const row = layout.nodes.slice(1)
    expect(row[0]?.x).toBe(0)
    expect(row[GRID_MAX_COLS - 1]?.x).toBe((GRID_MAX_COLS - 1) * (TASK_NODE_W + 10))
    // The seventh card wraps to the first column, one line down.
    expect(row[GRID_MAX_COLS]?.x).toBe(0)
    // Depth row zero (the lone root) owns the first line; the wrapped card is
    // the second line of the fan row.
    expect(row[GRID_MAX_COLS]?.y).toBe((TASK_NODE_H + 26) * 2)
    expect(layout.nodes[0]?.y).toBe(0)
  })

  it('widens the content box to the wrapped row and advances the next row', () => {
    const model = modelOf('root', {
      root: Array.from({ length: GRID_MAX_COLS + 1 }, (_, index) => node(`n${index}`, 1)),
    })
    const layout = layoutTasksGraph(model, {}, 'grid')
    expect(layout.width).toBe(GRID_MAX_COLS * TASK_NODE_W + (GRID_MAX_COLS - 1) * 10)
    // The third depth row starts below the two-line fan row.
    const last = layout.nodes.at(-1)
    expect(last?.y).toBe((TASK_NODE_H + 26) * 2)
  })
})

describe('layoutTasksGraph modes', () => {
  it('packs the same tree tighter in compact mode', () => {
    const model = modelOf('root', { root: [node('a', 1), node('b', 1)] })
    const tree = layoutTasksGraph(model, {}, 'tree')
    const compact = layoutTasksGraph(model, {}, 'compact')
    const treeA = boxOf(tree, 'a')
    const treeB = boxOf(tree, 'b')
    const compactA = boxOf(compact, 'a')
    const compactB = boxOf(compact, 'b')
    expect(treeB.x - treeA.x).toBeGreaterThan(compactB.x - compactA.x)
    expect(treeB.y).toBeGreaterThan(compactB.y)
  })

  it('defaults to the tree arrangement', () => {
    const model = modelOf('root', { root: [node('a', 1)] })
    expect(layoutTasksGraph(model)).toEqual(layoutTasksGraph(model, {}, 'tree' satisfies TaskLayoutMode))
  })
})

describe('layoutTasksGraph empty model', () => {
  it('lays out nothing for a model with no nodes', () => {
    const layout = layoutTasksGraph({ nodes: [], childrenOf: {} })
    expect(layout.nodes).toEqual([])
    expect(layout.edges).toEqual([])
  })
})

describe('subtreeIds', () => {
  it('walks depth-first with the node itself first', () => {
    const model = modelOf('root', {
      root: [node('a', 1), node('b', 1)],
      a: [node('g1', 2), node('g2', 2)],
    })
    expect(subtreeIds(model, 'a')).toEqual(['a', 'g1', 'g2'])
    expect(subtreeIds(model, 'root')).toEqual(['root', 'a', 'g1', 'g2', 'b'])
  })

  it('returns just the node when it is a leaf', () => {
    expect(subtreeIds(LONE, 'root')).toEqual(['root'])
  })
})

describe('dragOffsets', () => {
  const model = modelOf('root', { root: [node('a', 1)], a: [node('g', 2)] })

  it('moves the dragged node and its subtree by the total delta', () => {
    const next = dragOffsets(model, {}, 'a', 12, -7, true)
    expect(next.a).toEqual({ x: 12, y: -7 })
    expect(next.g).toEqual({ x: 12, y: -7 })
    expect(next.root).toBeUndefined()
  })

  it('moves only the card under Alt', () => {
    const next = dragOffsets(model, {}, 'a', 12, -7, false)
    expect(next.a).toEqual({ x: 12, y: -7 })
    expect(next.g).toBeUndefined()
  })

  it('computes from the gesture-start offsets, so repeated calls do not drift', () => {
    const base: NodeOffsets = { a: { x: 5, y: 5 }, g: { x: 5, y: 5 } }
    const once = dragOffsets(model, base, 'a', 3, 0, true)
    const twice = dragOffsets(model, base, 'a', 6, 0, true)
    expect(once.a).toEqual({ x: 8, y: 5 })
    expect(twice.a).toEqual({ x: 11, y: 5 })
  })

  it('keeps offsets the drag does not touch', () => {
    const base: NodeOffsets = { b: { x: 1, y: 2 } }
    const next = dragOffsets(model, base, 'a', 4, 4, true)
    expect(next.b).toEqual({ x: 1, y: 2 })
  })
})

describe('hasOffsets', () => {
  it('reads false while the layout is untouched', () => {
    expect(hasOffsets({})).toBe(false)
  })

  it('reads true once any node is displaced', () => {
    expect(hasOffsets({ a: { x: 1, y: 1 } })).toBe(true)
  })
})
