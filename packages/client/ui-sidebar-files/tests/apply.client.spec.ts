/**
 * The plugin's registrations, and their removal when the plugin goes.
 *
 * The registry is real, because "registered" means what it says a type is; the
 * slot, locale, and Remote faces are recorders, because what matters here is
 * what was handed to them — one body seat under the type's id with its store
 * and face — and that every registration is gone after dispose, which is what
 * makes a reload safe.
 */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@qilin/kylin'
import { SidebarRightTabRegistry } from '@qilin/client-ui-sidebar-right/src/client/tab-registry.ts'
import { FILES_ID, FILES_KIND } from '../src/client/definition.tsx'
import { FILE_ID, FILE_KIND } from '../src/client/file-definition.ts'
import { apply, inject } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'
import { FilesBody } from '../src/client/FilesBody.tsx'
import { FilesTitle } from '../src/client/FilesTitle.tsx'
import { FileBody } from '../src/client/FileBody.tsx'
import { FileTitle } from '../src/client/FileTitle.tsx'
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
  const workspaceFiles = { list: vi.fn(), read: vi.fn(), write: vi.fn() }
  const sidebarRight = { openResource: vi.fn() }
  ctx.provide('sidebarRightTabs', tabs as never)
  ctx.provide('sidebarRight', sidebarRight as never)
  ctx.provide('slots', slots as never)
  ctx.provide('locale', locale as never)
  ctx.provide('remote', { workspaceFiles } as never)
  ctx.provide('remote.workspaceFiles', workspaceFiles as never)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { tabs, registered, dictionaries, fiber }
}

describe('ui-sidebar-files apply', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('registers the type, its dictionaries, and the body and title seats under the type\'s id', async () => {
    const { tabs, registered, dictionaries } = await boot()
    const definition = tabs.get(FILES_KIND)
    expect(definition?.id).toBe(FILES_ID)
    expect(definition?.priority).toBe('builtin')
    expect(definition?.title('sidebar://files')).toBe('type.label')
    expect(definition?.guide?.map(entry => [entry.order, entry.title(), entry.description?.()]))
      .toEqual([[10, 'guide.title', 'guide.description']])
    expect(dictionaries.get('sidebarFiles')).toEqual({ zh, en })
    // The seat key is the implementation's id, not the kind: an extension may
    // take the kind over, and the seat must still find this body.
    expect(registered.map(entry => [entry.name, entry.key, entry.locale, entry.component])).toEqual([
      ['sidebar.right.pane.tab', FILES_ID, 'sidebarFiles', FilesBody],
      ['sidebar.right.pane.tab.title', FILES_ID, undefined, FilesTitle],
      ['sidebar.right.pane.tab', FILE_ID, 'sidebarFiles', FileBody],
      ['sidebar.right.pane.tab.title', FILE_ID, undefined, FileTitle],
    ])
    expect(registered[0]?.store).toBeDefined()
    expect(typeof registered[0]?.inject).toBe('function')
    // The editor's seats share the files page's store instance: one bucket
    // namespace per tab id, both kinds read the same slice shape.
    expect(registered[2]?.store).toBe(registered[0]?.store)
    expect(typeof registered[2]?.inject).toBe('function')
    // The composed face is the tree face and the editor face in one object.
    const storeInstance = (registered[2]?.store as { create(): { actions: object } }).create()
    const face = (registered[2]?.inject as (sessionId: string, actions: object) => Record<string, unknown>)(
      's-1', storeInstance.actions,
    )
    expect(Object.keys(face).sort()).toEqual([
      'load', 'openPreview', 'readFile', 'saveFile', 'start', 'toggle',
    ])
    const file = tabs.get(FILE_KIND)
    expect(file?.id).toBe(FILE_ID)
    expect(file?.title('qilin-resource://file/session/s-1/x/a.ts')).toBe('a.ts')
    expect(file?.label()).toBe('file.type.label')
  })

  it('binds the read and write adapters to the Remote face unchanged', async () => {
    const { createReadPage, createWriteFile } = await import('../src/client/index.ts')
    const signal = new AbortController().signal
    const read = vi.fn()
    const page = createReadPage({ workspaceFiles: { read: read as never } })
    void page('s-1' as never, 'a.ts', 1, signal)
    expect(read).toHaveBeenCalledWith('s-1', 'a.ts', { offset: 1 }, signal)
    const write = vi.fn()
    const save = createWriteFile({ workspaceFiles: { write: write as never } })
    void save('s-1' as never, 'a.ts', 'text', { baseVersion: 'v1' }, signal)
    expect(write).toHaveBeenCalledWith('s-1', 'a.ts', 'text', { baseVersion: 'v1' }, signal)
  })

  it('takes every registration back when the plugin is disposed', async () => {
    const { tabs, registered, dictionaries, fiber } = await boot()
    await fiber.dispose()
    expect(tabs.get(FILES_KIND)).toBeUndefined()
    expect(tabs.get(FILE_KIND)).toBeUndefined()
    expect(registered).toEqual([])
    expect(dictionaries.size).toBe(0)
  })
})
