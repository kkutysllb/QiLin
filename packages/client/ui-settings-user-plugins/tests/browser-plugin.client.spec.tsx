// @vitest-environment jsdom
import { cleanup } from '@testing-library/react'
import { Context, Service } from '@qilin/kylin'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@qilin/client-locale/client'
import { SlotRegistry } from '@qilin/client-ui-renderer/client'
import { resolveSlotLabel } from '@qilin/client-ui-slots'
import { usePinnedBrowserLanguages } from '@qilin/client-test-runtime'
import { apply, inject } from '../src/client/index.ts'
import { UserPluginsSettingsTab } from '../src/client/UserPluginsSettingsTab.tsx'
import type { UserPluginsSettingsTabInjected } from '../src/client/UserPluginsSettingsTab.tsx'
import { apply as hostApply } from '../src/index.ts'

usePinnedBrowserLanguages('zh-CN')
afterEach(cleanup)

const SNAPSHOT = { profile: 'web', entries: [] }
const RECEIPT = { changed: true, restartRequired: true, outputTail: ['added 1 package'] }

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  ctx.provide('locale', locale)
  class RemoteService extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }
  }
  new RemoteService(ctx)
  const pluginManager = {
    list: vi.fn(async () => ({ ok: true, value: SNAPSHOT })),
    checkUpdates: vi.fn(async () => ({ ok: true, value: { entries: [] } })),
    catalog: vi.fn(async () => ({ ok: true, value: { entries: [], page: 1, hasMore: false } })),
    installPlugin: vi.fn(async () => ({ ok: true, value: RECEIPT })),
    updatePlugin: vi.fn(async () => ({ ok: true, value: RECEIPT })),
    uninstallPlugin: vi.fn(async () => ({ ok: true, value: RECEIPT })),
  }
  ctx.provide('remote.pluginManager', pluginManager)
  return { ctx, slots: ctx.get('slots') as SlotRegistry, locale, pluginManager }
}

function declare(slots: SlotRegistry): () => void {
  return slots.register({
    name: 'root',
    children: { 'settings.plugins.tab': { kind: 'list', scope: 'root' } },
  } as never, () => null)
}

describe('ui-settings-user-plugins browser plugin', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares only the services used by the Settings Remote contribution', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.pluginManager'])
  })

  it('registers a localized tab that calls the shipped Remote method names', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()

    const entry = b.slots.entries('settings.plugins.tab')[0]!
    expect(entry.component).toBe(UserPluginsSettingsTab)
    expect(entry.options).toMatchObject({ id: 'user-plugins', order: 20 })
    expect(resolveSlotLabel(entry.options.label)).toBe('用户插件')
    expect(b.pluginManager.list).not.toHaveBeenCalled()

    const injected = (entry.inject as unknown as () => UserPluginsSettingsTabInjected)()
    await expect(injected.list()).resolves.toEqual(SNAPSHOT)
    await expect(injected.install('@example/plugin')).resolves.toEqual(RECEIPT)
    await expect(injected.update('@qilin/coding-sidebar')).resolves.toEqual(RECEIPT)
    await expect(injected.remove('@example/plugin')).resolves.toEqual(RECEIPT)
    await expect(injected.checkUpdates()).resolves.toEqual({ entries: [] })
    await expect(injected.catalog('sidebar', 1)).resolves.toEqual({ entries: [], page: 1, hasMore: false })
    expect(b.pluginManager.installPlugin).toHaveBeenCalledExactlyOnceWith('@example/plugin')
    expect(b.pluginManager.updatePlugin).toHaveBeenCalledExactlyOnceWith('@qilin/coding-sidebar')
    expect(b.pluginManager.uninstallPlugin).toHaveBeenCalledExactlyOnceWith('@example/plugin')
    expect(b.pluginManager.catalog).toHaveBeenCalledExactlyOnceWith('sidebar', 1)

    b.pluginManager.list.mockResolvedValueOnce({ ok: false, error: { code: 'REMOTE_ERROR', message: 'unavailable' } } as never)
    await expect(injected.list()).rejects.toThrow('unavailable')
    await b.ctx.fiber.dispose()
  })

  it('rejects on every Remote failure envelope instead of returning a partial view', async () => {
    const b = await bench()
    declare(b.slots)
    await b.ctx.plugin({ inject: [...inject], apply }).await()
    const injected = (b.slots.entries('settings.plugins.tab')[0]!.inject as unknown as () => UserPluginsSettingsTabInjected)()
    const failure = { ok: false, error: { code: 'REMOTE_ERROR', message: 'unavailable' } } as never
    b.pluginManager.installPlugin.mockResolvedValueOnce(failure)
    b.pluginManager.updatePlugin.mockResolvedValueOnce(failure)
    b.pluginManager.uninstallPlugin.mockResolvedValueOnce(failure)
    b.pluginManager.checkUpdates.mockResolvedValueOnce(failure)
    b.pluginManager.catalog.mockResolvedValueOnce(failure)
    await expect(injected.install('@example/plugin')).rejects.toThrow('unavailable')
    await expect(injected.update('@example/plugin')).rejects.toThrow('unavailable')
    await expect(injected.remove('@example/plugin')).rejects.toThrow('unavailable')
    await expect(injected.checkUpdates()).rejects.toThrow('unavailable')
    await expect(injected.catalog('', 1)).rejects.toThrow('unavailable')
    await b.ctx.fiber.dispose()
  })

  it('follows locale and recovers across late declaration', async () => {
    const b = await bench()
    const fiber = b.ctx.plugin({ inject: [...inject], apply })
    await fiber.await()
    expect(b.slots.entries('settings.plugins.tab')).toHaveLength(0)

    const stop = declare(b.slots)
    await vi.waitFor(() => { expect(b.slots.entries('settings.plugins.tab')).toHaveLength(1) })
    b.locale.setLocale('en')
    expect(resolveSlotLabel(b.slots.entries('settings.plugins.tab')[0]!.options.label)).toBe('User plugins')

    stop()
    expect(b.slots.entries('settings.plugins.tab')).toHaveLength(0)
    declare(b.slots)
    await vi.waitFor(() => {
      expect(b.slots.entries('settings.plugins.tab')[0]?.component).toBe(UserPluginsSettingsTab)
    })

    await fiber.dispose()
    expect(b.slots.entries('settings.plugins.tab')).toHaveLength(0)
    await b.ctx.fiber.dispose()
  })
})
