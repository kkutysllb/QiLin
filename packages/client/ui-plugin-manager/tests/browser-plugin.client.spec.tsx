// @vitest-environment jsdom
import { Context, Service } from '@qilin/kylin'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { LocaleRuntime } from '@qilin/client-locale/client'
import { SlotRegistry } from '@qilin/client-ui-renderer/client'
import { resolveSlotLabel } from '@qilin/client-ui-slots'
import { TestRemote, usePinnedBrowserLanguages } from '@qilin/client-test-runtime'
import { apply, inject, NS, TAB_ID } from '../src/client/index.ts'
import { PluginManagerPage } from '../src/client/PluginManagerPage.tsx'
import type { PluginManagerFace } from '../src/client/manager-store.ts'

usePinnedBrowserLanguages('zh-CN')
afterEach(cleanup)

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  class LocaleHolder extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'localeHolder')
    }
  }
  new LocaleHolder(ctx)
  // The shared configuration forms the page hands a contributed page; nothing is served here.
  ctx.provide('configForms', {
    describe: () => ({ getSnapshot: () => ({ view: undefined }), subscribe: () => () => {} }),
    get: () => ({
      getSnapshot: () => ({ status: 'unavailable', value: undefined, base: undefined, user: undefined, revision: undefined, writable: false, mode: 'host' }),
      mutate: () => Promise.resolve(false),
    }),
  })
  const list = vi.fn(() => Promise.resolve({ ok: true as const, value: { entries: [], managementAvailable: true } }))
  const fastest = vi.fn(() => Promise.resolve({ ok: true as const, value: null }))
  const remote = new TestRemote(ctx, {
    pluginInventory: { list },
    pluginManager: {
      listBundles: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
      listPlugins: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
      registries: vi.fn(() => Promise.resolve({ ok: true as const, value: { registry: null, fallbackRegistries: [], resolved: 'https://registry.npmjs.org/' } })),
    },
    pluginRegistryProbe: { fastest },
  })
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, list, fastest, remote }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'settings.plugins.tab': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
}

describe('ui-plugin-manager browser plugin', () => {
  it('routes pluginNavigation through the settings shell and the mounted page reveal', async () => {
    const b = await bench()
    const openSection = vi.fn()
    b.ctx.provide('settingsShell', { open: openSection })
    declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    const entry = b.slots.entries('settings.plugins.tab')[0]!
    // The tab's inject face hands the page's reveal registration to the channel.
    const face = (entry.inject as unknown as () => PluginManagerFace)()
    expect(face.registerOpen).toBeTypeOf('function')
    const reveal = vi.fn()
    const unregister = face.registerOpen!(reveal)
    // The channel opens the Plugins section, then the mounted page's reveal.
    b.ctx.pluginNavigation.openBundle('qilin-navigation-test')
    expect(openSection).toHaveBeenCalledWith('plugins')
    expect(reveal).toHaveBeenCalledWith('qilin-navigation-test')
    // Disposal of the registration detaches exactly that handler.
    unregister()
    b.ctx.pluginNavigation.openBundle('qilin-navigation-test')
    expect(reveal).toHaveBeenCalledOnce()
    // A second registration replaces the first: the first's disposer must not withdraw the live one.
    const replacement = vi.fn()
    const unregisterSecond = face.registerOpen!(replacement)
    unregister()
    b.ctx.pluginNavigation.openBundle('qilin-navigation-test')
    expect(replacement).toHaveBeenCalledWith('qilin-navigation-test')
    unregisterSecond()
    // Unmounting the tab withdraws the whole channel.
    await fiber.dispose()
    expect(b.ctx.get('pluginNavigation')).toBeUndefined()
  })

  it('declares only the services the page, its Remote methods, and the shared configuration forms use', () => {
    expect(inject).toEqual([
      'slots', 'locale', 'remote', 'remote.pluginManager', 'remote.pluginInventory', 'remote.pluginRegistryProbe', 'configForms',
    ])
  })

  it('registers the management tab, which reads the Host only once rendered and follows Host changes', async () => {
    const b = await bench()
    declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    const entry = b.slots.entries('settings.plugins.tab')[0]!
    expect(entry.component).toBe(PluginManagerPage)
    expect(entry.options).toMatchObject({ id: TAB_ID, order: 5 })
    expect(entry.locale).toBe(NS)
    // The Settings Plugins section renders the tab label; the page itself owns no sidebar entry.
    expect(resolveSlotLabel(entry.options.label)).toBe('插件管理')
    // The page declares the slots a plugin's configuration arrives through, and binds their projection beside its state.
    expect(b.slots.spec('plugins.item')).toMatchObject({ kind: 'list', scope: 'root' })
    expect(b.slots.spec('plugins.bundle.config')).toMatchObject({ kind: 'keyed', scope: 'root' })
    expect(b.slots.spec('plugins.row.config')).toMatchObject({ kind: 'keyed', scope: 'root' })
    const face = (entry.inject as unknown as () => PluginManagerFace)()
    expect(face.hooks.configLedger.getSnapshot()).toEqual({ items: [], bundles: new Set(), rows: new Set() })
    // A Host change before the first render is not a reason to read.
    b.remote.emit('plugin-manager/changed', [{ reason: 'install' }])
    b.ctx.emit('connection/reset')
    await Promise.resolve()
    expect(b.list).not.toHaveBeenCalled()
    face.ensure()
    await vi.waitFor(() => { expect(face.hooks.pluginManager.getSnapshot().status).toBe('ready') })
    expect(b.list).toHaveBeenCalledTimes(1)
    b.remote.emit('plugin-manager/changed', [{ reason: 'bundle' }])
    await vi.waitFor(() => { expect(b.list).toHaveBeenCalledTimes(2) })
    b.ctx.emit('connection/reset')
    await vi.waitFor(() => { expect(b.list).toHaveBeenCalledTimes(3) })

    // Install output folds into an open run only.
    face.openInstall()
    face.editInstallSpec('pkg')
    b.remote.emit('plugin-manager/install-log', [{ jobId: 'j', argv: ['pnpm', 'add', 'pkg'], cwd: '/p', stream: 'stdout', text: 'early' }])
    b.remote.emit('plugin-manager/install-state', [{ requestId: 'foreign', phase: 'installing' }])
    expect(face.hooks.pluginManager.getSnapshot().install.runs).toEqual([])

    await fiber.dispose()
    expect(b.slots.entries('settings.plugins.tab')).toHaveLength(0)
    b.remote.emit('plugin-manager/changed', [{ reason: 'install' }])
    await Promise.resolve()
    expect(b.list).toHaveBeenCalledTimes(3)
  })
})
