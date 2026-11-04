// @vitest-environment jsdom

/** Flow-level focus restoration: the observer that outlives the completion regroup. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, within } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import type { GroupKey, NodeKey, NodeReference } from '@qilin-agent/client-ui-conversation/client'
import { createSnapshotStore, type ObservableSnapshot } from '@qilin-agent/client-store'
import { bindSnapshotSelector, makeTranslate } from '@qilin-agent/client-test-runtime'
import type { KeyedSnapshotSelectorHook } from '@qilin-agent/client-ui-slots'
import { zh as commonZh } from '@qilin-agent/client-locale/src/locales/zh.ts'
import { ChatFlow } from '../src/client/chat/ChatFlow.tsx'
import type { ChatConversationViewNode, ChatNode } from '../src/client/contract/chat-nodes.ts'
import type {
  ChatNodeProcessSource, ChatNodeSource, ChatNodeStore, ChatTurnProcessPresentation,
} from '../src/client/contract/snapshot.ts'
import type { TurnProcessSpec } from '../src/client/contract/turn-process.ts'
import { presentationPolicyFor } from '../src/client/presentation-policy.ts'
import { createChatStore } from '../src/client/stores.ts'
import { zh } from '../src/client/locale.ts'
import type { StepLocation, TurnLocation } from '@qilin-agent/client-ui-conversation/client'

const turn: TurnLocation = {
  turn: 1, status: 'open', steps: [], end: undefined,
  start: { type: 'turn/start', seq: 1 as never, time: 1, data: { turn: 1 } },
  data: { get: () => undefined, source: () => ({ getSnapshot: () => undefined, subscribe: () => () => {} }) },
}

const stepLocation: StepLocation = {
  turn: 1, step: 1, start: undefined, end: undefined, status: 'open',
  data: { get: () => undefined, source: () => ({ getSnapshot: () => undefined, subscribe: () => () => {} }) },
}

const stepMember: ChatNode<'assistant-step'> = {
  key: 'step:1', id: 'step:1', kind: 'assistant-step', target: 'chat', anchorSeq: 2, visibility: 'visible',
  location: { kind: 'step', turn, step: stepLocation },
  data: { status: 'settled', turn: 1, step: 1, blocks: [], time: 2 },
}

const LIVE_SPEC: TurnProcessSpec = {
  turn: 1, controlAnchorSeq: 1, processStartSeq: 2, answerAnchorSeq: null, answerStep: 0,
  inlineReasoning: false, messageCount: 0, toolCallCount: 0, subagentCount: 0,
}
const livePresentation: ChatTurnProcessPresentation = {
  turn: 1, spec: LIVE_SPEC, turnStarted: true, turnClosed: false,
  hasExternalProcess: true, hasInterleavedInput: false, compactAnswer: false,
}
const closedPresentation: ChatTurnProcessPresentation = {
  ...livePresentation, turnClosed: true, spec: { ...LIVE_SPEC, answerAnchorSeq: 8, answerStep: 1 },
}

function keyedHook<Value>(resolve: (key: string) => ObservableSnapshot<Value>): KeyedSnapshotSelectorHook<Value> {
  const hooks = new WeakMap<object, ReturnType<typeof bindSnapshotSelector<Value>>>()
  return ((key: string, selector?: (value: Value) => unknown) => {
    const source = resolve(key)
    let useValue = hooks.get(source)
    if (useValue === undefined) {
      useValue = bindSnapshotSelector(source)
      hooks.set(source, useValue)
    }
    return useValue(selector ?? ((value: Value) => value))
  }) as KeyedSnapshotSelectorHook<Value>
}

function makeFlow() {
  const nodes = new Map<string, ChatConversationViewNode>([['step:1', stepMember]])
  const nodeSources = new Map<string, ObservableSnapshot<ChatConversationViewNode | undefined>>()
  const presentationSource = createSnapshotStore<ChatTurnProcessPresentation | undefined>(livePresentation)
  const bottomSource = createSnapshotStore(false)
  const policyStore = createSnapshotStore(presentationPolicyFor('standard'))
  const chat = createChatStore().create()
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
    bottomSource: () => bottomSource,
    processSource: (key): ChatNodeProcessSource => {
      void key
      return presentationSource
    },
    values: () => [...nodes.values()],
  }
  const entries: readonly NodeReference[] = [{ kind: 'node', key: 'step:1' as NodeKey }]
  const props = {
    entries,
    pendingInputs: [] as never[],
    lastInputTurn: 1,
    deferCollapse: false,
    useSession: bindSnapshotSelector(createSnapshotStore({ running: false })),
    useChat: bindSnapshotSelector(createSnapshotStore({
      nodes: nodeStore,
      // The restoration gate reads the Turn's timeline status, which stays
      // closed after settlement.
      timeline: { turnOrder: [1], turns: new Map([[1, { status: 'closed' } as never]]) },
    })),
    useChatNode: keyedHook<ChatConversationViewNode | undefined>(key => nodeStore.source(key)),
    useChatNodeBottom: keyedHook<boolean>(() => bottomSource),
    useChatNodeProcess: keyedHook<ChatTurnProcessPresentation | undefined>(() => presentationSource),
    useChatGroup: keyedHook<never>(() => createSnapshotStore(undefined as never)),
    usePresentation: bindSnapshotSelector(policyStore),
    useStore: bindSnapshotSelector(chat),
    actions: chat.actions,
    renderSlot: (_key: string, owner: { node?: ChatNode }): ReactNode =>
      owner.node === undefined ? null : <button data-testid="row-control" type="button" />,
    t: makeTranslate(zh, commonZh),
    useGroupAction: () => ({ current: null }),
    useGroupHeaderAction: () => {},
    cwd: '/tmp',
    openFile: () => {},
    openSkill: () => {},
    inspectCall: () => {},
    forkAt: () => {},
    editUserMessage: () => {},
    loadImage: () => Promise.reject(new Error('unused')),
  }
  return { props, chat, presentationSource, groupKey: 'group:1' as GroupKey }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('ChatFlow focus restoration', () => {
  it('restores the recorded member after the completion regroup drops focus', async () => {
    const { props, chat, presentationSource } = makeFlow()
    // The restoration path reads only the flow seats; the session-standard
    // seats the slot type also carries are outside this fixture's concern.
    const view = render(<ChatFlow {...(props as ComponentProps<typeof ChatFlow>)} />)
    const row = view.container.querySelector<HTMLElement>('[data-chat-node-key="step:1"]')!
    // Real focus, not fireEvent: the restoration reads document.activeElement.
    act(() => { within(row).getByTestId('row-control').focus() })
    expect(chat.store.getSnapshot().turnProcesses).toEqual([
      { turn: 1, answerStep: 0, reader: true, focusedNode: 'step:1' },
    ])

    // The completion boundary arrives with focus still inside the row: the
    // record must stand, not consume.
    act(() => { presentationSource.set(closedPresentation) })
    expect(chat.store.getSnapshot().turnProcesses[0]?.focusedNode).toBe('step:1')

    // The regroup replaces the subtree and focus falls to the body; the flow's
    // observer sees the next DOM change and hands focus back to the row's own
    // control, consuming the record.
    act(() => {
      ;(document.activeElement as HTMLElement | null)?.blur()
      const dummy = document.createElement('span')
      view.container.appendChild(dummy)
    })
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
    expect(document.activeElement).toBe(within(row).getByTestId('row-control'))
    const entry = chat.store.getSnapshot().turnProcesses[0]
    expect(entry).toMatchObject({ turn: 1, reader: true })
    expect(entry?.focusedNode).toBeUndefined()
  })

  it('does not restore the recorded member after the reader focuses another control', async () => {
    const { props, chat } = makeFlow()
    const view = render(<ChatFlow {...(props as ComponentProps<typeof ChatFlow>)} />)
    const row = view.container.querySelector<HTMLElement>('[data-chat-node-key="step:1"]')!
    // The outside control exists before the record does, so focusing it
    // mutates nothing: only the focus move itself can tell the flow the
    // reader has moved on.
    const outside = document.createElement('button')
    view.container.appendChild(outside)
    act(() => { within(row).getByTestId('row-control').focus() })
    expect(chat.store.getSnapshot().turnProcesses[0]?.focusedNode).toBe('step:1')

    act(() => { outside.focus() })
    expect(chat.store.getSnapshot().turnProcesses[0]?.focusedNode).toBeUndefined()

    // The control unmounts as follow resumes; no restoration may scroll the
    // transcript back to the recorded row.
    act(() => { outside.remove() })
    await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
    expect(document.activeElement).toBe(document.body)
  })
})
