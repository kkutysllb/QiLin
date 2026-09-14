/**
 * Trajectory graph projection: every ledger record kind the client knows, the
 * copy each one contributes, and every edge the ledger's own facts derive.
 */
import { describe, expect, it } from 'vitest'
import type {
  AssistantBlock, AssistantMessageNode, CommandNode, CompactionSummaryNode, ContextMessageNode,
  ConversationNode, ModelRetryNode, PartialAssistant, RequestView, RunningToolCall, SteeringMessageNode,
  SystemPromptNode, ToolResultNode, TurnErrorNode, TurnMaxTokensNode, UnknownSurfaceNode, UserMessageNode,
} from '@qilin/client-ui-conversation/client'
import type { ContentBlock } from '@qilin/llm/types'
import type { TrajectorySnapshot } from '../src/client/trajectory-contract.ts'
import {
  buildTrajectoryGraph, windowTrajectoryGraph, type TrajectoryGraph,
} from '../src/client/trajectory-graph.ts'
import { t } from './locale.client.ts'

function text(value: string): ContentBlock {
  return { type: 'text', text: value }
}

function tagged(type: string): ContentBlock {
  return { type } as unknown as ContentBlock
}

function message(seq: number, value: string): UserMessageNode {
  return { kind: 'user', seq, time: seq * 1000, content: [text(value)], source: null }
}

function assistant(
  seq: number,
  over: Partial<AssistantMessageNode> = {},
): AssistantMessageNode {
  return {
    kind: 'assistant', seq, time: seq * 1000, turn: 1, step: 1, blocks: [], ...over,
  }
}

function call(callId: string, name: string, argsRaw: string): AssistantBlock {
  return { kind: 'tool-call', callId, name, argsRaw }
}

function toolResult(seq: number, callId: string, over: Partial<ToolResultNode> = {}): ToolResultNode {
  return {
    kind: 'tool-result', seq, time: seq * 1000, callId, call: null, callTime: null,
    content: [], isError: false, subCalls: [], ...over,
  }
}

function runningCall(callId: string, over: Partial<RunningToolCall> = {}): RunningToolCall {
  return {
    callId, name: 'bash', argsRaw: '', turn: 1, step: 1, time: 500, subCalls: [], ...over,
  }
}

function request(
  over: Partial<Extract<RequestView, { purpose: 'assistant' }>>,
): RequestView {
  return {
    purpose: 'assistant', startSeq: 100, startedAt: 100, completedAt: null,
    status: 'complete', turn: 1, step: 1, ...over,
  }
}

function compactionRequest(
  over: Partial<Extract<RequestView, { purpose: 'compaction' }>>,
): RequestView {
  return {
    purpose: 'compaction', startSeq: 200, startedAt: 200, completedAt: 260, status: 'complete',
    turn: 1, step: 0, ...over,
  }
}

function snapshotOf(over: Partial<TrajectorySnapshot>): TrajectorySnapshot {
  return {
    eventNodes: [], eventLocations: new Map(), requests: [], callSchemas: new Map(),
    partial: null, runningCalls: [], ...over,
  }
}

/** The fields each assertion reads, so a case compares one plain value. */
function view(graph: TrajectoryGraph) {
  return {
    nodes: graph.nodes.map(node => node.id),
    edges: graph.edges.map(edge => edge.id + (edge.live ? ' (live)' : '')),
    bands: graph.bands,
    timeline: graph.timeline.map(step => step.nodeId + '<-' + String(step.edgeId)),
    stats: graph.stats,
    live: graph.live,
  }
}

const EMPTY = {
  nodes: [], edges: [], bands: [], timeline: [],
  stats: { nodes: 0, edges: 0, turns: 0, tools: 0, running: 0, errors: 0, tokens: {} },
  live: false,
}

describe('trajectory graph projection', () => {
  it('projects nothing from an absent or empty snapshot', () => {
    expect(view(buildTrajectoryGraph(null, t))).toEqual(EMPTY)
    expect(view(buildTrajectoryGraph(undefined, t))).toEqual(EMPTY)
    expect(view(buildTrajectoryGraph(snapshotOf({}), t))).toEqual(EMPTY)
  })

  it('draws loaded system prompts and every input record', () => {
    const prompts: SystemPromptNode[] = [
      { seq: 1, time: 1000, turn: 1, step: 1, text: 'You are Qilin.', update: false },
      { seq: 2, time: 1100, turn: 1, step: 1, text: '', update: true },
    ]
    const nodes: ConversationNode[] = [
      message(3, 'hello there'),
      { kind: 'user', seq: 4, time: 4000, content: [], source: null } satisfies UserMessageNode,
      {
        kind: 'steering', messageId: 'm1' as never, seq: 5, time: 5000,
        content: [text('wait')], source: null,
      } satisfies SteeringMessageNode,
      {
        kind: 'context', seq: 6, time: 6000, content: [text('ctx')], source: null,
        provenance: { role: 'inject', label: 'System' }, form: null,
      } satisfies ContextMessageNode,
      {
        kind: 'context', seq: 7, time: 7000, content: [], source: null,
        provenance: { role: 'recall', label: null }, form: 'recall',
      } satisfies ContextMessageNode,
      {
        kind: 'command', seq: 8, time: 8000, commandId: 'cmd1' as never, name: 'clear',
        args: '', outcome: { kind: 'success', text: 'done' },
      } satisfies CommandNode,
      {
        kind: 'command', seq: 9, time: 9000, commandId: 'cmd2' as never, name: null,
        args: null, outcome: null,
      } satisfies CommandNode,
      {
        kind: 'command', seq: 10, time: 10000, commandId: 'cmd3' as never, name: 'boom',
        args: null, outcome: { kind: 'error' },
      } satisfies CommandNode,
      {
        kind: 'unknown', seq: 11, time: 11000, type: 'future/event', data: { any: true },
      } satisfies UnknownSurfaceNode,
    ]
    const graph = buildTrajectoryGraph(snapshotOf({
      systemPrompts: prompts,
      eventNodes: nodes,
      requests: [request({ startSeq: 20, turn: 1, step: 1, completedAt: 2100 })],
    }), t)
    const byId = new Map(graph.nodes.map(node => [node.id, node]))

    expect(graph.nodes.map(node => [node.id, node.kind, node.lane, node.turn, node.step])).toEqual([
      ['sys:1', 'system', 'input', 1, 1],
      ['sys:2', 'system', 'input', 1, 1],
      ['ev:user:3', 'user', 'input', 1, 1],
      ['ev:user:4', 'user', 'input', 1, 1],
      ['ev:steering:5', 'steering', 'input', 1, 1],
      ['ev:context:6', 'context', 'input', 1, 1],
      ['ev:context:7', 'context', 'input', 1, 1],
      ['ev:command:8', 'command', 'input', 1, 1],
      ['ev:command:9', 'command', 'input', 1, 1],
      ['ev:command:10', 'command', 'input', 1, 1],
      ['ev:unknown:11', 'unknown', 'model', null, null],
      ['req:20', 'request', 'model', 1, 1],
    ])
    expect(byId.get('sys:1')).toMatchObject({ label: 'You are Qilin.', detail: 'You are Qilin.' })
    expect(byId.get('sys:2')).toMatchObject({ label: 'System prompt' })
    expect(byId.get('sys:2')?.detail).toBeUndefined()
    expect(byId.get('ev:user:3')).toMatchObject({
      label: 'hello there', detail: 'hello there', opensTurn: true, status: 'idle',
    })
    expect(byId.get('ev:user:4')).toMatchObject({ label: 'User message', opensTurn: true })
    expect(byId.get('ev:steering:5')).toMatchObject({ label: 'wait', detail: 'wait' })
    expect(byId.get('ev:context:6')).toMatchObject({
      label: 'System', badge: 'Injected', detail: 'ctx',
    })
    expect(byId.get('ev:context:7')).toMatchObject({ label: 'Context', badge: 'Recalled' })
    expect(byId.get('ev:command:8')).toMatchObject({
      label: '/clear', badge: 'Completed', detail: 'done', status: 'complete',
    })
    expect(byId.get('ev:command:9')).toMatchObject({ label: 'Command', status: 'idle' })
    expect(byId.get('ev:command:9')?.badge).toBeUndefined()
    expect(byId.get('ev:command:10')).toMatchObject({
      label: '/boom', badge: 'Failed', status: 'error',
    })
    expect(byId.get('ev:command:10')?.detail).toBeUndefined()
    expect(byId.get('ev:unknown:11')).toMatchObject({ label: 'future/event' })
    expect(byId.get('req:20')).toMatchObject({
      label: 'Model request', status: 'complete', durationMs: 2000, live: false,
    })
    expect(view(graph).bands).toEqual([{ turn: 1, from: 0, to: 12 }])
  })

  it('keeps a turn-less record from splitting the stripe of the turn around it', () => {
    const nodes: ConversationNode[] = [
      {
        kind: 'unknown', seq: 1, time: 1000, type: 'before/turn', data: null,
      } satisfies UnknownSurfaceNode,
      message(2, 'ask'),
      // A standalone compaction stays outside every turn between turns 1 and 2.
      {
        kind: 'compaction', seq: 5, time: 5000, summary: null, summaryEventSeq: null,
        shadowedItemCount: null, shadowedTokenCount: null,
      } satisfies CompactionSummaryNode,
      message(6, 'again'),
      {
        kind: 'compaction', seq: 20, time: 20000, summary: null, summaryEventSeq: null,
        shadowedItemCount: null, shadowedTokenCount: null,
      } satisfies CompactionSummaryNode,
    ]
    const graph = buildTrajectoryGraph(snapshotOf({
      eventNodes: nodes,
      requests: [
        request({ startSeq: 3, turn: 1, step: 1 }),
        request({ startSeq: 7, turn: 2, step: 1 }),
      ],
    }), t)
    expect(graph.nodes.map(node => [node.id, node.turn])).toEqual([
      ['ev:unknown:1', null],
      ['ev:user:2', 1],
      ['req:3', 1],
      ['ev:compaction:5', null],
      ['ev:user:6', 2],
      ['req:7', 2],
      ['ev:compaction:20', null],
    ])
    expect(graph.bands).toEqual([
      { turn: null, from: 0, to: 1 },
      { turn: 1, from: 1, to: 3 },
      { turn: null, from: 3, to: 4 },
      { turn: 2, from: 4, to: 6 },
      { turn: null, from: 6, to: 7 },
    ])
  })

  it('describes assistant records across interruption, tool calls, and usage', () => {
    const long = 'x'.repeat(60)
    const nodes: ConversationNode[] = [
      assistant(1, {
        blocks: [{ kind: 'reasoning', text: 'thinking' }, { kind: 'text', text: 'half' }],
        interrupted: true,
      }),
      assistant(2, {
        blocks: [call('c1', 'read', '{"path":"a"}')],
        timing: { stepStartTime: null, firstTokenTime: null, completedTime: 4000 },
      }),
      assistant(3, {
        blocks: [call('c1', 'read', ''), call('c2', 'bash', 'ls')],
        timing: { stepStartTime: 1000, firstTokenTime: 1500, completedTime: 3500 },
        usage: {
          inputTokens: 10, outputTokens: 4, cacheReadTokens: 2, cacheWriteTokens: 1, reasoningTokens: 3,
        },
      }),
      assistant(4, {
        blocks: [
          { kind: 'image', attachment: { id: 'img' } } as unknown as AssistantBlock,
          { kind: 'other', block: null },
        ],
        usage: { input: 7 },
      }),
      assistant(5, { usage: {} }),
      assistant(6, { usage: 'invalid' }),
      assistant(7, { usage: null }),
      assistant(8, { usage: [] }),
      assistant(9, { blocks: [{ kind: 'text', text: long }] }),
    ]
    const graph = buildTrajectoryGraph(snapshotOf({ eventNodes: nodes }), t)
    const byId = new Map(graph.nodes.map(node => [node.id, node]))

    expect(byId.get('ev:assistant:1')).toMatchObject({
      kind: 'assistant', lane: 'model', status: 'interrupted',
      label: 'thinking half', detail: 'thinking half',
    })
    expect(byId.get('ev:assistant:2')).toMatchObject({ label: 'read', badge: '1×' })
    expect(byId.get('ev:assistant:2')?.durationMs).toBeUndefined()
    expect(byId.get('ev:assistant:3')).toMatchObject({
      label: 'read bash', badge: '2×', durationMs: 2500,
      tokens: { input: 10, output: 4, cacheRead: 2, cacheWrite: 1, reasoning: 3 },
    })
    expect(byId.get('ev:assistant:4')).toMatchObject({
      label: 'Assistant message', tokens: { input: 7 },
    })
    expect(byId.get('ev:assistant:4')?.detail).toBeUndefined()
    expect(byId.get('ev:assistant:5')?.tokens).toBeUndefined()
    expect(byId.get('ev:assistant:6')?.tokens).toBeUndefined()
    expect(byId.get('ev:assistant:7')?.tokens).toBeUndefined()
    expect(byId.get('ev:assistant:8')?.tokens).toBeUndefined()
    expect(byId.get('ev:assistant:9')?.label).toBe(long.slice(0, 47) + '…')
    expect(graph.stats.tokens).toEqual({ input: 17, output: 4, cacheRead: 2, cacheWrite: 1, reasoning: 3 })
    expect(graph.stats.running).toBe(0)
    expect(graph.stats.tools).toBe(0)
  })

  it('describes tool results, checkpoints, retries, and turn failures', () => {
    const nodes: ConversationNode[] = [
      toolResult(1, 'abcdef1234567', {
        call: { name: 'read', argsRaw: '{"path":"a"}' }, content: [text('ok')],
      }),
      toolResult(2, 'c1', { call: { name: 'read', argsRaw: '' }, content: [tagged('image')] }),
      toolResult(3, 'c2', { isError: true, error: { name: 'ToolError', code: 'boom' } }),
      toolResult(4, 'c3', { isError: true }),
      {
        kind: 'compaction', seq: 5, time: 5000, summary: 'sum', summaryEventSeq: 4,
        shadowedItemCount: 5, shadowedTokenCount: 1200,
      } satisfies CompactionSummaryNode,
      {
        kind: 'compaction', seq: 6, time: 6000, summary: null, summaryEventSeq: null,
        shadowedItemCount: null, shadowedTokenCount: null,
      } satisfies CompactionSummaryNode,
      {
        kind: 'model-retry', seq: 7, time: 7000, retryState: 'scheduled',
        retryId: 'r1' as never, turn: 1, step: 1, provider: 'deepseek', mode: 'normal',
        policyKey: 'default', retry: 1, maxRetries: 3, delayMs: 500,
        failure: { message: '', code: 'rate_limit' },
      } satisfies ModelRetryNode,
      {
        kind: 'model-retry', seq: 8, time: 8000, retryState: 'started',
        retryId: 'r2' as never, turn: 1, step: 1, provider: 'deepseek', mode: 'always',
        policyKey: 'default', retry: 2, delayMs: 900,
        failure: { message: 'provider busy', code: 'overloaded' },
      } satisfies ModelRetryNode,
      {
        kind: 'model-retry', seq: 9, time: 9000, retryState: 'cancelled',
        retryId: 'r3' as never, turn: 1, step: 1, provider: 'deepseek', mode: 'normal',
        policyKey: 'default', retry: 3, maxRetries: 3, delayMs: 100,
        failure: { message: 'gone', code: 'aborted' },
      } satisfies ModelRetryNode,
      {
        kind: 'turn-error', seq: 10, time: 10000, turn: 1, step: 1, message: 'It failed', code: 'x',
      } satisfies TurnErrorNode,
      { kind: 'turn-error', seq: 11, time: 11000, turn: 1, step: 1, message: '' } satisfies TurnErrorNode,
      { kind: 'turn-max-tokens', seq: 12, time: 12000, turn: 1, step: 1 } satisfies TurnMaxTokensNode,
    ]
    const graph = buildTrajectoryGraph(snapshotOf({ eventNodes: nodes }), t)
    const byId = new Map(graph.nodes.map(node => [node.id, node]))

    expect(byId.get('ev:tool-result:1')).toMatchObject({
      kind: 'tool', lane: 'tool', status: 'complete', label: 'read', badge: '234567',
      args: '{"path":"a"}', result: 'ok',
    })
    expect(byId.get('ev:tool-result:2')).toMatchObject({ label: 'read', badge: 'c1', result: '[image]' })
    expect(byId.get('ev:tool-result:2')?.args).toBeUndefined()
    expect(byId.get('ev:tool-result:3')).toMatchObject({ status: 'error', badge: 'boom' })
    expect(byId.get('ev:tool-result:4')).toMatchObject({ status: 'error', badge: 'Failed' })
    expect(byId.get('ev:tool-result:4')?.result).toBeUndefined()
    expect(byId.get('ev:compaction:5')).toMatchObject({
      kind: 'compaction', lane: 'model', label: 'sum', badge: '1200 tok', detail: 'sum',
    })
    expect(byId.get('ev:compaction:6')).toMatchObject({ label: 'Compaction' })
    expect(byId.get('ev:compaction:6')?.badge).toBeUndefined()
    expect(byId.get('ev:model-retry:7')).toMatchObject({
      kind: 'retry', status: 'idle', label: 'Retry scheduled', badge: 'rate_limit',
    })
    expect(byId.get('ev:model-retry:7')?.detail).toBeUndefined()
    expect(byId.get('ev:model-retry:8')).toMatchObject({
      status: 'running', label: 'Retry started', detail: 'provider busy',
    })
    expect(byId.get('ev:model-retry:9')?.label).toBe('Retry cancelled')
    expect(byId.get('ev:turn-error:10')).toMatchObject({
      kind: 'error', status: 'error', label: 'It failed', badge: 'x', detail: 'It failed',
    })
    expect(byId.get('ev:turn-error:11')).toMatchObject({ label: 'Error' })
    expect(byId.get('ev:turn-error:11')?.badge).toBeUndefined()
    expect(byId.get('ev:turn-max-tokens:12')).toMatchObject({
      kind: 'max-tokens', status: 'error', label: 'Output cap',
    })
    // Errors counts records in the error lifecycle: failed tool results, turn
    // failures, and the output cap. Retry markers document a failure whose
    // outcome the retried request or the turn failure records, so none of the
    // three retry states counts here.
    expect(graph.stats.errors).toBe(5)
    expect(graph.stats.tools).toBe(4)
    expect(graph.stats.running).toBe(1)
  })

  it('derives prompt, result, dispatch, subcall, and loop edges', () => {
    const nodes: ConversationNode[] = [
      message(1, 'do it'),
      assistant(3, { blocks: [call('c1', 'read', ''), call('c1', 'read', ''), call('', 'read', '')] }),
      toolResult(4, 'c1', { subCalls: [runningCall('c2')] }),
      assistant(6, { blocks: [call('c2', 'bash', '')] }),
      toolResult(7, 'c2'),
      assistant(9, { blocks: [call('missing', 'read', 'args')] }),
    ]
    const graph = buildTrajectoryGraph(snapshotOf({
      eventNodes: nodes,
      requests: [
        request({ startSeq: 2, resultSeq: 3 }),
        request({ startSeq: 5, resultSeq: 6 }),
        request({ startSeq: 8, resultSeq: 9 }),
      ],
    }), t)

    expect(graph.edges.map(edge => edge.id)).toEqual([
      'prompt:ev:user:1->req:2',
      'result:req:2->ev:assistant:3',
      'result:req:5->ev:assistant:6',
      'result:req:8->ev:assistant:9',
      'dispatch:ev:assistant:3->ev:tool-result:4',
      'dispatch:ev:assistant:6->ev:tool-result:7',
      'dispatch:ev:assistant:9->waiting:missing',
      'subcall:ev:tool-result:4->ev:tool-result:7',
      'loop:ev:tool-result:4->req:5',
      'loop:ev:tool-result:7->req:8',
    ])
    expect(graph.nodes.find(node => node.id === 'waiting:missing')).toMatchObject({
      kind: 'tool', lane: 'tool', status: 'idle', seq: 9.5, args: 'args', turn: 1, step: 1,
    })
    // Six ledger events + three requests + the one synthesized waiting record.
    expect(graph.stats.nodes).toBe(10)
    expect(graph.timeline.map(step => step.nodeId + '<-' + String(step.edgeId))).toEqual([
      // The user record is a root: the prompt edge delivers the request, not
      // the record that issued it.
      'ev:user:1<-null',
      'req:2<-prompt:ev:user:1->req:2',
      'ev:assistant:3<-result:req:2->ev:assistant:3',
      'ev:tool-result:4<-dispatch:ev:assistant:3->ev:tool-result:4',
      'req:5<-loop:ev:tool-result:4->req:5',
      'ev:assistant:6<-result:req:5->ev:assistant:6',
      'ev:tool-result:7<-dispatch:ev:assistant:6->ev:tool-result:7',
      'req:8<-loop:ev:tool-result:7->req:8',
      'ev:assistant:9<-result:req:8->ev:assistant:9',
      'waiting:missing<-dispatch:ev:assistant:9->waiting:missing',
    ])
  })

  it('links a running request to the streaming prefix and marks live edges', () => {
    const partial: PartialAssistant = {
      turn: 1, step: 1,
      // Assistant blocks, not content blocks: the partial carries the
      // assistant block union, discriminated by kind.
      blocks: [{ kind: 'text', text: 'streaming now' }],
    }
    const graph = buildTrajectoryGraph(snapshotOf({
      eventNodes: [message(1, 'go'), assistant(4, { blocks: [call('p1', 'bash', 'ls')] })],
      requests: [request({ startSeq: 2, status: 'running', completedAt: null })],
      partial,
      runningCalls: [runningCall('p1', {
        argsRaw: 'ls', subCalls: [runningCall('p2'), toolResult(40, 's1')],
      })],
    }), t)
    const byId = new Map(graph.nodes.map(node => [node.id, node]))

    expect(graph.nodes.map(node => node.id)).toEqual([
      'ev:user:1', 'req:2', 'ev:assistant:4', 'partial:1:1', 'call:p1', 'call:p2',
    ])
    expect(byId.get('req:2')).toMatchObject({
      status: 'running', badge: 'Running', live: true,
    })
    expect(byId.get('req:2')?.durationMs).toBeUndefined()
    expect(byId.get('partial:1:1')).toMatchObject({
      kind: 'partial', lane: 'model', status: 'running', live: true, badge: 'Live',
      label: 'streaming now', turn: 1, step: 1,
    })
    expect(byId.get('call:p1')).toMatchObject({
      kind: 'running-call', lane: 'tool', status: 'running', live: true,
      label: 'bash', args: 'ls', badge: 'Live',
    })
    expect(byId.get('call:p2')).toMatchObject({ label: 'bash' })
    expect(byId.get('call:p2')?.args).toBeUndefined()
    expect(graph.edges.map(edge => edge.id + (edge.live ? ' (live)' : ''))).toEqual([
      'prompt:ev:user:1->req:2',
      'result:req:2->partial:1:1 (live)',
      'dispatch:ev:assistant:4->call:p1 (live)',
      'subcall:call:p1->call:p2 (live)',
    ])
    expect(graph.live).toBe(true)
    expect(graph.stats.running).toBe(4)
    // Tools counts drawn tool records with an outcome: the live root call and
    // its live child. The settled child result (s1) inside the running tree has
    // no node of its own in this projection, so it cannot appear here.
    expect(graph.stats.tools).toBe(2)
  })

  it('draws the streaming prefix without blocks and requests that never landed', () => {
    const graph = buildTrajectoryGraph(snapshotOf({
      requests: [request({ startSeq: 2, status: 'running' })],
      partial: { turn: 3, step: 4, blocks: [] },
    }), t)

    expect(graph.nodes.map(node => [node.id, node.label, node.turn, node.step])).toEqual([
      ['req:2', 'Model request', 1, 1],
      ['partial:3:4', 'Streaming', 3, 4],
    ])
    expect(graph.edges).toEqual([])
    expect(graph.stats.running).toBe(2)
    expect(graph.timeline.map(step => step.edgeId)).toEqual([null, null])
  })

  it('attributes compaction checkpoints to the request that committed them', () => {
    const nodes: ConversationNode[] = [
      message(1, 'first'),
      assistant(3, { turn: 1, step: 1 }),
      {
        kind: 'compaction', seq: 12, time: 12000, summary: 'replacement', summaryEventSeq: 11,
        shadowedItemCount: 4, shadowedTokenCount: 400,
      } satisfies CompactionSummaryNode,
      {
        kind: 'compaction', seq: 13, time: 13000, summary: null, summaryEventSeq: null,
        shadowedItemCount: null, shadowedTokenCount: null,
      } satisfies CompactionSummaryNode,
    ]
    const graph = buildTrajectoryGraph(snapshotOf({
      eventNodes: nodes,
      requests: [
        request({ startSeq: 2, turn: 1, step: 1, status: 'complete', resultSeq: 3 }),
        compactionRequest({ startSeq: 10, turn: 2, step: 0, replacementSeq: 12 }),
        compactionRequest({ startSeq: 20, turn: null, step: 0 }),
      ],
    }), t)
    const byId = new Map(graph.nodes.map(node => [node.id, node]))

    expect(byId.get('creq:10')).toMatchObject({
      kind: 'compact-request', lane: 'model', label: 'Compaction request', turn: 2, step: 0,
    })
    expect(byId.get('creq:20')).toMatchObject({ turn: null, step: 0 })
    expect(byId.get('ev:compaction:12')).toMatchObject({ turn: 2, step: 0 })
    expect(byId.get('ev:compaction:13')).toMatchObject({ turn: null, step: null })
    expect(graph.edges.map(edge => edge.id)).toEqual([
      'prompt:ev:user:1->req:2',
      'result:req:2->ev:assistant:3',
      'result:creq:10->ev:compaction:12',
    ])
  })

  it('windows the projection to its most recent records', () => {
    const graph = buildTrajectoryGraph(snapshotOf({
      eventNodes: [message(1, 'one'), assistant(3, { turn: 1, step: 1 })],
      requests: [request({ startSeq: 2, turn: 1, step: 1, completedAt: 3000, resultSeq: 3 })],
    }), t)

    const kept = windowTrajectoryGraph(graph, 2)
    expect(kept.hidden).toBe(1)
    expect(kept.graph.nodes.map(node => node.id)).toEqual(['req:2', 'ev:assistant:3'])
    expect(kept.graph.edges.map(edge => edge.id)).toEqual(['result:req:2->ev:assistant:3'])
    expect(kept.graph.bands).toEqual([{ turn: 1, from: 0, to: 2 }])
    expect(kept.graph.timeline).toEqual(graph.timeline.slice(1))
    expect(kept.graph.stats).toMatchObject({ nodes: 2, edges: 1, turns: 1 })
    expect(kept.graph.live).toBe(false)

    expect(windowTrajectoryGraph(graph, 5)).toEqual({ graph, hidden: 0 })
    const none = windowTrajectoryGraph(graph, 0)
    expect(none.hidden).toBe(3)
    expect(view(none.graph)).toEqual(EMPTY)
  })
})
