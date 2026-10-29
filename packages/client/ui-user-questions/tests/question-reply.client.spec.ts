/** Late-reply conversation node: source matching and payload projection. */
import { describe, expect, it } from 'vitest'
import { ConversationNodeAssembler } from '@qilin-agent/client-ui-conversation/client'
import type {
  ConversationTimelineSnapshot, ConversationViewNode, TurnLocation,
} from '@qilin-agent/client-ui-conversation/client'
import type { ChatConversationViewNode, ChatSnapshot } from '@qilin-agent/client-ui-chat/client'
import { makeTranslate } from '@qilin-agent/client-test-runtime'
import { SessionSeq } from '@qilin-agent/session'
import { isAtOrOutside } from '../../ui-chat/src/client/contract/group-tree.ts'
import { ChatSnapshotBuilder, chatViewDefinition } from '../../ui-chat/src/client/conversation-nodes/chat-snapshot-builder.ts'
import { messageDefinition } from '../../ui-chat/src/client/conversation-nodes/message.ts'
import { en } from '../src/client/locales.ts'
import type { QuestionReplyData } from '../src/client/question-reply.ts'
import {
  answeredQuestionDefinition, questionReplyDefinition, replyAnswerValues, replyClipboardText, replyPairsOf,
} from '../src/client/question-reply.ts'

const answered = JSON.stringify({
  kind: 'answer_to_pending_question',
  tool: 'ask_user_question',
  callId: 'call-1',
  questions: [{
    id: 'scope', question: 'Which scope?', header: 'Scope', detail: 'Choose the smallest useful surface.',
    options: [{ label: 'Tool only', description: 'Keep the change narrow.' }], multiSelect: false,
  }, { id: 'notes', question: 'Any notes?' }],
  answers: [{ id: 'scope', selected: ['Tool only'], custom: 'note' }, { id: 'notes', selected: [] }],
})
const noAnswers = JSON.stringify({ questions: [{ id: 'scope', question: 'Which scope?' }] })

function message(source: Record<string, unknown>, text: string, surfaceOp: string | null = 'append') {
  return {
    type: 'user/message',
    seq: SessionSeq(7),
    time: 7_000,
    ...(surfaceOp === null ? {} : { surfaceOp }),
    data: { id: 'msg-1', role: 'user', source, content: [{ type: 'text', text }] },
  } as never
}

const replySource = (outcome: string) => ({ kind: 'user-question-reply', callId: 'call-1', outcome })

describe('replyPairsOf', () => {
  it('reads question and answer pairs, tolerating a payload without answers', () => {
    expect(replyPairsOf(answered)).toEqual({
      questions: [{
        id: 'scope', question: 'Which scope?', header: 'Scope',
      }, { id: 'notes', question: 'Any notes?' }],
      answers: [{ id: 'scope', selected: ['Tool only'], custom: 'note' }, { id: 'notes', selected: [] }],
    })
    expect(replyPairsOf(noAnswers)).toEqual({ questions: [{ id: 'scope', question: 'Which scope?' }], answers: [] })
  })

  it('omits options and details from the projected question', () => {
    const text = JSON.stringify({
      questions: [{ id: 'scope', question: 'Which scope?', detail: 'Hidden detail', options: [{ label: 'Tool only', description: 1 }, 'nope', { description: 'no label' }] }],
      answers: [],
    })
    expect(replyPairsOf(text).questions).toEqual([{ id: 'scope', question: 'Which scope?' }])
  })

  it('renders nothing structured for text it cannot read', () => {
    expect(replyPairsOf('not json')).toEqual({ questions: [], answers: [] })
    expect(replyPairsOf('{"questions":"nope"}')).toEqual({ questions: [], answers: [] })
    expect(replyPairsOf('{"questions":[{"id":1}],"answers":[{"id":"x"}]}')).toEqual({ questions: [], answers: [] })
  })
})

const t = makeTranslate(en)
const replyData = (overrides: Partial<QuestionReplyData> = {}): QuestionReplyData => ({
  callId: 'call-1',
  outcome: 'answered',
  questions: [{ id: 'scope', question: 'Which scope?', header: 'Scope' }, { id: 'notes', question: 'Any notes?' }],
  answers: [{ id: 'scope', selected: ['Tool only'], custom: 'note' }, { id: 'notes', selected: [] }],
  text: answered,
  time: 7_000,
  ...overrides,
})

describe('replyAnswerValues', () => {
  it('orders selected labels before a non-blank custom answer', () => {
    const data = replyData()
    expect(replyAnswerValues(data, 'scope')).toEqual(['Tool only', 'note'])
    expect(replyAnswerValues(data, 'notes')).toEqual([])
    expect(replyAnswerValues(data, 'absent')).toEqual([])
    expect(replyAnswerValues(replyData({ answers: [{ id: 'scope', selected: [], custom: '  ' }] }), 'scope')).toEqual([])
    expect(replyAnswerValues(replyData({ answers: [{ id: 'scope', selected: [], custom: 'free text' }] }), 'scope'))
      .toEqual(['free text'])
  })
})

describe('replyClipboardText', () => {
  it('pairs every question with its answer and names the questions the user skipped', () => {
    expect(replyClipboardText(replyData(), t)).toBe(
      'Scope — Which scope?\nAnswer: Tool only, note\n\nAny notes?\nSkipped',
    )
  })

  it('drops a header that repeats its question', () => {
    const data = replyData({
      questions: [{ id: 'scope', question: 'Which scope?', header: 'Which scope?' }],
      answers: [{ id: 'scope', selected: ['Tool only'] }],
    })
    expect(replyClipboardText(data, t)).toBe('Which scope?\nAnswer: Tool only')
  })

  it('falls back to the model-facing text when the payload carried no questions', () => {
    expect(replyClipboardText(replyData({ questions: [], text: 'not json' }), t)).toBe('not json')
  })
})

describe('questionReplyDefinition', () => {
  it('claims only appended user messages carrying the reply source', () => {
    expect(questionReplyDefinition.match(message(replySource('answered'), answered)))
      .toEqual({ id: 'msg-1', role: 'start', exclusive: true })
    expect(questionReplyDefinition.match(message({ kind: 'user' }, answered))).toBeNull()
    expect(questionReplyDefinition.match(message({ kind: 'plugin', plugin: 'user-questions' }, answered))).toBeNull()
    expect(questionReplyDefinition.match(message(replySource('answered'), answered, null))).toBeNull()
  })

  it('claims the message the generic projection also matches, so Chat holds one Node for it', () => {
    const event = message(replySource('answered'), answered)
    expect(messageDefinition.match(event)).toEqual({ id: 'msg-1', role: 'start' })
    let chat: readonly ConversationViewNode[] = []
    const definitions = [messageDefinition, questionReplyDefinition]
    const assembler = new ConversationNodeAssembler(
      { entries: () => definitions, fallbackEntry: () => undefined },
      { entries: () => [{
        target: 'chat',
        create: () => ({
          empty: chat,
          replace: ({ nodes }: { readonly nodes: readonly ConversationViewNode[] }) => (chat = nodes),
          apply: ({ upserts }: { readonly upserts: readonly ConversationViewNode[] }) => (chat = [...chat, ...upserts]),
        }),
      }] },
    )
    assembler.activateTarget('chat')
    assembler.replaceWindow([{ type: 'event', event }], false)
    assembler.flush()
    expect(chat.map(node => node.kind)).toEqual(['question-reply'])
  })

  it('projects the outcome from the source and the pairs from the text into its own node', () => {
    const event = message(replySource('answered'), answered)
    const state = questionReplyDefinition.start({} as never, { event, id: 'msg-1', role: 'start' } as never, {} as never)
    expect(state).toMatchObject({
      seq: 7, time: 7_000, callId: 'call-1', outcome: 'answered',
      questions: [{ id: 'scope', question: 'Which scope?' }, { id: 'notes', question: 'Any notes?' }], answers: [{ id: 'scope', selected: ['Tool only'], custom: 'note' }, { id: 'notes', selected: [] }], text: answered,
    })

    const node = questionReplyDefinition.buildViewNode!({ state, key: 'reply:1', id: 'msg-1', start: undefined } as never)
    expect(node).toMatchObject({
      key: 'reply:1', kind: 'question-reply', id: 'msg-1', target: 'chat', anchorSeq: 7, visibility: 'visible',
      location: { kind: 'unresolved' },
      data: { callId: 'call-1', outcome: 'answered', text: answered },
    })
    expect(node).not.toHaveProperty('data.seq')
    expect(questionReplyDefinition.update({ state } as never, {} as never)).toBe(state)
    expect(questionReplyDefinition.buildViewNode!({ state: undefined } as never)).toBeNull()
  })

  it('starts an empty record for a reply without text', () => {
    const untyped = {
      type: 'user/message', seq: SessionSeq(8), time: 8_000, surfaceOp: 'append',
      data: { id: 'msg-2', role: 'user', source: replySource('answered'), content: [{ type: 'image', source: { kind: 'inline', data: '', mediaType: 'image/png' } }] },
    } as never
    const state = questionReplyDefinition.start({} as never, { event: untyped, id: 'msg-2', role: 'start' } as never, {} as never)
    expect(state).toEqual({ seq: 8, time: 8_000, callId: 'call-1', outcome: 'answered', text: '', questions: [], answers: [] })
  })

  it('rejects a reply source without an answered outcome', () => {
    const event = message({ kind: 'user-question-reply', callId: 'call-1' }, answered)
    expect(questionReplyDefinition.match(event)).toBeNull()
    expect(() => questionReplyDefinition.start({} as never, { event, id: 'msg-1', role: 'start' } as never, {} as never)).toThrow(/requires a reply source/)
    expect(() => questionReplyDefinition.start({} as never, {
      event: { ...(event as object), type: 'tool/call' }, id: 'x', role: 'start',
    } as never, {} as never)).toThrow(/requires user\/message/)
  })
})
function toolCall(argumentsText = JSON.stringify({ questions: [
  { id: 'scope', question: 'Which scope?', header: 'Scope', detail: 'Hidden detail', options: [{ label: 'Tool only' }] },
  { id: 'notes', question: 'Any notes?' },
] }), name = 'ask_user_question') {
  return { type: 'tool/call', seq: 5, time: 5_000,
    data: { turn: 1, step: 1, callId: 'call-1', name, arguments: argumentsText } } as never
}

function toolResult(text = JSON.stringify({ answers: [
  { id: 'notes', selected: [] }, { id: 'scope', selected: ['Tool only'], custom: 'note' },
] }), isError = false, surfaceOp = 'append') {
  return { type: 'tool/result', seq: 6, time: 6_000, surfaceOp,
    data: { turn: 1, step: 1, message: { role: 'tool', isError,
      source: { kind: 'tool', callId: 'call-1' }, content: [{ type: 'text', text }] } } } as never
}

function ptcCall(argumentsValue: unknown = { questions: [{ id: 'scope', question: 'Which scope?', header: 'Scope' }, { id: 'notes', question: 'Any notes?' }] }, name = 'ask_user_question') {
  return { type: 'tool/ptc-dispatch-start', seq: 5, time: 5_000,
    data: { rootCallId: 'root', parentCallId: 'root', subCallId: 'call-1', name, arguments: argumentsValue } } as never
}

function ptcResult(text = JSON.stringify({ answers: [{ id: 'notes', selected: [] }, { id: 'scope', selected: ['Tool only'], custom: 'note' }] }), isError = false, name = 'ask_user_question') {
  return { type: 'tool/ptc-dispatch', seq: 6, time: 6_000,
    data: { rootCallId: 'root', parentCallId: 'root', subCallId: 'call-1', name, arguments: {}, isError,
      content: [{ type: 'text', text }] } } as never
}

/** Assemble the answered-question projection over its dependencies and read the Chat nodes. */
function answerNodes(events: readonly unknown[]) {
  const assembler = new ConversationNodeAssembler(
    { entries: () => [answeredQuestionDefinition, questionReplyDefinition, messageDefinition], fallbackEntry: () => undefined },
    { entries: () => [chatViewDefinition] },
  )
  assembler.replaceWindow(events.map((event, index) => ({
    type: 'event' as const,
    event: {
      ...(event as object),
      seq: index + 1,
      time: (event as { time?: number }).time ?? (index + 1) * 1_000,
    } as never,
  })), false)
  assembler.activateTarget('chat')
  return (assembler.snapshot('chat') as ChatSnapshot).nodes.values()
}

describe('answeredQuestionDefinition', () => {
  it('pairs one batch at the result position and hides it until the answer arrives', () => {
    expect(answerNodes([toolCall()])).toEqual([])
    const nodes = answerNodes([toolCall(), toolResult()])
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({
      kind: 'question-reply', anchorSeq: 2, visibility: 'visible',
      data: {
        callId: 'call-1', time: 6_000, outcome: 'answered',
        questions: [{ id: 'scope', question: 'Which scope?', header: 'Scope' }, { id: 'notes', question: 'Any notes?' }],
        answers: [{ id: 'notes', selected: [] }, { id: 'scope', selected: ['Tool only'], custom: 'note' }],
      },
    })
    expect(nodes[0]?.data).not.toHaveProperty('seq')
  })

  it('pairs a PTC sub-dispatch by its subCallId', () => {
    const nodes = answerNodes([ptcCall(), ptcResult()])
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({ kind: 'question-reply', anchorSeq: 2, data: { callId: 'call-1' } })
  })

  it('derives the batch when its call is prepended after an update-only result', () => {
    const assembler = new ConversationNodeAssembler(
      { entries: () => [answeredQuestionDefinition, questionReplyDefinition, messageDefinition], fallbackEntry: () => undefined },
      { entries: () => [chatViewDefinition] },
    )
    const entries = (events: readonly unknown[], base: number) => events.map((event, index) => ({
      type: 'event' as const,
      event: {
        ...(event as object),
        seq: base + index,
        time: (event as { time?: number }).time ?? (base + index) * 1_000,
      } as never,
    }))
    assembler.replaceWindow(entries([toolResult()], 10), false)
    assembler.activateTarget('chat')
    assembler.flush()
    expect((assembler.snapshot('chat') as ChatSnapshot).nodes.values()).toEqual([])
    assembler.prepend(entries([toolCall()], 1), false)
    assembler.flush()
    expect((assembler.snapshot('chat') as ChatSnapshot).nodes.values()).toHaveLength(1)
  })

  it.each([
    'null', '[]', 'not json', '{"answers":"wrong"}', '{"answers":[]}',
    '{"answers":[{"id":"scope","selected":[]},{"id":"scope","selected":[]}]}',
    '{"answers":[{"id":"scope","selected":[1]},{"id":"notes","selected":[]}]}',
    '{"answers":[{"id":"scope","selected":[],"custom":1},{"id":"notes","selected":[]}]}',
    '{"answers":[{"id":"wrong","selected":[]},{"id":"notes","selected":[]}]}',
    '{"pending":true,"callId":"call-1"}',
  ])('leaves the generic Tool presentation in place for result %s', (text) => {
    expect(answerNodes([toolCall(), toolResult(text)])).toEqual([])
  })

  it.each(['not json', '{"questions":[]}', '{"questions":[{"id":1}]}',
    '{"questions":[{"id":"scope","question":"A"},{"id":"scope","question":"B"}]}',
    '{"questions":[{"id":"scope","question":"Approve?","intent":{"kind":"plan-review"}}]}',
  ])('does not pair unsafe or plan-review call arguments %s', (args) => {
    expect(answerNodes([toolCall(args), toolResult()])).toEqual([])
  })

  it.each([{ content: [] }, { content: [{ type: 'image', source: { kind: 'inline', data: '', mediaType: 'image/png' } }] },
    { content: [{ type: 'text', text: '{}' }, { type: 'text', text: '{}' }] },
  ])('leaves unsupported result content in the generic Tool presentation', ({ content }) => {
    const result = { type: 'tool/result', seq: 6, time: 6_000, surfaceOp: 'append',
      data: { turn: 1, step: 1, message: { role: 'tool', source: { kind: 'tool', callId: 'call-1' }, content } } } as never
    expect(answerNodes([toolCall(), result])).toEqual([])
  })

  it('matches only its own tool, and only appended results', () => {
    expect(answeredQuestionDefinition.match(toolCall(undefined, 'bash'))).toBeNull()
    expect(answeredQuestionDefinition.match(ptcCall(undefined, 'bash'))).toBeNull()
    expect(answeredQuestionDefinition.match(ptcResult(undefined, false, 'bash'))).toBeNull()
    const failed = toolResult()
    expect(answeredQuestionDefinition.match(toolCall())).toEqual({ id: 'call-1', role: 'start' })
    expect(answeredQuestionDefinition.match(ptcCall())).toEqual({ id: 'call-1', role: 'start' })
    expect(answeredQuestionDefinition.match(ptcResult())).toEqual({ id: 'call-1', role: 'update' })
    expect(answeredQuestionDefinition.match(toolResult())).toEqual({ id: 'call-1', role: 'update' })
    expect(answeredQuestionDefinition.match(toolResult(JSON.stringify({ answers: [] }), false, 'shadow'))).toBeNull()
    expect(answeredQuestionDefinition.match(failed)).toEqual({ id: 'call-1', role: 'update' })
    expect(answeredQuestionDefinition.match({ type: 'turn/start', seq: 1, data: { turn: 1 } } as never)).toBeNull()
  })

  it('retains a published node key while replay withdraws its answer evidence', () => {
    const event = toolCall()
    const state = answeredQuestionDefinition.start({} as never, { event, id: 'call-1', role: 'start' } as never, {} as never)
    const answeredState = answeredQuestionDefinition.update({ state } as never,
      { event: toolResult(), id: 'call-1', role: 'update' } as never)
    const current = new Map()
    const node = answeredQuestionDefinition.buildViewNode!({ state: answeredState, current,
      key: 'answered:1', id: 'call-1', start: undefined } as never)
    expect(node).toMatchObject({ key: 'answered:1', kind: 'question-reply', anchorSeq: 6, visibility: 'visible',
      location: { kind: 'unresolved' } })
    current.set('chat', node)
    const hidden = answeredQuestionDefinition.buildViewNode!({ state, current,
      key: 'answered:1', id: 'call-1', start: undefined } as never)
    expect(hidden).toMatchObject({ key: 'answered:1', visibility: 'hidden' })
    expect(answeredQuestionDefinition.buildViewNode!({ state: undefined, current: new Map() } as never)).toBeNull()
  })

  it('keeps a failed or pending result pending and ignores non-answer updates', () => {
    const event = toolCall()
    const state = answeredQuestionDefinition.start({} as never, { event, id: 'call-1', role: 'start' } as never, {} as never)
    const failed = answeredQuestionDefinition.update({ state } as never,
      { event: toolResult(JSON.stringify({ answers: [{ id: 'notes', selected: [] }] }), true), id: 'call-1', role: 'update' } as never)
    expect(failed.reply).toBeUndefined()
    const unrelated = answeredQuestionDefinition.update({ state } as never,
      { event: { type: 'user/message', seq: 8, data: {} }, id: 'call-1', role: 'update' } as never)
    expect(unrelated).toBe(state)
    const unparsed = answeredQuestionDefinition.start({} as never,
      { event: toolCall('not json'), id: 'call-1', role: 'start' } as never, {} as never)
    expect(unparsed).toEqual({ questions: null, reply: undefined })
    const settled = answeredQuestionDefinition.update({ state: unparsed } as never,
      { event: toolResult(), id: 'call-1', role: 'update' } as never)
    expect(settled).toBe(unparsed)
    expect(() => answeredQuestionDefinition.start({} as never,
      { event: { type: 'turn/start', seq: 1, data: {} }, id: 'x', role: 'start' } as never, {} as never))
      .toThrow(/requires tool\/call or tool\/ptc-dispatch-start/)
  })
})
describe('question reply group-tree positions', () => {
  /** One open Turn with no steps yet: only its start and Location data matter here. */
  const turn = (): TurnLocation => ({
    turn: 1, status: 'open', steps: [], end: undefined,
    start: { type: 'turn/start', seq: SessionSeq(1), time: 1, data: { turn: 1 } } as never,
    data: { get: () => undefined, source: () => ({ getSnapshot: () => undefined, subscribe: () => () => {} }) },
  })
  const timeline = (value: TurnLocation): ConversationTimelineSnapshot =>
    ({ turnOrder: [value.turn], turns: new Map([[value.turn, value]]) })

  function reply(step: number, value: TurnLocation, seq: number): ChatConversationViewNode {
    const event = message(replySource('answered'), answered)
    const state = questionReplyDefinition.start({} as never, { event, id: 'msg-1', role: 'start' } as never, {} as never)
    const node = questionReplyDefinition.buildViewNode!({
      state, key: 'reply:1', id: 'msg-1',
      start: { event, location: { kind: 'step', turn: value, step: { turn: value, step } } },
    } as never) as ChatConversationViewNode
    return { ...node, anchorSeq: seq }
  }

  const control = (value: TurnLocation, controlAnchorSeq: number): ChatConversationViewNode => ({
    key: 'control', id: '1', kind: 'turn-process', target: 'chat', anchorSeq: controlAnchorSeq - 0.1,
    location: { kind: 'turn', turn: value }, visibility: 'visible', groupTree: 'turn',
    data: {
      turn: 1, controlAnchorSeq, processStartSeq: 1, answerAnchorSeq: null,
      answerStep: null, inlineReasoning: false, messageCount: 0, toolCallCount: 1, subagentCount: 0,
    },
  })

  it('opens an exchange for a reply admitted in Step 1 and stands later replies at input', () => {
    const value = turn()
    const opening = reply(1, value, 3)
    const late = reply(2, value, 7)
    expect(opening.groupTree).toBe('exchange')
    expect(late.groupTree).toBe('input')
    expect(isAtOrOutside(opening, 'exchange')).toBe(true)
    expect(isAtOrOutside(late, 'exchange')).toBe(false)
    expect(isAtOrOutside(late, 'turn')).toBe(true)
  })

  it('keeps a late reply Turn expanded as an interleaved input', () => {
    const value = turn()
    const builder = new ChatSnapshotBuilder()
    const opening = reply(1, value, 3)
    const late = reply(2, value, 7)
    const snapshot = builder.replace({
      nodes: [control(value, 3), opening, late],
      timeline: timeline(value),
    })
    builder.publish()
    expect(snapshot.nodes.processSource(late.key).getSnapshot()).toMatchObject({
      turn: 1, turnClosed: false, hasInterleavedInput: true, compactAnswer: false,
    })
  })
})
