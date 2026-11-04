/**
 * `openResource(address, { destination })`: an explicit host for a resource.
 *
 * Each case drives the controller over a real registry and store, because a
 * reveal, a move, and a new tab are whatever one store intent plans, and the
 * Tab domain must keep a moved tab's occurrence across that commit.
 */
import { describe, expect, it, vi } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import type { SessionId } from '@qilin-agent/session/types'
import type { LayoutState, TabId } from '@qilin-agent/client-ui-dockkit'
import { dockPaneIds, findTabPane, getPane } from '@qilin-agent/client-ui-dockkit'
import { createSidebarRightController } from '../src/client/service.ts'
import { SidebarRightTabRegistry } from '../src/client/tab-registry.ts'
import { findHostContentTab, createSidebarRightStore } from '../src/client/stores.ts'
import { guideDefinition } from '../src/client/tabs/guide/definition.ts'

const SESSION = 's-test' as SessionId
const A = 'qilin-resource://file/session/s-test/a.txt'
const B = 'qilin-resource://file/session/s-test/b.txt'
const C = 'qilin-resource://file/session/s-test/c.txt'

/** Key-echoing translate: this file asserts behaviour, not copy. */
const t = ((key: string) => key) as Parameters<typeof guideDefinition>[0]

/** A controller over a real registry and store, published on screen as the plugin does. */
function harness() {
  const ctx = new Context()
  const tabs = new SidebarRightTabRegistry(ctx)
  tabs.register(guideDefinition(t))
  tabs.register({
    id: 'test/text', kind: 'text', patterns: ['qilin-resource://file/**'], priority: 'fallback',
    title: address => address.slice(address.lastIndexOf('/') + 1),
  })
  const pin = vi.fn<(address: string, signal: AbortSignal) => void>()
  const { controller, adopt, show } = createSidebarRightController(tabs, pin, {
    autoFullscreen: () => false,
    openWithFocus: (_sessionId, open) => { open() },
    closeWithFocus: (_sessionId, _paneId, close) => { close() },
  })
  const instance = createSidebarRightStore(() => ({ kind: 'guide', title: 'seed' })).create()
  adopt(SESSION, instance)
  show(SESSION)
  const layout = (): LayoutState => {
    const surface = instance.getSnapshot().bySession[SESSION]
    if (surface === undefined) throw new Error('expected a surface')
    return surface.layout
  }
  const closed = vi.fn()
  controller.registerCloseHandler('text', closed)
  const copies = (title: string): TabId[] => Object.values(layout().tabs).filter(tab => tab.title === title).map(tab => tab.id)
  const only = (title: string): TabId => {
    const [id, ...rest] = copies(title)
    if (id === undefined || rest.length > 0) throw new Error(`expected one ${title}`)
    return id
  }
  const host = (tabId: TabId): string => findTabPane(layout(), tabId).host
  const occurrence = (tabId: TabId): ReturnType<typeof controller.tabDomain.occurrence> =>
    controller.tabDomain.occurrence(SESSION, { id: tabId })
  const titles = (): string[] => Object.values(layout().tabs).map(tab => tab.title).sort()
  const entries = (): number => instance.getSnapshot().bySession[SESSION]?.history.entries.length ?? 0
  return { controller, instance, layout, closed, copies, only, host, occurrence, titles, entries }
}

describe('openResource with a destination', () => {
  it('opens unopened content in the default docked pane and expands the column', () => {
    const h = harness()
    h.controller.openResource(A, { destination: 'sidebar', params: { line: 3 } })
    const a = h.only('a.txt')
    expect(h.host(a)).toBe('dock')
    expect(h.layout().expanded).toBe(true)
    expect(dockPaneIds(h.layout())).toHaveLength(1)
    expect(h.titles()).toEqual(['a.txt'])
    expect(h.occurrence(a).navigation.getSnapshot()).toEqual({ address: A, params: { line: 3 }, revision: 1 })
    expect(h.entries()).toBe(1)
  })

  it('opens unopened content in a new floating panel, leaving the column collapsed and unseeded', () => {
    const h = harness()
    h.controller.openResource(A, { destination: 'float', params: { line: 7 } })
    const a = h.only('a.txt')
    expect(h.host(a)).toBe('float')
    expect(h.layout().floats).toHaveLength(1)
    expect(h.layout().expanded).toBe(false)
    expect(h.titles()).toEqual(['a.txt'])
    expect(getPane(h.layout(), h.layout().rootId).tabs).toEqual([])
    expect(h.layout().activePaneId).toBe(findTabPane(h.layout(), a).id)
    expect(h.occurrence(a).navigation.getSnapshot()).toEqual({ address: A, params: { line: 7 }, revision: 1 })
    expect(h.entries()).toBe(1)
  })

  it('opens a second floating panel beside the first and keeps the docked selection', () => {
    const h = harness()
    h.controller.openResource(B, { destination: 'sidebar' })
    h.controller.openResource(C, { destination: 'float' })
    const root = getPane(h.layout(), h.layout().rootId)
    h.controller.openResource(A, { destination: 'float' })
    const floats = h.layout().floats
    expect(floats).toHaveLength(2)
    const [first, second] = floats.map(id => getPane(h.layout(), id))
    expect(second!.tabs).toEqual([h.only('a.txt')])
    expect(second!.rect).not.toEqual(first!.rect)
    expect(getPane(h.layout(), h.layout().rootId)).toEqual(root)
    expect(h.layout().expanded).toBe(true)
  })

  it('reveals a docked copy where it is and flashes its pane only once it is on screen', () => {
    const h = harness()
    h.controller.openResource(A, { destination: 'sidebar' })
    h.controller.openResource(B, { destination: 'sidebar' })
    const a = h.only('a.txt')
    const held = h.occurrence(a)
    h.controller.openResource(A, { destination: 'sidebar', params: { line: 9 } })
    expect(h.only('a.txt')).toBe(a)
    expect(getPane(h.layout(), h.layout().activePaneId).activeTabId).toBe(a)
    expect(h.occurrence(a)).toBe(held)
    expect(held.navigation.getSnapshot()).toEqual({ address: A, params: { line: 9 }, revision: 2 })
    // Switching to the tab is the visible change; only a reveal of the tab already on screen flashes.
    expect(h.controller.flashOf(SESSION).getSnapshot()).toBeUndefined()
    h.controller.openResource(A, { destination: 'sidebar' })
    expect(h.controller.flashOf(SESSION).getSnapshot()).toEqual({ paneId: findTabPane(h.layout(), a).id, serial: 1 })
  })

  it('moves a docked tab into a new floating panel, keeping its id and occurrence, as one entry', () => {
    const h = harness()
    h.controller.openResource(B, { destination: 'sidebar' })
    h.controller.openResource(A, { destination: 'sidebar' })
    const a = h.only('a.txt')
    const held = h.occurrence(a)
    const before = h.entries()
    h.controller.openResource(A, { destination: 'float', params: { line: 4 } })
    expect(h.only('a.txt')).toBe(a)
    expect(h.host(a)).toBe('float')
    expect(h.layout().floats).toHaveLength(1)
    expect(h.layout().expanded).toBe(true)
    expect(h.occurrence(a)).toBe(held)
    expect(held.signal.aborted).toBe(false)
    expect(held.navigation.getSnapshot()).toEqual({ address: A, params: { line: 4 }, revision: 2 })
    expect(h.closed).not.toHaveBeenCalled()
    expect(h.controller.flashOf(SESSION).getSnapshot()).toBeUndefined()
    expect(h.entries()).toBe(before + 1)
    h.controller._undo()
    expect(h.host(a)).toBe('dock')
    expect(h.layout().floats).toEqual([])
    expect(h.occurrence(a)).toBe(held)
  })

  it('moves a floating tab back into the docked pane and expands the column', () => {
    const h = harness()
    h.controller.openResource(A, { destination: 'float' })
    const a = h.only('a.txt')
    const held = h.occurrence(a)
    expect(h.layout().expanded).toBe(false)
    h.controller.openResource(A, { destination: 'sidebar' })
    expect(h.only('a.txt')).toBe(a)
    expect(h.host(a)).toBe('dock')
    expect(h.layout().floats).toEqual([])
    expect(h.layout().expanded).toBe(true)
    expect(h.occurrence(a)).toBe(held)
    expect(held.signal.aborted).toBe(false)
    expect(h.closed).not.toHaveBeenCalled()
  })

  it('finds content per host, so the same address can live in both', () => {
    const h = harness()
    h.controller.openResource(A, { destination: 'sidebar' })
    h.controller.openResource(A, { destination: 'float' })
    const a = h.only('a.txt')
    expect(h.host(a)).toBe('float')
    expect(findHostContentTab(h.layout(), 'sidebar', A, 'text')).toBeUndefined()
    expect(findHostContentTab(h.layout(), 'float', A, 'text')).toBe(a)
    // The one copy moves instead of a second opening: a destination never duplicates.
    h.controller.openResource(A, { destination: 'sidebar' })
    expect(h.copies('a.txt')).toHaveLength(1)
    expect(h.host(findHostContentTab(h.layout(), 'sidebar', A, 'text')!)).toBe('dock')
    expect(findHostContentTab(h.layout(), 'float', A, 'text')).toBeUndefined()
  })

  it('hides a floating tab by closing it and a docked tab by collapsing the column', () => {
    const h = harness()
    h.controller.openResource(A, { destination: 'float' })
    const floated = h.only('a.txt')
    h.controller.hide(floated)
    expect(h.layout().tabs[floated]).toBeUndefined()

    h.controller.openResource(A, { destination: 'sidebar' })
    const docked = h.only('a.txt')
    expect(h.layout().expanded).toBe(true)
    h.controller.hide(docked)
    expect(h.layout().expanded).toBe(false)
    expect(h.layout().tabs[docked]).toBeDefined()
  })

  it('focuses the floating occurrence it already has instead of opening a second', () => {
    const h = harness()
    h.controller.openResource(A, { destination: 'float' })
    const a = h.only('a.txt')
    expect(h.host(a)).toBe('float')
    // The same content asked for the same host is one tab, refocused.
    h.controller.openResource(A, { destination: 'float' })
    expect(h.copies('a.txt')).toHaveLength(1)
    expect(h.host(h.only('a.txt'))).toBe('float')
    expect(h.layout().tabs[a]).toBeDefined()
  })

  it('ignores a hide request for a tab the on-screen surface does not hold', () => {
    const h = harness()
    h.controller.openResource(A, { destination: 'sidebar' })
    const a = h.only('a.txt')
    const expanded = h.layout().expanded
    // A tab closed by an earlier gesture is not a tab this one collapses the column for.
    h.controller.hide('tab-gone' as TabId)
    expect(h.layout().expanded).toBe(expanded)
    expect(h.layout().tabs[a]).toBeDefined()
    // A docked tab whose column is already collapsed stays where it is.
    h.controller.hide(a)
    expect(h.layout().expanded).toBe(false)
    h.controller.hide(a)
    expect(h.layout().expanded).toBe(false)
    expect(h.layout().tabs[a]).toBeDefined()
  })

  it('reads the clicked pane\'s closeable tabs for the tab menu', () => {
    const h = harness()
    for (const address of [A, B, C]) h.controller.openResource(address, { destination: 'sidebar' })
    const [a, b, c] = [h.only('a.txt'), h.only('b.txt'), h.only('c.txt')]
    const paneId = findTabPane(h.layout(), b).id
    // Every closeable tab but the anchor, and the ones to its right in display order.
    expect(h.controller.menuTabs(SESSION, paneId, b)).toEqual({ all: [a, c], right: [c], close: true })
    expect(h.controller.menuTabs(SESSION, paneId, c)).toEqual({ all: [a, b], right: [], close: true })
    // An anchor that left the pane, a pane the Session does not have, and a Session with no surface.
    expect(h.controller.menuTabs(SESSION, paneId, 'tab-gone' as TabId)).toEqual({ all: [], right: [], close: false })
    expect(h.controller.menuTabs(SESSION, 'pane-gone' as never, a)).toEqual({ all: [], right: [], close: false })
    expect(h.controller.menuTabs('s-none' as SessionId, paneId, a)).toEqual({ all: [], right: [], close: false })
  })
})
