// @vitest-environment jsdom
/** Branch coverage for the built-in Session and Workspace menu contributions. */
import { createElement } from 'react'
import { Context } from '@qilin-agent/kylin'
import { createSnapshotStore } from '@qilin-agent/client-store'
import { makeTranslate } from '@qilin-agent/client-test-runtime'
import { zh as commonZh } from '@qilin-agent/client-locale/src/locales/zh.ts'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { GroupNode } from '../src/client/tree.ts'
import { ProjectRowItem } from '../src/client/rows/Rows.tsx'
import { MenuRegistry } from '@qilin-agent/client-ui-context-menu/src/client/registry.ts'
import { LocaleRuntime } from '@qilin-agent/client-locale/client'
import { SessionId } from '@qilin-agent/session/types'
import { afterEach, expect, it, vi } from 'vitest'
import type { WorkspaceId } from '@qilin-agent/api-workspace-controller/client'
import { en, zh } from '../src/client/locales.ts'
import { registerWorkspaceMenus, type WorkspaceMenuActions } from '../src/client/context-menus.tsx'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

/** The row seat's dictionary chain, as the browser root passes it. */
const rowT = makeTranslate(zh, commonZh) as never

interface MenuAction {
  readonly id: string
  readonly label: string
  readonly icon: { readonly key: string }
  readonly commandId?: string
  readonly danger?: boolean
  readonly separatorBefore?: boolean
  readonly afterContent?: boolean
  readonly run?: () => void
}

type Actions = readonly MenuAction[]

interface Contribution {
  readonly id: string
  readonly target: string
  readonly resolve: (target: Record<string, unknown>, signal: AbortSignal) => Actions
}

async function bench(over: { pinned?: readonly string[] } = {}) {
  const ctx = new Context()
  const contributions: Contribution[] = []
  const failed = vi.fn()
  const registry = new MenuRegistry(failed)
  ctx.provide('contextMenus', {
    register: (contribution: Contribution) => {
      contributions.push(contribution)
      const remove = registry.register(contribution as never)
      return () => { remove(); contributions.splice(contributions.indexOf(contribution), 1) }
    },
    notify: vi.fn(),
  } as never)
  const list = createSnapshotStore({
    items: [], archivedSessionIds: [], pinnedSessionIds: [...over.pinned ?? []],
    state: 'idle', phase: 'ready', error: null,
  })
  ctx.provide('workspaces', { list } as never)
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('en')
  ctx.provide('locale', locale)
  ctx.locale.register('workspace', { zh, en })
  const actions: WorkspaceMenuActions = {
    pin: vi.fn(),
    unpin: vi.fn(),
    requestSessionRename: vi.fn(),
    fork: vi.fn(),
    copySessionId: vi.fn(),
    archive: vi.fn(),
    requestWorkspaceAction: vi.fn(),
  }
  const fiber = ctx.plugin({ name: 'workspace-menus', apply: (child) => {
    registerWorkspaceMenus(child, actions)
  } })
  await fiber.await()
  const contribution = (id: string): Contribution => {
    const found = contributions.find(entry => entry.id === id)
    if (found === undefined) throw new Error('missing contribution ' + id)
    return found
  }
  const resolve = (id: string, target: Record<string, unknown> = { sessionId: SessionId('s1'), displayTitle: 'Title' }): Actions =>
    contribution(id).resolve(target, new AbortController().signal)
  const byId = (actions: Actions, id: string): MenuAction => {
    const found = actions.find(action => action.id === id)
    if (found === undefined) throw new Error('missing action ' + id)
    return found
  }
  return { ctx, fiber, contributions, failed, registry, list, actions, resolve, byId }
}

it('pins and unpins the clicked Session through the row callbacks', async () => {
  const b = await bench()
  try {
    const [pin] = b.resolve('workspace.session.pin')
    expect(pin).toMatchObject({ id: 'pin', label: 'Pin session', icon: { key: 'workspace.pin' } })
    pin?.run?.()
    expect(b.actions.pin).toHaveBeenCalledWith(SessionId('s1'))
    expect(b.actions.unpin).not.toHaveBeenCalled()

    const pinned = await bench({ pinned: ['s1'] })
    try {
      const [unpin] = pinned.resolve('workspace.session.pin')
      expect(unpin).toMatchObject({ id: 'pin', label: 'Unpin session', icon: { key: 'workspace.unpin' } })
      unpin?.run?.()
      expect(pinned.actions.unpin).toHaveBeenCalledWith(SessionId('s1'))
      expect(pinned.failed).not.toHaveBeenCalled()
    } finally { await pinned.fiber.dispose() }
  } finally { await b.fiber.dispose() }
})

it('renames, forks, copies the id of, and archives the clicked Session', async () => {
  const b = await bench()
  try {
    const [rename] = b.resolve('workspace.session.rename')
    expect(rename).toMatchObject({ id: 'rename', label: 'Rename', commandId: 'session.rename' })
    rename?.run?.()
    expect(b.actions.requestSessionRename).toHaveBeenCalledWith(SessionId('s1'), 'Title')

    const [fork] = b.resolve('workspace.session.fork')
    expect(fork).toMatchObject({ id: 'fork', label: 'Fork session', commandId: 'session.fork' })
    fork?.run?.()
    expect(b.actions.fork).toHaveBeenCalledWith(SessionId('s1'))

    const [copy] = b.resolve('workspace.session.id')
    expect(copy).toMatchObject({ id: 'copy', label: 'Copy Session ID', separatorBefore: true })
    copy?.run?.()
    expect(b.actions.copySessionId).toHaveBeenCalledWith(SessionId('s1'))

    const [archive] = b.resolve('workspace.session.archive')
    expect(archive).toMatchObject({
      id: 'archive', label: 'Archive session', separatorBefore: true, afterContent: true, commandId: 'session.archive',
    })
    archive?.run?.()
    expect(b.actions.archive).toHaveBeenCalledWith(SessionId('s1'))
  } finally { await b.fiber.dispose() }
})

it('renames and deletes the clicked Workspace through the browser dialogs', async () => {
  const b = await bench()
  try {
    const workspace = { workspaceId: 'ws-1' as WorkspaceId, displayTitle: 'Project' }
    const [rename] = b.resolve('workspace.header.rename', workspace)
    expect(rename).toMatchObject({ id: 'rename', label: 'Rename', icon: { key: 'workspace.rename' } })
    rename?.run?.()
    expect(b.actions.requestWorkspaceAction).toHaveBeenCalledWith('ws-1', 'Project', 'rename')

    const [remove] = b.resolve('workspace.header.delete', workspace)
    expect(remove).toMatchObject({
      id: 'delete', label: 'Delete workspace', icon: { key: 'workspace.delete' }, danger: true, separatorBefore: true,
    })
    remove?.run?.()
    expect(b.actions.requestWorkspaceAction).toHaveBeenCalledWith('ws-1', 'Project', 'delete')
  } finally { await b.fiber.dispose() }
})

it('refreshes the pin label from the observed workspace snapshot', async () => {
  const b = await bench()
  try {
    const occurrence = b.registry.resolve({ kind: 'session', value: { sessionId: SessionId('s1'), displayTitle: 'Title' } } as never)
    await occurrence.ready
    const label = (): string | undefined => occurrence.source.getSnapshot()
      .find(action => action.id === 'workspace.session.pin/pin')?.label
    expect(label()).toBe('Pin session')
    b.list.set({ items: [], archivedSessionIds: [], pinnedSessionIds: ['s1'], state: 'idle', phase: 'ready', error: null })
    await vi.waitFor(() => { expect(label()).toBe('Unpin session') })
    // Every contribution shares the one Session occurrence and disposes with it.
    expect(occurrence.source.getSnapshot().map(action => action.id)).toEqual([
      'workspace.session.pin/pin', 'workspace.session.rename/rename', 'workspace.session.fork/fork',
      'workspace.session.id/copy', 'workspace.session.archive/archive',
    ])
    occurrence.dispose()
    expect(b.failed).not.toHaveBeenCalled()
  } finally { await b.fiber.dispose() }
})
it('leaves a Workspace header toggle to a menu binding that already handled the key', () => {
  const onToggle = vi.fn()
  const onKeyDown = vi.fn((event: { preventDefault: () => void }) => { event.preventDefault() })
  const group: GroupNode = {
    key: 'project', workspaceId: 'project' as WorkspaceId, section: 'directory', cwd: '/projects/project', createdAt: 0, label: 'Project',
    sessionCount: 0, expanded: false, containsCurrent: false, sessions: [],
  }
  render(createElement(ProjectRowItem, {
    group, onToggle, onCreate: vi.fn(), t: rowT,
    menu: () => ({ onKeyDown }),
  } as never))
  fireEvent.keyDown(screen.getByRole('treeitem'), { key: 'Enter' })
  // The shared-menu binding owns the key once it prevents the default.
  expect(onKeyDown).toHaveBeenCalledOnce()
  expect(onToggle).not.toHaveBeenCalled()
})
