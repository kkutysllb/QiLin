// @vitest-environment jsdom
import { Context, Service } from '@qilin-agent/kylin'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { LocaleRuntime } from '@qilin-agent/client-locale/client'
import { SlotRegistry } from '@qilin-agent/client-ui-renderer/client'
import { resolveSlotLabel } from '@qilin-agent/client-ui-slots'
import { TestRemote, usePinnedBrowserLanguages } from '@qilin-agent/client-test-runtime'
import { createSnapshotStore } from '@qilin-agent/client-store'
import { apply, inject, NS, PANEL_ID, TAB_ID } from '../src/client/index.ts'
import { PluginManagerPage } from '../src/client/PluginManagerPage.tsx'
import { PluginsPanelIcon } from '../src/client/PluginsPanelIcon.tsx'
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
  // The workbench tag the audience presentation gate reads.
  ctx.provide('workbench', {
    state: createSnapshotStore({ active: 'general', presets: { general: 'standard', coding: 'ptc' } }),
  })
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
      'main': { kind: 'keyed', scope: 'root' },
      'sidebar.panellist': { kind: 'list', scope: 'root' },
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
      'workbench',
    ])
  })

  it('registers the management tab, arms the boot read for the audience gate, and follows Host changes', async () => {
    const b = await bench()
    declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    const entry = b.slots.entries('settings.plugins.tab')[0]!
    expect(entry.component).toBe(PluginManagerPage)
    expect(entry.options).toMatchObject({ id: TAB_ID, order: 5 })
    expect(entry.locale).toBe(NS)
    // The Settings Plugins section renders the tab label.
    expect(resolveSlotLabel(entry.options.label)).toBe('插件管理')
    // The page declares the slots a plugin's configuration arrives through, and binds their projection beside its state.
    expect(b.slots.spec('plugins.item')).toMatchObject({ kind: 'list', scope: 'root' })
    expect(b.slots.spec('plugins.bundle.config')).toMatchObject({ kind: 'keyed', scope: 'root' })
    expect(b.slots.spec('plugins.row.config')).toMatchObject({ kind: 'keyed', scope: 'root' })
    const face = (entry.inject as unknown as () => PluginManagerFace)()
    expect(face.hooks.configLedger.getSnapshot()).toEqual({ items: [], bundles: new Set(), rows: new Set() })
    // The boot read arms the audience gate before the page is ever opened.
    await vi.waitFor(() => { expect(face.hooks.pluginManager.getSnapshot().status).toBe('ready') })
    expect(b.list).toHaveBeenCalledTimes(1)
    // A Host change and a reconnect each read again.
    b.remote.emit('plugin-manager/changed', [{ reason: 'bundle' }])
    await vi.waitFor(() => { expect(b.list).toHaveBeenCalledTimes(2) })
    b.ctx.emit('connection/reset')
    await vi.waitFor(() => { expect(b.list).toHaveBeenCalledTimes(3) })
    // Rendering the page adds no read while the cache is fresh.
    face.ensure()
    await Promise.resolve()
    expect(b.list).toHaveBeenCalledTimes(3)

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

  it('pins the sidebar entry first and opens the same page as a main panel', async () => {
    const b = await bench()
    declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    // First row of the panel list, under the new-session button.
    const row = b.slots.entries('sidebar.panellist')[0]!
    expect(row.options).toMatchObject({ id: PANEL_ID, order: 0 })
    expect(resolveSlotLabel(row.options.label)).toBe('插件管理')
    expect(row.component).toBe(PluginsPanelIcon)

    // The main panel renders the same page component, and both seats read one
    // controller face — the Settings 管理 tab is this panel's mirror.
    const panel = b.slots.entries('main').find(seat => seat.options.key === PANEL_ID)
    expect(panel?.component).toBe(PluginManagerPage)
    const tabFace = (b.slots.entries('settings.plugins.tab')[0]!.inject as unknown as () => PluginManagerFace)()
    const panelFace = (panel!.inject as unknown as () => PluginManagerFace)()
    expect(panelFace.hooks.pluginManager).toBe(tabFace.hooks.pluginManager)
    // The page's configuration slots are declared on the panel seat too.
    expect(b.slots.spec('plugins.item')).toMatchObject({ kind: 'list', scope: 'root' })

    await fiber.dispose()
    expect(b.slots.entries('sidebar.panellist')).toHaveLength(0)
    expect(b.slots.entries('main')).toHaveLength(0)
  })
})
