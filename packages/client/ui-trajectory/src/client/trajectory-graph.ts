/**
 * Pure projection from the Trajectory target snapshot to the trajectory graph:
 * one node per ledger record, plus the links the ledger already records.
 *
 * Every edge is read back out of a durable fact, never invented:
 * - `prompt`   - the last unconsumed input record (user, steering, context,
 *                system prompt, or compaction checkpoint) before a request;
 * - `result`   - the record named by `request.resultSeq` (`replacementSeq`
 *                for a compaction checkpoint); a request still running reaches
 *                the streaming assistant prefix instead;
 * - `dispatch` - an assistant `tool-call` block reaches the tool record its
 *                `callId` names;
 * - `subcall`  - a tool record reaches each child call it dispatched itself;
 * - `loop`     - a settling tool record reaches the next request, which is the
 *                agent loop turning back to the model.
 *
 * The module carries no React and no DOM, so it runs in a plain Node
 * environment, and it takes the namespace-bound translate so every string it
 * emits stays locale-owned. A ledger record kind this client does not know
 * degrades to an `unknown` node instead of throwing.
 */

import type {
  AssistantBlock, ConversationNode, ModelRetryNode, RequestView, RunningToolCall,
  ToolCallBlock,
} from '@qilin/client-ui-conversation/client'
import type { ContentBlock } from '@qilin/llm/types'
import type { TrajectoryKey, TrajectoryTranslate } from './locales.ts'
import type { TrajectorySnapshot } from './trajectory-contract.ts'

/** Ledger record kinds the graph draws. */
export type TrajectoryGraphNodeKind =
  /** Loaded system-prompt state. */
  | 'system'
  /** A finalized user message. */
  | 'user'
  /** A message admitted from the next-step inbox. */
  | 'steering'
  /** A context injection surfaced in the flow. */
  | 'context'
  /** A slash-command lifecycle. */
  | 'command'
  /** One ordinary model request (an agent-loop step). */
  | 'request'
  /** One compaction provider request. */
  | 'compact-request'
  /** A finalized assistant message. */
  | 'assistant'
  /** The in-flight streaming assistant prefix. */
  | 'partial'
  /** A settled tool result, possibly a sub-call. */
  | 'tool'
  /** A tool call whose result has not landed yet. */
  | 'running-call'
  /** A landed compaction checkpoint. */
  | 'compaction'
  /** A scheduled, started, or cancelled model retry. */
  | 'retry'
  /** A turn that ended in failure. */
  | 'error'
  /** A turn ended by the per-request output-token cap. */
  | 'max-tokens'
  /** A surface event this client does not know. */
  | 'unknown'

/** The swimlane a node belongs to. */
export type TrajectoryLane = 'input' | 'model' | 'tool'

/** Node lifecycle as far as the graph presents it. */
export type TrajectoryGraphNodeStatus = 'idle' | 'running' | 'complete' | 'error' | 'interrupted'

/** Chain-of-data edge kinds. */
export type TrajectoryGraphEdgeKind = 'prompt' | 'result' | 'dispatch' | 'subcall' | 'loop'

/** Provider token buckets summed from one record's reported usage. */
export interface TrajectoryTokens {
  input?: number
  cacheRead?: number
  cacheWrite?: number
  output?: number
  reasoning?: number
}

/** One graph node: one record of the ledger. */
export interface TrajectoryGraphNode {
  /** Stable identity: `req:<startSeq>`, `ev:<kind>:<seq>`, or `call:<callId>`. */
  readonly id: string
  readonly kind: TrajectoryGraphNodeKind
  readonly lane: TrajectoryLane
  readonly status: TrajectoryGraphNodeStatus
  /** Ledger order key, fractional for a record synthesized between two events. */
  readonly seq: number
  /** Unix epoch ms, or 0 when the ledger recorded none. */
  readonly time: number
  /** Owning turn, or null for a record outside every turn. */
  readonly turn: number | null
  /** Agent-loop step inside the turn, or null when the ledger records none. */
  readonly step: number | null
  /** Chip label: the record's own text, or the localized name of its kind. */
  readonly label: string
  /** Optional chip badge (status, call-id tail, shadowed token count). */
  readonly badge?: string
  /** Free-form inspector body that is neither arguments nor result. */
  readonly detail?: string
  /** Captured tool arguments, verbatim. */
  readonly args?: string
  /** Captured tool result text, verbatim. */
  readonly result?: string
  readonly tokens?: TrajectoryTokens
  /** Wall time between the record's start and completion, when both are recorded. */
  readonly durationMs?: number
  /** Whether the record is still moving, which drives the flow animation. */
  readonly live: boolean
  /** Whether the record opens a new turn, which the view marks. */
  readonly opensTurn?: boolean
}

/** One chain-of-data edge. */
export interface TrajectoryGraphEdge {
  readonly id: string
  readonly from: string
  readonly to: string
  readonly kind: TrajectoryGraphEdgeKind
  /** Whether data is moving into a live record across this edge. */
  readonly live: boolean
}

/**
 * One contiguous run of ledger records that share a turn, plus the records
 * outside every turn that the run surrounds: a turn-less record never splits
 * the stripe of the turn it sits inside.
 */
export interface TrajectoryGraphBand {
  /** Turn number, or null for records outside every turn. */
  readonly turn: number | null
  /** Index of the band's first record. */
  readonly from: number
  /** One past the index of the band's last record. */
  readonly to: number
}

/** One ledger step, with the edge that delivered the record. */
export interface TrajectoryTimelineStep {
  readonly nodeId: string
  /** The incoming edge to animate, or null for a root record. */
  readonly edgeId: string | null
  /** Unix epoch ms of the record, or 0 when the ledger recorded none. */
  readonly at: number
}

/** Session totals shown above the canvas. */
export interface TrajectoryGraphStats {
  nodes: number
  edges: number
  /** Highest turn number seen, or 0 while no turn has opened. */
  turns: number
  /** Tool records with an outcome: settled results and in-flight calls; the
   * synthesized waiting placeholders stay uncounted. */
  tools: number
  running: number
  errors: number
  /** Summed provider token buckets; an absent bucket is skipped. */
  tokens: TrajectoryTokens
}

/** The complete graph projection of one trajectory snapshot. */
export interface TrajectoryGraph {
  /** Nodes in ledger order. */
  readonly nodes: readonly TrajectoryGraphNode[]
  readonly edges: readonly TrajectoryGraphEdge[]
  /** Turn runs over the nodes, by node index. */
  readonly bands: readonly TrajectoryGraphBand[]
  /** Ledger order with the incoming edge per record. */
  readonly timeline: readonly TrajectoryTimelineStep[]
  readonly stats: TrajectoryGraphStats
  /** Whether any record is still moving. */
  readonly live: boolean
}

/** One windowed view of a projection, for the render cap. */
export interface TrajectoryGraphWindow {
  graph: TrajectoryGraph
  /** How many leading records the window dropped. */
  readonly hidden: number
}

/** A node while turn attribution still rewrites its turn and step. */
type MutableNode = { -readonly [K in keyof TrajectoryGraphNode]: TrajectoryGraphNode[K] }

/** Live records sort above every durable sequence. */
const LIVE_SEQ_BASE = 1e9

/** Token buckets summed by the stats pass, in report order. */
const TOKEN_KEYS = ['input', 'cacheRead', 'cacheWrite', 'output', 'reasoning'] as const

/** Localized name of each model-retry lifecycle state. */
const RETRY_KEY: Readonly<Record<ModelRetryNode['retryState'], TrajectoryKey>> = {
  scheduled: 'graph.node.retryScheduled',
  started: 'graph.node.retryStarted',
  cancelled: 'graph.node.retryCancelled',
}

/** Collapse whitespace and cut to the limit. */
function squash(text: string, limit: number): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > limit ? flat.slice(0, limit - 1) + '…' : flat
}

/** One-line chip label: the record's own text, or the localized name of its kind. */
function chipLabel(text: string, fallback: string): string {
  const flat = squash(text, 48)
  return flat === '' ? fallback : flat
}

/** Collapse message content to one line, naming a non-text block by its type tag. */
function contentText(content: readonly ContentBlock[], limit: number): string {
  const parts: string[] = []
  for (const block of content) {
    parts.push(block.type === 'text' ? block.text : '[' + block.type + ']')
  }
  return squash(parts.join(' '), limit)
}

/** Collapse assistant blocks to one line: tool calls by name, images by nothing. */
function blocksText(blocks: readonly AssistantBlock[], limit: number): string {
  const parts: string[] = []
  for (const block of blocks) {
    switch (block.kind) {
      case 'text':
      case 'reasoning':
        parts.push(block.text)
        break
      case 'tool-call':
        parts.push(block.name)
        break
      case 'image':
      case 'other':
        break
    }
  }
  return squash(parts.join(' '), limit)
}

/** Every tool-call block of one assistant record, in block order. */
function toolCallBlocks(blocks: readonly AssistantBlock[]): readonly {
  callId: string
  name: string
  argsRaw: string
}[] {
  const calls: { callId: string; name: string; argsRaw: string }[] = []
  for (const block of blocks) {
    if (block.kind === 'tool-call') {
      calls.push({ callId: block.callId, name: block.name, argsRaw: block.argsRaw })
    }
  }
  return calls
}

/** The short tail a call id is displayed by. */
function callTail(callId: string): string {
  return callId.length > 10 ? callId.slice(-6) : callId
}

/** Read one token bucket from either the raw or the projected usage member names. */
function pickTokens(record: Record<string, unknown>, ...keys: readonly string[]): number | undefined {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'number' && Number.isFinite(value)) return value
  }
  return undefined
}

/** Read every token bucket a record reported, or undefined when it reported none. */
function tokenBuckets(usage: unknown): TrajectoryTokens | undefined {
  if (typeof usage !== 'object' || usage === null || Array.isArray(usage)) return undefined
  const record = usage as Record<string, unknown>
  const input = pickTokens(record, 'input', 'inputTokens')
  const cacheRead = pickTokens(record, 'cacheRead', 'cacheReadTokens')
  const cacheWrite = pickTokens(record, 'cacheWrite', 'cacheWriteTokens')
  const output = pickTokens(record, 'output', 'outputTokens')
  const reasoning = pickTokens(record, 'reasoning', 'reasoningTokens')
  const buckets: TrajectoryTokens = {
    ...(input === undefined ? {} : { input }),
    ...(cacheRead === undefined ? {} : { cacheRead }),
    ...(cacheWrite === undefined ? {} : { cacheWrite }),
    ...(output === undefined ? {} : { output }),
    ...(reasoning === undefined ? {} : { reasoning }),
  }
  const empty = TOKEN_KEYS.every(key => buckets[key] === undefined)
  return empty ? undefined : buckets
}

/** Everything one ledger record contributes to its node beyond identity and order. */
interface DescribedNode {
  kind: TrajectoryGraphNodeKind
  lane: TrajectoryLane
  status: TrajectoryGraphNodeStatus
  label: string
  badge?: string
  detail?: string
  args?: string
  result?: string
  tokens?: TrajectoryTokens
  durationMs?: number
  opensTurn?: boolean
}

/**
 * Classify one durable ledger record and build its chip copy.
 * @param node - the record, discriminated by its own kind.
 * @param t - namespace-bound translate for the copy this node contributes.
 * @returns The record's lane, lifecycle, and presentation fields.
 */
function describeEventNode(node: ConversationNode, t: TrajectoryTranslate): DescribedNode {
  switch (node.kind) {
    case 'user': {
      const text = contentText(node.content, 4000)
      return {
        kind: 'user',
        lane: 'input',
        status: 'idle',
        label: chipLabel(text, t('graph.node.user')),
        ...(text === '' ? {} : { detail: text }),
        opensTurn: true,
      }
    }
    case 'steering': {
      const text = contentText(node.content, 4000)
      return {
        kind: 'steering',
        lane: 'input',
        status: 'idle',
        label: chipLabel(text, t('graph.node.steering')),
        ...(text === '' ? {} : { detail: text }),
      }
    }
    case 'context': {
      const text = contentText(node.content, 4000)
      return {
        kind: 'context',
        lane: 'input',
        status: 'idle',
        label: chipLabel(node.provenance.label ?? '', t('graph.node.context')),
        badge: t(node.provenance.role === 'recall' ? 'graph.context.recall' : 'graph.context.inject'),
        ...(text === '' ? {} : { detail: text }),
      }
    }
    case 'command': {
      const outcome = node.outcome
      return {
        kind: 'command',
        lane: 'input',
        status: outcome === null ? 'idle' : outcome.kind === 'error' ? 'error' : 'complete',
        label: node.name === null ? t('graph.node.command') : '/' + node.name,
        ...(outcome === null
          ? {}
          : { badge: t(outcome.kind === 'error' ? 'status.failed' : 'status.completed') }),
        ...(outcome?.text === undefined ? {} : { detail: outcome.text }),
      }
    }
    case 'assistant': {
      const full = blocksText(node.blocks, 4000)
      const calls = toolCallBlocks(node.blocks)
      const usage = tokenBuckets(node.usage)
      const timing = node.timing
      const started = timing?.stepStartTime
      const completed = timing?.completedTime
      return {
        kind: 'assistant',
        lane: 'model',
        status: node.interrupted === true ? 'interrupted' : 'complete',
        label: chipLabel(full, calls.length === 0
          ? t('graph.node.assistant')
          : t(calls.length === 1 ? 'summary.toolCalls.one' : 'summary.toolCalls.other', {
            count: calls.length,
          })),
        ...(calls.length === 0 ? {} : { badge: calls.length + '×' }),
        ...(full === '' ? {} : { detail: full }),
        ...(usage === undefined ? {} : { tokens: usage }),
        ...(typeof started !== 'number' || completed === undefined
          ? {}
          : { durationMs: Math.max(0, completed - started) }),
      }
    }
    case 'tool-result': {
      const content = contentText(node.content, 4000)
      const args = node.call?.argsRaw
      return {
        kind: 'tool',
        lane: 'tool',
        status: node.isError ? 'error' : 'complete',
        label: node.call?.name ?? node.callId,
        badge: node.isError ? node.error?.code ?? t('status.failed') : callTail(node.callId),
        ...(args === undefined || args === '' ? {} : { args }),
        ...(content === '' ? {} : { result: content }),
      }
    }
    case 'compaction': {
      const summary = node.summary
      const shadowed = node.shadowedTokenCount
      return {
        kind: 'compaction',
        lane: 'model',
        status: 'complete',
        label: chipLabel(summary ?? '', t('graph.node.compaction')),
        ...(shadowed === null ? {} : { badge: t('unit.tokens', { value: shadowed }) }),
        ...(summary === null ? {} : { detail: summary }),
      }
    }
    case 'model-retry':
      return {
        kind: 'retry',
        lane: 'model',
        status: node.retryState === 'started' ? 'running' : 'idle',
        label: t(RETRY_KEY[node.retryState]),
        badge: node.failure.code,
        ...(node.failure.message === '' ? {} : { detail: node.failure.message }),
      }
    case 'turn-error': {
      const message = squash(node.message, 4000)
      return {
        kind: 'error',
        lane: 'model',
        status: 'error',
        label: chipLabel(node.message, t('graph.node.error')),
        ...(node.code === undefined ? {} : { badge: node.code }),
        ...(message === '' ? {} : { detail: message }),
      }
    }
    case 'turn-max-tokens':
      return {
        kind: 'max-tokens',
        lane: 'model',
        status: 'error',
        label: t('graph.node.maxTokens'),
      }
    case 'unknown':
      return {
        kind: 'unknown',
        lane: 'model',
        status: 'idle',
        label: node.type,
      }
  }
}

/** Group consecutive nodes that share a turn into bands. */
function buildBands(nodes: readonly TrajectoryGraphNode[]): TrajectoryGraphBand[] {
  const runs: TrajectoryGraphBand[] = []
  let turn: number | null = null
  let from = 0
  let open = false
  for (const [index, node] of nodes.entries()) {
    if (open && node.turn === turn) continue
    if (open) runs.push({ turn, from, to: index })
    turn = node.turn
    from = index
    open = true
  }
  if (open) runs.push({ turn, from, to: nodes.length })
  // A record outside every turn (an unknown surface event, a standalone
  // compaction) must not visually split the stripe of the turn surrounding it:
  // a null-turn run between two runs of one turn folds into that turn's band,
  // and a null run no run of the same turn resumes stays its own band.
  const bands: TrajectoryGraphBand[] = []
  let gap: TrajectoryGraphBand[] = []
  for (const run of runs) {
    if (run.turn === null) {
      gap.push(run)
      continue
    }
    const last = bands[bands.length - 1]
    if (gap.length > 0 && last !== undefined && last.turn === run.turn) {
      bands[bands.length - 1] = { turn: last.turn, from: last.from, to: run.to }
      gap = []
      continue
    }
    bands.push(...gap, run)
    gap = []
  }
  bands.push(...gap)
  return bands
}

/**
 * Order the ledger for a replay-style walk: each record with the edge that
 * delivered it. Edges are built in chain order (prompt, result, dispatch,
 * subcall, loop), so the first incoming edge of a record is its delivery.
 */
function buildTimeline(
  nodes: readonly TrajectoryGraphNode[],
  edges: readonly TrajectoryGraphEdge[],
): TrajectoryTimelineStep[] {
  const incoming = new Map<string, TrajectoryGraphEdge>()
  for (const edge of edges) {
    if (!incoming.has(edge.to)) incoming.set(edge.to, edge)
  }
  return nodes.map(node => ({
    nodeId: node.id,
    edgeId: incoming.get(node.id)?.id ?? null,
    at: node.time,
  }))
}

/** Session totals for the strip above the canvas. */
function buildStats(
  nodes: readonly TrajectoryGraphNode[],
  edges: readonly TrajectoryGraphEdge[],
): TrajectoryGraphStats {
  const tokens: TrajectoryTokens = {}
  let turns = 0
  let tools = 0
  let running = 0
  let errors = 0
  for (const node of nodes) {
    if (node.turn !== null && node.turn > turns) turns = node.turn
    if (node.lane === 'tool' && node.status !== 'idle') tools += 1
    if (node.status === 'running') running += 1
    if (node.status === 'error') errors += 1
    const buckets = node.tokens
    if (buckets === undefined) continue
    for (const key of TOKEN_KEYS) {
      const value = buckets[key]
      if (value !== undefined) tokens[key] = (tokens[key] ?? 0) + value
    }
  }
  return { nodes: nodes.length, edges: edges.length, turns, tools, running, errors, tokens }
}

/** The projection of a snapshot that carries no record at all. */
function emptyGraph(): TrajectoryGraph {
  return {
    nodes: [],
    edges: [],
    bands: [],
    timeline: [],
    stats: { nodes: 0, edges: 0, turns: 0, tools: 0, running: 0, errors: 0, tokens: {} },
    live: false,
  }
}

/**
 * Project one Trajectory snapshot into the graph model.
 * @param snapshot - the live Trajectory target snapshot, or null while none is assembled.
 * @param t - namespace-bound translate for every string the nodes carry.
 * @returns Nodes in ledger order with their edges, turn bands, timeline, and totals.
 */
export function buildTrajectoryGraph(
  snapshot: TrajectorySnapshot | null | undefined,
  t: TrajectoryTranslate,
): TrajectoryGraph {
  if (snapshot === null || snapshot === undefined) return emptyGraph()

  const pending: { node: MutableNode; order: number }[] = []
  /** callId to the node standing for that call: settled, in flight, or synthesized. */
  const callNodes = new Map<string, string>()
  const requests: { node: MutableNode; view: RequestView }[] = []

  // 1. Loaded system-prompt state.
  for (const prompt of snapshot.systemPrompts ?? []) {
    const text = squash(prompt.text, 4000)
    pending.push({
      order: prompt.seq,
      node: {
        id: 'sys:' + prompt.seq,
        kind: 'system',
        lane: 'input',
        status: 'idle',
        seq: prompt.seq,
        time: prompt.time,
        turn: prompt.turn,
        step: prompt.step,
        label: chipLabel(prompt.text, t('graph.node.system')),
        ...(text === '' ? {} : { detail: text }),
        live: false,
      },
    })
  }

  // 2. Durable ledger records.
  for (const record of snapshot.eventNodes) {
    const described = describeEventNode(record, t)
    const id = 'ev:' + record.kind + ':' + record.seq
    pending.push({
      order: record.seq,
      node: {
        id,
        kind: described.kind,
        lane: described.lane,
        status: described.status,
        seq: record.seq,
        time: record.time,
        turn: 'turn' in record ? record.turn : null,
        step: 'step' in record ? record.step : null,
        label: described.label,
        ...(described.badge === undefined ? {} : { badge: described.badge }),
        ...(described.detail === undefined ? {} : { detail: described.detail }),
        ...(described.args === undefined ? {} : { args: described.args }),
        ...(described.result === undefined ? {} : { result: described.result }),
        ...(described.tokens === undefined ? {} : { tokens: described.tokens }),
        ...(described.durationMs === undefined ? {} : { durationMs: described.durationMs }),
        ...(described.opensTurn === undefined ? {} : { opensTurn: described.opensTurn }),
        live: described.status === 'running',
      },
    })
    if (described.kind === 'tool' && 'callId' in record) callNodes.set(record.callId, id)
  }

  // 3. Provider requests: the agent-loop steps.
  for (const view of snapshot.requests) {
    const compaction = view.purpose === 'compaction'
    const status: TrajectoryGraphNodeStatus = view.status === 'running'
      ? 'running'
      : view.status === 'error' ? 'error' : 'complete'
    const usage = tokenBuckets(view.usage)
    const node: MutableNode = {
      id: (compaction ? 'creq:' : 'req:') + view.startSeq,
      kind: compaction ? 'compact-request' : 'request',
      lane: 'model',
      status,
      seq: view.startSeq,
      time: view.startedAt,
      turn: view.turn,
      step: view.step,
      label: t(compaction ? 'graph.node.compactionRequest' : 'graph.node.request'),
      ...(status === 'running' ? { badge: t('graph.status.running') } : {}),
      ...(view.error === undefined ? {} : { detail: view.error }),
      ...(usage === undefined ? {} : { tokens: usage }),
      ...(view.completedAt === null
        ? {}
        : { durationMs: Math.max(0, view.completedAt - view.startedAt) }),
      live: status === 'running',
    }
    pending.push({ order: view.startSeq, node })
    requests.push({ node, view })
  }

  // 4. Live records: the streaming assistant prefix and every unsettled call.
  const partial = snapshot.partial
  if (partial !== null) {
    const text = blocksText(partial.blocks, 52)
    pending.push({
      order: LIVE_SEQ_BASE,
      node: {
        id: 'partial:' + partial.turn + ':' + partial.step,
        kind: 'partial',
        lane: 'model',
        status: 'running',
        seq: LIVE_SEQ_BASE,
        time: 0,
        turn: partial.turn,
        step: partial.step,
        label: text === '' ? t('graph.node.streaming') : text,
        badge: t('graph.live'),
        live: true,
      },
    })
  }
  let liveCount = 0
  const walkRunning = (call: RunningToolCall): void => {
    const id = 'call:' + call.callId
    const seq = LIVE_SEQ_BASE + 1000 + liveCount
    liveCount += 1
    callNodes.set(call.callId, id)
    pending.push({
      order: seq,
      node: {
        id,
        kind: 'running-call',
        lane: 'tool',
        status: 'running',
        seq,
        time: call.time,
        turn: call.turn,
        step: call.step,
        label: call.name,
        badge: t('graph.live'),
        ...(call.argsRaw === '' ? {} : { args: call.argsRaw }),
        live: true,
      },
    })
    for (const child of call.subCalls) {
      // A settled child already owns its durable node; only an unsettled one
      // adds a live node beside it.
      if (!('kind' in child)) walkRunning(child)
    }
  }
  for (const call of snapshot.runningCalls) walkRunning(call)

  // 5. The calls whose result never landed: a window cut, or a call the host
  //    has not reported as running yet.
  for (const record of snapshot.eventNodes) {
    if (record.kind !== 'assistant') continue
    for (const call of toolCallBlocks(record.blocks)) {
      if (call.callId === '' || callNodes.has(call.callId)) continue
      const id = 'waiting:' + call.callId
      callNodes.set(call.callId, id)
      pending.push({
        order: record.seq + 0.5,
        node: {
          id,
          kind: 'tool',
          lane: 'tool',
          status: 'idle',
          seq: record.seq + 0.5,
          time: record.time,
          turn: record.turn,
          step: record.step,
          label: call.name,
          badge: callTail(call.callId),
          ...(call.argsRaw === '' ? {} : { args: call.argsRaw }),
          live: false,
        },
      })
    }
  }

  // 6. Ledger order. Sorting is stable, so records sharing an order key keep
  //    the order they were contributed in.
  pending.sort((left, right) => left.order - right.order)
  const nodes: MutableNode[] = pending.map(entry => entry.node)

  // 7. Turn attribution: a request owns its declared turn, an input record
  //    belongs to the request it fed, and everything else inherits the last
  //    step the loop committed.
  const assistantRequests = requests
    .filter(entry => entry.view.purpose !== 'compaction')
    .sort((left, right) => left.node.seq - right.node.seq)
  let lastTurn: number | null = null
  let lastStep: number | null = null
  for (const node of nodes) {
    switch (node.kind) {
      case 'request':
      case 'compact-request':
      case 'assistant':
      case 'partial':
      case 'retry':
      case 'error':
      case 'max-tokens':
        lastTurn = node.turn ?? lastTurn
        lastStep = node.step ?? lastStep
        break
      case 'user':
      case 'steering':
      case 'context':
      case 'command':
      case 'system': {
        const feeder = assistantRequests.find(entry => entry.node.seq > node.seq)
        node.turn = feeder === undefined ? lastTurn : feeder.node.turn
        node.step = feeder === undefined ? null : feeder.node.step
        break
      }
      case 'compaction': {
        // A checkpoint belongs to the compaction request that committed it, so
        // a standalone compaction stays outside every turn.
        const owner = requests.find(entry => entry.view.purpose === 'compaction'
          && entry.view.replacementSeq === node.seq)
        node.turn = owner === undefined ? null : owner.node.turn
        node.step = owner === undefined ? null : owner.node.step
        break
      }
      case 'tool':
      case 'running-call':
      case 'unknown':
        node.turn = node.turn ?? lastTurn
        node.step = node.step ?? lastStep
        break
    }
  }

  // 8. Edges. Every endpoint is a node id this pass created, so linking only
  //    has to keep the result free of duplicates.
  const edges: TrajectoryGraphEdge[] = []
  const seen = new Set<string>()
  const link = (from: string, to: string, kind: TrajectoryGraphEdgeKind): void => {
    const id = kind + ':' + from + '->' + to
    if (seen.has(id)) return
    seen.add(id)
    edges.push({ id, from, to, kind, live: false })
  }

  // 8a. input to request: each input record feeds at most one request.
  const consumed = new Set<string>()
  for (const entry of assistantRequests) {
    let feeder: MutableNode | undefined
    for (const node of nodes) {
      if (node.seq >= entry.node.seq) break
      if (consumed.has(node.id)) continue
      if (node.kind === 'user' || node.kind === 'steering' || node.kind === 'context'
        || node.kind === 'system' || node.kind === 'compaction') feeder = node
    }
    if (feeder === undefined) continue
    consumed.add(feeder.id)
    link(feeder.id, entry.node.id, 'prompt')
  }

  // 8b. request to the record it produced.
  const bySeq = new Map<number, MutableNode>()
  for (const node of nodes) if (!bySeq.has(node.seq)) bySeq.set(node.seq, node)
  for (const entry of requests) {
    const view = entry.view
    const targetSeq = view.purpose === 'compaction' ? view.replacementSeq : view.resultSeq
    const target = targetSeq === undefined ? undefined : bySeq.get(targetSeq)
    if (target !== undefined) {
      link(entry.node.id, target.id, 'result')
      continue
    }
    if (entry.node.status !== 'running') continue
    const streaming = nodes.find(node => node.kind === 'partial'
      && node.turn === entry.node.turn && node.step === entry.node.step)
    if (streaming !== undefined) link(entry.node.id, streaming.id, 'result')
  }

  // 8c. assistant tool-call block to the tool record its callId names.
  for (const record of snapshot.eventNodes) {
    if (record.kind !== 'assistant') continue
    const from = 'ev:assistant:' + record.seq
    for (const call of toolCallBlocks(record.blocks)) {
      if (call.callId === '') continue
      const target = callNodes.get(call.callId)
      if (target !== undefined) link(from, target, 'dispatch')
    }
  }

  // 8d. tool record to each child call it dispatched.
  const linkSubCalls = (parentId: string, call: ToolCallBlock): void => {
    const childId = callNodes.get(call.callId)
    if (childId !== undefined) link(parentId, childId, 'subcall')
    for (const child of call.subCalls) linkSubCalls(childId ?? parentId, child)
  }
  for (const record of snapshot.eventNodes) {
    if (record.kind !== 'tool-result') continue
    const parentId = 'ev:tool-result:' + record.seq
    for (const child of record.subCalls) linkSubCalls(parentId, child)
  }
  for (const call of snapshot.runningCalls) {
    const parentId = 'call:' + call.callId
    for (const child of call.subCalls) linkSubCalls(parentId, child)
  }

  // 8e. tool record to the next request: the agent loop closing.
  for (const node of nodes) {
    if (node.lane !== 'tool') continue
    const next = assistantRequests.find(entry => entry.node.seq > node.seq)
    if (next !== undefined) link(node.id, next.node.id, 'loop')
  }

  // 9. Live edges: data is still arriving at the record an edge feeds — the
  //    streaming prefix and in-flight calls. A running request consumed its
  //    inputs when it started, so its own incoming edges stay settled.
  const liveIds = new Set(nodes.filter(node => node.live).map(node => node.id))
  const flowing = new Set(nodes.filter(node => node.live
    && (node.kind === 'partial' || node.kind === 'running-call')).map(node => node.id))
  const liveEdges = edges.map(edge => (flowing.has(edge.to) ? { ...edge, live: true } : edge))

  return {
    nodes,
    edges: liveEdges,
    bands: buildBands(nodes),
    timeline: buildTimeline(nodes, liveEdges),
    stats: buildStats(nodes, liveEdges),
    live: liveIds.size > 0,
  }
}

/**
 * Keep only the most recent records, with the edges between them.
 *
 * A session's ledger is unbounded, so the view renders a tail window and
 * reports how many leading records it dropped.
 * @param graph - the full projection.
 * @param limit - maximum records to keep; a non-positive limit keeps none.
 * @returns The windowed graph and the number of dropped leading records.
 */
export function windowTrajectoryGraph(graph: TrajectoryGraph, limit: number): TrajectoryGraphWindow {
  if (limit <= 0) return { graph: emptyGraph(), hidden: graph.nodes.length }
  if (graph.nodes.length <= limit) return { graph, hidden: 0 }
  const dropped = graph.nodes.length - limit
  const nodes = graph.nodes.slice(dropped)
  const kept = new Set(nodes.map(node => node.id))
  const edges = graph.edges.filter(edge => kept.has(edge.from) && kept.has(edge.to))
  return {
    graph: {
      nodes,
      edges,
      bands: buildBands(nodes),
      timeline: graph.timeline.slice(dropped),
      stats: buildStats(nodes, edges),
      live: graph.live,
    },
    hidden: dropped,
  }
}
