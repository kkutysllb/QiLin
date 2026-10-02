// @vitest-environment jsdom
/**
 * TrajectoryGraphView behavior on real props: the toolbar's controls (fit,
 * follow, flow pause, zoom, replay), the search box and the edge legend, the
 * canvas pan, node selection with its inspector sections (attachments,
 * Markdown bodies, structured tool calls), and keyboard selection. Vitest's
 * CSS-module stub yields class tokens as plain names, so the few class-driven
 * assertions query by token.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createSnapshotStore } from '@qilin/client-store'
import { bindSnapshotSelector } from '@qilin/client-test-runtime'
import type { AttachmentId } from '@qilin/attachment'
import type { ContentBlock } from '@qilin/llm/types'
import type {
  AssistantMessageNode, ConversationNode, MessageImageLoader, RequestView, StartedToolCall,
  ToolResultNode, UserMessageNode,
} from '@qilin/client-ui-conversation/client'
import type { SessionId } from '@qilin/session/types'
import type { TrajectorySnapshot } from '../src/client/trajectory-contract.ts'
import { EMPTY_TRAJECTORY_SNAPSHOT } from '../src/client/trajectory-snapshot-builder.ts'
import { ZOOM_MAX } from '../src/client/trajectory-graph-canvas.ts'
import { TrajectoryGraphView } from '../src/client/TrajectoryGraphView.tsx'
import { t as tTrajectory } from './locale.client.ts'

const SID = 's1' as SessionId

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function text(value: string): ContentBlock {
  return { type: 'text', text: value }
}

function imageContent(name?: string): ContentBlock {
  return {
    type: 'image',
    attachment: {
      attachmentId: 'att-image' as AttachmentId,
      mediaType: 'image/png',
      bytes: 2048,
      width: 64,
      height: 32,
      ...(name === undefined ? {} : { name }),
    },
  } satisfies ContentBlock
}

function fileContent(): ContentBlock {
  return {
    type: 'file',
    attachment: { attachmentId: 'att-file' as AttachmentId, name: 'notes.txt', bytes: 3 },
  } satisfies ContentBlock
}

function userNode(seq: number, content: readonly ContentBlock[] = []): UserMessageNode {
  return { kind: 'user', seq, time: seq * 1000, content, source: null }
}

function assistantNode(seq: number, over: Partial<AssistantMessageNode> = {}): AssistantMessageNode {
  return { kind: 'assistant', seq, time: seq * 1000, turn: 1, step: 1, blocks: [], ...over }
}

function toolResultNode(seq: number, callId: string, over: Partial<ToolResultNode> = {}): ToolResultNode {
  return {
    kind: 'tool-result', seq, time: seq * 1000, callId, call: null, callTime: null,
    content: [], isError: false, subCalls: [], ...over,
  }
}

function requestView(startSeq: number, over: Partial<Extract<RequestView, { purpose: 'assistant' }>> = {}): RequestView {
  return {
    purpose: 'assistant', startSeq, startedAt: startSeq * 1000, completedAt: startSeq * 1000 + 500,
    status: 'complete', turn: 1, step: 1, ...over,
  }
}

function runningCall(callId: string, over: Partial<StartedToolCall> = {}): StartedToolCall {
  return {
    phase: 'start', callId, name: 'bash', argsRaw: '', turn: 1, step: 1, time: 500, subCalls: [], ...over,
  }
}

function snapshotOf(over: Partial<TrajectorySnapshot> = {}): TrajectorySnapshot {
  return {
    eventNodes: [], eventLocations: new Map(), requests: [], callSchemas: new Map(),
    partial: null, runningCalls: [], ...over,
  }
}

/** An authorized image loader stub: configurable peek, promise, and call log. */
function stubLoader(over: { peek?: string | undefined; reject?: boolean } = {}): MessageImageLoader & {
  calls: number
} {
  const loader = Object.assign(
    () => {
      loader.calls += 1
      return over.reject === true
        ? Promise.reject(new Error('unauthorized'))
        : Promise.resolve('blob:resolved')
    },
    { peek: () => over.peek, calls: 0 },
  )
  return loader
}

/**
 * The graph body reads the trajectory hook, the locale seat, the image loader,
 * and the ledger control; the rest of the session-scope runtime kit stays
 * unprovided.
 */
function mountGraph(
  snapshot: TrajectorySnapshot,
  over: { loadImage?: MessageImageLoader; openLedger?: () => void } = {},
) {
  const trajectory = createSnapshotStore<TrajectorySnapshot>(snapshot)
  const props: Partial<Parameters<typeof TrajectoryGraphView>[0]> = {
    sessionId: SID,
    useTrajectory: bindSnapshotSelector(trajectory),
    loadImage: over.loadImage ?? stubLoader(),
    openLedger: over.openLedger ?? vi.fn(),
    t: tTrajectory,
  }
  return { view: render(<TrajectoryGraphView {...(props as Parameters<typeof TrajectoryGraphView>[0])} />), trajectory }
}

const FULL_USAGE = {
  inputTokens: 10, outputTokens: 4, cacheReadTokens: 2, cacheWriteTokens: 1, reasoningTokens: 3,
}

/** Turn-less unknown, one user turn with a request, assistant, tool, and a second request. */
function staticSnapshot(): TrajectorySnapshot {
  return snapshotOf({
    eventNodes: [
      { kind: 'unknown', seq: 1, time: 1000, type: 'future/event', data: null } satisfies ConversationNode,
      userNode(2),
      assistantNode(4, {
        blocks: [{ kind: 'text', text: 'Answer' }],
        usage: FULL_USAGE,
        timing: { stepStartTime: 4000, firstTokenTime: 4500, completedTime: 6500 },
      }),
      toolResultNode(5, 'abcdef1234567', {
        call: { name: 'read', argsRaw: '{"a":1}' }, content: [text('done')],
      }),
    ],
    requests: [
      requestView(3, { startedAt: 1000, completedAt: 3500, resultSeq: 4 }),
      requestView(30, { startedAt: 40000, completedAt: 40500 }),
    ],
  })
}

function liveSnapshot(): TrajectorySnapshot {
  return snapshotOf({
    eventNodes: [
      userNode(1),
      assistantNode(4, { blocks: [{ kind: 'tool-call', callId: 'p1', name: 'bash', argsRaw: 'ls' }] }),
    ],
    requests: [requestView(2, { status: 'running', completedAt: null })],
    partial: { turn: 1, step: 1, blocks: [{ kind: 'text', text: 'streaming now' }] },
    runningCalls: [runningCall('p1', { argsRaw: 'ls', subCalls: [runningCall('p2')] })],
  })
}

/** The canvas svg of a mounted graph. */
function svgOf(container: HTMLElement): SVGSVGElement {
  return container.querySelector('svg[role="img"]')!
}

/** The scrollable canvas host. */
function canvasOf(container: HTMLElement): HTMLDivElement {
  return container.querySelector('[class*="canvas"]') as HTMLDivElement
}

/** Every dimmed node group. */
function dimmedNodes(container: HTMLElement): Element[] {
  return [...container.querySelectorAll('[class*="nodeDim"]')]
}

describe('TrajectoryGraphView empty state', () => {
  it('renders the empty copy without a canvas', () => {
    const { view } = mountGraph(EMPTY_TRAJECTORY_SNAPSHOT)
    expect(screen.getByText('No trajectory records to draw')).toBeTruthy()
    // Toolbar icons are SVGs; the canvas is the only one that carries role=img.
    expect(view.container.querySelector('svg[role="img"]')).toBeNull()
    expect(document.querySelectorAll('[class*="liveDot"]').length).toBe(0)
  })

  it('ignores the fit press while no canvas exists', () => {
    mountGraph(EMPTY_TRAJECTORY_SNAPSHOT)
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Fit view' }))).not.toThrow()
  })

  it('opens the ledger from its toolbar control', () => {
    const openLedger = vi.fn()
    mountGraph(staticSnapshot(), { openLedger })
    const control = screen.getByRole('button', { name: 'Ledger' })
    expect(control.getAttribute('title')).toBe('Ledger')
    fireEvent.click(control)
    expect(openLedger).toHaveBeenCalledTimes(1)
  })
})

describe('TrajectoryGraphView toolbar', () => {
  it('renders the session stats and the lane legend', () => {
    mountGraph(staticSnapshot())
    expect(screen.getByText('6 nodes')).toBeTruthy()
    expect(screen.getByText('3 edges')).toBeTruthy()
    // The stats templates do not pluralize.
    expect(screen.getByText('1 turns')).toBeTruthy()
    expect(screen.getByText('20 tokens')).toBeTruthy()
    expect(screen.getByText('Input')).toBeTruthy()
    expect(screen.getByText('Tool')).toBeTruthy()
    // The token stat breaks its buckets down in the tooltip.
    expect(screen.getByText('20 tokens').getAttribute('title')).toContain('Input 10')
    expect(screen.getByText('20 tokens').getAttribute('title')).toContain('Reasoning 3')
    // The turn-less unknown record opens no band label.
    expect(screen.getAllByText('Turn 1').length).toBe(1)
  })

  it('ranks the slowest tool records and omits the chip when none carries a duration', () => {
    const base = staticSnapshot()
    mountGraph(snapshotOf({
      ...base,
      eventNodes: base.eventNodes.map(node =>
        node.kind === 'tool-result' ? { ...node, callTime: 4000, time: 6400 } : node),
    }))
    const chip = screen.getByText('Slowest read 2.4 s')
    expect(chip.getAttribute('title')).toContain('read 2.4 s')
    cleanup()
    mountGraph(staticSnapshot())
    expect(screen.queryByText(/Slowest/)).toBeNull()
  })

  it('fits the graph width, toggles follow and flow pause, and zooms stepwise', () => {
    const { view } = mountGraph(staticSnapshot())
    const svg = svgOf(view.container)
    const width0 = Number(svg.getAttribute('width'))
    expect(width0).toBe(372)

    // Fit reads the canvas width; jsdom reports none, so the scale falls back to 1.
    fireEvent.click(screen.getByRole('button', { name: 'Fit view' }))
    expect(Number(svgOf(view.container).getAttribute('width'))).toBe(width0)
    // Fitting unhooks the tail follow.
    expect(screen.getByRole('button', { name: 'Follow latest' }).getAttribute('aria-pressed')).toBe('false')
    // The follow toggle still works after a fit.
    fireEvent.click(screen.getByRole('button', { name: 'Follow latest' }))
    expect(screen.getByRole('button', { name: 'Follow latest' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Follow latest' }))
    expect(screen.getByRole('button', { name: 'Follow latest' }).getAttribute('aria-pressed')).toBe('false')

    const pause = screen.getByRole('button', { name: 'Pause flow' })
    fireEvent.click(pause)
    expect(screen.getByRole('button', { name: 'Resume flow' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Resume flow' }))
    expect(screen.getByRole('button', { name: 'Pause flow' }).getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    const zoomed = Number(svgOf(view.container).getAttribute('width'))
    expect(zoomed).toBeGreaterThan(width0)
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(Number(svgOf(view.container).getAttribute('width'))).toBe(width0)
  })

  it('clamps the zoom at its bounds and computes fit from a real canvas width', () => {
    const { view } = mountGraph(staticSnapshot())
    const canvas = canvasOf(view.container)
    // Zoom in past the ceiling: the scale stops at ZOOM_MAX.
    for (let i = 0; i < 24; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(Number(svgOf(view.container).getAttribute('width'))).toBe(Math.round(372 * ZOOM_MAX))
    // A real canvas width drives the fit scale.
    Object.defineProperty(canvas, 'clientWidth', { value: 800 })
    fireEvent.click(screen.getByRole('button', { name: 'Fit view' }))
    expect(Number(svgOf(view.container).getAttribute('width'))).toBe(796)
    // Zooming out below the floor clamps at ZOOM_MIN.
    for (let i = 0; i < 30; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }))
    expect(Number(svgOf(view.container).getAttribute('width'))).toBe(Math.round(372 * 0.4))
  })

  it('zooms on the ctrl/⌘ wheel anchored at the pointer and ignores a plain wheel', () => {
    const { view } = mountGraph(staticSnapshot())
    const canvas = canvasOf(view.container)
    const before = Number(svgOf(view.container).getAttribute('width'))
    fireEvent.wheel(canvas, { deltaY: 120 })
    expect(Number(svgOf(view.container).getAttribute('width'))).toBe(before)
    canvas.scrollLeft = 50
    canvas.scrollTop = 20
    fireEvent.wheel(canvas, { deltaY: -120, ctrlKey: true, clientX: 100, clientY: 60 })
    expect(Number(svgOf(view.container).getAttribute('width'))).toBeGreaterThan(before)
    // The anchor keeps the scrolled content point visible: the scroll moved.
    expect(canvas.scrollLeft).not.toBe(50)
    // A shrinking wheel also pans the anchor back into place.
    fireEvent.wheel(canvas, { deltaY: 120, ctrlKey: true, clientX: 100, clientY: 60 })
  })

  it('pans by dragging, unhooks follow, and ignores non-primary buttons', () => {
    const { view } = mountGraph(staticSnapshot())
    const canvas = canvasOf(view.container)
    // A right-button press never starts a drag.
    fireEvent.pointerDown(canvas, { button: 2, clientX: 10, clientY: 10 })
    expect(canvas.getAttribute('class')).not.toContain('canvasDragging')
    fireEvent.pointerDown(canvas, { button: 0, clientX: 10, clientY: 10 })
    expect(canvas.getAttribute('class')).toContain('canvasDragging')
    // Sub-pixel jitter keeps the follow hook.
    fireEvent.pointerMove(window, { clientX: 11, clientY: 11 })
    expect(screen.getByRole('button', { name: 'Follow latest' }).getAttribute('aria-pressed')).toBe('true')
    // A real drag pans and unhooks follow.
    fireEvent.pointerMove(window, { clientX: 60, clientY: 40 })
    expect(canvas.scrollLeft).toBe(-50)
    expect(canvas.scrollTop).toBe(-30)
    expect(screen.getByRole('button', { name: 'Follow latest' }).getAttribute('aria-pressed')).toBe('false')
    fireEvent.pointerUp(window)
    expect(canvas.getAttribute('class')).not.toContain('canvasDragging')
    // A second stop (pointercancel after pointerup) is a no-op.
    fireEvent.pointerCancel(window)
    expect(canvas.getAttribute('class')).not.toContain('canvasDragging')
  })
})

describe('TrajectoryGraphView replay', () => {
  it('walks the ledger with recorded pacing and stops at the end', async () => {
    vi.useFakeTimers()
    const { view } = mountGraph(staticSnapshot())
    const total = 6
    // The speed control is inert outside a replay.
    expect(screen.getByRole('button', { name: 'Replay speed' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Stop replay' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
    expect(screen.getByRole('button', { name: 'Pause replay' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Stop replay' })).toBeTruthy()
    expect(dimmedNodes(view.container)).toHaveLength(total)
    // The walk paces each hop by the next record's own incoming gap: 1.0 s,
    // then the backwards request stamp floored at 90 ms, then a 1.1 s clamp.
    await act(async () => { await vi.advanceTimersByTimeAsync(120) })
    expect(dimmedNodes(view.container)).toHaveLength(total)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(dimmedNodes(view.container)).toHaveLength(total - 1)
    await act(async () => { await vi.advanceTimersByTimeAsync(120) })
    expect(dimmedNodes(view.container)).toHaveLength(total - 2)
    // The request record is the first with an incoming edge: its hop flies a
    // packet along the real edge path.
    await act(async () => { await vi.advanceTimersByTimeAsync(1200) })
    expect(dimmedNodes(view.container)).toHaveLength(total - 3)
    const packet = view.container.querySelector('[class*="packetHot"]')
    expect(packet).not.toBeNull()
    const motion = packet!.querySelector('animateMotion')
    expect(motion?.getAttribute('path')).toContain('C')
    expect(motion?.getAttribute('repeatCount')).toBe('1')
    // Cycle the speed.
    fireEvent.click(screen.getByRole('button', { name: 'Replay speed' }))
    expect(screen.getByRole('button', { name: 'Replay speed' }).textContent).toBe('×2')
    fireEvent.click(screen.getByRole('button', { name: 'Replay speed' }))
    expect(screen.getByRole('button', { name: 'Replay speed' }).textContent).toBe('×4')
    fireEvent.click(screen.getByRole('button', { name: 'Replay speed' }))
    expect(screen.getByRole('button', { name: 'Replay speed' }).textContent).toBe('×1')
    // The remaining hops: 1.0 s, the 35 s tool gap clamped to 1.1 s, and the
    // parked final hop.
    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
    expect(dimmedNodes(view.container)).toHaveLength(2)
    await act(async () => { await vi.advanceTimersByTimeAsync(1200) })
    expect(dimmedNodes(view.container)).toHaveLength(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1200) })
    expect(dimmedNodes(view.container)).toHaveLength(0)
    // The finished replay parks and offers a fresh start.
    expect(screen.getByRole('button', { name: 'Replay' })).toBeTruthy()
    // A finished replay restarts from the first record.
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
    expect(dimmedNodes(view.container)).toHaveLength(total)
    // Stop tears the replay down and re-enables a fresh start.
    fireEvent.click(screen.getByRole('button', { name: 'Stop replay' }))
    expect(screen.getByRole('button', { name: 'Replay speed' }).hasAttribute('disabled')).toBe(true)
    expect(dimmedNodes(view.container)).toHaveLength(0)
  })

  it('pauses on the cursor, resumes, and ends parked', async () => {
    vi.useFakeTimers()
    const { view } = mountGraph(snapshotOf({
      eventNodes: [userNode(1), assistantNode(3, { blocks: [{ kind: 'text', text: 'done' }] })],
      requests: [requestView(2, { startedAt: 2000, completedAt: 3000, resultSeq: 3 })],
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1200) })
    expect(dimmedNodes(view.container)).toHaveLength(2)
    // Pause freezes the cursor even as wall time passes.
    fireEvent.click(screen.getByRole('button', { name: 'Pause replay' }))
    expect(screen.getByRole('button', { name: 'Replay' })).toBeTruthy()
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(dimmedNodes(view.container)).toHaveLength(2)
    // Resuming finishes the walk: the remaining hops are each 1.0 s.
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    expect(dimmedNodes(view.container)).toHaveLength(1)
    await act(async () => { await vi.advanceTimersByTimeAsync(1200) })
    expect(dimmedNodes(view.container)).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'Replay' })).toBeTruthy()
  })

  it('keeps following off and the cursor in view during a replay', async () => {
    vi.useFakeTimers()
    const { view } = mountGraph(staticSnapshot())
    const canvas = canvasOf(view.container)
    canvas.scrollTop = 400
    Object.defineProperty(canvas, 'clientHeight', { value: 200 })
    fireEvent.click(screen.getByRole('button', { name: 'Replay' }))
    await act(async () => { await vi.advanceTimersByTimeAsync(1200) })
    // The replay keeps the current record inside the viewport.
    expect(canvas.scrollTop).not.toBe(400)
    // Re-enabling follow mid-replay does not fight the replay's own framing.
    fireEvent.click(screen.getByRole('button', { name: 'Follow latest' }))
    expect(screen.getByRole('button', { name: 'Follow latest' }).getAttribute('aria-pressed')).toBe('true')
    await act(async () => { await vi.advanceTimersByTimeAsync(1200) })
    expect(screen.getByRole('button', { name: 'Follow latest' }).getAttribute('aria-pressed')).toBe('true')
  })
})

describe('TrajectoryGraphView search', () => {
  it('locates, cycles, and clears record matches', () => {
    const { view } = mountGraph(staticSnapshot())
    const input = screen.getByRole('textbox', { name: 'Search records' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'read' } })
    expect(screen.getByText('1/1')).toBeTruthy()
    // Non-matching records dim while a query is active.
    expect(dimmedNodes(view.container).length).toBeGreaterThan(0)
    fireEvent.keyDown(input, { key: 'Enter' })
    // The jump selects the matching tool record.
    expect(screen.getByText('Arguments JSON')).toBeTruthy()
    // Cycling a single match wraps in place; Shift+Enter walks backwards.
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('Arguments JSON')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(screen.getByText('Arguments JSON')).toBeTruthy()
    // Plain typing never cycles.
    fireEvent.keyDown(input, { key: 'x' })
    // Escape clears the query and the dimming.
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('')
    expect(screen.queryByText('1/1')).toBeNull()
    expect(dimmedNodes(view.container)).toHaveLength(0)
  })

  it('reports a query with no matches', () => {
    mountGraph(staticSnapshot())
    const input = screen.getByRole('textbox', { name: 'Search records' })
    fireEvent.change(input, { target: { value: 'zzz' } })
    expect(screen.getByText('No matches')).toBeTruthy()
    fireEvent.change(input, { target: { value: '   ' } })
    expect(screen.queryByText('No matches')).toBeNull()
  })

  it('cycles multiple matches in ledger order', () => {
    mountGraph(staticSnapshot())
    const input = screen.getByRole('textbox', { name: 'Search records' }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'model' } })
    expect(screen.getByText('1/2')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('2/2')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByText('1/2')).toBeTruthy()
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })
    expect(screen.getByText('2/2')).toBeTruthy()
  })
})

describe('TrajectoryGraphView edge legend', () => {
  it('pins an edge kind, dims the others, and unpins on a second press', () => {
    const { view } = mountGraph(staticSnapshot())
    const prompt = screen.getByRole('button', { name: 'Prompt' })
    fireEvent.click(prompt)
    expect(prompt.getAttribute('aria-pressed')).toBe('true')
    expect(view.container.querySelectorAll('[class*="edgeKindHot"]').length).toBeGreaterThan(0)
    expect(view.container.querySelectorAll('[class*="edgeDim"]').length).toBeGreaterThan(0)
    fireEvent.click(prompt)
    expect(prompt.getAttribute('aria-pressed')).toBe('false')
    expect(view.container.querySelectorAll('[class*="edgeDim"]')).toHaveLength(0)
  })

  it('highlights a kind while its edge is hovered and keeps the pin on top', () => {
    const { view } = mountGraph(staticSnapshot())
    const hits = [...view.container.querySelectorAll('[class*="edgeHit"]')]
    // Hover one edge: its kind lights up.
    fireEvent.mouseEnter(hits[0]!)
    expect(view.container.querySelectorAll('[class*="edgeKindHot"]').length).toBeGreaterThan(0)
    // Moving between edges keeps exactly the new kind lit.
    fireEvent.mouseEnter(hits[1]!)
    fireEvent.mouseLeave(hits[0]!)
    expect(view.container.querySelectorAll('[class*="edgeKindHot"]').length).toBeGreaterThan(0)
    // A pin outranks the hover: hovering another kind changes nothing lit.
    const loop = screen.getByRole('button', { name: 'Loop' })
    fireEvent.click(loop)
    const pinned = view.container.querySelectorAll('[class*="edgeKindHot"]').length
    expect(pinned).toBeGreaterThan(0)
    fireEvent.mouseEnter(hits[0]!)
    expect(view.container.querySelectorAll('[class*="edgeKindHot"]').length).toBe(pinned)
    fireEvent.mouseLeave(hits[0]!)
    expect(view.container.querySelectorAll('[class*="edgeKindHot"]').length).toBe(pinned)
    // Unpinning clears the kind focus.
    fireEvent.click(loop)
    expect(view.container.querySelectorAll('[class*="edgeKindHot"]')).toHaveLength(0)
  })
})

describe('TrajectoryGraphView selection and inspector', () => {
  it('opens the structured tool body for a tool record', () => {
    const { view } = mountGraph(staticSnapshot())
    expect(screen.getByText('Select a node to read its arguments and result')).toBeTruthy()
    const tool = screen.getByRole('button', { name: 'Tool node: read' })
    expect(tool.getAttribute('data-kind')).toBe('tool')
    fireEvent.click(tool)
    expect(screen.getByText('Completed')).toBeTruthy()
    // The head names the tool and its call id.
    expect(screen.getAllByText('read').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('abcdef1234567')).toBeTruthy()
    // The arguments sit behind a collapsible pretty-JSON summary.
    const details = view.container.querySelector('details')
    expect(details?.hasAttribute('open')).toBe(false)
    fireEvent.click(screen.getByText('Arguments JSON'))
    expect(details?.hasAttribute('open')).toBe(true)
    expect(view.container.querySelector('[class*="toolArgs"] pre')?.textContent).toBe('{\n  "a": 1\n}')
    expect(view.container.querySelector('[class*="toolResultLabel"]')?.textContent).toBe('Result')
    expect(view.container.querySelector('[class*="toolResult"] pre')?.textContent).toBe('done')
    expect(screen.getByText(/Seq 5 · Time /)).toBeTruthy()
    expect(screen.queryByText(/Duration/)).toBeNull()
    expect(screen.queryByText(/Tokens /)).toBeNull()
  })

  it('flags a failed tool result and hides the result section of an empty one', () => {
    const { view } = mountGraph(snapshotOf({
      eventNodes: [
        toolResultNode(2, 'e1', {
          isError: true, error: { name: 'ToolError', code: 'boom' },
          call: { name: 'bash', argsRaw: '' }, content: [],
        }),
      ],
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Tool node: bash' }))
    // The failure state appears twice: the inspector chip and the tool body.
    expect(screen.getAllByText('Failed').length).toBe(2)
    // No arguments captured, no result landed: only the head shows.
    expect(screen.queryByText('Arguments JSON')).toBeNull()
    expect(view.container.querySelector('[class*="toolResult"]')).toBeNull()
  })

  it('renders an assistant detail as Markdown with the package chrome labels', () => {
    mountGraph(snapshotOf({
      eventNodes: [
        assistantNode(3, {
          blocks: [{ kind: 'text', text: '# Heading\n\n**bold** plan' }],
        }),
      ],
    }))
    fireEvent.click(screen.getByRole('button', { name: /Assistant message node/ }))
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Heading')
    expect(screen.getByText('bold').tagName).toBe('STRONG')
  })

  it('renders a non-assistant detail as plain text', () => {
    mountGraph(snapshotOf({
      eventNodes: [userNode(2, [text('# not markdown')])],
    }))
    fireEvent.click(screen.getByRole('button', { name: /User message node/ }))
    expect(screen.getByText('# not markdown', { selector: 'pre' })).toBeTruthy()
  })

  it('opens the inspector with tokens and duration for an assistant record', () => {
    mountGraph(staticSnapshot())
    fireEvent.click(screen.getByRole('button', { name: 'Assistant message node: Answer' }))
    // One chip label on the canvas plus the inspector detail body.
    expect(screen.getAllByText('Answer').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/Duration 2\.5 s/)).toBeTruthy()
    expect(screen.getByText(/Tokens 20/)).toBeTruthy()
    expect(screen.queryByText('Arguments JSON')).toBeNull()
  })

  it('labels durations in the unit the value reads best in', () => {
    mountGraph(staticSnapshot())
    const requests = screen.getAllByRole('button', { name: 'Model request node: Model request' })
    fireEvent.click(requests[1]!)
    expect(screen.getByText(/Duration 500 ms/)).toBeTruthy()
  })

  it('selects with the keyboard, switches, and closes', () => {
    mountGraph(staticSnapshot())
    const tool = screen.getByRole('button', { name: 'Tool node: read' })
    const assistant = screen.getByRole('button', { name: 'Assistant message node: Answer' })
    // An unhandled key never opens the inspector.
    fireEvent.keyDown(tool, { key: 'x' })
    fireEvent.keyDown(tool, { key: 'Tab' })
    expect(screen.queryByText('Arguments JSON')).toBeNull()
    fireEvent.keyDown(tool, { key: 'Enter' })
    expect(screen.getByText('Arguments JSON')).toBeTruthy()
    // Switching selection replaces the inspector.
    fireEvent.keyDown(assistant, { key: ' ' })
    expect(screen.queryByText('Arguments JSON')).toBeNull()
    // Clicking the selected node again deselects it.
    fireEvent.click(assistant)
    expect(screen.getByText('Select a node to read its arguments and result')).toBeTruthy()
    fireEvent.click(tool)
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
    expect(screen.getByText('Select a node to read its arguments and result')).toBeTruthy()
  })

  it('highlights the hovered and keyboard-focused record with its edges', () => {
    const { view } = mountGraph(staticSnapshot())
    const user = screen.getByRole('button', { name: /User message node/ })
    fireEvent.mouseEnter(user)
    expect(view.container.querySelectorAll('[class*="edgeHot"]').length).toBeGreaterThan(0)
    expect(view.container.querySelectorAll('[class*="nodeHot"]').length).toBe(1)
    fireEvent.mouseLeave(user)
    expect(view.container.querySelectorAll('[class*="edgeHot"]')).toHaveLength(0)
    // Keyboard focus reads as the same highlight.
    fireEvent.focus(user)
    expect(view.container.querySelectorAll('[class*="nodeHot"]').length).toBe(1)
    fireEvent.blur(user)
    expect(view.container.querySelectorAll('[class*="nodeHot"]')).toHaveLength(0)
  })
})

describe('TrajectoryGraphView attachments', () => {
  function attachmentSnapshot(): TrajectorySnapshot {
    return snapshotOf({
      eventNodes: [
        userNode(1, [text('see this'), imageContent('shot.png'), fileContent()]),
        toolResultNode(2, 'shot-call', {
          call: { name: 'screenshot', argsRaw: '' }, content: [imageContent()],
        }),
      ],
    })
  }

  it('pills the chip counts and lists attachments with thumbnails and files', async () => {
    const loader = stubLoader({ peek: 'blob:peek' })
    const { view } = mountGraph(attachmentSnapshot(), { loadImage: loader })
    const user = screen.getByRole('button', { name: /User message node/ })
    expect(user.querySelector('title')?.textContent).toBe('1 images · 1 files')
    fireEvent.click(user)
    // The peeked URL paints immediately without an async read.
    await waitFor(() => { expect(screen.getByAltText('shot.png')).toBeTruthy() })
    expect(loader.calls).toBe(0)
    // The file row keeps its icon, name, and size.
    expect(screen.getByText('notes.txt')).toBeTruthy()
    expect(screen.getByText('3B')).toBeTruthy()
    // Open the lightbox from the thumbnail.
    fireEvent.click(screen.getByRole('button', { name: 'View image' }))
    expect(screen.getByRole('dialog', { name: 'Image preview' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    await waitFor(() => { expect(screen.queryByRole('dialog', { name: 'Image preview' })).toBeNull() })
    // The tool chip counts its screenshot and the tool body lists the row.
    const tool = screen.getByRole('button', { name: 'Tool node: screenshot' })
    expect(tool.querySelector('title')?.textContent).toBe('1 images · 0 files')
    fireEvent.click(tool)
    // The unnamed image falls back to its ordinal label.
    await waitFor(() => { expect(screen.getByText('Image 1')).toBeTruthy() })
    expect(screen.getByText(/64×32/)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'View image' })).toHaveLength(1)
    // Deselecting and reselecting reads from the cache, not the loader.
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
    fireEvent.click(user)
    expect(loader.calls).toBe(0)
    expect(view.container.querySelectorAll('img').length).toBeGreaterThan(0)
  })

  it('resolves thumbnails asynchronously and keeps a failed read icon-only', async () => {
    const loader = stubLoader()
    const { view } = mountGraph(attachmentSnapshot(), { loadImage: loader })
    fireEvent.click(screen.getByRole('button', { name: /User message node/ }))
    await waitFor(() => { expect(screen.getByAltText('shot.png')).toBeTruthy() })
    expect(loader.calls).toBe(1)
    expect(view.container.querySelectorAll('img')).toHaveLength(1)
    cleanup()
    const failing = stubLoader({ reject: true })
    mountGraph(attachmentSnapshot(), { loadImage: failing })
    fireEvent.click(screen.getByRole('button', { name: /User message node/ }))
    await waitFor(() => { expect(failing.calls).toBe(1) })
    // Every image row degraded to its icon.
    expect(view.container.querySelectorAll('img')).toHaveLength(0)
    expect(screen.getByText('shot.png')).toBeTruthy()
  })
})

describe('TrajectoryGraphView live records', () => {
  it('draws the streaming prefix and running calls as live records', () => {
    mountGraph(liveSnapshot())
    expect(screen.getByText('streaming now')).toBeTruthy()
    expect(screen.getAllByText('Live').length).toBe(3)
    expect(screen.getByText('Running')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Streaming node: streaming now' }))
    expect(screen.getByText(/Not recorded/)).toBeTruthy()
    expect(screen.queryByText(/Duration/)).toBeNull()
  })

  it('shows the pending marker of an unsettled call', () => {
    mountGraph(liveSnapshot())
    const calls = screen.getAllByRole('button', { name: 'Running call node: bash' })
    fireEvent.click(calls[0]!)
    expect(screen.getByText('Awaiting result')).toBeTruthy()
    expect(screen.getByText('p1')).toBeTruthy()
  })
})

describe('TrajectoryGraphView render window', () => {
  it('reports the records the render cap dropped', () => {
    mountGraph(snapshotOf({
      eventNodes: Array.from({ length: 405 }, (_, index) => userNode(index + 1)),
    }))
    expect(screen.getByText('400 nodes')).toBeTruthy()
    expect(screen.getByText('Showing the 5 most recent records')).toBeTruthy()
  })
})
