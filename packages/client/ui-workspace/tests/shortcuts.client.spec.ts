/** Workspace command registrations and the browser-owned opening request store. */
import { Context } from '@qilin/kylin'
import { describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@qilin/client-ui-renderer/client'
import { createWorkspaceShortcutControls, installWorkspaceShortcuts } from '../src/client/shortcuts.ts'
import { en, zh } from '../src/client/locales.ts'

/** One captured command resolve's outcome, shaped for the assertions below. */
interface ShortcutCommandResolution {
  readonly status: string
  run?: () => void
  readonly reason?: string
}

interface MainViewSession {
  readonly id: string
  readonly displayTitle: string
  readonly blank: boolean
  readonly retainedBy: { readonly mainView: number }
}

/** Provide the locale rows and a capturing shortcuts registry on a bare Context. */
async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const registered: { id: string; resolve: () => unknown }[] = []
  let sessions: readonly MainViewSession[] = []
  ctx.provide('locale', {
    register: () => () => {},
    bind: () => {
      const table = { ...zh, ...en }
      return ((key: string, params?: Record<string, unknown>) => {
        let text = table[key as keyof typeof table] ?? key
        for (const [name, value] of Object.entries(params ?? {})) {
          text = text.replaceAll(`{${name}}`, String(value))
        }
        return text
      }) as never
    },
  })
  ctx.provide('shortcuts', {
    register: (command: { id: string; resolve: () => unknown }) => {
      registered.push(command)
      return () => {}
    },
  })
  ctx.provide('sessions', {
    list: { getSnapshot: () => ({ byId: Object.fromEntries(sessions.map(row => [row.id, row])) }), subscribe: () => () => {} },
  })
  return { ctx, registered, setSessions: (rows: readonly MainViewSession[]): void => { sessions = rows } }
}

/** Install the registrations and return the captured resolve functions by command id. */
async function installed(sessions: readonly MainViewSession[] = []) {
  const b = await bench()
  b.setSessions(sessions)
  const navigation = { startSession: vi.fn(), forkSession: vi.fn(async () => undefined) }
  const archiveSession = vi.fn()
  const controls = createWorkspaceShortcutControls()
  installWorkspaceShortcuts(b.ctx as never, navigation, controls, archiveSession)
  /** The captured resolve for one command id; the installer registered it. */
  const command = (id: string): ShortcutCommandResolution => {
    const resolve = b.registered.find(row => row.id === id)?.resolve as (() => ShortcutCommandResolution) | undefined
    if (resolve === undefined) throw new Error(`command ${id} was not registered`)
    return resolve()
  }
  return { registered: b.registered, navigation, archiveSession, controls, command, setSessions: b.setSessions }
}

describe('createWorkspaceShortcutControls', () => {
  it('routes browser opening requests through one store', () => {
    const controls = createWorkspaceShortcutControls()
    expect(controls.state.getSnapshot()).toMatchObject({
      searchRequest: 0, addRequested: false, directoryBusy: false, renameTarget: null,
    })
    controls.search()
    controls.search()
    expect(controls.state.getSnapshot().searchRequest).toBe(2)
    // A busy directory picker refuses the add request instead of queueing it.
    controls.directoryBusy(true)
    controls.add()
    expect(controls.state.getSnapshot().addRequested).toBe(false)
    controls.directoryBusy(false)
    controls.add()
    expect(controls.state.getSnapshot().addRequested).toBe(true)
    controls.closeAdd()
    expect(controls.state.getSnapshot().addRequested).toBe(false)
    controls.rename('s1' as never, 'Current')
    expect(controls.state.getSnapshot().renameTarget).toEqual({ sessionId: 's1', currentTitle: 'Current' })
    controls.closeRename()
    expect(controls.state.getSnapshot().renameTarget).toBeNull()
  })
})

describe('installWorkspaceShortcuts', () => {
  it('registers the navigation commands with device defaults', async () => {
    const { registered } = await installed()
    expect(registered.map(row => row.id)).toEqual([
      'session.new', 'session.search', 'workspace.add', 'session.rename', 'session.fork', 'session.archive',
    ])
  })

  it('resolves new, search, and add against the browser request store', async () => {
    const h = await installed()
    h.command('session.new').run?.()
    expect(h.navigation.startSession).toHaveBeenCalled()
    h.command('session.search').run?.()
    expect(h.controls.state.getSnapshot().searchRequest).toBe(1)
    // Without a directory flow the add command is blocked with the picker reason;
    // the busy-picker branch and the request itself are the browser row's contract.
    expect(h.command('workspace.add')).toMatchObject({ status: 'blocked', reason: en['shortcut.noPicker'] })
  })

  it('resolves rename, fork, and archive against the main-view session', async () => {
    const empty = await installed()
    expect(empty.command('session.rename')).toMatchObject({ status: 'blocked', reason: en['shortcut.noSession'] })
    expect(empty.command('session.fork')).toMatchObject({ status: 'blocked', reason: en['shortcut.noSession'] })
    expect(empty.command('session.archive')).toMatchObject({ status: 'blocked', reason: en['shortcut.noSession'] })

    const h = await installed([
      { id: 's1', displayTitle: 'Current', blank: false, retainedBy: { mainView: 1 } },
    ])
    h.command('session.rename').run?.()
    expect(h.controls.state.getSnapshot().renameTarget).toEqual({ sessionId: 's1', currentTitle: 'Current' })
    h.controls.closeRename()
    // A blank main-view session has no completed turn to fork.
    h.setSessions([{ id: 's2', displayTitle: 'Blank', blank: true, retainedBy: { mainView: 1 } }])
    expect(h.command('session.fork')).toMatchObject({ status: 'blocked', reason: en['shortcut.noCompletedTurn'] })
    h.setSessions([{ id: 's1', displayTitle: 'Current', blank: false, retainedBy: { mainView: 1 } }])
    h.command('session.fork').run?.()
    expect(h.navigation.forkSession).toHaveBeenCalledWith('s1')
    h.command('session.archive').run?.()
    expect(h.archiveSession).toHaveBeenCalledWith('s1')
  })
})
