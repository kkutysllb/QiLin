// @vitest-environment jsdom
import assert from 'node:assert/strict'
import { Context, Service } from '@qilin-agent/kylin'
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { LocaleRuntime } from '@qilin-agent/client-locale/client'
import { SlotRegistry } from '@qilin-agent/client-ui-renderer/client'
import { resolveSlotLabel } from '@qilin-agent/client-ui-slots'
import { TestRemote, usePinnedBrowserLanguages } from '@qilin-agent/client-test-runtime'
import * as settings from '@qilin-agent/client-ui-settings/client'
import { apply, inject, NS, PANEL_ID } from '../src/client/index.ts'
import { PluginManagerPage } from '../src/client/PluginManagerPage.tsx'
import { PluginRefreshToast, type PluginRefreshToastFace } from '../src/client/PluginRefreshToast.tsx'
import type { PluginManagerFace } from '../src/client/manager-store.ts'

usePinnedBrowserLanguages('zh-CN')
beforeEach(() => { localStorage.clear() })
afterEach(cleanup)

async function bench() {
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  class LocaleHolder extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'localeHolder')
    }
  }
  new LocaleHolder(ctx)
  // The settings shell owns the panel; this plugin only asks it to reveal the Plugins section.
  const openSettings = vi.fn<(sectionId?: string) => void>()
  ctx.provide('settingsShell', { open: openSettings })
  const list = vi.fn(() => Promise.resolve({ ok: true as const, value: { entries: [], managementAvailable: true } }))
  const remote = new TestRemote(ctx, {
    settings: { describe: vi.fn(async () => ({ ok: true as const, value: { writable: true, hasDocument: true, namespaces: [] } })) },
    pluginInventory: { list },
    pluginRegistryProbe: { fastest: vi.fn(async () => ({ ok: true as const, value: null })) },
    pluginManager: {
      listBundles: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
      listPlugins: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
      registries: vi.fn(() => Promise.resolve({ ok: true as const, value: { registry: null, fallbackRegistries: [], resolved: null } })),
    },
  })
  await ctx.plugin(settings).await()
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, list, remote, openSettings }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: {
      'settings.section': { kind: 'list', scope: 'root' },
      'shell.overlay': { kind: 'list', scope: 'root' },
    },
  } as never, () => null)
}

describe('ui-plugin-manager browser plugin', () => {
  it('opens the settings section on its list or one bundle and releases its navigation provider with the registration', async () => {
    const b = await bench()
    const removeRoot = declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const entry = b.slots.entries('settings.section')[0]!
    assert(entry.store && 'create' in entry.store)
    const navigation = entry.store.create()
    expect(navigation.getSnapshot()).toEqual({ tab: 'installed', view: { kind: 'list' } })
    b.ctx.pluginNavigation.openBundle('dsh-navigation-test')
    expect(b.openSettings).toHaveBeenLastCalledWith(PANEL_ID)
    expect(navigation.getSnapshot()).toEqual({ tab: 'installed', view: { kind: 'package', name: 'dsh-navigation-test' } })
    b.ctx.pluginNavigation.openList()
    expect(b.openSettings).toHaveBeenLastCalledWith(PANEL_ID)
    expect(navigation.getSnapshot()).toEqual({ tab: 'installed', view: { kind: 'list' } })
    removeRoot()
    // A removed shell leaves the navigation call harmless: the view still moves,
    // so a later open shows the requested place.
    b.ctx.pluginNavigation.openBundle('dsh-navigation-test')
    expect(navigation.getSnapshot()).toEqual({ tab: 'installed', view: { kind: 'package', name: 'dsh-navigation-test' } })
  })

  it('shares refresh failures with the overlay after navigation and releases both registrations across reloads', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('shell.overlay')).toHaveLength(0)
    const removeRoot = declare(b.slots)
    const pageInjected: object = b.slots.entries('settings.section')[0]!.inject!()
    const face = pageInjected as PluginManagerFace
    const overlayInjected: object = b.slots.entries('shell.overlay')[0]!.inject!()
    const overlay = overlayInjected as PluginRefreshToastFace
    expect(overlay.hooks.pluginManager).toBe(face.hooks.pluginManager)
    face.ensure()
    await vi.waitFor(() => { expect(face.hooks.pluginManager.getSnapshot().status).toBe('ready') })
    b.list.mockRejectedValueOnce(new Error('offline'))
    face.refresh()
    await vi.waitFor(() => { expect(overlay.hooks.pluginManager.getSnapshot().notice?.kind).toBe('refresh-failed') })
    overlay.dismissNotice()
    expect(face.hooks.pluginManager.getSnapshot().notice).toBeNull()
    removeRoot()
    expect(b.slots.entries('shell.overlay')).toHaveLength(0)
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    declare(b.slots)
    const remountedInjected: object = b.slots.entries('shell.overlay')[0]!.inject!()
    expect((remountedInjected as PluginRefreshToastFace).hooks.pluginManager).toBe(face.hooks.pluginManager)
    await fiber.dispose()
    expect(b.slots.entries('shell.overlay')).toHaveLength(0)
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const reloadedInjected: object = b.slots.entries('shell.overlay')[0]!.inject!()
    expect((reloadedInjected as PluginRefreshToastFace).hooks.pluginManager).not.toBe(face.hooks.pluginManager)
    expect((reloadedInjected as PluginRefreshToastFace).hooks.pluginManager.getSnapshot().notice).toBeNull()
  })

  it('declares only the services the page and its Remote methods use', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.pluginManager', 'remote.pluginInventory', 'remote.pluginRegistryProbe', 'configForms'])
  })

  it('registers the settings section and its page, which reads the Host only once rendered and follows Host changes', async () => {
    const b = await bench()
    declare(b.slots)
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()

    b.ctx.pluginNavigation.openBundle('dsh-navigation-test')
    expect(b.openSettings).toHaveBeenLastCalledWith(PANEL_ID)
    const entry = b.slots.entries('settings.section')[0]!
    assert(entry.store && 'create' in entry.store)
    expect(entry.store.create().getSnapshot()).toEqual({ tab: 'installed', view: { kind: 'package', name: 'dsh-navigation-test' } })
    expect(entry.component).toBe(PluginManagerPage)
    // The nav row names the section with the page's own title and keeps its order.
    expect(entry.options).toMatchObject({ id: PANEL_ID, order: 15 })
    expect(entry.locale).toBe(NS)
    expect(resolveSlotLabel(entry.options.label)).toBe('插件')
    // The page declares the slots a plugin's configuration arrives through, and binds their projection beside its state.
    expect(b.slots.spec('plugins.add.actions')).toMatchObject({ kind: 'list', scope: 'root' })
    expect(b.slots.spec('plugins.item')).toMatchObject({ kind: 'list', scope: 'root' })
    expect(b.slots.spec('plugins.bundle.config')).toMatchObject({ kind: 'keyed', scope: 'root' })
    for (const name of ['plugins.detail.actions', 'plugins.detail.badge', 'plugins.detail.section'] as const) {
      expect(b.slots.spec(name)).toMatchObject({ kind: 'list', scope: 'root' })
    }
    const injected: object = entry.inject!()
    const face = injected as PluginManagerFace
    const overlay = b.slots.entries('shell.overlay')[0]!
    expect(overlay.component).toBe(PluginRefreshToast)
    expect(overlay.options).toMatchObject({ id: 'plugin-manager.refresh-toast' })
    expect(overlay.locale).toBe(NS)
    const overlayInjected: object = overlay.inject!()
    const overlayFace = overlayInjected as PluginRefreshToastFace
    expect(overlayFace.hooks.pluginManager).toBe(face.hooks.pluginManager)
    expect(overlayFace.dismissNotice).toBe(face.dismissNotice)
    expect(Object.keys(overlayFace).sort()).toEqual(['dismissNotice', 'hooks'])
    expect(Object.keys(overlayFace.hooks)).toEqual(['pluginManager'])
    const text = { en: 'Local tools', zh: '本地工具' }
    expect(face.resolveText(text)).toBe('本地工具')
    b.locale.setLocale('en')
    expect(face.resolveText(text)).toBe('Local tools')
    b.locale.setLocale('zh')
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
    // An update step of another request leaves the page's own update state alone.
    b.remote.emit('plugin-manager/update-state', [{ requestId: 'foreign', step: 'checking' }])
    expect(face.hooks.pluginManager.getSnapshot().install.runs).toEqual([])
    expect(face.hooks.pluginManager.getSnapshot().update).toBeNull()

    // Another plugin's navigation reveals the settings section on its list or on one bundle.
    const navigation = b.ctx.get('pluginNavigation') as {
      openList: () => void
      openBundle: (name: string) => void
    }
    navigation.openList()
    expect(b.openSettings).toHaveBeenLastCalledWith(PANEL_ID)
    expect(face.hooks.pluginManager.getSnapshot().status).toBe('ready')
    navigation.openBundle('dsh-better-sidebar')
    expect(b.openSettings).toHaveBeenLastCalledWith(PANEL_ID)

    await fiber.dispose()
    expect(b.ctx.get('pluginNavigation')).toBeUndefined()
    expect(b.slots.entries('settings.section')).toHaveLength(0)
    expect(b.slots.entries('shell.overlay')).toHaveLength(0)
    b.remote.emit('plugin-manager/changed', [{ reason: 'install' }])
    await Promise.resolve()
    expect(b.list).toHaveBeenCalledTimes(3)
  })
})
