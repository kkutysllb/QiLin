// @vitest-environment jsdom

/** Three-state contract for the Turn-process control: running, stopped, and settled folding. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { makeTranslate } from '@qilin-agent/client-test-runtime'
import { zh as commonZh } from '@qilin-agent/client-locale/src/locales/zh.ts'
import { SessionSeq, type TurnEndReason } from '@qilin-agent/session/types'
import type { TurnLocation } from '@qilin-agent/client-ui-conversation/client'
import { TurnProcessNodeView } from '../src/client/chat/TurnProcessNodeView.tsx'
import type { ChatNode } from '../src/client/contract/chat-nodes.ts'
import type { ChatNodeViewProps, TurnProcessOwnerProps } from '../src/client/contract/slots.ts'
import { turnProcessAlwaysOpen } from '../src/client/contract/turn-process.ts'
import { zh } from '../src/client/locale.ts'

const t: ChatNodeViewProps['t'] = makeTranslate(zh, commonZh)

afterEach(cleanup)

interface TurnOptions {
  readonly status?: 'open' | 'closed'
  readonly reason?: TurnEndReason
  readonly startTime?: number
}

function turn(options: TurnOptions = {}): TurnLocation {
  const status = options.status ?? 'closed'
  return {
    turn: 1,
    status,
    steps: [],
    start: { type: 'turn/start', seq: SessionSeq(1), time: options.startTime ?? 1_000, data: { turn: 1 } },
    end: options.reason === undefined ? undefined : {
      type: 'turn/end',
      seq: SessionSeq(9),
      time: 6_000,
      data: { turn: 1, reason: options.reason },
    },
    data: { get: () => undefined, source: () => ({ getSnapshot: () => undefined, subscribe: () => () => {} }) },
  }
}

function processNode(location: TurnLocation): ChatNode<'turn-process'> {
  return {
    key: 'turn-process:1',
    id: 'turn-process:1',
    kind: 'turn-process',
    target: 'chat',
    anchorSeq: 9.5,
    location: { kind: 'turn', turn: location },
    visibility: 'visible',
    data: {
      turn: 1,
      controlAnchorSeq: 2,
      processStartSeq: 2,
      answerAnchorSeq: 8,
      answerStep: 1,
      inlineReasoning: false,
      messageCount: 1,
      toolCallCount: 1,
      subagentCount: 0,
    },
  }
}

interface ViewOptions {
  readonly node?: ChatNode<'turn-process'>
  readonly open?: boolean
  readonly hasContent?: boolean
  readonly foldable?: boolean
}

/** Typed view props for the seats this control reads: the node, the process state, and the copy. */
function viewProps(node: ChatNode<'turn-process'>, turnProcess: TurnProcessOwnerProps | undefined): ChatNodeViewProps<'turn-process'> {
  return { node, turnProcess, t } as ChatNodeViewProps<'turn-process'>
}

function renderControl(options: ViewOptions = {}) {
  const node = options.node ?? processNode(turn({ reason: { kind: 'completed' } }))
  const setOpen = vi.fn()
  const props = viewProps(node, {
    hasContent: options.hasContent ?? true,
    spec: node.data,
    foldable: options.foldable ?? true,
    open: options.open ?? false,
    setOpen,
  })
  const view = render(<TurnProcessNodeView {...props} />)
  return {
    ...view,
    node,
    setOpen,
    control: () => view.container.querySelector<HTMLButtonElement>('[data-turn-process]'),
    announcement: () => view.getByRole('status').textContent,
  }
}

describe('TurnProcessNodeView states', () => {
  it('renders nothing while the Turn runs', () => {
    const location = turn({ status: 'open', reason: { kind: 'completed' } })
    const view = renderControl({ node: processNode(location) })
    expect(view.container.querySelector('[data-turn-process]')).toBeNull()
    expect(turnProcessAlwaysOpen(view.node)).toBe(true)
  })

  it('summarizes a completed Turn with its elapsed time and folds on demand', () => {
    const view = renderControl()
    const control = view.control()
    if (control === null) throw new Error('settled control did not render')
    expect(control.textContent).toBe('已完成，用时 5秒')
    expect(control.getAttribute('aria-expanded')).toBe('false')
    expect(control.disabled).toBe(false)
    expect(control.dataset.turnProcess).toBe('1')
    expect(control.dataset.turnProcessToolCalls).toBe('1')
    expect(control.querySelector('svg')).not.toBeNull()
    expect(view.announcement()).toBe('已完成')
    expect(turnProcessAlwaysOpen(view.node)).toBe(false)

    fireEvent.click(control)
    expect(view.setOpen).toHaveBeenCalledWith(true)
    view.rerender(<TurnProcessNodeView {...viewProps(view.node, {
      hasContent: true, spec: view.node.data, foldable: true, open: true, setOpen: view.setOpen,
    })} />)
    const reopened = view.control()
    expect(reopened?.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(reopened as HTMLButtonElement)
    expect(view.setOpen).toHaveBeenLastCalledWith(false)
  })

  it('reports a user cancellation as stopped without elapsed time', () => {
    const view = renderControl({
      node: processNode(turn({ reason: { kind: 'aborted', reason: { kind: 'user' } } })),
    })
    const control = view.control()
    expect(control?.textContent).toBe('已停止')
    expect(control?.textContent).not.toContain('秒')
    expect(control?.disabled).toBe(true)
    expect(control?.querySelector('svg')).toBeNull()
    expect(view.announcement()).toBe('已停止')
    expect(turnProcessAlwaysOpen(view.node)).toBe(true)
  })

  it('reports a restart interruption as stopped without elapsed time', () => {
    const view = renderControl({ node: processNode(turn({ reason: { kind: 'interrupted' } })) })
    const control = view.control()
    expect(control?.textContent).toBe('已停止')
    expect(control?.textContent).not.toContain('秒')
    expect(control?.disabled).toBe(true)
    expect(view.announcement()).toBe('已停止')
    expect(turnProcessAlwaysOpen(view.node)).toBe(true)
  })

  it('reports a failed Turn without elapsed time and keeps it open', () => {
    const view = renderControl({
      node: processNode(turn({ reason: { kind: 'error', error: { code: 'UNKNOWN', message: 'boom' } } })),
    })
    const control = view.control()
    expect(control?.textContent).toBe('处理失败')
    expect(control?.disabled).toBe(true)
    expect(view.announcement()).toBe('处理失败')
    expect(turnProcessAlwaysOpen(view.node)).toBe(true)
  })

  it('retains the title without a collapse action when no process content exists', () => {
    const view = renderControl({ hasContent: false })
    const control = view.control()
    expect(control?.textContent).toBe('已完成，用时 5秒')
    expect(control?.disabled).toBe(true)
    expect(control?.getAttribute('aria-expanded')).toBeNull()
    expect(control?.querySelector('svg')).toBeNull()
  })

  it('keeps an unfolded Turn open regardless of its stored choice', () => {
    const view = renderControl({ foldable: false })
    const control = view.control()
    expect(control?.getAttribute('aria-expanded')).toBe('true')
    expect(control?.disabled).toBe(true)
  })

  it('omits elapsed time when the Turn start is outside the loaded window', () => {
    const location = turn({ reason: { kind: 'completed' } })
    const windowed: TurnLocation = { ...location, start: undefined }
    const view = renderControl({ node: processNode(windowed) })
    expect(view.control()?.textContent).toBe('已完成')
  })
})
