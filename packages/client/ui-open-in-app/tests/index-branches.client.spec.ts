// @vitest-environment jsdom
/** Plugin-body coverage: the context menu icon catalog, the files-seat action, and the shortcut label. */
import { Context } from '@qilin-agent/kylin'
import { SlotRegistry } from '@qilin-agent/client-ui-renderer/client'
import { LocaleRuntime } from '@qilin-agent/client-locale/client'
import { createSnapshotStore } from '@qilin-agent/client-store'
import { OPEN_IN_APP_ICON_PREFIX_ROUTE } from '@qilin-agent/host-open-in-app/shared'
import { afterEach, expect, it, vi } from 'vitest'
import { apply, inject } from '../src/client/index.ts'
import { OpenInAppAction } from '../src/client/OpenInAppAction.tsx'

afterEach(() => { vi.restoreAllMocks() })

interface RegisteredCommand {
  readonly label: () => string
}

async function bench() {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'contextMenu.icon': { kind: 'keyed', scope: 'root', inline: true },
      'sidebar.right.tab.files.actions': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
  const commands: RegisteredCommand[] = []
  ctx.provide('shortcuts', {
    register: (command: RegisteredCommand) => { commands.push(command); return () => { commands.splice(commands.indexOf(command), 1) } },
  } as never)
  const contributions: unknown[] = []
  ctx.provide('contextMenus', {
    register: (contribution: unknown) => {
      contributions.push(contribution)
      return () => { contributions.splice(contributions.indexOf(contribution), 1) }
    },
    notify: vi.fn(),
  } as never)
  ctx.provide('layout', {
    panelInfo: createSnapshotStore({ activePanelId: null }),
  } as never)
  ctx.provide('sessions', {
    list: createSnapshotStore({
      ids: [], byId: {}, current: undefined, phase: 'ready' as const, projectionsBySession: {},
    }),
  } as never)
  const remote = { session: {} }
  ctx.provide('remote', remote as never)
  ctx.provide('remote.session', remote.session as never)
  const locale = new LocaleRuntime(ctx)
  locale.setLocale('en')
  ctx.provide('locale', locale)
  const fiber = ctx.plugin({ inject, apply })
  await fiber.await()
  return { ctx, fiber, commands, contributions, locale }
}

it('registers the action icons, the files-seat opener, and the localized shortcut label', async () => {
  const b = await bench()
  try {
    // Every contributed action resolves through the shared keyed icon slot.
    expect(b.ctx.slots.entries('contextMenu.icon').map(entry => entry.options.key)).toEqual([
      'open-in-app.reveal', 'open-in-app.copy', 'open-in-app.external', 'open-in-app.application',
    ])
    // The file tree's reload-adjacent seat renders the same split button.
    const [files] = b.ctx.slots.entries('sidebar.right.tab.files.actions')
    expect(files?.component).toBe(OpenInAppAction)
    const injected = (files?.inject as () => {
      hooks: Record<string, unknown>
      launch: (appId: string, path: string) => unknown
      choose: (appId: string) => void
      iconUrl: (appId: string) => string
    })()
    expect(Object.keys(injected.hooks).sort()).toEqual(['openInAppApps', 'openInAppChoice'])
    expect(injected.iconUrl('cursor')).toBe(`${OPEN_IN_APP_ICON_PREFIX_ROUTE}/cursor`)

    // The command's label reads the dictionary the plugin registered on mount.
    const [command] = b.commands
    expect(command?.label()).toBe('Open locally')
    expect(b.contributions).toHaveLength(4)
  } finally { await b.fiber.dispose() }
})

it('withdraws the icon and action registrations with the plugin fiber', async () => {
  const b = await bench()
  await b.fiber.dispose()
  expect(b.ctx.slots.entries('contextMenu.icon')).toEqual([])
  expect(b.ctx.slots.entries('sidebar.right.tab.files.actions')).toEqual([])
  expect(b.commands).toEqual([])
  expect(b.contributions).toEqual([])
})
