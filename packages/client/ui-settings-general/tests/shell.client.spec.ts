// @vitest-environment jsdom
/**
 * Settings shell registration inside the assembled web client: the shell
 * occupies the `sidebar.settings` hole ui-sidebar declares, its ledger
 * projections read the product's real sections, its connection control is the
 * roster's Connection, and it survives a Loader rebuild of the declarer.
 */
import { describe, expect, onTestFinished, vi } from 'vitest'
import type {} from '@qilin/client-ui-renderer/client'
import { createClientTest, type TestClient, webApp } from '@qilin/client-test-runtime/src/assembly/index.ts'
import { inject } from '../src/client/index.ts'
import type { SettingsRootInjected } from '../src/client/shell-contract.ts'
import { SettingsRoot } from '../src/client/SettingsRoot.tsx'
import type { DesktopUpdatePresentation } from '../src/client/desktop-update-bridge.ts'

const SELF = '@qilin/client-ui-settings-general'
const SIDEBAR = '@qilin/client-ui-sidebar'
const it = createClientTest({ roster: webApp })
/** The whole roster's first boot pays the cold module transform of every plugin package. */
const COLD_BOOT_TIMEOUT_MS = 60_000

function injectedOf(c: TestClient): SettingsRootInjected {
  const entry = c.ctx.slots.entries('sidebar.settings')[0]!
  return (entry.inject as () => SettingsRootInjected)()
}

/** The shell's child declarations (chrome, actions, sections, and onboarding overlays). */
const CHILD_SPECS = {
  'settings.trigger': { kind: 'single', scope: 'root' },
  'settings.header': { kind: 'single', scope: 'root' },
  'settings.action': { kind: 'list', scope: 'root' },
  'settings.close': { kind: 'single', scope: 'root' },
  'settings.section': { kind: 'list', scope: 'root' },
  'settings.onboarding': { kind: 'list', scope: 'root' },
} as const
const CHILD_NAMES = Object.keys(CHILD_SPECS) as Array<keyof typeof CHILD_SPECS>

/**
 * Section ids the web-app roster registers: this package (general and about),
 * ui-settings-models, ui-settings-plugins, ui-settings-mcp, ui-settings-skills,
 * ui-agent-preset, ui-settings-unarchive-sessions, and ui-sidebar-right. A
 * plugin adding a section changes this list; mcp/agent-presets share order 20
 * and skills/sidebar-right share order 30, so the projection order within each
 * pair follows registration.
 */
const PRODUCT_SECTIONS: readonly string[] = [
  'general', 'models', 'plugins', 'mcp', 'agent-presets', 'archived-sessions', 'skills',
  'sidebar-right', 'about',
]
/** Onboarding steps the web-app roster registers; ui-settings-models owns the only one. */
const PRODUCT_ONBOARDING: readonly { id: string; order: number }[] = [
  { id: 'deepseek-official', order: 0 },
]

describe('ui-settings-general shell', () => {
  it('shares one carrier subscription between both update locations and releases it on unload', async ({ start }) => {
    const initial = Promise.withResolvers<DesktopUpdatePresentation>()
    let publish: ((state: DesktopUpdatePresentation) => void) | undefined
    const off = vi.fn()
    const subscribe = vi.fn((listener: typeof publish) => { publish = listener; return off })
    const open = vi.fn(async () => {})
    vi.stubGlobal('qilinDesktop', { protocolVersion: 1, updates: { status: () => initial.promise, subscribe, open } })
    onTestFinished(() => { vi.unstubAllGlobals(); initial.resolve({ phase: 'idle' }) })
    const c = await start()
    const row = injectedOf(c)
    const badge = (c.ctx.slots.entries('sidebar.toggle.badge')[0]!.inject as () => Pick<SettingsRootInjected, 'hooks'>)()
    expect(badge.hooks.desktopUpdate).toBe(row.hooks.desktopUpdate)
    expect(subscribe).toHaveBeenCalledOnce()
    const status = { phase: 'available' as const, version: '1.0.1' }
    publish!(status)
    expect(row.hooks.desktopUpdate.getSnapshot().presentation).toEqual(status)
    row.openDesktopUpdate()
    await c.flush()
    expect(open).toHaveBeenCalledOnce()
    await c.unload(SELF)
    await c.flush()
    expect(off).toHaveBeenCalledOnce()
    expect(c.ctx.slots.entries('sidebar.toggle.badge')).toHaveLength(0)
    publish!({ phase: 'error', version: status.version, failure: 'install' })
    expect(row.hooks.desktopUpdate.getSnapshot().presentation).toEqual(status)
  }, COLD_BOOT_TIMEOUT_MS)

  it('declares its services', () => {
    expect(inject).toEqual(['slots', 'locale', 'connection'])
  })

  it('occupies sidebar.settings, declared by ui-sidebar, and declares every child slot', async ({ start }) => {
    const c = await start()
    expect(c.ctx.slots.entries('sidebar.settings').map(entry => entry.component)).toEqual([SettingsRoot])
    for (const name of CHILD_NAMES) expect(c.ctx.slots.spec(name)).toEqual(CHILD_SPECS[name])
  }, COLD_BOOT_TIMEOUT_MS)

  it('projects the section ledger: product sections in order, defaults for bare rows, stable snapshots', async ({ start }) => {
    const c = await start()
    const { sections } = injectedOf(c).hooks
    const product = sections.getSnapshot()
    expect(product.map(row => row.id).sort()).toEqual([...PRODUCT_SECTIONS].sort())
    expect(product[0]).toEqual({ id: 'general', order: 0, label: expect.any(String) as string })
    c.ctx.slots.register({ name: 'settings.section', id: 'z', order: 1_000, label: 'Z' } as never, () => null)
    // No order and no label: both projection defaults apply, and order 0 sorts among the product rows.
    c.ctx.slots.register({ name: 'settings.section', id: 'a' } as never, () => null)
    const rows = sections.getSnapshot()
    expect(rows.find(row => row.id === 'z')).toEqual({ id: 'z', order: 1_000, label: 'Z' })
    expect(rows.find(row => row.id === 'a')).toEqual({ id: 'a', order: 0, label: '' })
    expect(rows.map(row => row.order)).toEqual([...rows.map(row => row.order)].sort((x, y) => x - y))
    // Snapshot identity is stable until the ledger moves (uSES contract).
    expect(sections.getSnapshot()).toBe(rows)
    const listener = vi.fn()
    const off = sections.subscribe(listener)
    c.ctx.slots.register({ name: 'settings.section', id: 'b', order: 1, label: 'B' } as never, () => null)
    await Promise.resolve()
    expect(listener).toHaveBeenCalled()
    expect(sections.getSnapshot()).not.toBe(rows)
    off()
  })

  it('lists only the winner of a shadowed section cell, matching what the content column renders', async ({ start }) => {
    const c = await start()
    const { sections } = injectedOf(c).hooks
    c.ctx.slots.register({ name: 'settings.section', id: 'stock', order: 30, label: 'Stock' } as never, () => null)
    // A replacement registers the same id at a lower priority: its entry wins
    // the cell, so exactly one row remains and it carries the winner's label.
    c.ctx.slots.register({ name: 'settings.section', id: 'stock', order: 40, priority: -1, label: 'Replacement' } as never, () => null)
    const rows = sections.getSnapshot().filter(row => row.id === 'stock')
    expect(rows).toEqual([{ id: 'stock', order: 40, label: 'Replacement' }])
    // Disposing the shadow restores the stock row — replacement is reversible.
    const dispose = c.ctx.slots.register({ name: 'settings.section', id: 'stock', order: 45, priority: -2, label: 'Second' } as never, () => null)
    dispose()
    expect(sections.getSnapshot().filter(row => row.id === 'stock'))
      .toEqual([{ id: 'stock', order: 40, label: 'Replacement' }])
  })

  it('projects the roster Connection control without copying its state; reconnect opens a new $events generation', async ({ start }) => {
    const c = await start()
    const injected = injectedOf(c)
    expect(injected.hooks.connectionState).toBe(c.connection.state)
    expect(injected.hooks.connectionState.getSnapshot()).toBe('connected')
    injected.reconnect()
    await c.mock.streams.opened('$events', 2)
    await vi.waitFor(() => { expect(c.connection.state.getSnapshot()).toBe('connected') })
  })

  it('projects onboarding entries into stable coordinator order', async ({ start }) => {
    const c = await start()
    const { onboardingSteps } = injectedOf(c).hooks
    expect(onboardingSteps.getSnapshot()).toEqual(PRODUCT_ONBOARDING)
    c.ctx.slots.register({ name: 'settings.onboarding', id: 'credential', order: 0 } as never, () => null)
    c.ctx.slots.register({ name: 'settings.onboarding', id: 'welcome', order: -100 } as never, () => null)
    c.ctx.slots.register({ name: 'settings.onboarding', id: 'default-order' } as never, () => null)
    const steps = onboardingSteps.getSnapshot()
    expect(steps.filter(step => !PRODUCT_ONBOARDING.some(known => known.id === step.id))).toEqual([
      { id: 'welcome', order: -100 },
      { id: 'credential', order: 0 },
      { id: 'default-order', order: 0 },
    ])
    expect(onboardingSteps.getSnapshot()).toBe(steps)
    const listener = vi.fn()
    const off = onboardingSteps.subscribe(listener)
    c.ctx.slots.register({ name: 'settings.onboarding', id: 'later', order: 10 } as never, () => null)
    await Promise.resolve()
    expect(listener).toHaveBeenCalledOnce()
    off()
  })

  it('projects onboarding steps from winner cells as well', async ({ start }) => {
    const c = await start()
    const { onboardingSteps } = injectedOf(c).hooks
    c.ctx.slots.register({ name: 'settings.onboarding', id: 'credential', order: 0 } as never, () => null)
    c.ctx.slots.register({ name: 'settings.onboarding', id: 'credential', order: 5, priority: -1 } as never, () => null)
    expect(onboardingSteps.getSnapshot()).toEqual([...PRODUCT_ONBOARDING, { id: 'credential', order: 5 }])
  })

  it('re-registers after the declarer reloads: the cascade removes the shell, the rebuilt declaration takes it back', async ({ start }) => {
    const c = await start()
    const before = c.ctx.slots.entries('sidebar.settings')[0]
    expect(before).toBeDefined()
    await c.reload(SIDEBAR)
    await c.flush()
    expect(c.ctx.slots.entries('sidebar.settings').map(entry => entry.component)).toEqual([SettingsRoot])
    expect(c.ctx.slots.entries('sidebar.settings')[0]).not.toBe(before)
    for (const name of CHILD_NAMES) expect(c.ctx.slots.spec(name)).toEqual(CHILD_SPECS[name])
  })

  it('unregisters the shell and collapses every child slot when its row unloads', async ({ start }) => {
    const c = await start()
    await c.unload(SELF)
    await c.flush()
    expect(c.ctx.slots.entries('sidebar.settings')).toHaveLength(0)
    for (const name of CHILD_NAMES) expect(c.ctx.slots.spec(name)).toBeUndefined()
  })
})
