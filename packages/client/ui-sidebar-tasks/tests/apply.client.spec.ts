/**
 * The plugin's registrations, and their removal when the plugin goes.
 *
 * The registry is real, because "registered" means what it says a type is; the
 * slot, locale, jobs, and service faces are recorders, because what matters
 * here is what was handed to them — one type, one body seat (with the graph
 * store and face) and one badge seat under the type's id — and that every
 * registration is gone after dispose, which is what makes a reload safe.
 */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@qilin/kylin'
import { SidebarRightTabRegistry } from '@qilin/client-ui-sidebar-right/src/client/tab-registry.ts'
import { TASKS_ID, TASKS_KIND } from '../src/client/definition.tsx'
import { apply, inject } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'
import { TasksBody } from '../src/client/TasksBody.tsx'
import { TasksBadge } from '../src/client/TasksBadge.tsx'
import { en, zh } from '../src/client/locales.ts'

interface Recorded {
  name: string
  key: string
  locale: string
  store: unknown
  inject: unknown
  component: unknown
}

async function boot() {
  const ctx = new Context()
  const tabs = new SidebarRightTabRegistry(ctx)
  const registered: Recorded[] = []
  const slots = {
    inject: vi.fn((_name: string, register: () => () => void) => register()),
    register: vi.fn((options: Omit<Recorded, 'component'>, component: unknown) => {
      const entry: Recorded = { ...options, component }
      registered.push(entry)
      return () => { registered.splice(registered.indexOf(entry), 1) }
    }),
  }
  const dictionaries = new Map<string, unknown>()
  const bound = vi.fn(() => (key: string) => key)
  const locale = {
    bind: bound,
    register: vi.fn((ns: string, dicts: unknown) => {
      dictionaries.set(ns, dicts)
      return () => { dictionaries.delete(ns) }
    }),
  }
  const subagents = { interruptByParent: vi.fn(async () => ({})) }
  const jobsSource = {
    state: { rows: {}, observed: {} },
    watchRows: vi.fn(() => () => {}),
  }
  const workspace = {
    openSession: vi.fn(),
    refreshProjections: vi.fn(async () => undefined),
  }
  ctx.provide('sidebarRightTabs', tabs as never)
  ctx.provide('slots', slots as never)
  ctx.provide('locale', locale as never)
  ctx.provide('remote', { subagents } as never)
  ctx.provide('remote.subagents', subagents as never)
  ctx.provide('jobs', jobsSource as never)
  ctx.provide('sessions', { refreshProjections: workspace.refreshProjections } as never)
  ctx.provide('uiWorkspace', { openSession: workspace.openSession } as never)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { tabs, registered, dictionaries, bound, subagents, jobsSource, workspace, fiber }
}

describe('ui-sidebar-tasks apply', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('registers the type, its dictionaries, and the body and badge seats under the type\'s id', async () => {
    const { tabs, registered, dictionaries, bound, jobsSource } = await boot()
    const definition = tabs.get(TASKS_KIND)
    expect(definition?.id).toBe(TASKS_ID)
    expect(definition?.priority).toBe('builtin')
    expect(definition?.single).toBe(true)
    expect(definition?.title(TASKS_ID)).toBe('type.label')
    expect(definition?.guide?.map(entry => [entry.order, entry.title(), entry.description?.()]))
      .toEqual([[40, 'guide.title', 'guide.description']])
    expect(dictionaries.get('sidebarTasks')).toEqual({ zh, en })
    expect(bound).toHaveBeenCalledWith('sidebarTasks')
    // The seat key is the implementation's id, not the kind: an extension may
    // take the kind over, and the seats must still find this body and badge.
    expect(registered.map(entry => [entry.name, entry.key, entry.locale, entry.component])).toEqual([
      ['sidebar.right.pane.tab', TASKS_ID, 'sidebarTasks', TasksBody],
      ['sidebar.right.pane.tab.badge', TASKS_ID, undefined, TasksBadge],
    ])
    // The body carries the graph's shared view state and the injected face;
    // the badge carries only its jobs face.
    expect(registered[0]?.store).toBeDefined()
    expect(typeof registered[0]?.inject).toBe('function')
    const injected = (registered[0]?.inject as () => unknown)() as { hooks: { jobs: unknown }; watchRows: unknown }
    expect(injected.hooks.jobs).toBe(jobsSource.state)
    const badgeInjected = (registered[1]?.inject as () => unknown)() as { hooks: { jobs: unknown } }
    expect(badgeInjected.hooks.jobs).toBe(jobsSource.state)
  })

  it('routes the injected face through the client services', async () => {
    const { registered, jobsSource, subagents, workspace } = await boot()
    expect(workspace.openSession).not.toHaveBeenCalled()
    expect(workspace.refreshProjections).not.toHaveBeenCalled()
    expect(jobsSource.watchRows).not.toHaveBeenCalled()
    const injected = (registered[0]?.inject as () => {
      openChild(target: unknown): void
      refresh(parentSessionId: unknown): void
      interruptChild(childSessionId: unknown, parentSessionId: unknown): void
      watchRows(sessionId: unknown): () => void
    })()
    injected.openChild('s-root')
    expect(workspace.openSession).toHaveBeenCalledWith('s-root')
    injected.refresh('s-root')
    expect(workspace.refreshProjections).toHaveBeenCalledWith('s-root')
    const stop = injected.watchRows('s-root')
    expect(jobsSource.watchRows).toHaveBeenCalledWith('s-root')
    stop()
    injected.interruptChild('s-child', 's-root')
    expect(subagents.interruptByParent).toHaveBeenCalledWith('s-child', 's-root', 'continuable')
  })

  it('takes every registration back when the plugin is disposed', async () => {
    const { tabs, registered, dictionaries, jobsSource, fiber } = await boot()
    await fiber.dispose()
    expect(tabs.get(TASKS_KIND)).toBeUndefined()
    expect(registered).toEqual([])
    expect(dictionaries.size).toBe(0)
    expect(jobsSource.watchRows).not.toHaveBeenCalled()
  })
})
