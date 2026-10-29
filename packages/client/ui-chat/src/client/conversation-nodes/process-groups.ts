/** Chat-owned segmentation and incremental summaries over materialized Node inputs. */
import { brandString } from '@qilin-agent/brand'
import type {
  ConversationGroupDefinition, ConversationGroupInput, GroupKey, GroupSnapshot,
  GroupUpdate, NodeKey, NodeReference, RenderEntry,
} from '@qilin-agent/client-ui-conversation/client'
import type { ChatConversationViewNode, ChatNode } from '../contract/chat-nodes.ts'
import type { ProcessActivitySummary, ProcessGroupData } from '../contract/process-groups.ts'
import { hasAssistantReplyContent } from '../contract/assistant-content.ts'
import { isVisibleChatNode } from '../contract/chat-visibility.ts'
import { isAtOrOutside } from '../contract/group-tree.ts'
import { processActivity } from './process-activity.ts'

type ProcessInput = ConversationGroupInput<ChatConversationViewNode>

function turnOf(node: ChatNode): number | undefined {
  const location = node.location
  return location.kind === 'turn' || location.kind === 'step' ? location.turn.turn : undefined
}

function reasoning(node: ChatNode): boolean {
  return node.kind === 'assistant-step'
    && node.data.blocks.some(block => block.kind === 'reasoning' && block.text.trim() !== '')
}

function reply(node: ChatNode): boolean {
  return node.kind === 'assistant-step' && hasAssistantReplyContent(node.data.blocks)
}

/** Process range one Turn owns, read from its own Turn-process control Node. */
interface ProcessRange {
  readonly start: number
  readonly answerAnchor: number | null
  readonly answerStep: number | null
}

/** Fallback range for a Turn whose control Node is outside the loaded window. */
const WHOLE_TURN: ProcessRange = { start: Number.NEGATIVE_INFINITY, answerAnchor: null, answerStep: null }

function processRange(nodes: readonly ChatNode[]): ProcessRange {
  const control = nodes.find((node): node is ChatNode<'turn-process'> => node.kind === 'turn-process')
  if (control === undefined) return WHOLE_TURN
  return {
    start: control.data.processStartSeq,
    answerAnchor: control.data.answerAnchorSeq,
    answerStep: control.data.answerStep,
  }
}

/**
 * Whether one Node's evidence falls inside the Turn's process range. A live
 * Turn has no answer boundary yet, so every node from the range start belongs.
 */
function inProcessRange(node: ChatNode, range: ProcessRange, live: boolean): boolean {
  return node.anchorSeq >= range.start
    && (live || range.answerAnchor === null || node.anchorSeq < range.answerAnchor)
}

/**
 * Whether one Node is the Turn's finalized answer step. A live Turn has no
 * answer boundary yet: its reply rows keep their own seat while streaming.
 */
function isAnswerStep(node: ChatNode, range: ProcessRange, live: boolean): boolean {
  return !live && range.answerStep !== null
    && node.kind === 'assistant-step' && node.data.step === range.answerStep
}

/** Whether a new Turn-process range must reshape the Turn's group. */
function processRangeChanged(previous: ChatNode, current: ChatNode): boolean {
  if (previous.kind !== 'turn-process' || current.kind !== 'turn-process') return false
  return previous.data.processStartSeq !== current.data.processStartSeq
    || previous.data.answerAnchorSeq !== current.data.answerAnchorSeq
    || previous.data.answerStep !== current.data.answerStep
}

/**
 * Whether one render part of a Node belongs to the Turn's group. The finalized
 * answer and a live Turn's reply keep their own rows: the answer owns the
 * Turn's seat, and the collapsed body would otherwise swallow the prose the
 * reader is watching.
 * @param part - renderer-owned part of the Node, or undefined for the whole Node.
 * @param answer - whether the Node is the Turn's finalized answer step.
 * @param member - whether the Node's evidence falls inside the process range.
 * @param closed - whether the Turn is closed.
 * @returns whether the part joins the Turn's group.
 */
function inGroup(part: string | undefined, answer: boolean, member: boolean, closed: boolean): boolean {
  if (part === 'response') return member && closed && !answer
  return member
}

function sameSummary(left: ProcessActivitySummary, right: ProcessActivitySummary): boolean {
  return left.running === right.running && left.runningDetail === right.runningDetail
    && left.preparing === right.preparing
    && left.counts.length === right.counts.length && left.counts.every((value, index) =>
    value.kind === right.counts[index]?.kind && value.count === right.counts[index].count)
}

function sameMembers(left: readonly NodeReference[], right: readonly NodeReference[]): boolean {
  return left.length === right.length && left.every((value, index) =>
    value.key === right[index]?.key && value.groupPart === right[index].groupPart)
}

function structureChanged(previous: ChatNode | undefined, current: ChatNode): boolean {
  if (!isVisibleChatNode(current) && (previous === undefined || !isVisibleChatNode(previous))) return false
  return previous === undefined || previous.kind !== current.kind
    || turnOf(previous) !== turnOf(current)
    || isVisibleChatNode(previous) !== isVisibleChatNode(current)
    || previous.groupTree !== current.groupTree
    || reasoning(previous) !== reasoning(current) || reply(previous) !== reply(current)
    || processRangeChanged(previous, current)
}

function readNode(input: ProcessInput, key: NodeKey): ChatNode {
  const node = input.readNode(key) as ChatNode | undefined
  if (node === undefined) throw new Error(`Chat grouping input is missing Node ${key}`)
  return node
}

/** One group's members and cached summary, refreshed together when its content changes. */
class ProcessGroup {
  private nodes: readonly ChatNode[] = []
  snapshot: GroupSnapshot<ProcessGroupData>

  constructor(readonly key: GroupKey, readonly turn: number, readonly members: readonly NodeReference[]) {
    this.snapshot = { key, members, data: { turn, closed: false, summary: { counts: [], running: undefined, runningDetail: '' } } }
  }

  refresh(input: ProcessInput, closed: boolean): void {
    const nodes = this.members.map(member => readNode(input, member.key))
    const unchanged = nodes.length === this.nodes.length && nodes.every((node, index) => node === this.nodes[index])
    const previous = this.snapshot.data
    const activity = unchanged && previous.closed === closed ? previous.summary : processActivity(nodes)
    const summary = closed ? { counts: activity.counts, running: undefined, runningDetail: '' } : activity
    this.nodes = nodes
    if (previous.closed !== closed || !sameSummary(previous.summary, summary)) {
      this.snapshot = {
        key: this.key, members: this.members,
        data: { turn: this.turn, closed, summary },
      }
    }
  }
}

/** One Turn's grouping result and member lookup; summaries stay with their groups. */
class TurnGroups {
  private groups = new Map<GroupKey, ProcessGroup>()
  private membership = new Map<NodeKey, GroupKey>()
  private roots = new Map<NodeKey, readonly RenderEntry[]>()

  constructor(readonly turn: number) {}

  references(key: NodeKey): readonly RenderEntry[] {
    return this.roots.get(key) ?? []
  }

  snapshots(): GroupSnapshot<ProcessGroupData>[] {
    return [...this.groups.values()].map(group => group.snapshot)
  }

  refresh(input: ProcessInput, changed: ReadonlySet<NodeKey>): GroupSnapshot<ProcessGroupData>[] {
    const dirty = new Set<GroupKey>()
    for (const node of changed) {
      const group = this.membership.get(node)
      if (group !== undefined) dirty.add(group)
    }
    const ended = input.timeline.turns.get(this.turn)?.status === 'closed'
    if (ended) {
      for (const group of this.groups.values()) {
        if (!group.snapshot.data.closed) dirty.add(group.key)
      }
    }
    const upserts: GroupSnapshot<ProcessGroupData>[] = []
    for (const key of dirty) {
      const group = this.groups.get(key) as ProcessGroup
      const previous = group.snapshot
      group.refresh(input, previous.data.closed || ended)
      if (group.snapshot !== previous) upserts.push(group.snapshot)
    }
    return upserts
  }

  rebuild(input: ProcessInput, added: ReadonlySet<NodeKey>): { upserts: GroupSnapshot<ProcessGroupData>[]; removes: GroupKey[] } {
    const roots = new Map<NodeKey, readonly RenderEntry[]>()
    const groups = new Map<GroupKey, ProcessGroup>()
    const membership = new Map<NodeKey, GroupKey>()
    let pending: NodeReference[] = []
    const upserts: GroupSnapshot<ProcessGroupData>[] = []
    const emit = (key: NodeKey, entry: RenderEntry): void => {
      roots.set(key, [...roots.get(key) ?? [], entry])
    }
    /**
     * Install the accumulated members as the Turn's group.
     * @param complete - whether the members form a finished range; the Turn's own
     * lifecycle closes the last group of a live Turn.
     */
    const commit = (complete: boolean): void => {
      const first = pending[0]
      if (first === undefined) return
      const retained = this.extendedGroup(pending, added)
      const key = retained?.key ?? brandString<GroupKey>(JSON.stringify(['process', first.key, first.groupPart ?? null]))
      const previous = this.groups.get(key)
      const before = previous?.snapshot
      const group = previous !== undefined && sameMembers(previous.members, pending)
        ? previous : new ProcessGroup(key, this.turn, pending)
      group.refresh(input, complete || closed)
      groups.set(group.key, group)
      // A member that also renders its own row keeps that row after the header.
      roots.set(first.key, [{ kind: 'group', key: group.key }, ...roots.get(first.key) ?? []])
      for (const member of pending) membership.set(member.key, group.key)
      if (group.snapshot !== before) upserts.push(group.snapshot)
      pending = []
    }
    const keys = input.readTurn(this.turn)
    const nodes = keys.map(key => readNode(input, key))
    const closed = input.timeline.turns.get(this.turn)?.status === 'closed'
    const live = !closed
    const range = processRange(nodes)
    // A live Turn keeps the segmentation it streamed with: the collapsed process
    // body must not swallow the in-flight prose, and each finished segment folds
    // on its own. A closed Turn emits its whole range as one group.
    const split = (): void => { if (!closed) commit(true) }
    for (const [index, key] of keys.entries()) {
      const node = nodes[index] as ChatNode
      // Infrastructure rows never reach this loop: the Chat visible order drops
      // them through isVisibleChatNode before grouping reads the Turn. A Node
      // whose position is `process` or outer stands outside the step run.
      if (isAtOrOutside(node, 'process')) {
        split()
        emit(key, { kind: 'node', key })
        continue
      }
      const answer = isAnswerStep(node, range, live)
      const member = answer || inProcessRange(node, range, live)
      const parts: readonly NodeReference[] = node.kind === 'assistant-step'
        ? [
          ...reasoning(node) ? [{ kind: 'node' as const, key, groupPart: 'reasoning' }] : [],
          ...reply(node) ? [{ kind: 'node' as const, key, groupPart: 'response' }] : [],
        ]
        : [{ kind: 'node', key }]
      for (const reference of parts) {
        if (inGroup(reference.groupPart, answer, member, closed)) pending.push(reference)
        else {
          if (reference.groupPart === 'response') split()
          emit(key, reference)
        }
      }
    }
    commit(closed)
    const removes = [...this.groups.keys()].filter(key => !groups.has(key))
    this.groups = groups
    this.membership = membership
    this.roots = roots
    return { upserts, removes }
  }

  private extendedGroup(members: readonly NodeReference[], added: ReadonlySet<NodeKey>): ProcessGroup | undefined {
    // Reuse identity only while the complete old group remains between newly visible members.
    const offset = members.findIndex(member => !added.has(member.key))
    const first = members[offset]
    if (first === undefined) return undefined
    const key = this.membership.get(first.key)
    const previous = key === undefined ? undefined : this.groups.get(key)
    if (previous === undefined || offset + previous.members.length > members.length) return undefined
    for (let index = 0; index < previous.members.length; index++) {
      const before = previous.members[index] as NodeReference
      const after = members[offset + index] as NodeReference
      if (before.key !== after.key || before.groupPart !== after.groupPart) return undefined
    }
    for (let index = offset + previous.members.length; index < members.length; index++) {
      if (!added.has((members[index] as NodeReference).key)) return undefined
    }
    return previous
  }
}

function readPosition(input: ProcessInput, key: NodeKey) {
  const position = input.readPosition(key)
  if (position === undefined) throw new Error(`Chat grouping order is missing position for Node ${key}`)
  return position
}

/** Session-local Turn results; ordinary updates never read other Turns' Node contents. */
export class ProcessState {
  private turns = new Map<number, TurnGroups>()
  private order: readonly NodeKey[] = []
  private pending: GroupUpdate<ProcessGroupData> | null = null

  /**
   * Consume one synchronous Builder input without retaining its readers.
   * @param input - projected Node changes, indexed positions, and Turn lifecycle.
   */
  accept(input: ProcessInput): void {
    if (input.kind === 'replace') {
      const previousKeys = new Set(this.order)
      const added = new Set(input.order.filter(key => !previousKeys.has(key)))
      const turns = new Map<number, TurnGroups>()
      for (const key of input.order) {
        const turn = readPosition(input, key).turn
        if (turn === undefined || turns.has(turn)) continue
        const groups = this.turns.get(turn) ?? new TurnGroups(turn)
        groups.rebuild(input, added)
        turns.set(turn, groups)
      }
      this.turns = turns
      this.order = input.order
      this.pending = {
        entries: this.rootEntries(input),
        groups: { kind: 'replace', snapshots: [...turns.values()].flatMap(turn => turn.snapshots()) },
      }
      return
    }

    const regroup = new Set(input.changedTurnOrders)
    const added = new Set<NodeKey>()
    const changed = new Map<number, Set<NodeKey>>()
    const touch = (turn: number): Set<NodeKey> => {
      let keys = changed.get(turn)
      if (keys === undefined) {
        keys = new Set()
        changed.set(turn, keys)
      }
      return keys
    }
    for (const change of input.changes) {
      const before = change.previous as ChatNode | undefined
      const after = change.current as ChatNode
      const turn = turnOf(after)
      if (before === undefined || !isVisibleChatNode(before)) added.add(after.key as NodeKey)
      if (structureChanged(before, after)) {
        const previousTurn = before === undefined ? undefined : turnOf(before)
        if (previousTurn !== undefined) regroup.add(previousTurn)
        if (turn !== undefined) regroup.add(turn)
      }
      if (turn !== undefined) touch(turn).add(after.key as NodeKey)
    }
    for (const turn of input.changedTurns) {
      touch(turn)
      // A Turn that streamed several segments folds into one group once it is
      // closed, so a lifecycle-only close reassembles it. A Turn already holding
      // one group needs no rebuild.
      if (input.timeline.turns.get(turn)?.status === 'closed'
        && (this.turns.get(turn)?.snapshots().length ?? 0) > 1) regroup.add(turn)
    }

    const upserts: GroupSnapshot<ProcessGroupData>[] = []
    const removes: GroupKey[] = []
    for (const turn of regroup) {
      const groups = this.turns.get(turn) ?? new TurnGroups(turn)
      const update = groups.rebuild(input, added)
      upserts.push(...update.upserts)
      removes.push(...update.removes)
      if (input.readTurn(turn).length === 0) this.turns.delete(turn)
      else this.turns.set(turn, groups)
    }
    for (const [turn, keys] of changed) {
      if (!regroup.has(turn)) upserts.push(...this.turns.get(turn)?.refresh(input, keys) ?? [])
    }
    const reordered = input.order !== this.order || regroup.size > 0
    this.order = input.order
    const installed = new Set(upserts.map(group => group.key))
    this.pending = reordered || upserts.length > 0 || removes.length > 0
      ? {
        ...reordered ? { entries: this.rootEntries(input) } : {},
        groups: { kind: 'apply', upserts, removes: removes.filter(key => !installed.has(key)) },
      }
      : null
  }

  private rootEntries(input: ProcessInput): RenderEntry[] {
    return input.order.flatMap<RenderEntry>((key) => {
      const turn = readPosition(input, key).turn
      if (turn === undefined) return [{ kind: 'node', key }]
      const groups = this.turns.get(turn)
      if (groups === undefined) throw new Error(`Chat grouping order is missing Turn ${turn}`)
      return groups.references(key)
    })
  }

  /**
   * Read pending output without advancing State.
   * @returns the repeatable update for the last input batch.
   */
  output(): GroupUpdate<ProcessGroupData> | null { return this.pending }
}

/** Chat's registered business grouping; presentation modes never enter its State. */
export const processGroupDefinition: ConversationGroupDefinition<ChatConversationViewNode, ProcessState, ProcessGroupData>
  & { readonly target: 'chat' } = {
    kind: 'process-groups', target: 'chat',
    create: () => new ProcessState(),
    update: (context, input) => { context.state.accept(input); return context.state },
    buildGroups: context => context.state.output(),
  }
