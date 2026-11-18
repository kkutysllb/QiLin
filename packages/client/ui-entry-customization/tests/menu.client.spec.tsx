// @vitest-environment jsdom
/** The plugin fills each region's More menu: unpinned sidebar entries, discovery, and creation. */
import type { Context } from '@qilin-agent/kylin'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, within } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { useState } from 'react'
import { makeTranslate, SlotTestRuntime } from '@qilin-agent/client-test-runtime'
import { LocaleRuntime } from '@qilin-agent/client-locale/client'
import type { PropsRenderSlots } from '@qilin-agent/client-ui-slots'
import type { TrackProductEvent } from '@qilin-agent/client-product-analytics/client'
import { EntryMenuContent } from '../src/client/EntryMenuContent.tsx'
import { en } from '../src/client/locales.ts'
import { apply, inject } from '../src/client/index.ts'

type Seats = 'sidebar.panellist.actions' | 'conversation.session.header.views.actions' | 'sidebar.right.tab.guide.actions'
const SEATS = ['sidebar.panellist.actions', 'conversation.session.header.views.actions', 'sidebar.right.tab.guide.actions'] as const
const runtimes = new Set<SlotTestRuntime>()
afterEach(async () => {
  try { for (const runtime of runtimes) await runtime.dispose() }
  finally { runtimes.clear(); cleanup(); vi.useRealTimers() }
})

type ContentProps = ComponentProps<typeof EntryMenuContent>
const unused = (): never => { throw new Error('The menu rows read no framework hooks') }

/** Accessible names in DOM order; a pin button carries a name but no text. */
function menuNames(view: ReturnType<typeof render>): string[] {
  return view.getAllByRole('menuitem').map(row => row.getAttribute('aria-label') ?? row.textContent ?? '')
}

function content(overrides: Partial<ContentProps> = {}, { pluginNavigation = true }: { pluginNavigation?: boolean } = {}) {
  const callbacks = {
    onOpen: vi.fn<ContentProps['onOpen']>(), onPinnedChange: vi.fn<ContentProps['onPinnedChange']>(),
    onDismiss: vi.fn<ContentProps['onDismiss']>(), browsePlugins: vi.fn<ContentProps['browsePlugins']>(),
    createPlugin: vi.fn<ContentProps['createPlugin']>(),
  }
  const props = {
    entries: [{ id: 'notes', label: 'Notes', pinned: true }, { id: 'tasks', label: 'Tasks', pinned: false }],
    region: 'sidebar', t: makeTranslate(en),
    usePluginNavigation: (select: (present: boolean) => unknown) => select(pluginNavigation),
    usePanelInfo: unused, useSessions: unused, useSessionStatus: unused, useSessionRetainInfo: unused,
    useResource: unused, useWorkspaces: unused,
    ...callbacks,
    ...overrides,
  } as ContentProps
  const view = render(<div role="menu"><EntryMenuContent {...props} /></div>)
  return { view, ...callbacks }
}

describe('More menu rows', () => {
  it('lists unpinned sidebar entries with a pin control and leaves pinned rows out', () => {
    const b = content({ entries: [
      { id: 'notes', label: 'Notes', pinned: true, active: true },
      { id: 'tasks', label: 'Tasks', pinned: false },
    ] })
    expect(menuNames(b.view)).toEqual([
      'Tasks', 'Pin Tasks to the sidebar', 'Browse other plugins', 'Create your plugin',
    ])
    expect(b.view.queryByRole('menuitem', { name: 'Notes' })).toBeNull()
    expect(b.view.getAllByRole('separator')).toHaveLength(1)
    fireEvent.click(b.view.getByRole('menuitem', { name: 'Pin Tasks to the sidebar' }))
    expect(b.onDismiss).toHaveBeenCalledOnce()
    expect(b.onPinnedChange).toHaveBeenCalledExactlyOnceWith('tasks', true)
    expect(b.onOpen).not.toHaveBeenCalled()
  })

  it('opens an unpinned entry without changing its pin state', () => {
    const b = content()
    fireEvent.click(b.view.getByRole('menuitem', { name: 'Tasks' }))
    expect(b.onOpen).toHaveBeenCalledExactlyOnceWith('tasks')
    expect(b.onPinnedChange).not.toHaveBeenCalled()
  })

  it.each(['rightbar'] as const)('shows only discovery and creation in %s regardless of entries', (region) => {
    const b = content({ region, entries: [
      { id: 'notes', label: 'Notes', pinned: true, active: true },
      { id: 'tasks', label: 'Tasks', pinned: false },
    ] })
    expect(menuNames(b.view)).toEqual(['Browse other plugins', 'Create your plugin'])
    expect(b.view.queryByRole('separator')).toBeNull()
    fireEvent.click(b.view.getByRole('menuitem', { name: 'Browse other plugins' }))
    expect(b.browsePlugins).toHaveBeenCalledExactlyOnceWith()
    expect(b.onDismiss.mock.invocationCallOrder[0]).toBeLessThan(b.browsePlugins.mock.invocationCallOrder[0]!)
    fireEvent.click(b.view.getByRole('menuitem', { name: 'Create your plugin' }))
    expect(b.createPlugin).toHaveBeenCalledExactlyOnceWith()
    expect(b.onDismiss.mock.invocationCallOrder[1]).toBeLessThan(b.createPlugin.mock.invocationCallOrder[0]!)
    expect(b.onOpen).not.toHaveBeenCalled()
    expect(b.onPinnedChange).not.toHaveBeenCalled()
  })

  it('opens folded Conversation Views and marks the active View without pin controls', () => {
    const b = content({ region: 'conversation', entries: [
      { id: 'notes', label: 'Notes', pinned: true, active: true },
      { id: 'tasks', label: 'Tasks', pinned: true, active: false },
    ] })
    expect(menuNames(b.view)).toEqual(['Notes', 'Tasks', 'Browse other plugins', 'Create your plugin'])
    const currentRow = b.view.getByRole('menuitem', { name: 'Notes' })
    expect(currentRow.getAttribute('aria-current')).toBe('page')
    expect(currentRow.querySelector('svg')?.previousElementSibling?.textContent).toBe('Notes')
    expect(b.view.getByRole('menuitem', { name: 'Tasks' }).hasAttribute('aria-current')).toBe(false)
    expect(b.view.getAllByRole('separator')).toHaveLength(1)
    fireEvent.click(b.view.getByRole('menuitem', { name: 'Tasks' }))
    expect(b.onOpen).toHaveBeenCalledExactlyOnceWith('tasks')
    expect(b.onDismiss.mock.invocationCallOrder[0]).toBeLessThan(b.onOpen.mock.invocationCallOrder[0]!)
    expect(b.onPinnedChange).not.toHaveBeenCalled()
  })

  it('hides the discovery row while the Plugins page provides no navigation', () => {
    const b = content({}, { pluginNavigation: false })
    expect(menuNames(b.view)).toEqual(['Tasks', 'Pin Tasks to the sidebar', 'Create your plugin'])
  })

  it('keeps both actions for an empty roster', () => {
    const b = content({ region: 'rightbar', entries: [] })
    expect(menuNames(b.view)).toEqual(['Browse other plugins', 'Create your plugin'])
    expect(b.view.queryByRole('separator')).toBeNull()
  })
})

function Frame({ renderSlot }: PropsRenderSlots<Seats>) {
  const [pinned, setPinned] = useState(false)
  const [opened, setOpened] = useState('')
  const entries = [{ id: 'notes', label: 'Notes', pinned }]
  return <>
    {SEATS.map(seat => <div key={seat} role="menu" aria-label={seat}>
      {renderSlot(seat, {
        entries,
        onOpen: (id) => { setOpened(`${seat}:${id}`) },
        onPinnedChange: (_id, next) => { setPinned(next) },
        onDismiss: () => {},
      })}
    </div>)}
    <output data-testid="opened">{opened}</output>
  </>
}

async function bench(language: 'en' | 'zh' = 'en', { analytics = true, pluginNavigation = true }: { analytics?: boolean; pluginNavigation?: boolean } = {}) {
  const runtime = await SlotTestRuntime.create()
  runtimes.add(runtime)
  const openList = vi.fn(), startSession = vi.fn(), track = vi.fn<TrackProductEvent>()
  await runtime.mount({
    inject: ['slots'],
    apply(ctx: Context) {
      const locale = new LocaleRuntime(ctx)
      locale.setLocale(language)
      ctx.provide('locale', locale)
      ctx.slots.installLocale(locale)
      if (pluginNavigation) ctx.provide('pluginNavigation', { openList } as never)
      ctx.provide('uiWorkspace', { startSession } as never)
      if (analytics) ctx.provide('productAnalytics', { track } as never)
    },
  })
  await runtime.root.declare({ ...Object.fromEntries(SEATS.map(seat => [seat, { kind: 'list', scope: 'root' }])) } as never, Frame)
  const plugin = await runtime.mount({ inject: [...inject], apply })
  const view = runtime.renderRoot()
  return { runtime, openList, startSession, track, plugin, view }
}

describe('More menu registrations', () => {
  it('registers one row set per region and removes all of them when the plugin unloads', async () => {
    const b = await bench()
    for (const seat of SEATS) {
      expect(b.runtime.slots.entries(seat).map(entry => entry.options.id)).toEqual(['entry-customization'])
    }
    // The sidebar shows the unpinned row plus its pin control; the other regions show their own rows.
    const sidebar = within(b.view.getByRole('menu', { name: 'sidebar.panellist.actions' }))
    expect(sidebar.getAllByRole('menuitem').map(row => row.getAttribute('aria-label') ?? row.textContent))
      .toEqual(['Notes', 'Pin Notes to the sidebar', 'Browse other plugins', 'Create your plugin'])
    const guide = within(b.view.getByRole('menu', { name: 'sidebar.right.tab.guide.actions' }))
    expect(guide.getAllByRole('menuitem').map(row => row.textContent))
      .toEqual(['Browse other plugins', 'Create your plugin'])
    fireEvent.click(guide.getByRole('menuitem', { name: 'Browse other plugins' }))
    expect(b.openList).toHaveBeenCalledExactlyOnceWith()
    await b.plugin.dispose()
    for (const seat of SEATS) {
      expect(b.runtime.slots.entries(seat)).toEqual([])
      expect(within(b.view.getByRole('menu', { name: seat })).queryByRole('menuitem')).toBeNull()
    }
  })

  it('starts an unsent Creator draft from the conversation region', async () => {
    const b = await bench('en')
    fireEvent.click(within(b.view.getByRole('menu', { name: 'conversation.session.header.views.actions' }))
      .getByRole('menuitem', { name: 'Create your plugin' }))
    expect(b.startSession).toHaveBeenCalledExactlyOnceWith(undefined, {
      agentPreset: 'coding', prompt: 'Create a QiLin conversation view plugin.', whenDraftExists: 'append',
    })
  })

  it('reports the rightbar footer actions before acting', async () => {
    const b = await bench()
    const menu = within(b.view.getByRole('menu', { name: 'sidebar.right.tab.guide.actions' }))
    fireEvent.click(menu.getByRole('menuitem', { name: 'Browse other plugins' }))
    expect(b.track).toHaveBeenCalledExactlyOnceWith('more_menu_item_click', { region: 'rightbar', action: 'browse_plugins' })
    expect(b.track.mock.invocationCallOrder[0]).toBeLessThan(b.openList.mock.invocationCallOrder[0]!)
    fireEvent.click(menu.getByRole('menuitem', { name: 'Create your plugin' }))
    expect(b.track).toHaveBeenLastCalledWith('more_menu_item_click', { region: 'rightbar', action: 'create_plugin' })
    expect(b.track.mock.invocationCallOrder[1]).toBeLessThan(b.startSession.mock.invocationCallOrder[0]!)
    expect(b.track).toHaveBeenCalledTimes(2)
  })

  it('keeps both footer actions working without the analytics or navigation services', async () => {
    const b = await bench('en', { analytics: false, pluginNavigation: false })
    const menu = within(b.view.getByRole('menu', { name: 'sidebar.right.tab.guide.actions' }))
    // Without the navigation service the discovery row is absent; the Creator row still works.
    expect(menu.queryByRole('menuitem', { name: 'Browse other plugins' })).toBeNull()
    fireEvent.click(menu.getByRole('menuitem', { name: 'Create your plugin' }))
    expect(b.startSession).toHaveBeenCalledOnce()
    expect(b.track).not.toHaveBeenCalled()
  })
})
