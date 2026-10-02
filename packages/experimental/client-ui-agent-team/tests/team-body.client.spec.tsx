// @vitest-environment jsdom
/**
 * The Team page over a real store instance and a scripted writer: the roster,
 * the board, the forms, and every outcome the write face records.
 */
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import type { SessionId } from '@qilin/session/types'
import type {
  TeamMemberProjection, TeamProjection, TeamTaskId, TeamTaskView as TeamTask,
} from '@qilin/experimental-agent-team/client'
import { RemoteError } from '@qilin/typert-protocol'
import type { RemoteResult } from '@qilin/typert-protocol'
import type { SessionListState, SessionSnapshot, SessionSummary } from '@qilin/api-session-controller/client'
import type { SessionStatusSnapshot } from '@qilin/client-ui-session/client'
import { createSnapshotStore } from '@qilin/client-store'
import { bindSnapshotSelector, makeTranslate } from '@qilin/client-test-runtime'
import { zh as commonZh } from '@qilin/client-locale/src/locales/zh.ts'
import { teamWritesFace } from '../src/client/team-writes.ts'
import { TeamBody } from '../src/client/TeamBody.tsx'
import type { TeamBodyProps } from '../src/client/TeamBody.tsx'
import type { TeamWriter } from '../src/client/team-writes.ts'
import { createTeamPageStore } from '../src/client/team-page-store.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const SESSION = 'lead' as SessionId
const WORKER = 'worker-id' as SessionId
const OTHER = 'other' as SessionId
const TASK_1 = 'task-1' as TeamTaskId
const TASK_2 = 'task-2' as TeamTaskId

const TASK_1_VIEW: TeamTask = {
  id: TASK_1,
  revision: 4,
  subject: 'Implement runtime',
  description: 'Build the Team runtime',
  status: 'in_progress',
  ownerName: 'lead',
  blockedBy: [TASK_2],
  writeScopes: ['src'],
  ready: false,
  writeScopeWarnings: ['write scopes overlap with task-2'],
}
const TASK_2_VIEW: TeamTask = {
  id: TASK_2,
  revision: 2,
  subject: 'Write tests',
  description: 'Cover the task graph',
  status: 'completed',
  blockedBy: [],
  writeScopes: [],
  ready: true,
  writeScopeWarnings: [],
}
const LEAD_MEMBER: TeamMemberProjection = { id: SESSION, name: 'lead', role: 'lead', phase: 'active' }
const WORKER_MEMBER: TeamMemberProjection = { id: WORKER, name: 'worker', role: 'teammate', phase: 'active' }
const FULL_TEAM: TeamProjection = { members: [LEAD_MEMBER, WORKER_MEMBER], tasks: [TASK_1_VIEW, TASK_2_VIEW] }

/** One scripted wire answer, held back as a pending promise while a write flies. */
type Answer = RemoteResult<TeamTask> | Promise<RemoteResult<TeamTask>>

/** What a spec holds after mounting: the page, the store, and the wire record. */
interface Mounted {
  readonly view: RenderResult
  readonly instance: ReturnType<ReturnType<typeof createTeamPageStore>['create']>
  readonly sessions: ReturnType<typeof createSnapshotStore<SessionListState>>
  readonly statuses: ReturnType<typeof createSnapshotStore<SessionStatusSnapshot>>
  readonly calls: Array<{ readonly method: 'createTask' | 'updateTask'; readonly agent: SessionId; readonly request: unknown }>
  readonly refreshes: SessionId[]
  readonly opened: unknown[]
  /** Queue the next wire answer, failing by default. */
  readonly answer: (value: Answer) => void
  readonly rerender: (options?: BenchOptions) => void
}

interface BenchOptions {
  readonly sessionId?: SessionId
  readonly team?: TeamProjection
  readonly memberValues?: Record<string, Record<string, unknown>>
  readonly running?: Record<string, boolean>
  readonly dropTeam?: boolean
  readonly listing?: boolean
  readonly parentSessionId?: SessionId
  readonly openState?: SessionSnapshot['openState']
}

function summary(id: SessionId): SessionSummary {
  return { id, displayTitle: id, running: false, retainedBy: {}, blank: false, updatedAt: 0 }
}

function hookOf<T>(inst: { subscribe: (fn: () => void) => () => void; getSnapshot: () => T }) {
  return function useSelector<S>(sel: (s: T) => S): S {
    return sel(useSyncExternalStore(inst.subscribe, inst.getSnapshot))
  }
}

/** Drain the face's fire-and-forget promise chain. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => { setTimeout(resolve, 0) })
  })
}

async function bodyBench(options: BenchOptions = {}): Promise<Mounted> {
  const instance = createTeamPageStore().create()
  const calls: Mounted['calls'] = []
  const refreshes: SessionId[] = []
  const opened: unknown[] = []
  let answer: Awaited<Answer> | Answer = { ok: true, value: TASK_1_VIEW }
  const writer: TeamWriter = {
    createTask: async (agent: SessionId, request: Parameters<TeamWriter['createTask']>[1]) => {
      calls.push({ method: 'createTask', agent, request })
      return answer
    },
    updateTask: async (agent: SessionId, request: Parameters<TeamWriter['updateTask']>[1]) => {
      calls.push({ method: 'updateTask', agent, request })
      return answer
    },
  }
  const projectionValues = options.dropTeam === true
    ? {}
    : { agentTeam: options.team ?? FULL_TEAM, ...options.memberValues }
  const sessions = createSnapshotStore<SessionListState>({
    ids: [SESSION, WORKER, OTHER].map(id => summary(id).id),
    byId: Object.fromEntries([SESSION, WORKER, OTHER].map(id => [id, summary(id)])),
    phase: options.listing === true ? 'pending' : 'ready',
    projectionsBySession: {
      ...Object.fromEntries(Object.entries(options.memberValues ?? {}).map(([id, values]) => [id, {
        state: 'ready', error: null, values,
      }])),
      ...(options.dropTeam === true ? {} : {
        [SESSION]: { state: 'ready', error: null, values: projectionValues },
      }),
    },
  })
  const statusMap: SessionStatusSnapshot = new Map(Object.entries(options.running ?? {}).map(([id, isRunning]) => [
    id as SessionId, { running: isRunning, pendingInteraction: undefined, completionUnread: false },
  ]))
  const statuses = createSnapshotStore<SessionStatusSnapshot>(statusMap)
  const session = createSnapshotStore<SessionSnapshot>({
    sessionId: SESSION,
    pendingSubmissions: [],
    running: false,
    subagent: options.parentSessionId === undefined
      ? null
      : { address: { parentSessionId: options.parentSessionId, childSessionId: SESSION, mode: 'continuable' } },
    removed: false,
    openState: options.openState ?? 'open',
    openError: null,
    hasMore: false,
    loadingOlder: false,
    promptError: null,
    blank: false,
    lastAgentError: null,
    promptAttempted: false,
    awaitingFirstTurn: false,
  })
  const useSessions = bindSnapshotSelector(sessions)
  const face = teamWritesFace({
    writer,
    refreshProjections: async (id: SessionId) => { refreshes.push(id) },
    leadSessionId: id => id,
    mainViewCount: () => 1,
    openSession: (target) => { opened.push(target) },
  })(SESSION, instance.actions)
  const props: Partial<TeamBodyProps> = {
    sessionId: options.sessionId ?? SESSION,
    useSession: bindSnapshotSelector(session),
    useSessions,
    useSessionStatus: bindSnapshotSelector(statuses),
    useStore: hookOf(instance),
    actions: instance.actions,
    ...face,
    t: makeTranslate(zh, commonZh),
  }
  const view = render(<TeamBody {...(props as TeamBodyProps)} />)
  return {
    view,
    instance,
    sessions,
    statuses,
    calls,
    refreshes,
    opened,
    answer: (value) => { answer = value },
    rerender(next: BenchOptions = {}) {
      const merged: BenchOptions = { ...options, ...next }
      const nextSessionId = merged.sessionId ?? SESSION
      const nextValues = merged.dropTeam === true
        ? {}
        : { agentTeam: merged.team ?? FULL_TEAM, ...merged.memberValues?.[SESSION] }
      const nextMemberEntries = Object.fromEntries(Object.entries(merged.memberValues ?? {}).map(([id, values]) => [id, {
        state: 'ready', error: null, values,
      }]))
      act(() => {
        const current = sessions.getSnapshot()
        view.rerender(<TeamBody {...({ ...props, sessionId: nextSessionId } as TeamBodyProps)} />)
        sessions.set({
          ...current,
          phase: merged.listing === true ? 'pending' : 'ready',
          projectionsBySession: {
            ...nextMemberEntries,
            ...(merged.dropTeam === true ? {} : {
              [SESSION]: { state: 'ready', error: null, values: nextValues },
            }),
          } as SessionListState['projectionsBySession'],
        })
      })
    },
  }
}

describe('TeamBody board', () => {
  it('renders the roster with live status and the board with status, meta, and warnings', async () => {
    const b = await bodyBench()
    expect(screen.getByText('成员')).toBeDefined()
    expect(screen.getAllByText('lead').length).toBeGreaterThan(0)
    expect(screen.getAllByText('worker').length).toBeGreaterThan(0)
    expect(screen.getAllByText('未运行').length).toBe(2)
    expect(screen.getByText('Implement runtime')).toBeDefined()
    expect(screen.getByText('进行中')).toBeDefined()
    expect(screen.getByText('task-1')).toBeDefined()
    expect(screen.getAllByText(/task-2/).length).toBeGreaterThan(0)
    expect(screen.getByText('写入范围: src')).toBeDefined()
    expect(screen.getByText('write scopes overlap with task-2')).toBeDefined()
    expect(screen.getByText('Write tests')).toBeDefined()
    expect(screen.getByText('已完成')).toBeDefined()
    expect(b.opened).toEqual([])
  })

  it('shows the unavailable notice when the projection is missing and the loading one while listing', async () => {
    const b = await bodyBench({ dropTeam: true })
    expect(screen.getByText('Team 暂不可用')).toBeDefined()
    b.rerender({ dropTeam: true, listing: true })
    expect(screen.getByText('正在加载团队…')).toBeDefined()
  })

  it('renders the empty board without task cards', async () => {
    await bodyBench({ team: { members: [LEAD_MEMBER], tasks: [] } })
    expect(screen.getByText('暂无共享任务，可以通过对话创建')).toBeDefined()
    expect(screen.queryByText('Implement runtime')).toBeNull()
  })

  it('renders a failed persisted record with its diagnostic', async () => {
    const failed: TeamProjection = { members: [], tasks: [], failure: 'generation gap' }
    await bodyBench({ team: failed })
    expect(screen.getByText('团队持久记录无效：generation gap')).toBeDefined()
  })

  it('marks the current conversation roster row disabled and others openable', async () => {
    const b = await bodyBench()
    const leadRow = screen.getByRole('button', { name: /lead/u })
    const workerRow = screen.getByRole('button', { name: /worker/u })
    expect((leadRow as HTMLButtonElement).disabled).toBe(true)
    expect((workerRow as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(workerRow)
    expect(b.opened).toEqual([{ parentSessionId: SESSION, childSessionId: WORKER, mode: 'continuable' }])
  })

  it('refreshes the viewed conversation from the toolbar button', async () => {
    const b = await bodyBench()
    fireEvent.click(screen.getByRole('button', { name: /刷新/u }))
    await settle()
    expect(b.refreshes).toEqual([SESSION])
  })

  it('marks running, provisioning, and failed roster rows with their model and diagnostic', async () => {
    const provisioning = { id: OTHER, name: 'prep', role: 'teammate', phase: 'provisioning' } as TeamMemberProjection
    const failed: TeamMemberProjection = {
      id: 'failed-id' as SessionId, name: 'broken', role: 'teammate', phase: 'failed', error: 'spawn failed',
    }
    await bodyBench({
      team: { members: [LEAD_MEMBER, WORKER_MEMBER, provisioning, failed], tasks: [] },
      running: { [WORKER]: true },
      memberValues: { [WORKER]: { modelSelection: { next: { model: 'deepseek-chat' } } } },
    })
    expect(screen.getByText('运行中')).toBeDefined()
    expect(screen.getByText(/模型: deepseek-chat/u)).toBeDefined()
    expect(screen.getByText('准备中')).toBeDefined()
    expect(screen.getByText('失败')).toBeDefined()
    expect(screen.getByText('spawn failed')).toBeDefined()
    const prepRow = screen.getByRole('button', { name: /prep/u }) as HTMLButtonElement
    const brokenRow = screen.getByRole('button', { name: /broken/u }) as HTMLButtonElement
    expect(prepRow.disabled).toBe(true)
    expect(brokenRow.disabled).toBe(true)
  })

  it('shows ready and blocked copy on pending tasks', async () => {
    await bodyBench({ team: { members: [LEAD_MEMBER], tasks: [
      { ...TASK_1_VIEW, id: 'task-p1' as TeamTaskId, status: 'pending', ready: true, blockedBy: [], writeScopeWarnings: [] },
      {
        ...TASK_1_VIEW, id: 'task-p2' as TeamTaskId, status: 'pending', ready: false,
        blockedBy: ['task-p1' as TeamTaskId], writeScopes: [], writeScopeWarnings: [],
      },
    ] } })
    expect(screen.getByText('可开始')).toBeDefined()
    expect(screen.getByText('被依赖阻塞')).toBeDefined()
    expect(screen.getByText('依赖: task-p1')).toBeDefined()
  })

  it('reads a teammate conversation roster through its Lead', async () => {
    await bodyBench({ parentSessionId: SESSION })
    expect(screen.getByText('Implement runtime')).toBeDefined()
  })
})

describe('TeamBody transitions', () => {
  it('offers complete on in-progress tasks and reopen on completed ones', async () => {
    const b = await bodyBench()
    fireEvent.click(screen.getByRole('button', { name: '完成' }))
    await settle()
    expect(b.calls[0]).toMatchObject({ method: 'updateTask', agent: SESSION, request: {
      taskId: TASK_1, expectedRevision: 4, action: 'complete',
    } })
    const reopen = screen.getByRole('button', { name: '重新打开' })
    fireEvent.click(reopen)
    await settle()
    expect(b.calls[1]?.request).toMatchObject({ taskId: TASK_2, action: 'reopen' })
  })

  it('arms delete behind a confirmation step', async () => {
    const b = await bodyBench()
    const card = screen.getByText('Implement runtime').closest('article') as HTMLElement
    const arm = [...card.querySelectorAll('button')].find(button => button.textContent?.includes('删除'))
    expect(arm).toBeDefined()
    fireEvent.click(arm!)
    expect(screen.getByRole('button', { name: /确认删除/u })).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /确认删除/u }))
    await settle()
    expect(b.calls[0]?.request).toMatchObject({ taskId: TASK_1, action: 'delete' })
  })

  it('reassigns through the owner select and releases with the unowned option', async () => {
    const b = await bodyBench()
    const card = screen.getByText('Implement runtime').closest('article') as HTMLElement
    const select = card.querySelector('select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'worker' } })
    await settle()
    expect(b.calls[0]?.request).toMatchObject({ taskId: TASK_1, action: 'reassign', owner: 'worker' })
    fireEvent.change(select, { target: { value: '' } })
    await settle()
    expect(b.calls[1]?.request).toMatchObject({ taskId: TASK_1, action: 'reassign' })
    expect(b.calls[1]?.request).not.toHaveProperty('owner')
  })
})

describe('TeamBody forms', () => {
  it('creates a task from the form and closes it when the write commits', async () => {
    const b = await bodyBench()
    fireEvent.click(screen.getByRole('button', { name: /新建任务/u }))
    expect(screen.getByLabelText('主题')).toBeDefined()
    fireEvent.change(screen.getByLabelText('主题'), { target: { value: ' Ship docs ' } })
    fireEvent.change(screen.getByLabelText('描述'), { target: { value: 'Write the guide' } })
    fireEvent.change(screen.getByLabelText('依赖'), { target: { value: 'task-1, task-1, ' } })
    fireEvent.change(screen.getByLabelText('写入范围'), { target: { value: 'docs' } })
    const commit = screen.getByRole('button', { name: '提交' })
    fireEvent.click(commit)
    await settle()
    expect(b.calls[0]).toMatchObject({ method: 'createTask', agent: SESSION, request: {
      subject: 'Ship docs',
      description: 'Write the guide',
      blockedBy: ['task-1'],
      writeScopes: ['docs'],
    } })
    expect(screen.queryByLabelText('主题')).toBeNull()
  })

  it('keeps the create form open with the rejection diagnostic and dismisses it', async () => {
    const b = await bodyBench()
    b.answer({ ok: false, error: new RemoteError('agent-team/rejected', 'subject must be non-empty', { code: 'X' }) })
    fireEvent.click(screen.getByRole('button', { name: /新建任务/u }))
    fireEvent.change(screen.getByLabelText('主题'), { target: { value: 'Ship docs' } })
    fireEvent.change(screen.getByLabelText('描述'), { target: { value: 'Write the guide' } })
    fireEvent.click(screen.getByRole('button', { name: '提交' }))
    await settle()
    expect(screen.getByLabelText('主题')).toBeDefined()
    expect(screen.getByText('操作被拒绝：subject must be non-empty')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))
    expect(b.instance.getSnapshot().notice).toBeUndefined()
  })

  it('requires a subject and a description before the commit unlocks', async () => {
    await bodyBench()
    fireEvent.click(screen.getByRole('button', { name: /新建任务/u }))
    const commit = screen.getByRole('button', { name: '提交' }) as HTMLButtonElement
    expect(commit.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('主题'), { target: { value: 'Ship docs' } })
    expect(commit.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('描述'), { target: { value: 'Write the guide' } })
    expect(commit.disabled).toBe(false)
  })

  it('ignores the form submit event and closes the create form when the toggle repeats', async () => {
    const submit = vi.fn()
    await bodyBench()
    fireEvent.click(screen.getByRole('button', { name: /新建任务/u }))
    const form = screen.getByLabelText('主题').closest('form') as HTMLFormElement
    form.addEventListener('submit', submit)
    fireEvent.submit(form)
    expect(submit).toHaveBeenCalledTimes(1)
    expect(screen.getByLabelText('主题')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: /新建任务/u }))
    expect(screen.queryByLabelText('主题')).toBeNull()
  })

  it('cancels the create form', async () => {
    await bodyBench()
    fireEvent.click(screen.getByRole('button', { name: /新建任务/u }))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByLabelText('主题')).toBeNull()
  })

  it('pre-fills the edit form and commits a text-only edit', async () => {
    const b = await bodyBench()
    const card = screen.getByText('Implement runtime').closest('article') as HTMLElement
    fireEvent.click([...card.querySelectorAll('button')].find(button => button.textContent === '编辑')!)
    expect(screen.getByLabelText<HTMLInputElement>('主题').value).toBe('Implement runtime')
    expect(screen.getByLabelText<HTMLInputElement>('依赖').value).toBe('task-2')
    expect(screen.getByLabelText<HTMLInputElement>('写入范围').value).toBe('src')
    fireEvent.change(screen.getByLabelText('主题'), { target: { value: 'Implement the runtime' } })
    fireEvent.click(screen.getByRole('button', { name: '提交' }))
    await settle()
    expect(b.calls[0]).toMatchObject({ method: 'updateTask', request: {
      taskId: TASK_1, expectedRevision: 4, action: 'edit',
      subject: 'Implement the runtime', description: 'Build the Team runtime',
    } })
    expect(b.calls).toHaveLength(1)
    expect(screen.queryByLabelText('主题')).toBeNull()
  })

  it('keeps the edit form open beside the conflict notice and refreshes the board', async () => {
    const b = await bodyBench()
    b.answer({ ok: false, error: new RemoteError('agent-team/stale-revision', 'stale', {}) })
    const card = screen.getByText('Implement runtime').closest('article') as HTMLElement
    fireEvent.click([...card.querySelectorAll('button')].find(button => button.textContent === '编辑')!)
    fireEvent.change(screen.getByLabelText('主题'), { target: { value: 'Implement the runtime' } })
    fireEvent.click(screen.getByRole('button', { name: '提交' }))
    await settle()
    expect(b.refreshes).toEqual([SESSION])
    expect(screen.getByText('任务已被他人更新，看板已刷新，请重试')).toBeDefined()
    expect(screen.getByLabelText('主题')).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
  })

  it('resets the open form when the conversation switches', async () => {
    const b = await bodyBench()
    fireEvent.click(screen.getByRole('button', { name: /新建任务/u }))
    expect(screen.getByLabelText('主题')).toBeDefined()
    b.rerender({ sessionId: OTHER })
    expect(screen.queryByLabelText('主题')).toBeNull()
  })
})

describe('TeamBody busy state', () => {
  it('disables the controls and shows the busy notice while one write flies', async () => {
    let release: (value: RemoteResult<TeamTask>) => void = () => {}
    const b = await bodyBench()
    b.answer(new Promise<RemoteResult<TeamTask>>((resolve) => { release = resolve }))
    fireEvent.click(screen.getByRole('button', { name: '完成' }))
    await act(async () => { await Promise.resolve() })
    expect(screen.getByText('正在提交…')).toBeDefined()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /新建任务/u }).disabled).toBe(true)
    await act(async () => { release({ ok: true, value: TASK_1_VIEW }) })
    await settle()
    expect(screen.queryByText('正在提交…')).toBeNull()
  })
})
