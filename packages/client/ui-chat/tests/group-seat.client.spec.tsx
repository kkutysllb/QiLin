// @vitest-environment jsdom

/** Driven fixture for the process-group seat: one group, its members, and the live policy. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useEffect, useRef, type ComponentProps } from 'react'
import { SessionSeq } from '@qilin-agent/session/types'
import type {
  ConversationGroupData, GroupKey, GroupSnapshot, NodeKey, NodeReference, TurnLocation,
} from '@qilin-agent/client-ui-conversation/client'
import type { TurnEndReason } from '@qilin-agent/session/types'
import { createSnapshotStore, type ObservableSnapshot } from '@qilin-agent/client-store'
import { bindSnapshotSelector, makeTranslate } from '@qilin-agent/client-test-runtime'
import type { KeyedSnapshotSelectorHook, SnapshotSelectorHook } from '@qilin-agent/client-ui-slots'
import { zh as commonZh } from '@qilin-agent/client-locale/src/locales/zh.ts'
import { ChatGroupSeat } from '../src/client/chat/ChatGroupSeat.tsx'
import type { ChatConversationViewNode, ChatNode } from '../src/client/contract/chat-nodes.ts'
import type {
  ChatNodeProcessSource, ChatNodeSource, ChatNodeStore, ChatTurnProcessPresentation,
} from '../src/client/contract/snapshot.ts'
import type { ProcessActivitySummary, ProcessGroupData } from '../src/client/contract/process-groups.ts'
import type { TurnProcessSpec } from '../src/client/contract/turn-process.ts'
import type { TranscriptViewMode } from '../src/chat-settings.ts'
import { presentationPolicyFor } from '../src/client/presentation-policy.ts'
import { createChatStore } from '../src/client/stores.ts'
import { zh } from '../src/client/locale.ts'

type SeatProps = ComponentProps<typeof ChatGroupSeat>
type GroupSnapshotValue = GroupSnapshot<ConversationGroupData<'chat'>> | undefined

/** Per-key selector hook over one source map, matching the renderer's binding. */
function keyedHook<Value>(
  resolve: (key: string) => ObservableSnapshot<Value>,
): KeyedSnapshotSelectorHook<Value> {
  const hooks = new WeakMap<object, SnapshotSelectorHook<Value>>()
  return ((key: string, selector?: (value: Value) => unknown, equal?: (left: unknown, right: unknown) => boolean) => {
    const source = resolve(key)
    let useValue = hooks.get(source)
    if (useValue === undefined) {
      useValue = bindSnapshotSelector(source)
      hooks.set(source, useValue)
    }
    return useValue(selector ?? ((value: Value) => value), equal)
  }) as KeyedSnapshotSelectorHook<Value>
}

const turn: TurnLocation = {
  turn: 1, status: 'open', steps: [], end: undefined,
  start: { type: 'turn/start', seq: SessionSeq(1), time: 1, data: { turn: 1 } },
  data: { get: () => undefined, source: () => ({ getSnapshot: () => undefined, subscribe: () => () => {} }) },
}

/** The same Turn closed by one recorded end reason. */
function endedTurn(reason: TurnEndReason): TurnLocation {
  return {
    ...turn,
    status: 'closed',
    end: { type: 'turn/end', seq: SessionSeq(9), time: 9_000, data: { turn: 1, reason } },
  }
}

function userNode(key: string, seq: number, location: TurnLocation = turn): ChatNode<'user'> {
  return {
    key, id: key, kind: 'user', target: 'chat', anchorSeq: seq,
    location: { kind: 'turn', turn: location }, visibility: 'visible',
    data: { kind: 'user', seq, time: seq, content: [{ type: 'text', text: key }], source: null },
  }
}

/** Observers the seat binds, so a test can deliver the size change jsdom never fires. */
class FakeResizeObserver implements ResizeObserver {
  static instances: FakeResizeObserver[] = []
  readonly targets = new Set<Element>()
  constructor(readonly callback: ResizeObserverCallback) { FakeResizeObserver.instances.push(this) }
  observe(target: Element): void { this.targets.add(target) }
  unobserve(target: Element): void { this.targets.delete(target) }
  disconnect(): void {
    this.targets.clear()
    const index = FakeResizeObserver.instances.indexOf(this)
    if (index >= 0) FakeResizeObserver.instances.splice(index, 1)
  }
  deliver(): void { this.callback([], this) }
}

interface SeatOptions {
  readonly members?: readonly NodeReference[]
  readonly summary?: ProcessActivitySummary
  readonly closed?: boolean
  readonly reason?: TurnEndReason
  readonly process?: ChatTurnProcessPresentation
}

/** One rendered group seat plus the mutable inputs a test drives. */
function makeSeat(options: SeatOptions = {}) {
  const groupKey = 'group:1' as GroupKey
  const members = options.members ?? [{ kind: 'node' as const, key: 'user:1' as NodeKey }]
  const location = options.reason === undefined ? turn : endedTurn(options.reason)
  const nodes = new Map<string, ChatConversationViewNode>([['user:1', userNode('user:1', 1, location)]])
  const nodeSources = new Map<string, ObservableSnapshot<ChatConversationViewNode | undefined>>()
  const processSources = new Map<string, ObservableSnapshot<undefined>>()
  const presentationSource = createSnapshotStore<ChatTurnProcessPresentation | undefined>(options.process)
  const nodeStore: ChatNodeStore = {
    get: key => nodes.get(key),
    source: (key): ChatNodeSource => {
      let source = nodeSources.get(key)
      if (source === undefined) {
        source = createSnapshotStore(nodes.get(key))
        nodeSources.set(key, source)
      }
      return source
    },
    turnDataSource: () => ({ getSnapshot: () => [], subscribe: () => () => {} }),
    bottomSource: () => ({ getSnapshot: () => false, subscribe: () => () => {} }),
    processSource: (key): ChatNodeProcessSource => {
      let source = processSources.get(key)
      if (source === undefined) {
        source = createSnapshotStore<undefined>(undefined)
        processSources.set(key, source)
      }
      return source
    },
    values: () => [...nodes.values()],
  }
  const groupStore = createSnapshotStore<GroupSnapshotValue>({
    key: groupKey,
    members,
    data: {
      turn: 1,
      closed: options.closed ?? true,
      summary: options.summary ?? { counts: [], running: undefined, runningDetail: '' },
    },
  })
  const policyStore = createSnapshotStore(presentationPolicyFor('standard'))
  const chat = createChatStore().create()
  const props: SeatProps = {
    groupKey,
    useGroupHeaderAction: () => {},
    // The motion hook owns the `hidden` attribute; the seat owns the boolean it
    // passes, so this stands in for the flow's hook at the same call sites.
    useGroupAction: (hidden: boolean) => {
      const ref = useRef<HTMLDivElement | null>(null)
      useEffect(() => {
        const element = ref.current
        if (element === null) return
        if (hidden) element.setAttribute('hidden', '')
        else element.removeAttribute('hidden')
      }, [hidden])
      return ref
    },
    useChatNodeBottom: keyedHook<boolean>(() => createSnapshotStore(false)),
    deferCollapse: false,
    useChatGroup: keyedHook<GroupSnapshotValue>(() => groupStore),
    nodeStore,
    useChatNode: keyedHook<ChatConversationViewNode | undefined>(key => nodeStore.source(key)),
    useChatNodeProcess: keyedHook<ChatTurnProcessPresentation | undefined>(() => presentationSource),
    usePresentation: bindSnapshotSelector(policyStore),
    useStore: bindSnapshotSelector(chat),
    actions: chat.actions,
    renderSlot: () => null,
    openFile: () => {},
    openSkill: () => {},
    inspectCall: () => {},
    forkAt: () => {},
    loadImage: () => Promise.reject(new Error('unused')),
    renderMessageImages: () => null,
    fileMentions: () => undefined,
    t: makeTranslate(zh, commonZh),
  }
  return {
    props,
    members,
    setPolicy: (mode: TranscriptViewMode) => { policyStore.set(presentationPolicyFor(mode)) },
    setGroup: (next: GroupSnapshot<ProcessGroupData>) => { groupStore.set({ ...next, key: groupKey }) },
  }
}

function headerOf(container: HTMLElement): HTMLButtonElement {
  const header = container.querySelector<HTMLButtonElement>('[data-process-activity]')
  if (header === null) throw new Error('group header did not render')
  return header
}

/** The header's visible label, apart from the decorative shimmer duplicate. */
function labelOf(container: HTMLElement): string {
  const label = container.querySelector<HTMLElement>('[data-process-label]')
  if (label === null) throw new Error('group title did not render')
  return label.textContent ?? ''
}

function bodyOf(container: HTMLElement): HTMLElement {
  const body = container.querySelector<HTMLElement>('[data-step-process-body]')
  if (body === null) throw new Error('group body did not render')
  return body
}

function rootOf(container: HTMLElement): HTMLElement {
  const root = container.querySelector<HTMLElement>('[data-chat-group-key]')
  if (root === null) throw new Error('group root did not render')
  return root
}

const SETTLED_SPEC: TurnProcessSpec = {
  turn: 1,
  controlAnchorSeq: 2,
  processStartSeq: 2,
  answerAnchorSeq: 8,
  answerStep: 1,
  inlineReasoning: false,
  messageCount: 1,
  toolCallCount: 1,
  subagentCount: 0,
}

const SETTLED_PRESENTATION: ChatTurnProcessPresentation = {
  turn: 1,
  spec: SETTLED_SPEC,
  turnStarted: true,
  turnClosed: true,
  hasExternalProcess: true,
  hasInterleavedInput: false,
  compactAnswer: false,
}

beforeEach(() => { FakeResizeObserver.instances = [] })

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const TITLE_CASES: readonly { name: string; summary: ProcessActivitySummary; closed: boolean; expected: string }[] = [
  { name: 'an empty summary', summary: { counts: [], running: undefined, runningDetail: '' }, closed: true, expected: '已完成分析' },
  {
    name: 'the running command detail',
    summary: { counts: [], running: 'commands', runningDetail: 'pwd' },
    closed: false,
    expected: '正在运行命令 · pwd',
  },
  {
    name: 'a preparing search',
    summary: { counts: [], running: 'search', runningDetail: '', preparing: true },
    closed: false,
    expected: '准备搜索代码',
  },
  {
    name: 'a preparing tool without a category',
    summary: { counts: [], running: undefined, runningDetail: '', preparing: true },
    closed: false,
    expected: '准备调用工具',
  },
  {
    name: 'one category',
    summary: { counts: [{ kind: 'read', count: 3 }], running: undefined, runningDetail: '' },
    closed: true,
    expected: '已读取文件',
  },
  {
    name: 'two categories sharing a prefix',
    summary: { counts: [{ kind: 'read', count: 1 }, { kind: 'readImage', count: 1 }], running: undefined, runningDetail: '' },
    closed: true,
    expected: '已读取文件并读取图片',
  },
  {
    name: 'three categories',
    summary: {
      counts: [{ kind: 'read', count: 1 }, { kind: 'edit', count: 1 }, { kind: 'commands', count: 1 }],
      running: undefined, runningDetail: '',
    },
    closed: true,
    expected: '已读取文件，修改了文件，执行了命令',
  },
  {
    name: 'four categories',
    summary: {
      counts: [
        { kind: 'read', count: 1 }, { kind: 'edit', count: 1 },
        { kind: 'commands', count: 1 }, { kind: 'search', count: 1 },
      ],
      running: undefined, runningDetail: '',
    },
    closed: true,
    expected: '已读取文件，修改了文件，执行了命令等',
  },
]

describe('ChatGroupSeat', () => {
  it('titles settled work by its ranked categories and hides its rows until asked', () => {
    const seat = makeSeat({
      closed: true,
      summary: { counts: [{ kind: 'read', count: 2 }, { kind: 'edit', count: 1 }], running: undefined, runningDetail: '' },
    })
    const view = render(<ChatGroupSeat {...seat.props} />)
    const header = headerOf(view.container)
    const body = bodyOf(view.container)

    expect(header.textContent).toBe('已读取文件并修改了文件')
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(header.dataset.processActivity).toBe('read')
    expect(body.hasAttribute('hidden')).toBe(true)

    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('true')
    expect(body.hasAttribute('hidden')).toBe(false)

    fireEvent.click(header)
    expect(header.getAttribute('aria-expanded')).toBe('false')
    expect(body.hasAttribute('hidden')).toBe(true)
  })

  it.each([
    { name: 'a completed Turn', reason: { kind: 'completed' } as TurnEndReason, hidden: true },
    {
      name: 'a user cancellation',
      reason: { kind: 'aborted', reason: { kind: 'user' } } as TurnEndReason,
      hidden: false,
    },
    { name: 'a restart interruption', reason: { kind: 'interrupted' } as TurnEndReason, hidden: false },
    {
      name: 'a failed Turn',
      reason: { kind: 'error', error: { code: 'UNKNOWN', message: 'boom' } } as TurnEndReason,
      hidden: false,
    },
  ])('whole-Turn hiding for $name is $hidden', ({ reason, hidden }) => {
    const seat = makeSeat({ closed: true, reason, process: SETTLED_PRESENTATION })
    const view = render(<ChatGroupSeat {...seat.props} />)
    expect(rootOf(view.container).hasAttribute('hidden')).toBe(hidden)
  })

  it.each(TITLE_CASES)('titles $name as $expected', ({ summary, closed, expected }) => {
    const seat = makeSeat({ closed, summary })
    const view = render(<ChatGroupSeat {...seat.props} />)
    expect(labelOf(view.container)).toBe(expected)
  })

  it('withholds the live detail once the reader picks a mode without it', () => {
    const seat = makeSeat({
      closed: false,
      summary: { counts: [], running: 'commands', runningDetail: 'pwd' },
    })
    const view = render(<ChatGroupSeat {...seat.props} />)
    expect(labelOf(view.container)).toBe('正在运行命令 · pwd')

    act(() => { seat.setPolicy('compact') })
    expect(labelOf(view.container)).toBe('正在运行命令')
  })

  it('shimmers its title while the group runs and settles the text once it closes', () => {
    const running = render(<ChatGroupSeat {...makeSeat({ closed: false }).props} />)
    expect(running.container.querySelector('[data-process-label]')?.closest('[data-shimmer]')).not.toBeNull()
    running.unmount()
    const closed = render(<ChatGroupSeat {...makeSeat({ closed: true }).props} />)
    expect(closed.container.querySelector('[data-process-label]')?.closest('[data-shimmer]')).toBeNull()
  })

  it('keeps independently keyed members apart when one part is split out', () => {
    const seat = makeSeat({
      members: [
        { kind: 'node', key: 'user:1' as NodeKey, groupPart: 'reasoning' },
        { kind: 'node', key: 'user:1' as NodeKey },
      ],
    })
    const view = render(<ChatGroupSeat {...seat.props} />)
    const flowKeys = [...view.container.querySelectorAll('[data-chat-node-key]')]
      .map(element => element.getAttribute('data-chat-flow-key'))
    expect(flowKeys).toEqual([JSON.stringify(['user:1', 'reasoning']), 'user:1'])
  })

  it('nests a Step row one level and its reasoning and call rows two', () => {
    const seat = makeSeat({
      members: [
        { kind: 'node', key: 'user:1' as NodeKey, groupPart: 'response' },
        { kind: 'node', key: 'user:1' as NodeKey, groupPart: 'reasoning' },
        { kind: 'node', key: 'user:1' as NodeKey },
      ],
    })
    const view = render(<ChatGroupSeat {...seat.props} />)
    const depths = [...view.container.querySelectorAll<HTMLElement>('[data-chat-node-key]')]
      .map(row => row.getAttribute('data-chat-depth'))
    expect(depths).toEqual(['1', '2', '2'])
  })

  it.each([
    { closed: true, expectedTop: 0, expectedUp: false, expectedDown: true },
    { closed: false, expectedTop: 500, expectedUp: true, expectedDown: false },
  ])('positions a manually opened group with closed=$closed at $expectedTop and fades its edges', ({
    closed, expectedTop, expectedUp, expectedDown,
  }) => {
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    const seat = makeSeat({ closed })
    const view = render(<ChatGroupSeat {...seat.props} />)
    const header = headerOf(view.container)
    const body = bodyOf(view.container)
    expect(FakeResizeObserver.instances).toHaveLength(0)

    let top = 320
    Object.defineProperties(body, {
      scrollTop: { get: () => top, set: (value: number) => { top = value } },
      clientHeight: { value: 200 },
      scrollHeight: { value: 700 },
      scrollTo: { value: vi.fn() },
    })

    fireEvent.click(header)
    const observer = FakeResizeObserver.instances[0]
    if (observer === undefined) throw new Error('opening the group did not bind its observer')
    expect(observer.targets.has(body)).toBe(true)
    act(() => { observer.deliver() })
    expect(top).toBe(expectedTop)
    expect(body.hasAttribute('data-scroll-up')).toBe(expectedUp)
    expect(body.hasAttribute('data-scroll-down')).toBe(expectedDown)

    top = 200
    fireEvent.scroll(body)
    expect(body.hasAttribute('data-scroll-up')).toBe(true)
    expect(body.hasAttribute('data-scroll-down')).toBe(true)

    fireEvent.click(header)
    expect(FakeResizeObserver.instances).toHaveLength(0)
  })
})
