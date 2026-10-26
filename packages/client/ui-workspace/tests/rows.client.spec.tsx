// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, createEvent, fireEvent, render, screen } from '@testing-library/react'
import type { WorkspaceId } from '@qilin-agent/api-workspace-controller/client'
import type { SessionId } from '@qilin-agent/session/types'
import { makeTranslate } from '@qilin-agent/client-test-runtime'
import { zh as commonZh } from '@qilin-agent/client-locale/src/locales/zh.ts'
import type { RowDragProps } from '../src/client/rows/Rows.tsx'
import { ProjectRowItem, SearchResultItem, SessionNodeItem } from '../src/client/rows/Rows.tsx'
import type { GroupNode, SearchResultNode, SessionNode } from '../src/client/tree.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t = makeTranslate(zh, commonZh) as never

const sid = (id: string) => id as SessionId
const wid = (id: string) => id as WorkspaceId

/** Half detection reads the row rect; jsdom rects are all-zero by default. */
function stubRect(row: HTMLElement): void {
  row.getBoundingClientRect = () => ({
    top: 100, bottom: 134, left: 0, right: 200, width: 200, height: 34,
    x: 0, y: 100, toJSON: () => ({}),
  })
}

/** Session action callbacks every row assertion shares. */
function sessionActions() {
  return {
    onOpen: vi.fn(), onRename: vi.fn(), onFork: vi.fn(),
    onArchive: vi.fn(), onCopyId: vi.fn(), onPin: vi.fn(), onUnpin: vi.fn(),
  }
}

function dragProps(overrides: Partial<RowDragProps> = {}): RowDragProps {
  return {
    start: vi.fn(), active: false, marker: null,
    hover: vi.fn(), drop: vi.fn(), end: vi.fn(),
    ...overrides,
  }
}

/** Seat renderer that records each rendered child-seat name. */
function recordSeats(seats: string[]): (name: string) => null {
  return (name) => { seats.push(name); return null }
}

/** Seat renderer that renders nothing. */
const emptyRenderSlot = (name: string) => {
  void name
  return null
}

/** One session row whose title the marquee measures: returns the row and its title span. */
function renderClippedRow(title: string, actions = sessionActions()) {
  render(<SessionNodeItem
    node={{
      id: sid('clipped'), title, blank: false, running: false,
      runningSubagentCount: 0, completed: false, updatedAt: 0, pinned: false,
    }}
    currentId={undefined} now={0} {...actions} onCopyId={vi.fn()} renderSlot={emptyRenderSlot} t={t}
  />)
  return { row: screen.getByRole('treeitem'), title: screen.getByText(title) }
}

/** jsdom lays out nothing: the title's clipped geometry is stated outright. */
function stubTitleGeometry(title: HTMLElement, scrollWidth: number, clientWidth: number): void {
  Object.defineProperty(title, 'scrollWidth', { value: scrollWidth, configurable: true })
  Object.defineProperty(title, 'clientWidth', { value: clientWidth, configurable: true })
}

/** Install the async browser clipboard and restore its prior host shape. */
function installClipboard(writeText: (text: string) => Promise<void>): () => void {
  const prior = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText },
  })
  return () => {
    if (prior === undefined) Reflect.deleteProperty(navigator, 'clipboard')
    else Object.defineProperty(navigator, 'clipboard', prior)
  }
}

const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn() }

/** jsdom lacks DragEvent — the fireEvent fallback drops clientY, so pin it on the built event. */
function fireDrag(row: HTMLElement, kind: 'dragOver' | 'drop', clientY: number): void {
  const event = kind === 'dragOver' ? createEvent.dragOver(row) : createEvent.drop(row)
  Object.defineProperty(event, 'clientY', { value: clientY })
  Object.defineProperty(event, 'dataTransfer', { value: { ...dataTransfer } })
  fireEvent(row, event)
}

describe('workspace browser rows', () => {
  it('keeps the leading status cell in the hierarchy-free flat list', () => {
    const seats: string[] = []
    const idle: SessionNode = {
      id: sid('flat'), title: 'Flat Session', blank: false, running: false,
      runningSubagentCount: 0, completed: false, updatedAt: 0, pinned: false,
    }
    const view = render(<SessionNodeItem node={idle} currentId={undefined} now={0} onOpen={vi.fn()}
      onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()} onPin={vi.fn()} onUnpin={vi.fn()}
      onCopyId={vi.fn()} renderSlot={recordSeats(seats)} t={t} />)
    // The cell is the row's first element and hosts the leading seat while the
    // row's primary state is idle; the title follows it.
    const cell = screen.getByText('Flat Session').previousElementSibling
    expect(cell?.className).toMatch(/slot/)
    expect(seats).toEqual(['sidebar.session.row.leading'])

    // A row that gains a state dot keeps that dot in the same cell and renders
    // no leading occupant beside it.
    view.rerender(<SessionNodeItem node={{ ...idle, running: true }} currentId={undefined} now={0}
      {...sessionActions()} onCopyId={vi.fn()} renderSlot={recordSeats(seats)} t={t} />)
    expect(screen.getByText('Flat Session').previousElementSibling?.querySelector('[data-state="ongoing"]')).toBeTruthy()
    expect(seats).toEqual(['sidebar.session.row.leading'])
  })

  it('renders a selected content-search row and opens only its session', () => {
    const onOpen = vi.fn()
    const result: SearchResultNode = {
      id: sid('result'),
      title: 'Result title',
      workspace: 'Workspace context',
      running: true,
      runningSubagentCount: 0,
      completed: false,
      snippet: 'matching message excerpt',
    }
    render(<SearchResultItem result={result} currentId={result.id} onOpen={onOpen} t={t} />)
    const row = screen.getByRole('treeitem')
    expect(row.getAttribute('aria-selected')).toBe('true')
    expect(screen.getByText('Workspace context')).toBeTruthy()
    expect(screen.getByText('matching message excerpt')).toBeTruthy()
    expect(row.querySelector('[data-state="ongoing"]')).toBeTruthy()
    expect(screen.getByText('进行中')).toBeTruthy()
    expect(row.hasAttribute('draggable')).toBe(false)
    fireEvent.click(row)
    expect(onOpen).toHaveBeenCalledWith(result.id)
  })

  it.each([
    ['approval', '等待审批'],
    ['plan-review', '计划待审'],
    ['question', '等待回答'],
  ] as const)('shows %s ahead of running in search results', (pendingInteraction, label) => {
    const result: SearchResultNode = {
      id: sid(pendingInteraction), title: 'Needs input', workspace: 'Project',
      pendingInteraction, running: true, runningSubagentCount: 0, completed: false,
    }
    render(<SearchResultItem result={result} currentId={undefined} onOpen={vi.fn()} t={t} />)
    const row = screen.getByRole('treeitem')
    expect(row.querySelector('[data-state="warning"]')).toBeTruthy()
    expect(row.querySelector('[data-state="ongoing"]')).toBeNull()
    expect(screen.getByText(label)).toBeTruthy()
  })

  it('renders an active Workspace and keeps its create action separate from toggling', () => {
    const onToggle = vi.fn()
    const onCreate = vi.fn()
    const group: GroupNode = {
      key: 'project', workspaceId: wid('project'), cwd: '/projects/project', createdAt: 0, label: 'Project',
      sessionCount: 1, expanded: true, containsCurrent: true, sessions: [],
    }
    render(<ProjectRowItem group={group} onToggle={onToggle} onCreate={onCreate} t={t} />)

    expect(screen.getByRole('treeitem').getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: '在“Project”中新建会话' }))
    expect(onCreate).toHaveBeenCalledOnce()
    expect(onToggle).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Project'))
    expect(onToggle).toHaveBeenCalledOnce()
  })

  it('renders and opens a selected running Session row', () => {
    const node: SessionNode = {
      id: sid('session'), title: 'Session', blank: false, running: true,
      runningSubagentCount: 0, completed: false, updatedAt: 0, pinned: false,
    }
    const onOpen = vi.fn()
    render(
      <SessionNodeItem node={node} currentId={node.id} now={0} onOpen={onOpen}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()} onPin={vi.fn()} onUnpin={vi.fn()}
        onCopyId={vi.fn()} renderSlot={emptyRenderSlot} t={t} />,
    )

    const row = screen.getByRole('treeitem')
    expect(row.getAttribute('aria-selected')).toBe('true')
    expect(row.hasAttribute('aria-expanded')).toBe(false)
    expect(screen.queryByRole('button', { name: /展开|收起/ })).toBeNull()
    fireEvent.click(row)
    expect(onOpen).toHaveBeenCalledWith(node.id)
  })

  it('marquees a clipped title while the row is hovered and rests at its far edge', () => {
    vi.useFakeTimers()
    try {
      const { row, title } = renderClippedRow('A Session Title Long Enough To Be Clipped (1)')
      stubTitleGeometry(title, 320, 180)

      fireEvent.pointerEnter(row)
      // The first frame publishes the remaining clip before any travel; the
      // left fade stays off while the title still sits at its start.
      act(() => { vi.advanceTimersByTime(16) })
      expect(title.scrollLeft).toBe(0)
      expect(title.dataset.clipped).toBe('')
      expect(title.dataset.scrolled).toBeUndefined()

      act(() => { vi.advanceTimersByTime(1000) })
      const travelled = title.scrollLeft
      expect(travelled).toBeGreaterThan(0)
      expect(travelled).toBeLessThan(140)
      expect(title.dataset.scrolled).toBe('')

      // The crawl holds at the far edge, where the right fade lifts.
      act(() => { vi.advanceTimersByTime(10_000) })
      expect(title.scrollLeft).toBe(140)
      expect(title.dataset.scrolled).toBe('')
      expect(title.dataset.clipped).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('returns a marqueed title to its start in one step and stops the crawl', () => {
    vi.useFakeTimers()
    try {
      const { row, title } = renderClippedRow('A Session Title Long Enough To Be Clipped (1)')
      stubTitleGeometry(title, 320, 180)
      const scrollTo = vi.fn()
      Object.defineProperty(title, 'scrollTo', { value: scrollTo, configurable: true })

      fireEvent.pointerEnter(row)
      act(() => { vi.advanceTimersByTime(500) })
      fireEvent.pointerLeave(row)
      // Rest is one explicit instant hop: the stylesheet no longer smooths it,
      // and the resting ellipsis must not meet the text on the way back.
      expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'instant' })
      expect(title.dataset.scrolled).toBeUndefined()
      expect(title.dataset.clipped).toBeUndefined()
      const calls = scrollTo.mock.calls.length
      act(() => { vi.advanceTimersByTime(1000) })
      expect(scrollTo).toHaveBeenCalledTimes(calls)
    } finally {
      vi.useRealTimers()
    }
  })

  it('leaves a title that fits its cell and a jitter-sized clip at rest', () => {
    vi.useFakeTimers()
    try {
      const { row, title } = renderClippedRow('Short title')
      stubTitleGeometry(title, 180, 180)
      fireEvent.pointerEnter(row)
      act(() => { vi.advanceTimersByTime(1000) })
      expect(title.scrollLeft).toBe(0)
      expect(title.dataset.scrolled).toBeUndefined()
      expect(title.dataset.clipped).toBeUndefined()

      // A clip of exactly the 8px reveal guard hides no meaningful tail.
      fireEvent.pointerLeave(row)
      stubTitleGeometry(title, 188, 180)
      fireEvent.pointerEnter(row)
      act(() => { vi.advanceTimersByTime(1000) })
      expect(title.scrollLeft).toBe(0)
      expect(title.dataset.scrolled).toBeUndefined()
      expect(title.dataset.clipped).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('jumps to the far edge under reduced motion instead of crawling', () => {
    vi.useFakeTimers()
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true }) as MediaQueryList))
    try {
      const { row, title } = renderClippedRow('A Session Title Long Enough To Be Clipped (1)')
      stubTitleGeometry(title, 320, 180)
      const scrollTo = vi.fn()
      Object.defineProperty(title, 'scrollTo', { value: scrollTo, configurable: true })

      fireEvent.pointerEnter(row)
      // No frame runs: the far edge is in view at once, left fade on, no right fade.
      expect(scrollTo).toHaveBeenCalledWith({ left: 140, behavior: 'instant' })
      expect(title.dataset.scrolled).toBe('')
      expect(title.dataset.clipped).toBeUndefined()

      fireEvent.pointerLeave(row)
      expect(scrollTo).toHaveBeenLastCalledWith({ left: 0, behavior: 'instant' })
    } finally {
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })

  it('shows archive and pin hover actions that act without opening the row', () => {
    const actions = sessionActions()
    const node: SessionNode = {
      id: sid('verbs'), title: 'Row verbs', blank: false, running: false,
      runningSubagentCount: 0, completed: false, updatedAt: 0, pinned: false,
    }
    render(<SessionNodeItem node={node} currentId={undefined} now={0} {...actions}
      onCopyId={vi.fn()} renderSlot={emptyRenderSlot} t={t} />)

    const archive = screen.getByRole('button', { name: '归档会话' })
    const pin = screen.getByRole('button', { name: '置顶会话' })
    expect(archive.className).toMatch(/iconButton/)
    expect(pin.className).toMatch(/iconButton/)
    fireEvent.click(archive)
    expect(actions.onArchive).toHaveBeenCalledWith(node.id)
    fireEvent.click(pin)
    expect(actions.onPin).toHaveBeenCalledWith(node.id)
    expect(actions.onOpen).not.toHaveBeenCalled()
  })

  it('raises the hover action tooltips after the pointer dwell', () => {
    vi.useFakeTimers()
    try {
      renderClippedRow('Row verbs')
      const archive = screen.getByRole('button', { name: '归档会话' })
      fireEvent.mouseEnter(archive)
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getByRole('tooltip').textContent).toBe('归档会话')
      fireEvent.mouseLeave(archive)
      expect(screen.queryByRole('tooltip')).toBeNull()

      const pin = screen.getByRole('button', { name: '置顶会话' })
      fireEvent.mouseEnter(pin)
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getByRole('tooltip').textContent).toBe('置顶会话')
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the green done dot only on a finished, unviewed session (live activity wins the slot)', () => {
    const renderRow = (over: Partial<SessionNode>) => render(
      <SessionNodeItem
        node={{
          id: sid('s1'), title: 'One', blank: false, running: false,
          runningSubagentCount: 0, completed: false, updatedAt: 0, pinned: false, ...over,
        }}
        currentId={undefined} now={0} onOpen={vi.fn()}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()} onPin={vi.fn()} onUnpin={vi.fn()}
        onCopyId={vi.fn()} renderSlot={emptyRenderSlot} t={t}
      />,
    )
    const stateDot = (view: ReturnType<typeof renderRow>) =>
      view.container.querySelector('[data-state]')
    // No completion reminder, not running: no state dot at all.
    const plain = renderRow({})
    expect(stateDot(plain)).toBeNull()
    plain.unmount()
    // Completed while unviewed: the green done dot.
    const done = renderRow({ completed: true })
    expect(done.container.querySelector('[data-state="done"]')).not.toBeNull()
    done.unmount()
    // Running wins the slot: the animated ongoing dot, no done dot.
    const running = renderRow({ completed: true, running: true })
    expect(running.container.querySelector('[data-state="ongoing"]')).not.toBeNull()
    expect(running.container.querySelector('[data-state="done"]')).toBeNull()
    running.unmount()
    // Descendant activity also wins until the last running descendant stops.
    const delegated = renderRow({ completed: true, runningSubagentCount: 1 })
    expect(delegated.container.querySelector('[data-state="ongoing"]')).not.toBeNull()
    expect(delegated.container.querySelector('[data-state="done"]')).toBeNull()
  })

  it('shows descendant activity without describing an idle parent as running', () => {
    vi.useFakeTimers()
    try {
      const node: SessionNode = {
        id: sid('owner'), title: 'Delegating', blank: false, running: false,
        runningSubagentCount: 2, completed: false, updatedAt: 0, pinned: false,
      }
      render(<SessionNodeItem node={node} currentId={undefined} now={0} onOpen={vi.fn()}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()} onPin={vi.fn()} onUnpin={vi.fn()}
        onCopyId={vi.fn()} renderSlot={emptyRenderSlot} t={t} />)
      const row = screen.getByRole('treeitem')
      expect(row.querySelector('[data-state="ongoing"]')).not.toBeNull()
      expect(screen.getByText('2 个子代理运行中')).toBeTruthy()
      expect(screen.queryByText('进行中')).toBeNull()

      fireEvent.pointerEnter(row.parentElement as HTMLElement)
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getAllByText('2 个子代理运行中')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps descendant activity secondary while the parent is running', () => {
    vi.useFakeTimers()
    try {
      const node: SessionNode = {
        id: sid('owner'), title: 'Delegating', blank: false, running: true,
        runningSubagentCount: 1, completed: false, updatedAt: 0, pinned: false,
      }
      render(<SessionNodeItem node={node} currentId={undefined} now={0} onOpen={vi.fn()}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()} onPin={vi.fn()} onUnpin={vi.fn()}
        onCopyId={vi.fn()} renderSlot={emptyRenderSlot} t={t} />)
      const row = screen.getByRole('treeitem')
      expect(row.querySelectorAll('[data-state="ongoing"]')).toHaveLength(1)
      expect(screen.getByText('进行中')).toBeTruthy()
      expect(screen.getByText('1 个子代理运行中')).toBeTruthy()

      fireEvent.pointerEnter(row.parentElement as HTMLElement)
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getAllByText('进行中')).toHaveLength(2)
      expect(screen.getAllByText('1 个子代理运行中')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps child activity as a secondary status while user attention is primary', () => {
    const node: SessionNode = {
      id: sid('owner'), title: 'Needs input', blank: false, pendingInteraction: 'question',
      running: false, runningSubagentCount: 1, completed: false, updatedAt: 0, pinned: false,
    }
    render(<SessionNodeItem node={node} currentId={undefined} now={0} onOpen={vi.fn()}
      onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()} onPin={vi.fn()} onUnpin={vi.fn()}
      onCopyId={vi.fn()} renderSlot={emptyRenderSlot} t={t} />)
    const row = screen.getByRole('treeitem')
    expect(row.querySelector('[data-state="warning"]')).not.toBeNull()
    expect(row.querySelector('[data-state="ongoing"]')).toBeNull()
    expect(screen.getByText('等待回答')).toBeTruthy()
    expect(screen.getByText('1 个子代理运行中')).toBeTruthy()
  })

  it('shows the green done dot on a finished search result row', () => {
    render(<SearchResultItem
      result={{
        id: sid('result'), title: 'Done', workspace: 'Workspace', running: false,
        runningSubagentCount: 0, completed: true       }}
      currentId={undefined} onOpen={vi.fn()} t={t}
    />)
    expect(screen.getByRole('treeitem').querySelector('[data-state="done"]')).not.toBeNull()
  })

  it('workspace row menu opens on the ellipsis, renames, and shows the danger delete row', () => {
    const onRename = vi.fn()
    const onDelete = vi.fn()
    const onToggle = vi.fn()
    const group: GroupNode = {
      key: 'project', workspaceId: wid('project'), cwd: '/projects/project', createdAt: 0, label: 'Project',
      sessionCount: 0, expanded: false, containsCurrent: false, sessions: [],
    }
    render(<ProjectRowItem
      group={group} onToggle={onToggle} onCreate={vi.fn()}
      actions={{ rename: onRename, delete: onDelete }} t={t}
    />)
    fireEvent.click(screen.getByRole('button', { name: '工作区“Project”的操作' }))
    // Opening the menu neither toggles the group nor renames yet.
    expect(onToggle).not.toHaveBeenCalled()
    expect(screen.getByRole('menuitem', { name: '删除工作区' }).className).toMatch(/danger/)
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
    expect(onRename).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '工作区“Project”的操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '删除工作区' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(onRename).toHaveBeenCalledOnce()
    expect(onDelete).toHaveBeenCalledOnce()
    // Escape closes without selecting (Menu onClose path).
    fireEvent.click(screen.getByRole('button', { name: '工作区“Project”的操作' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('workspace hover card shows its details and copies the full directory path', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(async () => {})
    const restoreClipboard = installClipboard(writeText)
    try {
      const group: GroupNode = {
        key: 'project', workspaceId: wid('project'), cwd: '/projects/project', createdAt: 0, label: 'Project',
        sessionCount: 0, expanded: false, containsCurrent: false, sessions: [],
      }
      render(<ProjectRowItem group={group} onToggle={vi.fn()} onCreate={vi.fn()} t={t} />)
      fireEvent.pointerEnter(screen.getByRole('treeitem').parentElement as HTMLElement)
      act(() => { vi.advanceTimersByTime(500) })
      // Card body: full title + cwd + absolute creation time.
      expect(screen.getAllByText('Project')).toHaveLength(2)
      expect(screen.getByText('/projects/project')).toBeTruthy()
      expect(screen.getByText(/^创建于 \d+年\d+月\d+日 /)).toBeTruthy()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制: /projects/project' })) })
      expect(writeText).toHaveBeenCalledWith('/projects/project')
      expect(screen.getByRole('status').textContent).toBe('已复制')
    } finally {
      restoreClipboard()
      vi.useRealTimers()
    }
  })

  it('workspace hover card shows a POSIX home descendant as ~ and still copies the full path', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn(async () => {})
    const restoreClipboard = installClipboard(writeText)
    try {
      const group: GroupNode = {
        key: 'project', workspaceId: wid('project'), cwd: '/home/u/Documents/project', createdAt: 0, label: 'Project',
        sessionCount: 0, expanded: false, containsCurrent: false, sessions: [],
      }
      render(<ProjectRowItem group={group} home="/home/u" onToggle={vi.fn()} onCreate={vi.fn()} t={t} />)
      fireEvent.pointerEnter(screen.getByRole('treeitem').parentElement as HTMLElement)
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getByText('~/Documents/project')).toBeTruthy()
      expect(screen.queryByText('/home/u/Documents/project')).toBeNull()
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: '复制: /home/u/Documents/project' })) })
      expect(writeText).toHaveBeenCalledWith('/home/u/Documents/project')
    } finally {
      restoreClipboard()
      vi.useRealTimers()
    }
  })

  it('workspace hover card without a directory omits the path and copy action', async () => {
    vi.useFakeTimers()
    try {
      const group: GroupNode = {
        key: 'project', workspaceId: wid('project'), cwd: undefined, createdAt: 0, label: 'Project',
        sessionCount: 0, expanded: false, containsCurrent: false, sessions: [],
      }
      render(<ProjectRowItem group={group} home="/home/u" onToggle={vi.fn()} onCreate={vi.fn()} t={t} />)
      fireEvent.pointerEnter(screen.getByRole('treeitem').parentElement as HTMLElement)
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getAllByText('Project')).toHaveLength(2)
      expect(screen.getByText(/^创建于 \d+年\d+月\d+日 /)).toBeTruthy()
      expect(screen.queryByRole('button', { name: /^复制:/ })).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('workspace hover card leaves a Windows path verbatim', async () => {
    vi.useFakeTimers()
    try {
      const group: GroupNode = {
        key: 'project', workspaceId: wid('project'), cwd: 'C:\\Users\\u\\project', createdAt: 0, label: 'Project',
        sessionCount: 0, expanded: false, containsCurrent: false, sessions: [],
      }
      render(<ProjectRowItem group={group} home="C:\\Users\\u" onToggle={vi.fn()} onCreate={vi.fn()} t={t} />)
      fireEvent.pointerEnter(screen.getByRole('treeitem').parentElement as HTMLElement)
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getByText('C:\\Users\\u\\project')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('ungrouped bucket renders no workspace menu', () => {
    const group: GroupNode = {
      key: '', workspaceId: undefined, cwd: undefined, createdAt: undefined, label: 'Ungrouped',
      sessionCount: 0, expanded: false, containsCurrent: false, sessions: [],
    }
    render(<ProjectRowItem group={group} onToggle={vi.fn()} onCreate={vi.fn()} t={t} />)
    expect(screen.queryByRole('button', { name: /工作区/ })).toBeNull()
  })

  it('blank New Session rows carry no menu, no time label, and no hover-card time', () => {
    vi.useFakeTimers()
    try {
      const node: SessionNode = {
        id: sid('s-blank'), title: 'ignored', blank: true, running: false,
        runningSubagentCount: 0, completed: false, updatedAt: 0, pinned: false,
      }
      render(<SessionNodeItem node={node} currentId={node.id} now={0} onOpen={vi.fn()}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()} onPin={vi.fn()} onUnpin={vi.fn()}
        onCopyId={vi.fn()} renderSlot={emptyRenderSlot} t={t} />)
      // The placeholder has no content yet: no row verbs, no "now" stamp.
      expect(screen.queryByRole('button', { name: /会话.*的操作/ })).toBeNull()
      expect(screen.queryByText('刚刚')).toBeNull()
      // The hover card keeps title + status but drops the timestamp line.
      const wrapper = screen.getByRole('treeitem').parentElement as HTMLElement
      fireEvent.pointerEnter(wrapper)
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getAllByText('新会话').length).toBeGreaterThanOrEqual(2)
      expect(screen.getByText('空闲')).toBeTruthy()
      expect(screen.queryByText('刚刚')).toBeNull()
      expect(screen.getByText('空闲').closest('[role="button"]')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('session row menu opens without opening the session and dispatches rename, fork, archive, and copy', () => {
    const onOpen = vi.fn()
    const onRename = vi.fn()
    const onFork = vi.fn()
    const onArchive = vi.fn()
    const onCopyId = vi.fn()
    const onPin = vi.fn()
    const node: SessionNode = {
      id: sid('s1'), title: 'One', blank: false, running: false,
      runningSubagentCount: 0, completed: false, updatedAt: 0, pinned: false,
    }
    render(<SessionNodeItem node={node} currentId={undefined} now={0} onOpen={onOpen}
      onRename={onRename} onFork={onFork} onArchive={onArchive} onCopyId={onCopyId}
      onPin={onPin} onUnpin={vi.fn()} renderSlot={emptyRenderSlot} t={t} />)
    fireEvent.click(screen.getByRole('button', { name: '会话“One”的操作' }))
    expect(onOpen).not.toHaveBeenCalled()
    // Archive is not destructive (log and accounting slot remain): no danger styling.
    expect(screen.getByRole('menuitem', { name: '归档会话' }).className).not.toMatch(/danger/)
    // Rename dispatches with the current display title (dialog prefill).
    fireEvent.click(screen.getByRole('menuitem', { name: '重命名' }))
    expect(screen.queryByRole('menu')).toBeNull()
    expect(onRename).toHaveBeenCalledWith(node.id, 'One')
    expect(onOpen).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '会话“One”的操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '分叉会话' }))
    expect(onFork).toHaveBeenCalledWith(node.id)
    // Archive dispatches without opening the session.
    fireEvent.click(screen.getByRole('button', { name: '会话“One”的操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '归档会话' }))
    expect(onArchive).toHaveBeenCalledWith(node.id)
    // Copy is the menu's last row: it reads the row identity and copies it
    // without opening the session.
    fireEvent.click(screen.getByRole('button', { name: '会话“One”的操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '复制 Session ID' }))
    expect(onCopyId).toHaveBeenCalledWith(node.id)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(onRename).toHaveBeenCalledOnce()
    expect(onOpen).not.toHaveBeenCalled()
    // Pin is the menu's first row and dispatches the pin verb.
    fireEvent.click(screen.getByRole('button', { name: '会话“One”的操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '置顶会话' }))
    expect(onPin).toHaveBeenCalledWith(node.id)
    // Escape closes without selecting (Menu onClose path).
    fireEvent.click(screen.getByRole('button', { name: '会话“One”的操作' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('labels a row without a title as untitled and pins it from its hover button', () => {
    const actions = sessionActions()
    const node: SessionNode = {
      id: sid('s-untitled'), title: '', blank: false, running: false,
      runningSubagentCount: 0, completed: false, updatedAt: 0, pinned: false,
    }
    render(<SessionNodeItem node={node} currentId={undefined} now={0}
      {...actions} onCopyId={vi.fn()} renderSlot={emptyRenderSlot} t={t} />)

    expect(screen.getByText('未命名')).toBeTruthy()
    // The trailing button offers the pin verb for an unpinned row.
    fireEvent.click(screen.getByRole('button', { name: '置顶会话' }))
    expect(actions.onPin).toHaveBeenCalledWith(node.id)
    expect(actions.onUnpin).not.toHaveBeenCalled()
  })

  it('labels a search result without a title as untitled', () => {
    const result: SearchResultNode = {
      id: sid('untitled-result'), title: '', workspace: '', running: false,
      runningSubagentCount: 0, completed: false,
    }
    render(<SearchResultItem result={result} currentId={undefined} onOpen={vi.fn()} t={t} />)

    expect(screen.getByText('未命名')).toBeTruthy()
    expect(screen.getByText('未分组')).toBeTruthy()
  })

  it('marks a pinned row and lets the hover button and menu drop the pin', () => {
    const onPin = vi.fn()
    const onUnpin = vi.fn()
    const node: SessionNode = {
      id: sid('s1'), title: 'Pinned', blank: false, running: false,
      runningSubagentCount: 0, completed: false, updatedAt: 0, pinned: true,
    }
    render(<SessionNodeItem node={node} currentId={undefined} now={0} onOpen={vi.fn()}
      onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()} onPin={onPin} onUnpin={onUnpin}
      onCopyId={vi.fn()} renderSlot={emptyRenderSlot} t={t} />)
    expect(screen.getByRole('img', { name: '已置顶' })).toBeTruthy()
    // The hover button is the trailing action in the same cell as the marker.
    fireEvent.click(screen.getByRole('button', { name: '取消置顶' }))
    expect(onUnpin).toHaveBeenCalledWith(node.id)
    expect(onPin).not.toHaveBeenCalled()
    // The menu row flips to the unpin verb for a pinned row.
    fireEvent.click(screen.getByRole('button', { name: '会话“Pinned”的操作' }))
    fireEvent.click(screen.getByRole('menuitem', { name: '取消置顶' }))
    expect(onUnpin).toHaveBeenCalledTimes(2)
  })


  it('shows the hover card after the dwell and suppresses it while the row menu is open', () => {
    vi.useFakeTimers()
    try {
      const node: SessionNode = {
        id: sid('s1'), title: 'Hovered', blank: false, running: true,
        runningSubagentCount: 0, completed: false, updatedAt: 0, pinned: false,
      }
      render(<SessionNodeItem node={node} currentId={undefined} now={60_000} onOpen={vi.fn()}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()} onPin={vi.fn()} onUnpin={vi.fn()}
        onCopyId={vi.fn()} renderSlot={emptyRenderSlot} t={t} />)
      const wrapper = screen.getByRole('treeitem').parentElement as HTMLElement
      fireEvent.pointerEnter(wrapper)
      act(() => { vi.advanceTimersByTime(500) })
      // Card body: full title + relative time + running status.
      expect(screen.getAllByText('Hovered')).toHaveLength(2)
      expect(screen.getByText('1分钟前')).toBeTruthy()
      expect(screen.getAllByText('进行中')).toHaveLength(2)
      fireEvent.pointerLeave(wrapper)
      // Menu open (disabled=true) suppresses the card for the same hover.
      fireEvent.click(screen.getByRole('button', { name: '会话“Hovered”的操作' }))
      fireEvent.pointerEnter(wrapper)
      act(() => { vi.advanceTimersByTime(1000) })
      expect(screen.queryByText('1分钟前')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it.each([
    ['approval', '等待审批'],
    ['plan-review', '计划待审'],
    ['question', '等待回答'],
  ] as const)('shows %s as warning ahead of the running state', (pendingInteraction, label) => {
    vi.useFakeTimers()
    try {
      const node: SessionNode = {
        id: sid(pendingInteraction), title: 'Needs input', blank: false,
        pendingInteraction, running: true, runningSubagentCount: 0, completed: false,
        updatedAt: 0, pinned: false,
      }
      const view = render(<SessionNodeItem node={node} currentId={undefined} now={0} onOpen={vi.fn()}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()} onPin={vi.fn()} onUnpin={vi.fn()}
        onCopyId={vi.fn()} renderSlot={emptyRenderSlot} t={t} />)
      const row = screen.getByRole('treeitem')
      expect(row.querySelector('[data-state="warning"]')).toBeTruthy()
      expect(row.querySelector('[data-state="ongoing"]')).toBeNull()
      expect(screen.getByText(label)).toBeTruthy()

      view.rerender(<SessionNodeItem node={{ ...node, running: false }} currentId={undefined} now={0}
        {...sessionActions()} onCopyId={vi.fn()} renderSlot={emptyRenderSlot} t={t} />)
      expect(screen.getByRole('treeitem').querySelector('[data-state="warning"]')).toBeTruthy()

      fireEvent.pointerEnter(screen.getByRole('treeitem').parentElement as HTMLElement)
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getAllByText(label)).toHaveLength(2)
      expect(document.querySelectorAll('[data-state="warning"]')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('idle hover card shows the Idle status line', () => {
    vi.useFakeTimers()
    try {
      const node: SessionNode = {
        id: sid('s1'), title: 'Quiet', blank: false, running: false,
        runningSubagentCount: 0, completed: false, updatedAt: 0, pinned: false,
      }
      render(<SessionNodeItem node={node} currentId={undefined} now={0} onOpen={vi.fn()}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()} onPin={vi.fn()} onUnpin={vi.fn()}
        onCopyId={vi.fn()} renderSlot={emptyRenderSlot} t={t} />)
      fireEvent.pointerEnter(screen.getByRole('treeitem').parentElement as HTMLElement)
      act(() => { vi.advanceTimersByTime(500) })
      expect(screen.getByText('空闲')).toBeTruthy()
      expect(screen.getAllByText('刚刚')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('completed hover card shows the Completed status line', () => {
    vi.useFakeTimers()
    try {
      const node: SessionNode = {
        id: sid('s1'), title: 'Done', blank: false, running: false,
        runningSubagentCount: 0, completed: true, updatedAt: 0, pinned: false,
      }
      render(<SessionNodeItem node={node} currentId={undefined} now={0} onOpen={vi.fn()}
        onRename={vi.fn()} onFork={vi.fn()} onArchive={vi.fn()} onPin={vi.fn()} onUnpin={vi.fn()}
        onCopyId={vi.fn()} renderSlot={emptyRenderSlot} t={t} />)
      fireEvent.pointerEnter(screen.getByRole('treeitem').parentElement as HTMLElement)
      act(() => { vi.advanceTimersByTime(500) })
      // Row's visually-hidden reminder label plus the hover card's status line.
      expect(screen.getAllByText('已完成')).toHaveLength(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('draggable row wires start/end and gates hover/drop on an active same-group drag', () => {
    const node: SessionNode = {
      id: sid('s1'), title: 'Drag me', blank: false, running: false,
      runningSubagentCount: 0, completed: false, updatedAt: 0, pinned: false,
    }
    const inactive = dragProps()
    const { rerender } = render(
      <SessionNodeItem node={node} currentId={undefined} now={0} {...sessionActions()}
        drag={inactive} onCopyId={vi.fn()} renderSlot={emptyRenderSlot} t={t} />,
    )
    const row = screen.getByRole('treeitem')
    stubRect(row)
    expect(row.getAttribute('draggable')).toBe('true')
    fireEvent.dragStart(row, { dataTransfer })
    expect(inactive.start).toHaveBeenCalledOnce()
    // Inactive drag: hover and drop are rejected.
    fireEvent.dragOver(row, { dataTransfer })
    fireEvent.drop(row, { dataTransfer })
    expect(inactive.hover).not.toHaveBeenCalled()
    expect(inactive.drop).not.toHaveBeenCalled()
    fireEvent.dragEnd(row)
    expect(inactive.end).toHaveBeenCalledOnce()

    const active = dragProps({ active: true, marker: 'before' })
    rerender(
      <SessionNodeItem node={node} currentId={undefined} now={0} {...sessionActions()}
        drag={active} onCopyId={vi.fn()} renderSlot={emptyRenderSlot} t={t} />,
    )
    stubRect(screen.getByRole('treeitem'))
    // Top half hovers/drops 'before'; bottom half 'after' (row mid = 117).
    fireDrag(screen.getByRole('treeitem'), 'dragOver', 105)
    expect(active.hover).toHaveBeenCalledWith('before')
    fireDrag(screen.getByRole('treeitem'), 'dragOver', 130)
    expect(active.hover).toHaveBeenCalledWith('after')
    fireDrag(screen.getByRole('treeitem'), 'drop', 130)
    expect(active.drop).toHaveBeenCalledWith('after')

    const after = dragProps({ active: true, marker: 'after' })
    rerender(
      <SessionNodeItem node={node} currentId={undefined} now={0} {...sessionActions()}
        drag={after} onCopyId={vi.fn()} renderSlot={emptyRenderSlot} t={t} />,
    )
    expect(screen.getByRole('treeitem').className).toMatch(/dropAfter/)
  })
})
