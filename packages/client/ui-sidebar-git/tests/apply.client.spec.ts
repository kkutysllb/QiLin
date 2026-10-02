/**
 * The plugin's registrations, and their removal when the plugin goes.
 *
 * The registry is real, because "registered" means what it says a type is; the
 * slot, locale, and Remote faces are recorders, because what matters here is
 * what was handed to them — one body seat and one title seat under the type's
 * id, the body with its store and face — and that every registration is gone
 * after dispose, which is what makes a reload safe.
 */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@qilin/kylin'
import { SidebarRightTabRegistry } from '@qilin/client-ui-sidebar-right/src/client/tab-registry.ts'
import { GIT_ID, GIT_KIND } from '../src/client/definition.tsx'
import { apply, inject } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'
import { GitBody } from '../src/client/GitBody.tsx'
import { GitTitle } from '../src/client/GitTitle.tsx'
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
  const locale = {
    // Copy is the dictionary's contract; the key stands in for the translation.
    bind: vi.fn(() => (key: string) => key),
    register: vi.fn((ns: string, dicts: unknown) => {
      dictionaries.set(ns, dicts)
      return () => { dictionaries.delete(ns) }
    }),
  }
  const workspaceGit = {
    isRepo: vi.fn(), status: vi.fn(), diff: vi.fn(), stage: vi.fn(), unstage: vi.fn(), discard: vi.fn(),
    commit: vi.fn(), branches: vi.fn(), checkout: vi.fn(), createBranch: vi.fn(), push: vi.fn(), pull: vi.fn(),
    log: vi.fn(), commitDiff: vi.fn(),
    ghAvailable: vi.fn(), ghAuthStatus: vi.fn(), ghListPrs: vi.fn(), ghCreatePr: vi.fn(), ghMergePr: vi.fn(),
  }
  ctx.provide('sidebarRightTabs', tabs as never)
  ctx.provide('slots', slots as never)
  ctx.provide('locale', locale as never)
  ctx.provide('remote', { workspaceGit } as never)
  ctx.provide('remote.workspaceGit', workspaceGit as never)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { tabs, registered, dictionaries, fiber }
}

describe('ui-sidebar-git apply', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('registers the type, its dictionaries, and the body and title seats under the type\'s id', async () => {
    const { tabs, registered, dictionaries } = await boot()
    const definition = tabs.get(GIT_KIND)
    expect(definition?.id).toBe(GIT_ID)
    expect(definition?.priority).toBe('builtin')
    expect(definition?.title('git://status')).toBe('type.label')
    expect(definition?.guide?.map(entry => [entry.order, entry.title(), entry.description?.()]))
      .toEqual([[20, 'guide.title', 'guide.description']])
    expect(dictionaries.get('sidebarGit')).toEqual({ zh, en })
    // The seat key is the implementation's id, not the kind: an extension may
    // take the kind over, and the seats must still find this body and title.
    expect(registered.map(entry => [entry.name, entry.key, entry.locale, entry.component])).toEqual([
      ['sidebar.right.pane.tab', GIT_ID, 'sidebarGit', GitBody],
      ['sidebar.right.pane.tab.title', GIT_ID, undefined, GitTitle],
    ])
    expect(registered[0]?.store).toBeDefined()
    expect(typeof registered[0]?.inject).toBe('function')
  })

  it('takes every registration back when the plugin is disposed', async () => {
    const { tabs, registered, dictionaries, fiber } = await boot()
    await fiber.dispose()
    expect(tabs.get(GIT_KIND)).toBeUndefined()
    expect(registered).toEqual([])
    expect(dictionaries.size).toBe(0)
  })
})
