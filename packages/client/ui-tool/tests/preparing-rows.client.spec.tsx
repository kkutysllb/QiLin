// @vitest-environment jsdom
import { useDisclosure } from '@qilin/client-ui-chat/src/client/chat/use-disclosure.ts'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import type { StartedToolCall, ToolResultNode } from '@qilin/client-ui-chat/client'
import { makeTranslate } from '@qilin/client-test-runtime'
import { en } from '@qilin/client-ui-conversation/src/client/locales.ts'
import { en as common } from '@qilin/client-locale/src/locales/en.ts'
import { PartialArguments } from '@qilin/util-values'
import { GenericToolCard } from '../src/client/tool/toolviews/GenericToolCard.tsx'
import { FileMutationRow } from '../src/client/tool/toolviews/file-mutation-row.tsx'
import { ReadRow } from '../src/client/tool/toolviews/read-row.tsx'
import { ReadImageRow } from '../src/client/tool/toolviews/read-image-row.tsx'
import { SearchRow } from '../src/client/tool/toolviews/search-row.tsx'
import { WebRow } from '../src/client/tool/toolviews/web-row.tsx'
import { TodoRow } from '../src/client/tool/toolviews/todo-row.tsx'
import { AskQuestionRow } from '../src/client/tool/toolviews/ask-question-row.tsx'
import { BashRow } from '../src/client/tool/toolviews/bash-sample.tsx'
import { parsedToolCall } from '../src/client/tool/models/raw-tool-call.ts'
import { toolRowModel } from '../src/client/tool/models/tool-call-model.ts'

afterEach(cleanup)

type Props = Parameters<typeof TodoRow>[0] & Parameters<typeof ReadImageRow>[0] & Parameters<typeof AskQuestionRow>[0]

function preparation(name: string, args = new PartialArguments()): Extract<Props, { phase: 'preparing' }> {
  return {
    phase: 'preparing', callId: 'call', toolName: name,
    block: { phase: 'preparing', args, callId: 'call', name, turn: 1, step: 1, time: 1, subCalls: [] },
    t: makeTranslate(en, common), useDisclosure, openFile: vi.fn(), loadImage: vi.fn(),
    useTodoHistory: vi.fn(), useSession: vi.fn(() => false), renderSlot: vi.fn(() => null),
    useProjection: vi.fn(() => undefined), revealPanel: vi.fn(() => false), reviewPanel: vi.fn(() => false),
  } as Extract<Props, { phase: 'preparing' }>
}

describe('argument-free tool preparation', () => {
  it.each([
    ['read', ReadRow], ['read_image', ReadImageRow], ['write', FileMutationRow], ['edit', FileMutationRow],
    ['grep', SearchRow], ['glob', SearchRow], ['web_search', WebRow], ['web_fetch', WebRow],
    ['todo_write', TodoRow], ['ask_user_question', AskQuestionRow],
    ['run_code', GenericToolCard], ['custom_tool', GenericToolCard],
  ] as const)('%s has a tool-owned prefix without arguments or disclosure', (name, Component) => {
    const props = preparation(name)
    const view = render(<Component {...props} />)
    expect(view.container.querySelector('[data-state="preparing"]')).not.toBeNull()
    expect(view.container.querySelector('svg')).not.toBeNull()
    expect(view.container.textContent?.trim()).not.toBe('')
    expect(view.queryByRole('button')).toBeNull()
    expect(view.container.querySelector('pre')).toBeNull()
    expect(parsedToolCall(props.block)).toBeNull()
    expect(toolRowModel(name, props.block)).toMatchObject({ state: 'preparing', bodyRaw: null, output: null, filePath: undefined })
    fireEvent.click(view.container.firstElementChild!)
    fireEvent.keyDown(view.container.firstElementChild!, { key: 'Enter' })
    expect(view.container.querySelector('[aria-expanded="true"]')).toBeNull()
  })

  it('retains the file row through preparation, dispatch, and result', () => {
    const props = preparation('write')
    const view = render(<FileMutationRow {...props} />)
    const preparingRow = view.container.querySelector('[data-tool="write"]')
    const started: StartedToolCall = {
      phase: 'start', args: PartialArguments.fromText('{"file_path":"hello.txt","content":"hello"}'), callId: 'call', name: 'write', turn: 1, step: 1, time: 2, subCalls: [],
      argsRaw: '{"file_path":"hello.txt","content":"hello"}',
    }
    view.rerender(<FileMutationRow {...props} phase="start" block={started} />)
    const row = view.container.querySelector('[data-tool="write"]')
    expect(row).toBe(preparingRow)
    expect(view.getByText('hello.txt')).toBeTruthy()
    expect(view.container.querySelector('[data-state="running"]')).not.toBeNull()
    const result: ToolResultNode = {
      kind: 'tool-result', seq: 3, time: 3, callId: 'call', callTime: 2,
      name: 'write', args: PartialArguments.fromText(started.argsRaw),
      call: { name: 'write', argsRaw: started.argsRaw }, content: [], isError: false, subCalls: [],
    }
    view.rerender(<FileMutationRow {...props} phase="result" block={result} />)
    expect(view.container.querySelector('[data-tool="write"]')).toBe(row)
    expect(view.container.querySelector('[data-state="ok"]')).not.toBeNull()
  })

  it('retains the tool name in the generic title and summary rule when arguments arrive', () => {
    const props = preparation('custom_tool')
    const view = render(<GenericToolCard {...props} />)
    expect(view.getByText('Tool call', { exact: true })).toBeTruthy()
    expect(toolRowModel('custom_tool', props.block).summary).toBe('custom_tool')
    expect(view.queryByText('custom_tool', { exact: true })).not.toBeNull()
    expect(view.queryByRole('button')).toBeNull()
    const started: StartedToolCall = {
      phase: 'start', args: PartialArguments.fromText('{"prompt":"Inspect this file"}'), callId: 'call', name: 'custom_tool', turn: 1, step: 1, time: 2, subCalls: [],
      argsRaw: '{"prompt":"Inspect this file"}',
    }
    view.rerender(<GenericToolCard {...props} phase="start" block={started} />)
    expect(view.getByText('Tool call', { exact: true })).toBeTruthy()
    expect(view.getByText('custom_tool · Inspect this file', { exact: true })).toBeTruthy()
    expect(view.getByRole('button', { expanded: false })).toBeTruthy()
    const result: ToolResultNode = {
      kind: 'tool-result', seq: 3, time: 3, callId: 'call', callTime: 2,
      name: 'custom_tool', args: PartialArguments.fromText(started.argsRaw),
      call: { name: 'custom_tool', argsRaw: started.argsRaw }, content: [], isError: false, subCalls: [],
    }
    view.rerender(<GenericToolCard {...props} phase="result" block={result} />)
    expect(view.getByText('Tool call', { exact: true })).toBeTruthy()
    expect(view.getByText('custom_tool · Inspect this file', { exact: true })).toBeTruthy()
  })

  it('renders Bash preparation as a non-expandable shimmering row', () => {
    const view = render(<BashRow {...preparation('bash')} useSessions={vi.fn()} />)
    expect(view.container.querySelector('[data-state="preparing"]')).not.toBeNull()
    expect(view.queryByRole('button')).toBeNull()
  })
})
