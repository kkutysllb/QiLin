/**
 * Browser-half lifecycle over the real SlotRegistry: the dictionary and
 * header-slot registrations with fiber teardown proving removal (HMR safety)
 * and the injected controller face.
 */

import { Context } from '@qilin/kylin'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SlotRegistry } from '@qilin/client-ui-renderer/client'
import { LocaleRuntime } from '@qilin/client-locale/client'
import type { StoredEntry } from '@qilin/client-ui-slots'
import type {} from '@qilin/client-ui-conversation/client'
import { apply, inject, type OpenInAppActionInjected } from '../src/client/index.ts'
import { apply as nodeApply } from '../src/index.ts'
import { OpenInAppAction } from '../src/client/OpenInAppAction.tsx'
import { OpenPathAction, OpenPathEmptyAction, type OpenPathInjected } from '../src/client/OpenPathAction.tsx'
import { en, NS, zh } from '../src/client/locales.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Boot the browser half over a real slot tree that declares the header list. */
async function bench(): Promise<{ ctx: Context; fiber: ReturnType<Context['plugin']> }> {
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
  ctx.provide('sessions', {
    list: { getSnapshot: () => ({ ids: [], byId: {}, phase: 'ready', projectionsBySession: {} }) },
  } as never)
  ctx.provide('layout', { panelInfo: { getSnapshot: () => ({ activePanelId: null }) } } as never)
  ctx.provide('shortcuts', {
    register: () => () => {},
    catalog: { getSnapshot: () => [] },
  } as never)
  // The document seats read desktop availability and run gestures over the
  // Session Remote; the bench supplies the namespace each call reaches.
  ctx.provide('remote', { session: sessionRemote } as never)
  ctx.provide('remote.session', sessionRemote as never)
  ctx.provide('locale', new LocaleRuntime(ctx))
  const fiber = ctx.plugin({ inject: [...inject], apply })
  await fiber.await()
  return { ctx, fiber }
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
    await expect(injected.openPath('/host/work/notes.md', 'open')).resolves.toBeNull()
    expect(sessionRemote.openWorkspacePath).toHaveBeenCalledWith({ path: '/host/work/notes.md' })

    await fiber.dispose()
    expect(ctx.slots.entries('sidebar.right.tab.document.actions')).toEqual([])
    expect(ctx.slots.entries('sidebar.right.tab.document.unpreviewable')).toEqual([])
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
    const injected = (entry?.inject as unknown as () => OpenInAppActionInjected)()
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
