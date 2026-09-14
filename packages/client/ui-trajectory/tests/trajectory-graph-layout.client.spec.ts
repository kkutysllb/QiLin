/**
 * Graph layout geometry: ledger order as the vertical axis, the actor lane as
 * the horizontal one, and one cubic path per edge kind. Every expected number
 * below is derived from DEFAULTS (width 372, rowHeight 44, nodeHeight 30,
 * bandHeight 22, padding 10) with the arithmetic spelled out.
 */
import { describe, expect, it } from 'vitest'
import {
  ellipsize, layoutTrajectoryGraph,
} from '../src/client/trajectory-graph-layout.ts'
import type {
  TrajectoryGraph, TrajectoryGraphEdge, TrajectoryGraphEdgeKind, TrajectoryGraphNode,
  TrajectoryGraphNodeKind, TrajectoryLane,
} from '../src/client/trajectory-graph.ts'

function node(id: string, lane: TrajectoryLane, kind: TrajectoryGraphNodeKind = 'tool'): TrajectoryGraphNode {
  return { id, kind, lane, status: 'idle', seq: 1, time: 0, turn: null, step: null, label: id, live: false }
}

function edge(from: string, to: string, kind: TrajectoryGraphEdgeKind = 'result'): TrajectoryGraphEdge {
  return { id: kind + ':' + from + '->' + to, from, to, kind, live: false }
}

function graph(nodes: readonly TrajectoryGraphNode[], edges: readonly TrajectoryGraphEdge[] = []): TrajectoryGraph {
  return {
    nodes,
    edges,
    bands: [],
    timeline: [],
    stats: { nodes: nodes.length, edges: edges.length, turns: 0, tools: 0, running: 0, errors: 0, tokens: {} },
    live: false,
  }
}

/** The numbers in one SVG path, for float-tolerant comparison. */
function numbers(d: string): number[] {
  return d.split(/[^.\d-]+/).filter(part => part !== '').map(Number)
}

function expectPath(d: string, expected: readonly number[]): void {
  const got = numbers(d)
  expect(got.length).toBe(expected.length)
  expected.forEach((value, index) => expect(got[index]).toBeCloseTo(value, 6))
}

describe('layoutTrajectoryGraph lanes and rows', () => {
  it('places the three lanes at their tuned centers and rows 44 apart', () => {
    const laid = layoutTrajectoryGraph(graph([
      node('u', 'input'), node('m', 'model', 'request'), node('t', 'tool'),
    ]))
    expect(laid.width).toBe(372)
    // input cx 62 w 108 → x = 62 - 54; model cx 186 w 140 → 186 - 70; tool cx 310 w 108 → 310 - 54.
    expect(laid.nodes.map(n => [n.node.id, n.x, n.w])).toEqual([
      ['u', 8, 108], ['m', 116, 140], ['t', 256, 108],
    ])
    // Row tops: padding 10 + row * 44 + (44 - 30) / 2; canvas height pads both ends.
    expect(laid.nodes.map(n => n.y)).toEqual([17, 61, 105])
    expect(laid.height).toBe(152)
  })

  it('honors geometry overrides', () => {
    const laid = layoutTrajectoryGraph(graph([node('u', 'input')]), {
      width: 500, rowHeight: 20, nodeHeight: 10, padding: 2,
    })
    expect(laid.width).toBe(500)
    expect(laid.nodes[0]).toMatchObject({ x: 8, y: 2 + (20 - 10) / 2, w: 108, h: 10 })
    expect(laid.height).toBe(24)
  })
})

describe('layoutTrajectoryGraph turn bands', () => {
  it('reserves the header above a numbered band and none outside every turn', () => {
    const withBands: TrajectoryGraph = {
      nodes: [node('a', 'input'), node('b', 'model', 'request'), node('c', 'model', 'assistant')],
      edges: [],
      bands: [
        { turn: 1, from: 0, to: 2 },
        { turn: null, from: 2, to: 3 },
      ],
      timeline: [],
      stats: { nodes: 3, edges: 0, turns: 1, tools: 0, running: 0, errors: 0, tokens: {} },
      live: false,
    }
    const placed = layoutTrajectoryGraph(withBands)
    // Band 1: header 22 above two rows → y 10, height 22 + 88 = 110; the null
    // band reserves no header → y 120, height 44.
    expect(placed.bands).toEqual([
      { turn: 1, y: 10, height: 110, from: 0, to: 2 },
      { turn: null, y: 120, height: 44, from: 2, to: 3 },
    ])
    expect(placed.nodes.map(n => n.y)).toEqual([39, 83, 127])
    expect(placed.height).toBe(174)
  })
})

describe('layoutTrajectoryGraph subcall nesting', () => {
  it('shifts and shrinks nested calls right up to the depth cap', () => {
    const nodes = ['t0', 't1', 't2', 't3', 't4'].map(id => node(id, 'tool'))
    const laid = layoutTrajectoryGraph(graph(nodes, [
      edge('t0', 't1', 'subcall'), edge('t1', 't2', 'subcall'),
      edge('t2', 't3', 'subcall'), edge('t3', 't4', 'subcall'),
    ]))
    // dx = depth * 10, shrink = depth * 12, capped at depth 3.
    expect(laid.nodes.map(n => [n.node.id, n.x, n.w])).toEqual([
      ['t0', 256, 108], ['t1', 272, 96], ['t2', 288, 84], ['t3', 304, 72], ['t4', 304, 72],
    ])
  })

  it('survives a subcall cycle without recursing forever', () => {
    const laid = layoutTrajectoryGraph(graph(
      [node('a', 'tool'), node('b', 'tool')],
      [edge('a', 'b', 'subcall'), edge('b', 'a', 'subcall')],
    ))
    expect(laid.nodes.map(n => [n.node.id, n.w])).toEqual([['a', 84], ['b', 96]])
  })
})

describe('layoutTrajectoryGraph edge routing', () => {
  it('drops edges whose endpoints are outside the graph', () => {
    const u = node('u', 'input')
    const laid = layoutTrajectoryGraph(graph([u], [edge('ghost', 'u', 'prompt'), edge('u', 'phantom', 'prompt')]))
    expect(laid.edges).toEqual([])
  })

  it('routes a same-lane result as a near-vertical cubic', () => {
    const r = node('r', 'model', 'request')
    const a = node('a', 'model', 'assistant')
    const laid = layoutTrajectoryGraph(graph([r, a], [edge('r', 'a', 'result')]))
    // From r's bottom (186, 47) to a's top (186, 61): k clamps up to 10.
    expectPath(laid.edges[0]!.d, [186, 47, 186, 52.6, 186, 55.4, 186, 61])
  })

  it('routes a prompt as the default cubic with the unclamped elbow', () => {
    const u = node('u', 'input', 'user')
    const r = node('r', 'model', 'request')
    const laid = layoutTrajectoryGraph(graph([u, r], [edge('u', 'r', 'prompt')]))
    expectPath(laid.edges[0]!.d, [62, 47, 62, 57, 186, 51, 186, 61])
  })

  it('routes the loop on its right rail', () => {
    const t = node('t', 'tool')
    const r = node('r', 'model', 'request')
    const laid = layoutTrajectoryGraph(graph([t, r], [edge('t', 'r', 'loop')]))
    expectPath(laid.edges[0]!.d, [310, 47, 336, 57, 222.4, 51, 186, 61])
  })

  it('routes a backwards link around a right-side rail', () => {
    const u = node('u', 'input', 'user')
    const a = node('a', 'model', 'assistant')
    // a sits one row BELOW u, so the edge runs upward: dy = 17 - 91 = -74.
    const laid = layoutTrajectoryGraph(graph([u, a], [edge('a', 'u', 'result')]))
    expectPath(laid.edges[0]!.d, [186, 91, 214, 115, 214, -7, 62, 17])
  })

  it('clamps the default cubic elbow at 64 on long spans', () => {
    const u = node('u', 'input', 'user')
    const far = node('far', 'model', 'request')
    const fillers = ['f1', 'f2', 'f3'].map(id => node(id, 'model', 'assistant'))
    const laid = layoutTrajectoryGraph(graph([u, ...fillers, far], [edge('u', 'far', 'prompt')]))
    // dy = 193 - 47 = 146 → k clamps down to 64.
    expectPath(laid.edges[0]!.d, [62, 47, 62, 111, 186, 129, 186, 193])
  })
})

describe('ellipsize', () => {
  it('keeps labels that fit and cuts the rest at the column boundary', () => {
    // Latin column = 11 * 0.56 ≈ 6.16; four glyphs exceed maxWidth 20.
    expect(ellipsize('hi', 100, 11)).toBe('hi')
    expect(ellipsize('abcdefg', 20, 11)).toBe('abc…')
  })

  it('counts a CJK glyph as 1.75 latin columns', () => {
    expect(ellipsize('你好世界', 21, 11)).toBe('你…')
    expect(ellipsize('你好', 24, 11)).toBe('你好')
  })
})
