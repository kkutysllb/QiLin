/**
 * The write face: every entry under the Lead's identity, one write at a time,
 * conflict routed to refresh, everything else to the message notice.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import type { SessionId } from '@qilin/session/types'
import type { TeamTaskId } from '@qilin/experimental-agent-team/client'
import { RemoteError } from '@qilin/typert-protocol'
import type { RemoteErrorCode } from '@qilin/typert-protocol'
import { createTeamPageStore } from '../src/client/team-page-store.ts'
import { teamOpenTeammate, teamWritesFace, type TeamTaskFormFields, type TeamWriter } from '../src/client/team-writes.ts'
import type { TeamTaskView as TeamTask } from '@qilin/experimental-agent-team/client'

const SESSION = 'lead' as SessionId
const CHILD = 'child' as SessionId
const TASK = 'task-1' as TeamTaskId

const TASK_VIEW: TeamTask = {
  id: TASK,
  revision: 3,
  subject: 'Implement runtime',
  description: 'Build the Team runtime',
  status: 'in_progress',
  ownerName: 'lead',
  blockedBy: [],
  writeScopes: ['src'],
  ready: true,
  writeScopeWarnings: [],
}

/** A settled success. */
function ok(value: unknown): Promise<{ readonly ok: true; readonly value: unknown }> {
  return Promise.resolve({ ok: true, value })
}

/** A settled typed failure. */
function fail(
  code: RemoteErrorCode,
  message: string,
): Promise<{ readonly ok: false; readonly error: RemoteError }> {
  return Promise.resolve({ ok: false, error: new RemoteError(code, message, {}) })
}

interface Harness {
  readonly create: Mock
  readonly update: Mock
  readonly refresh: Mock
  readonly open: Mock
  readonly instance: ReturnType<ReturnType<typeof createTeamPageStore>['create']>
  readonly face: ReturnType<ReturnType<typeof teamWritesFace>>
  readonly settle: () => Promise<void>
}

function bench(options: {
  create?: Mock<TeamWriter['createTask']>
  update?: Mock<TeamWriter['updateTask']>
  parentSessionId?: SessionId
  mainView?: number
} = {}): Harness {
  const create = options.create ?? vi.fn<TeamWriter['createTask']>(() => ok(TASK_VIEW))
  const update = options.update ?? vi.fn<TeamWriter['updateTask']>(() => ok(TASK_VIEW))
  const refresh = vi.fn(() => Promise.resolve())
  const open = vi.fn()
  const writer: TeamWriter = {
    createTask: create,
    updateTask: update,
  }
  const instance = createTeamPageStore().create()
  const face = teamWritesFace({
    writer,
    refreshProjections: refresh,
    leadSessionId: sessionId => options.parentSessionId ?? sessionId,
    mainViewCount: () => options.mainView ?? 1,
    openSession: open,
  })(SESSION, instance.actions)
  /** Drain the face's fire-and-forget promise chain. */
  const settle = async (): Promise<void> => {
    await new Promise<void>((resolve) => { setTimeout(resolve, 0) })
  }
  return { create, update, refresh, open, instance, face, settle }
}

const FIELDS: TeamTaskFormFields = {
  subject: 'Implement runtime',
  description: 'Build the Team runtime',
  blockers: [],
  writeScopes: ['src'],
}

describe('teamOpenTeammate', () => {
  it('opens a teammate as a continuable child of the Lead', () => {
    const { open } = bench()
    const nav = teamOpenTeammate({
      leadSessionId: id => id,
      mainViewCount: () => 1,
      openSession: open,
    })
    nav(SESSION, CHILD)
    expect(open).toHaveBeenCalledWith({ parentSessionId: SESSION, childSessionId: CHILD, mode: 'continuable' })
  })

  it('opens the Lead directly when the roster row is the Lead', () => {
    const { open } = bench()
    const nav = teamOpenTeammate({ leadSessionId: id => id, mainViewCount: () => 1, openSession: open })
    nav(SESSION, SESSION)
    expect(open).toHaveBeenCalledWith(SESSION)
  })

  it('does not navigate from a conversation outside the main view', () => {
    const { open } = bench()
    const nav = teamOpenTeammate({ leadSessionId: id => id, mainViewCount: () => 0, openSession: open })
    nav(SESSION, CHILD)
    expect(open).not.toHaveBeenCalled()
  })
})

describe('teamWritesFace', () => {
  it('creates under the Lead identity with empty lists omitted', async () => {
    const b = bench()
    b.face.createTask(SESSION, FIELDS)
    await b.settle()
    expect(b.create).toHaveBeenCalledWith(SESSION, {
      subject: 'Implement runtime',
      description: 'Build the Team runtime',
      writeScopes: ['src'],
    })
    expect(b.instance.getSnapshot()).toEqual({ busy: false, notice: undefined })
  })

  it('sends nonempty blockers and edits through the Lead-resolved session', async () => {
    const b = bench({ parentSessionId: SESSION })
    b.face.createTask(CHILD, { ...FIELDS, blockers: [TASK] })
    await b.settle()
    expect(b.create).toHaveBeenCalledWith(SESSION, {
      subject: 'Implement runtime',
      description: 'Build the Team runtime',
      blockedBy: [TASK],
      writeScopes: ['src'],
    })
  })

  it('commits unchanged lists as text-only edits without a dependency write', async () => {
    const b = bench()
    b.face.editTask(SESSION, TASK_VIEW, FIELDS)
    await b.settle()
    expect(b.update).toHaveBeenCalledTimes(1)
    expect(b.update).toHaveBeenCalledWith(SESSION, {
      taskId: TASK,
      expectedRevision: 3,
      action: 'edit',
      subject: 'Implement runtime',
      description: 'Build the Team runtime',
    })
  })

  it('follows a text edit with a rebased dependency write when blockers changed', async () => {
    const b = bench()
    b.face.editTask(SESSION, TASK_VIEW, { ...FIELDS, blockers: ['task-0' as TeamTaskId] })
    await b.settle()
    expect(b.update).toHaveBeenCalledTimes(2)
    expect(b.update.mock.calls[1]).toEqual([SESSION, {
      taskId: TASK,
      expectedRevision: 3,
      action: 'set_dependencies',
      blockedBy: ['task-0'],
    }])
  })

  it('clears a nonempty list by sending an empty set instead of an omission', async () => {
    const b = bench()
    b.face.editTask(SESSION, TASK_VIEW, { subject: 'x', description: 'y', blockers: [], writeScopes: [] })
    await b.settle()
    expect(b.update).toHaveBeenCalledTimes(1)
    expect(b.update.mock.calls[0]?.[1]).toMatchObject({ action: 'edit', writeScopes: [] })
  })

  it('clears a nonempty dependency set with one rebased write', async () => {
    const b = bench()
    const blocked: TeamTask = { ...TASK_VIEW, blockedBy: ['task-0' as TeamTaskId] }
    b.face.editTask(SESSION, blocked, { subject: 'x', description: 'y', blockers: [], writeScopes: [] })
    await b.settle()
    expect(b.update).toHaveBeenCalledTimes(2)
    expect(b.update.mock.calls[1]?.[1]).toMatchObject({ action: 'set_dependencies', blockedBy: [] })
  })

  it('stops at the first failed write of an edit', async () => {
    const b = bench({ update: vi.fn<TeamWriter['updateTask']>(() => fail('agent-team/rejected', 'subject must be non-empty')) })
    b.face.editTask(SESSION, TASK_VIEW, { ...FIELDS, blockers: ['task-0' as TeamTaskId] })
    await b.settle()
    expect(b.update).toHaveBeenCalledTimes(1)
    expect(b.instance.getSnapshot().notice).toEqual({ kind: 'rejected', message: 'subject must be non-empty' })
  })

  it('routes transitions and reassignment through the Lead', async () => {
    const b = bench()
    b.face.transitionTask(SESSION, TASK_VIEW, 'complete')
    b.face.reassignTask(SESSION, TASK_VIEW, 'worker')
    b.face.reassignTask(SESSION, TASK_VIEW, undefined)
    await b.settle()
    expect(b.update.mock.calls.map((call: Parameters<TeamWriter['updateTask']>) => call[1])).toEqual([
      { taskId: TASK, expectedRevision: 3, action: 'complete' },
      { taskId: TASK, expectedRevision: 3, action: 'reassign', owner: 'worker' },
      { taskId: TASK, expectedRevision: 3, action: 'reassign' },
    ])
  })

  it('refreshes the projections and records the conflict on a stale revision', async () => {
    const b = bench({ update: vi.fn<TeamWriter['updateTask']>(() => fail('agent-team/stale-revision', 'stale')) })
    b.face.transitionTask(SESSION, TASK_VIEW, 'complete')
    await b.settle()
    expect(b.refresh).toHaveBeenCalledWith(SESSION)
    expect(b.instance.getSnapshot().notice).toEqual({ kind: 'conflict' })
  })

  it('records the wire message on any other refusal', async () => {
    const b = bench({ update: vi.fn<TeamWriter['updateTask']>(() => fail('agent-team/rejected', 'refused')) })
    b.face.transitionTask(SESSION, TASK_VIEW, 'delete')
    await b.settle()
    expect(b.refresh).not.toHaveBeenCalled()
    expect(b.instance.getSnapshot().notice).toEqual({ kind: 'rejected', message: 'refused' })
  })

  it('refreshes the viewed conversation on the explicit refresh entry', async () => {
    const b = bench({ parentSessionId: SESSION })
    b.face.refresh(CHILD)
    await b.settle()
    expect(b.refresh).toHaveBeenCalledWith(SESSION)
  })
})
