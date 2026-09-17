import { Context, Service } from '@qilin/kylin'
import { describe, expect, it, vi } from 'vitest'
import { LocaleRuntime } from '@qilin/client-locale/client'
import { SlotRegistry } from '@qilin/client-ui-renderer/client'
import { resolveSlotLabel } from '@qilin/client-ui-slots'
import { apply, inject, NS } from '../src/client/index.ts'
import { apply as hostApply } from '../src/index.ts'
import { en } from '../src/client/locales.ts'

/** Fake `remote.skills` namespace: the page's only Host edge. */
function skillsRemote() {
  const list = vi.fn(async () => ({ ok: true as const, value: { skills: [] } }))
  return { list }
}

/** Fake `uiWorkspace`: the page reads the main-pane selection from its snapshot. */
function workspaceService(ctx: Context) {
  const store = { getSnapshot: () => ({}), subscribe: () => () => {} }
  class WorkspaceService extends Service {
    readonly selection = store
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'uiWorkspace')
    }
  }
  return new WorkspaceService(ctx)
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.provide('locale', new LocaleRuntime(ctx))
  class RemoteService extends Service {
    constructor(serviceCtx: Context) {
      super(serviceCtx, 'remote')
    }
  }
  await ctx.plugin(RemoteService).await()
  const skills = skillsRemote()
  ctx.provide('remote.skills', skills)
  // Constructing the service registers it; providing it again would double-register.
  workspaceService(ctx)
  const slots = ctx.get('slots') as SlotRegistry
  slots.register(
    { name: 'root', children: { 'settings.section': { kind: 'list', scope: 'root' } } } as never,
    () => null,
  )
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber, slots, skills }
}

describe('ui-settings-skills apply', () => {
  it('keeps the host Loader entry inert', () => {
    expect(hostApply).not.toThrow()
  })

  it('declares only the services the page and its Remote need', () => {
    expect(inject).toEqual(['slots', 'locale', 'remote', 'remote.skills', 'uiWorkspace'])
  })

  it('registers the page under the settings section and removes it with its fiber', async () => {
    const { fiber, slots, skills } = await bench()
    const entry = slots.entries('settings.section')[0]
    expect(entry?.options.id).toBe('skills')
    expect(entry?.options.order).toBe(30)
    expect(resolveSlotLabel(entry!.options.label)).toBe(en.nav)
    expect(NS).toBe('settings.skills')
    const face = (entry as unknown as {
      inject?: () => { controller: unknown; t: (key: keyof typeof en) => string; hooks: { snapshot: unknown; selection: unknown } }
    }).inject?.()
    expect(face?.t('nav')).toBe(en.nav)
    expect(face?.hooks.snapshot).toBe(
      (face?.controller as { store: unknown }).store,
    )
    expect(face?.hooks.selection).toBeDefined()
    // Registering the page reads nothing; the mounted section loads.
    expect(skills.list).not.toHaveBeenCalled()
    await fiber.dispose()
    expect(slots.entries('settings.section')).toHaveLength(0)
  })
})
