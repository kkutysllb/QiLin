/**
 * Browser-half lifecycle over the real SlotRegistry: the dictionary and
 * header-slot registrations with fiber teardown proving removal (HMR safety)
 * and the injected controller face.
 */

import { Context } from '@qilin-agent/kylin'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@qilin-agent/client-ui-renderer/client'
import { LocaleRuntime } from '@qilin-agent/client-locale/client'
import type { StoredEntry } from '@qilin-agent/client-ui-slots'
import type {} from '@qilin-agent/client-ui-conversation/client'
import { apply, inject, type OpenInAppActionInjected } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'
import { OpenInAppAction } from '../src/client/OpenInAppAction.tsx'
import { OpenPathAction, OpenPathEmptyAction, type OpenPathInjected } from '../src/client/OpenPathAction.tsx'
import { en, NS, zh } from '../src/client/locales.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** One shortcut command the plugin registered, as the registry receives it. */
interface RegisteredCommand {
  readonly id: string
  readonly defaults?: Readonly<Record<string, unknown>>
  readonly resolve: () => {
    readonly status: 'blocked' | 'handled'
    readonly reason?: string
    readonly run?: () => void
  }
}

/** One Session row the plugin's page command may target. */
interface SessionRow { readonly cwd?: string; readonly mainView?: number }

/** Boot the browser half over a real slot tree that declares the header list. */
async function bench(over: {
  readonly sessions?: readonly SessionRow[]
  readonly activePanelId?: string | null
} = {}): Promise<{
  ctx: Context
  fiber: ReturnType<Context['plugin']>
  commands: RegisteredCommand[]
}> {
  const ctx = new Context()
  await ctx.plugin(SlotRegistry).await()
  ctx.slots.register({
    name: 'root',
    children: {
      'conversation.session.header.utilities': { kind: 'list', scope: 'session' },
      'sidebar.right.tab.document.actions': { kind: 'list', scope: 'session' },
      'sidebar.right.tab.document.unpreviewable': { kind: 'list', scope: 'session' },
    },
  } as never, () => null)
  // The plugin injects the layout seat and the shortcut registry; the bench supplies
  // the surface each one is read through (panel visibility, command registration).
  const rows = (over.sessions ?? []).map((row, index) => ({
    sessionId: `s-${String(index)}`,
    ...(row.cwd === undefined ? {} : { cwd: row.cwd }),
    retainedBy: row.mainView === undefined ? {} : { mainView: row.mainView },
  }))
  ctx.provide('sessions', {
    list: {
      getSnapshot: () => ({
        ids: rows.map(row => row.sessionId),
        byId: Object.fromEntries(rows.map(row => [row.sessionId, row])),
        phase: 'ready',
        projectionsBySession: {},
      }),
    },
  } as never)
  ctx.provide('layout', {
    panelInfo: { getSnapshot: () => ({ activePanelId: over.activePanelId ?? null }) },
  } as never)
  const commands: RegisteredCommand[] = []
  ctx.provide('shortcuts', {
    register: (command: RegisteredCommand) => { commands.push(command); return () => {} },
    catalog: { getSnapshot: () => [] },
  } as never)
  // The document seats read desktop availability and run gestures over the
  // Session Remote; the bench supplies the namespace each call reaches.
  ctx.provide('remote', { session: sessionRemote } as never)
  ctx.provide('remote.session', sessionRemote as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber, commands }
}

function headerEntryIds(ctx: Context): (string | undefined)[] {
  return ctx.slots.entries('conversation.session.header.utilities').map(entry => entry.options.id)
}

/** The document seats' file-opening face, read from the erased registration inject. */
function openPathFace(entry: StoredEntry | undefined): OpenPathInjected {
  if (entry?.inject === undefined) throw new Error('expected a registered entry')
  const face: unknown = entry.inject()
  return face as OpenPathInjected
}

/** The Session Remote slice the document file controls call; every answer is a healthy Host. */
const sessionRemote = {
  canOpenWorkspacePath: vi.fn(async () => ({ ok: true as const, value: true })),
  openWorkspacePath: vi.fn(async () => ({ ok: true as const, value: { opened: true as const } })),
  workspacePathApplications: vi.fn(async () => ({ ok: true as const, value: [] })),
}

describe('open-in-app browser half', () => {
  it('declares the services it binds', () => {
    expect(inject).toEqual(['sessions', 'slots', 'locale', 'layout', 'shortcuts', 'remote', 'remote.session'])
  })

  it('registers the header split button, and fiber teardown removes it (HMR safety)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ apps: [] }), { status: 200 })))
    const { ctx, fiber } = await bench()
    const entry = ctx.slots.entries('conversation.session.header.utilities')[0]
    expect(entry?.component).toBe(OpenInAppAction)
    expect(entry?.options).toMatchObject({ id: 'open-in-app' })
    await fiber.dispose()
    expect(headerEntryIds(ctx)).not.toContain('open-in-app')
  })

  it('registers both document seats, and fiber teardown removes them (HMR safety)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ apps: [] }), { status: 200 })))
    const { ctx, fiber } = await bench()
    const actions = ctx.slots.entries('sidebar.right.tab.document.actions')[0]
    const unpreviewable = ctx.slots.entries('sidebar.right.tab.document.unpreviewable')[0]
    expect(actions?.component).toBe(OpenPathAction)
    expect(unpreviewable?.component).toBe(OpenPathEmptyAction)
    expect(actions?.options).toMatchObject({ id: 'open-in-app' })

    // One page-lifetime availability read, and one gesture through the Remote.
    const injected = openPathFace(actions)
    expect(injected.hooks.openInAppDesktop.getSnapshot()).toBeNull()
    await injected.loadDesktop()
    expect(injected.hooks.openInAppDesktop.getSnapshot()).toBe(true)
    await expect(injected.applications('/host/work/notes.md', new AbortController().signal))
      .resolves.toEqual([])
    expect(sessionRemote.workspacePathApplications).toHaveBeenCalledWith(
      { path: '/host/work/notes.md' }, expect.any(AbortSignal),
    )
    await expect(injected.openPath('/host/work/notes.md', 'open')).resolves.toBeNull()
    expect(sessionRemote.openWorkspacePath).toHaveBeenCalledWith({ path: '/host/work/notes.md' })

    await fiber.dispose()
    expect(ctx.slots.entries('sidebar.right.tab.document.actions')).toEqual([])
    expect(ctx.slots.entries('sidebar.right.tab.document.unpreviewable')).toEqual([])
  })


  it('registers the workspace command with its platform defaults and runs it on the visible Session', async () => {
    const fetcher = vi.fn(async (input: string | URL, _init?: RequestInit) => String(input) === 'open-in-app/apps'
      ? new Response(JSON.stringify({ apps: ['finder'] }), { status: 200 })
      : new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)
    // The folded Session comes first so the page command skips it for the visible one.
    const { fiber, commands } = await bench({ sessions: [{ cwd: '/w/folded' }, { cwd: '/w/dir', mainView: 1 }] })
    const command = commands.find(candidate => candidate.id === 'workspace.openLocal')
    if (command === undefined) throw new Error('the workspace command was not registered')
    expect(command.defaults).toMatchObject({
      'desktop:macos': { code: 'KeyO', modifiers: ['primary', 'alt'] },
      'web:windows': { code: 'KeyO', modifiers: ['primary', 'shift'] },
    })

    await vi.waitFor(() => { expect(command.resolve().status).toBe('handled') })
    command.resolve().run?.()
    await vi.waitFor(() => {
      expect(fetcher.mock.calls.map(call => call[0])).toContain('open-in-app/open')
    })
    const open = fetcher.mock.calls.find(call => call[0] === 'open-in-app/open')
    expect(open?.[1]).toMatchObject({ body: JSON.stringify({ app: 'finder', path: '/w/dir' }) })
    await fiber.dispose()
  })

  it('blocks the workspace command without a visible Session or without an installed application', async () => {
    const fetcher = vi.fn(async (input: string | URL) => String(input) === 'open-in-app/apps'
      ? new Response(JSON.stringify({ apps: [] }), { status: 200 })
      : new Response(JSON.stringify({ ok: true }), { status: 200 }))
    vi.stubGlobal('fetch', fetcher)

    // An open panel owns the page: the command issues no gesture at all.
    const panel = await bench({ sessions: [{ cwd: '/w/dir', mainView: 1 }], activePanelId: 'workspace' })
    const panelCommand = panel.commands[0]
    expect(panelCommand?.resolve()).toEqual({
      status: 'blocked', reason: panel.ctx.locale.bind(NS)('shortcut.unavailable'),
    })
    await panel.fiber.dispose()

    // No Session is on screen.
    const hidden = await bench({ sessions: [{ cwd: '/w/dir' }] })
    expect(hidden.commands[0]?.resolve()).toMatchObject({ status: 'blocked' })
    await hidden.fiber.dispose()

    // The visible Session has no workspace directory yet.
    const homeless = await bench({ sessions: [{ mainView: 1 }] })
    expect(homeless.commands[0]?.resolve()).toMatchObject({ status: 'blocked' })
    await homeless.fiber.dispose()

    // Nothing is installed on the Host, so there is no application to open.
    const unchosen = await bench({ sessions: [{ cwd: '/w/dir', mainView: 1 }] })
    await vi.waitFor(() => { expect(unchosen.commands[0]?.resolve().status).toBe('blocked') })
    await unchosen.fiber.dispose()
  })

  it('blocks the workspace command while a launch is already in flight', async () => {
    const gate = Promise.withResolvers<Response>()
    const fetcher = vi.fn(async (input: string | URL) => String(input) === 'open-in-app/apps'
      ? new Response(JSON.stringify({ apps: ['finder'] }), { status: 200 })
      : gate.promise)
    vi.stubGlobal('fetch', fetcher)
    const { ctx, fiber, commands } = await bench({ sessions: [{ cwd: '/w/dir', mainView: 1 }] })
    const command = commands[0]
    if (command === undefined) throw new Error('the workspace command was not registered')
    await vi.waitFor(() => { expect(command.resolve().status).toBe('handled') })

    const entry = ctx.slots.entries('conversation.session.header.utilities')[0]
    const injected = (entry?.inject as unknown as () => OpenInAppActionInjected)()
    const launching = injected.launch('finder', '/w/dir')
    expect(command.resolve()).toEqual({
      status: 'blocked', reason: ctx.locale.bind(NS)('shortcut.busy'),
    })

    gate.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    await launching
    await fiber.dispose()
  })

  it('announces a refused launch on the console instead of failing the command', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fetcher = vi.fn(async (input: string | URL) => String(input) === 'open-in-app/apps'
      ? new Response(JSON.stringify({ apps: ['finder'] }), { status: 200 })
      : new Response('', { status: 502 }))
    vi.stubGlobal('fetch', fetcher)
    const { fiber, commands } = await bench({ sessions: [{ cwd: '/w/dir', mainView: 1 }] })
    const command = commands[0]
    if (command === undefined) throw new Error('the workspace command was not registered')
    await vi.waitFor(() => { expect(command.resolve().status).toBe('handled') })

    command.resolve().run?.()
    await vi.waitFor(() => {
      expect(warn).toHaveBeenCalledWith('workspace open rejected:', expect.anything())
    })
    await fiber.dispose()
    warn.mockRestore()
  })

  it('injects the controller face: availability sources, launch carrier, choice, and icon URLs', async () => {
    const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
      void init
      const url = String(input)
      if (url === 'open-in-app/apps') {
        return new Response(JSON.stringify({ apps: ['finder', 'cursor', 7] }), { status: 200 })
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    })
    vi.stubGlobal('fetch', fetcher)
    const { ctx, fiber } = await bench()
    const entry = ctx.slots.entries('conversation.session.header.utilities')[0]
    const injected = (entry?.inject as unknown as () => OpenInAppActionInjected)()

    await vi.waitFor(() => {
      expect(injected.hooks.openInAppApps.getSnapshot()).toEqual(['finder', 'cursor'])
    })
    expect(injected.iconUrl('cursor')).toBe('open-in-app/icon/cursor')

    injected.choose('cursor')
    expect(injected.hooks.openInAppChoice.getSnapshot()).toBe('cursor')

    await injected.launch('cursor', '/w/dir')
    const openCall = fetcher.mock.calls.find(call => call[0] === 'open-in-app/open')
    expect(openCall?.[1]).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ app: 'cursor', path: '/w/dir' }),
    })
    await fiber.dispose()
  })

  it('publishes an empty availability list when the host read fails, and launches reject on HTTP errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      if (String(input) === 'open-in-app/apps') throw new Error('down')
      return new Response('', { status: 502 })
    }))
    const { ctx, fiber } = await bench()
    const entry = ctx.slots.entries('conversation.session.header.utilities')[0]
    const injected = (entry as { inject?: () => unknown } | undefined)?.inject?.() as OpenInAppActionInjected
    await vi.waitFor(() => {
      expect(injected.hooks.openInAppApps.getSnapshot()).toEqual([])
    })
    await expect(injected.launch('finder', '/w/dir')).rejects.toThrow('open failed: HTTP 502')
    await fiber.dispose()
  })

  it('registers both dictionaries under its own namespace and releases them with the fiber', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ apps: [] }), { status: 200 })))
    const { ctx, fiber } = await bench()
    ctx.locale.setLocale('zh')
    const translate = ctx.locale.bind(NS)
    expect(translate('menu.aria')).toBe(zh['menu.aria'])
    ctx.locale.setLocale('en')
    expect(translate('menu.aria')).toBe(en['menu.aria'])
    await fiber.dispose()
    expect(translate('menu.aria')).not.toBe(en['menu.aria'])
  })

  it('keeps the English dictionary key-identical to the Chinese source of truth', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })
})

describe('ui-open-in-app node half', () => {
  it('the node apply is an inert loader seat', () => {
    expect(() => { nodeApply() }).not.toThrow()
  })
})
