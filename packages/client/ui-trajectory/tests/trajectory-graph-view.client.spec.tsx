// @vitest-environment jsdom
/**
 * TrajectoryGraphView behavior on real props: the toolbar's pressed states,
 * the empty and windowed states, node selection with its inspector sections,
 * and keyboard selection. Vitest's CSS-module stub yields class tokens as
 * plain names, so the few class-driven assertions query by token.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createSnapshotStore } from '@qilin/client-store'
import { bindSnapshotSelector } from '@qilin/client-test-runtime'
import type { ContentBlock } from '@qilin/llm/types'
import type {
  AssistantMessageNode, ConversationNode, RequestView, RunningToolCall, ToolResultNode,
  UserMessageNode,
} from '@qilin/client-ui-conversation/client'
import type { SessionId } from '@qilin/session/types'
import type { TrajectorySnapshot } from '../src/client/trajectory-contract.ts'
import { EMPTY_TRAJECTORY_SNAPSHOT } from '../src/client/trajectory-snapshot-builder.ts'
import { TrajectoryGraphView } from '../src/client/TrajectoryGraphView.tsx'
import { t as tTrajectory } from './locale.client.ts'

const SID = 's1' as SessionId

afterEach(cleanup)

function text(value: string): ContentBlock {
  return { type: 'text', text: value }
}

function userNode(seq: number): UserMessageNode {
  return { kind: 'user', seq, time: seq * 1000, content: [], source: null }
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

function runningCall(callId: string, over: Partial<RunningToolCall> = {}): RunningToolCall {
  return {
    callId, name: 'bash', argsRaw: '', turn: 1, step: 1, time: 500, subCalls: [], ...over,
  }
}

function snapshotOf(over: Partial<TrajectorySnapshot> = {}): TrajectorySnapshot {
  return {
    eventNodes: [], eventLocations: new Map(), requests: [], callSchemas: new Map(),
    partial: null, runningCalls: [], ...over,
  }
}

/**
 * The graph body reads only the trajectory hook and the locale seat; the rest
 * of the session-scope runtime kit is stubbed unread.
 */
function mountGraph(snapshot: TrajectorySnapshot) {
  const trajectory = createSnapshotStore<TrajectorySnapshot>(snapshot)
  const props = {
    sessionId: SID,
    useSession: () => undefined,
    useTrajectory: bindSnapshotSelector(trajectory),
    useSessions: () => undefined,
    useWorkspaces: () => undefined,
    usePanelInfo: (selector: (value: unknown) => unknown) => selector(null),
    useResource: () => ({ status: 'none', value: undefined, failure: undefined, reload: () => {} }),
    t: tTrajectory,
  } as unknown as Parameters<typeof TrajectoryGraphView>[0]
  return { view: render(<TrajectoryGraphView {...props} />), trajectory }
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

describe('TrajectoryGraphView empty state', () => {
  it('renders the empty copy without a canvas', () => {
    const { view } = mountGraph(EMPTY_TRAJECTORY_SNAPSHOT)
    expect(screen.getByText('No trajectory records to draw')).toBeTruthy()
    // Toolbar icons are SVGs; the canvas is the only one that carries role=img.
    expect(view.container.querySelector('svg[role="img"]')).toBeNull()
    expect(document.querySelectorAll('[class*="liveDot"]').length).toBe(0)
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
    // The turn-less unknown record opens no band label.
    expect(screen.getAllByText('Turn 1').length).toBe(1)
  })

  it('toggles fit, follow, and pause through their pressed states', () => {
    const { view } = mountGraph(staticSnapshot())
    const fit = screen.getByRole('button', { name: 'Fit view' })
    expect(fit.getAttribute('aria-pressed')).toBe('true')
    const canvas = view.container.querySelector('svg[role="img"]')!
    const svgClass = canvas.getAttribute('class')
    fireEvent.click(fit)
    expect(fit.getAttribute('aria-pressed')).toBe('false')
    expect(view.container.querySelector('svg[role="img"]')!.getAttribute('class')).not.toBe(svgClass)

    const follow = screen.getByRole('button', { name: 'Follow latest' })
    expect(follow.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(follow)
    expect(follow.getAttribute('aria-pressed')).toBe('false')

    const pause = screen.getByRole('button', { name: 'Pause flow' })
    fireEvent.click(pause)
    expect(screen.getByRole('button', { name: 'Resume flow' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Resume flow' }))
    expect(screen.getByRole('button', { name: 'Pause flow' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('marks a live graph with the live dot and omits it on a settled one', () => {
    const settled = mountGraph(staticSnapshot())
    expect(settled.view.container.querySelectorAll('[class*="liveDot"]').length).toBe(0)
    cleanup()
    const live = mountGraph(liveSnapshot())
    expect(live.view.container.querySelectorAll('[class*="liveDot"]').length).toBeGreaterThan(0)
  })
})

describe('TrajectoryGraphView selection and inspector', () => {
  it('opens the inspector with arguments and result for a tool record', () => {
    mountGraph(staticSnapshot())
    expect(screen.getByText('Select a node to read its arguments and result')).toBeTruthy()
    const tool = screen.getByRole('button', { name: 'Tool node: read' })
    expect(tool.getAttribute('data-kind')).toBe('tool')
    fireEvent.click(tool)
    expect(screen.getByText('Completed')).toBeTruthy()
    expect(screen.getByText('Arguments')).toBeTruthy()
    expect(screen.getByText('{"a":1}')).toBeTruthy()
    expect(screen.getByText('Result')).toBeTruthy()
    expect(screen.getByText('done')).toBeTruthy()
    expect(screen.getByText(/Seq 5 · Time /)).toBeTruthy()
    expect(screen.queryByText(/Duration/)).toBeNull()
    expect(screen.queryByText(/Tokens /)).toBeNull()
  })

  it('opens the inspector with detail, tokens, and duration for an assistant record', () => {
    mountGraph(staticSnapshot())
    fireEvent.click(screen.getByRole('button', { name: 'Assistant message node: Answer' }))
    // One chip label on the canvas plus the inspector detail body.
    expect(screen.getAllByText('Answer').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText(/Duration 2\.5 s/)).toBeTruthy()
    expect(screen.getByText(/Tokens 20/)).toBeTruthy()
    expect(screen.queryByText('Arguments')).toBeNull()
    expect(screen.queryByText('Result')).toBeNull()
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
    expect(screen.queryByText('Arguments')).toBeNull()
    fireEvent.keyDown(tool, { key: 'Enter' })
    expect(screen.getByText('Arguments')).toBeTruthy()
    // Switching selection replaces the inspector.
    fireEvent.keyDown(assistant, { key: ' ' })
    expect(screen.queryByText('Arguments')).toBeNull()
    // Clicking the selected node again deselects it.
    fireEvent.click(assistant)
    expect(screen.getByText('Select a node to read its arguments and result')).toBeTruthy()
    fireEvent.click(tool)
    fireEvent.click(screen.getByRole('button', { name: 'Close details' }))
    expect(screen.getByText('Select a node to read its arguments and result')).toBeTruthy()
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
