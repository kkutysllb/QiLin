// @vitest-environment jsdom
/**
 * The shell entry's own wiring: the reveal channel behind ctx.settingsShell,
 * the open-shortcut command, the shared shell store, the injected row faces,
 * and the loopback-gated settings-document action.
 */
import { Context } from '@qilin-agent/kylin'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@qilin-agent/client-ui-renderer/client'
import { LocaleRuntime } from '@qilin-agent/client-locale/client'
import { TestRemote } from '@qilin-agent/client-test-runtime'
import { apply as settingsApply, inject as settingsInject } from '@qilin-agent/client-ui-settings/client'
import { apply, inject } from '../src/client/index.ts'
import { SettingsRoot } from '../src/client/SettingsRoot.tsx'
import { SettingsDocumentAction } from '../src/client/SettingsDocumentAction.tsx'
import { DeveloperToolsRow, type DeveloperToolsRowInjected } from '../src/client/DeveloperToolsRow.tsx'
import type { SettingsRootInjected } from '../src/client/shell-contract.ts'
import type { SettingsDocumentActionInjected } from '../src/client/SettingsDocumentAction.tsx'

afterEach(() => { vi.unstubAllGlobals() })

/** One shortcut command as the registry receives it. */
interface RegisteredCommand {
  readonly id: string
  readonly resolve: (context: { readonly modal: string | null }) => {
    readonly status: string
    readonly run?: () => void
  }
}

async function bench(isLoopback = true) {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('en')
  ctx.provide('locale', locale)
  const remote = new TestRemote(ctx, {
    settings: {
      describe: vi.fn(() => Promise.resolve({
        ok: true as const,
        value: { writable: true, hasDocument: true, namespaces: [] },
      })),
      openSettingsDocument: vi.fn(() => Promise.resolve({ ok: true as const, value: { opened: true as const } })),
    },
  })
  remote.$host = { home: undefined, isLoopback }
  ctx.provide('connection', {
    state: { getSnapshot: () => 'connected', subscribe: () => () => {} },
    reconnect: () => {},
  } as never)
  const commands: RegisteredCommand[] = []
  ctx.provide('shortcuts', {
    register: (command: RegisteredCommand) => { commands.push(command); return () => {} },
    registerFixed: () => () => {},
    observeFixedInput: () => () => {},
    catalog: { getSnapshot: () => [], subscribe: () => () => {} },
  } as never)
  ctx.provide('modules', {
    entries: {
      dismissRelease: () => {},
      releaseChange: { getSnapshot: () => undefined, subscribe: () => () => {} },
    },
  } as never)
  await ctx.plugin({ inject: [...settingsInject], apply: settingsApply }).await()
  const slots = ctx.get('slots') as SlotRegistry
  // Only the sidebar hole is declared here: the shell occupant declares its
  // own children, the way ui-sidebar owns the hole in the assembled app.
  slots.register({
    name: 'root',
    children: { 'sidebar.settings': { kind: 'single', scope: 'root' } },
  } as never, () => null)
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, slots, commands, fiber }
}

/** The shell occupant's injected face. */
function shellFace(slots: SlotRegistry): SettingsRootInjected {
  const entry = slots.entries('sidebar.settings')[0]
  if (entry?.inject === undefined) throw new Error('the settings shell did not take the sidebar hole')
  return (entry.inject as () => SettingsRootInjected)()
}

describe('settings shell entry wiring', () => {
  it('occupies the sidebar hole through the shared one-instance shell store', async () => {
    const b = await bench()
    const entry = b.slots.entries('sidebar.settings')[0]
    expect(entry?.component).toBe(SettingsRoot)
    const store = entry?.store as { create(): { getSnapshot(): unknown } }
    // The registration hands every render the same instance, so the panel's
    // viewing state survives the slot tree re-rendering around it.
    expect(store.create()).toBe(store.create())
    await b.fiber.dispose()
  })

  it('routes ctx.settingsShell.open to the mounted occupant and drops an unclaimed call', async () => {
    const b = await bench()
    const shell = b.ctx.get('settingsShell') as { open(sectionId?: string): void }
    const injected = shellFace(b.slots)
    const reveals: (string | undefined)[] = []
    const release = injected.registerOpen((sectionId) => { reveals.push(sectionId) })

    shell.open('models')
    shell.open()
    expect(reveals).toEqual(['models', undefined])

    // The occupant leaving unclaims the channel instead of holding a dead handler.
    release()
    shell.open('usage')
    expect(reveals).toEqual(['models', undefined])
    await b.fiber.dispose()
  })

  it('opens the settings panel from its command, and closes the top modal when Settings is one', async () => {
    const b = await bench()
    const command = b.commands.find(candidate => candidate.id === 'settings.open')
    if (command === undefined) throw new Error('the settings command was not registered')

    // Another modal owns the page: the command is blocked rather than stacked.
    expect(command.resolve({ modal: 'picker' })).toEqual({ status: 'blocked', reason: 'modal' })

    const entry = b.slots.entries('sidebar.settings')[0]
    const store = entry?.store as { create(): { getSnapshot(): { open: boolean } } }
    const instance = store.create()
    command.resolve({ modal: null }).run?.()
    expect(instance.getSnapshot().open).toBe(true)

    // With Settings itself on top, the command is the close gesture.
    const close = command.resolve({ modal: 'settings' })
    expect(close.status).toBe('handled')
    expect(() => { close.run?.() }).not.toThrow()
    await b.fiber.dispose()
  })

  it('injects the shared cursor-tools preference into the General row', async () => {
    const b = await bench()
    const entry = b.slots.entries('settings.general.item').find(row => row.options.id === 'developer-tools')
    if (entry?.inject === undefined) throw new Error('the developer-tools row was not registered')
    expect(entry.component).toBe(DeveloperToolsRow)

    const face = (entry.inject as unknown as () => DeveloperToolsRowInjected)()
    expect(face.hooks.developerTools).toBe(b.ctx.configForms.developerTools.enabled)
    const setEnabled = vi.spyOn(b.ctx.configForms.developerTools, 'setEnabled').mockResolvedValue(undefined)
    await face.setEnabled(true)
    expect(setEnabled).toHaveBeenCalledWith(true)
    setEnabled.mockRestore()
    await b.fiber.dispose()
  })

  it('seats the settings-document action only on a loopback host', async () => {
    const loopback = await bench(true)
    const entry = loopback.slots.entries('settings.action').find(row => row.options.id === 'open-document')
    if (entry?.inject === undefined) throw new Error('the document action was not registered')
    expect(entry.component).toBe(SettingsDocumentAction)
    const face = (entry.inject as unknown as () => SettingsDocumentActionInjected)()
    expect(face.hooks.snapshot).toBe(face.controller.store)
    await loopback.fiber.dispose()

    // A remote browser has no Host document to open, so the seat stays empty.
    const remote = await bench(false)
    expect(remote.slots.entries('settings.action').filter(row => row.options.id === 'open-document')).toEqual([])
    await remote.fiber.dispose()
  })
})
