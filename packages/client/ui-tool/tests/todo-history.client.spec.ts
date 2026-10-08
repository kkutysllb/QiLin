/** Recorded todo predecessors follow incremental history repair and nested invocations. */
import { describe, expect, it } from 'vitest'
import { ConversationNodeAssembler, type TodoItem } from '@qilin-agent/client-ui-conversation/client'
import { SessionSeq, type SessionEvent } from '@qilin-agent/session/types'
import type { SessionLiveEventEntry } from '@qilin-agent/api-session-controller/client'
import { ToolCallId } from '@qilin-agent/llm/brand'
import { makeTranslate } from '@qilin-agent/client-test-runtime'
import { en } from '@qilin-agent/client-ui-conversation/src/client/locales.ts'
import { en as commonEn } from '@qilin-agent/client-locale/src/locales/en.ts'
import { todoCallDefinition, todoHistoryView, todoWriteDefinition, type TodoHistory } from '../src/client/tool/models/todo-history.ts'
import { todoDiffModel } from '../src/client/tool/models/todo-diff-model.ts'
import type { ToolResultNode } from '@qilin-agent/client-ui-chat/client'
import { PartialArguments } from '@qilin-agent/util-values'

const t = makeTranslate(en, commonEn)
const first: TodoItem[] = [
  { content: 'Build', status: 'in_progress' },
  { content: 'Review', status: 'pending' },
  { content: 'Old task', status: 'pending' },
]
const second: TodoItem[] = [
  { content: 'Build', status: 'completed' },
  { content: 'Review', status: 'pending' },
  { content: 'Publish', status: 'pending' },
]

function entry(event: SessionEvent): SessionLiveEventEntry {
  return { type: 'event', event }
}

function todoWrite(seq: number, todos: TodoItem[]): SessionLiveEventEntry {
  return entry({ seq: SessionSeq(seq), time: 1000 + seq, type: 'todo/write', data: { todos } })
}

function todoCall(seq: number, callId: string, todos: TodoItem[]): SessionLiveEventEntry {
  return entry({
    seq: SessionSeq(seq), time: 1000 + seq, type: 'tool/call',
    data: { turn: 1, step: 1, callId: ToolCallId(callId), name: 'todo_write', arguments: JSON.stringify({ todos }) },
  })
}

function ptcDetail(seq: number, subCallId: string, todos: TodoItem[]): SessionLiveEventEntry {
  return entry({
    seq: SessionSeq(seq), time: 1000 + seq, type: 'tool/ptc-dispatch-start',
    data: {
      rootCallId: ToolCallId('root'), parentCallId: ToolCallId('root'), subCallId: ToolCallId(subCallId),
      name: 'todo_write', arguments: { todos },
    },
  })
}

function call(todos: unknown): ToolResultNode {
  return { kind: 'tool-result', seq: 20, time: 2000, callTime: 1000, callId: 'second', name: 'todo_write', args: PartialArguments.fromText(JSON.stringify({ todos })), call: { name: 'todo_write', argsRaw: JSON.stringify({ todos }) }, content: [], isError: false, subCalls: [] }
}

function runtime() {
  const assembler = new ConversationNodeAssembler(
    { entries: () => [todoWriteDefinition, todoCallDefinition], fallbackEntry: () => undefined },
    { entries: () => [todoHistoryView] },
  )
  assembler.activateTarget('tool-todo-history')
  return assembler
}

function history(assembler: ConversationNodeAssembler): TodoHistory {
  assembler.flush()
  return assembler.snapshot('tool-todo-history') as TodoHistory
}

describe('recorded todo history', () => {
  it('repairs a missing predecessor on prepend and keeps earlier cards fixed after a later write', () => {
    const assembler = runtime()
    assembler.replaceWindow([todoCall(10, 'second', second)], true)
    expect(todoDiffModel(call(second), history(assembler).get('second'), true, t)?.summary).toBeNull()
    assembler.prepend([todoWrite(5, first)], false)
    const baseline = history(assembler).get('second')
    expect(todoDiffModel(call(second), baseline, false, t)?.summary).toBe('1 added · 1 updated · 1 removed')
    assembler.append(todoWrite(11, second))
    expect(history(assembler).get('second')).toEqual(baseline)
    assembler.append(ptcDetail(12, 'nested', []))
    expect(history(assembler).get('nested')?.todos).toEqual(second)
    assembler.replaceWindow([], false)
    expect(history(assembler).get('second')).toBeUndefined()
  })

  it('shows first-write additions, status transitions, removals, and unchanged items separately', () => {
    expect(todoDiffModel(call(first), { todos: undefined }, false, t)?.summary).toBe('3 added')
    const diff = todoDiffModel(call(second), { todos: first }, false, t)
    expect(diff?.details.items).toMatchObject([
      { title: 'Build', previousStatus: 'In progress', change: { value: 'updated' } },
      { title: 'Publish', change: { value: 'added' } },
      { title: 'Old task', change: { value: 'removed' } },
    ])
    expect(diff?.details.unchanged?.items.map(item => item.title)).toEqual(['Review'])
    expect(todoDiffModel(call(second), { todos: second }, false, t)?.summary).toBe('No changes to the list')
    expect(todoDiffModel(call([]), { todos: undefined }, false, t)?.details.empty).toBe('The to-do list is empty')
    expect(todoDiffModel({ ...call(first), isError: true }, { todos: undefined }, false, t)).toBeNull()
    expect(todoDiffModel(call(first), undefined, false, t)?.details.caption).toBe('Previous list unavailable')
  })

  it('publishes immutable lookup snapshots when the index changes', () => {
    const view = todoHistoryView.create()
    const firstSnapshot = view.replace({ nodes: [{ id: 'call-1', data: { todos: first } }] } as never)
    const secondSnapshot = view.apply({ upserts: [{ id: 'call-1', data: { todos: second } }] } as never)
    expect(firstSnapshot.get('call-1')?.todos).toEqual(first)
    expect(secondSnapshot.get('call-1')?.todos).toEqual(second)
    expect(view.empty.get('call-1')).toBeUndefined()
  })

  it('distinguishes relative reordering from positions shifted by an insertion', () => {
    const moved = todoDiffModel(call([first[1], first[0], first[2]]), { todos: first }, false, t)
    expect(moved?.details.items.map(item => item.change?.label)).toEqual(['Reordered', 'Reordered'])
    const inserted = todoDiffModel(call([{ content: 'New', status: 'pending' }, ...first]), { todos: first }, false, t)
    expect(inserted?.summary).toBe('1 added')
  })
})
