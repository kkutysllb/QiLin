// @vitest-environment jsdom

/** Driven fixture for the process-group seat: one group, its members, and the live policy. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { SessionSeq } from '@qilin-agent/session/types'
import type {
  ConversationGroupData, GroupKey, GroupSnapshot, NodeKey, NodeReference, TurnLocation,
} from '@qilin-agent/client-ui-conversation/client'
import { createSnapshotStore, type ObservableSnapshot } from '@qilin-agent/client-store'
import { bindSnapshotSelector, makeTranslate } from '@qilin-agent/client-test-runtime'
import type { KeyedSnapshotSelectorHook, SnapshotSelectorHook } from '@qilin-agent/client-ui-slots'
import { zh as commonZh } from '@qilin-agent/client-locale/src/locales/zh.ts'
import { ChatGroupSeat } from '../src/client/chat/ChatGroupSeat.tsx'
import type { ChatConversationViewNode, ChatNode } from '../src/client/contract/chat-nodes.ts'
import type { ChatNodeProcessSource, ChatNodeSource, ChatNodeStore } from '../src/client/contract/snapshot.ts'
import type { ProcessActivitySummary, ProcessGroupData } from '../src/client/contract/process-groups.ts'
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

function userNode(key: string, seq: number): ChatNode<'user'> {
  return {
    key, id: key, kind: 'user', target: 'chat', anchorSeq: seq,
    location: { kind: 'turn', turn }, visibility: 'visible',
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
}

/** One rendered group seat plus the mutable inputs a test drives. */
function makeSeat(options: SeatOptions = {}) {
  const groupKey = 'group:1' as GroupKey
  const members = options.members ?? [{ kind: 'node' as const, key: 'user:1' as NodeKey }]
  const nodes = new Map<string, ChatConversationViewNode>([['user:1', userNode('user:1', 1)]])
  const nodeSources = new Map<string, ObservableSnapshot<ChatConversationViewNode | undefined>>()
  const processSources = new Map<string, ObservableSnapshot<undefined>>()
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
    useChatGroup: keyedHook<GroupSnapshotValue>(() => groupStore),
    nodeStore,
    useChatNode: keyedHook<ChatConversationViewNode | undefined>(key => nodeStore.source(key)),
    useChatNodeProcess: keyedHook<undefined>((key) => {
      let source = processSources.get(key)
      if (source === undefined) {
        source = createSnapshotStore<undefined>(undefined)
        processSources.set(key, source)
      }
      return source
    }),
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

function bodyOf(container: HTMLElement): HTMLElement {
  const body = container.querySelector<HTMLElement>('[data-step-process-body]')
  if (body === null) throw new Error('group body did not render')
  return body
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

  it.each(TITLE_CASES)('titles $name as $expected', ({ summary, closed, expected }) => {
    const seat = makeSeat({ closed, summary })
    const view = render(<ChatGroupSeat {...seat.props} />)
    expect(headerOf(view.container).textContent).toBe(expected)
  })

  it('withholds the live detail once the reader picks a mode without it', () => {
    const seat = makeSeat({
      closed: false,
      summary: { counts: [], running: 'commands', runningDetail: 'pwd' },
    })
    const view = render(<ChatGroupSeat {...seat.props} />)
    expect(headerOf(view.container).textContent).toBe('正在运行命令 · pwd')

    act(() => { seat.setPolicy('compact') })
    expect(headerOf(view.container).textContent).toBe('正在运行命令')
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
