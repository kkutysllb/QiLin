// @vitest-environment jsdom
/** The reusable navigator: pane-owned state, listing, opening, and row gestures. */
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { PaneId, TabId } from '@qilin-agent/client-ui-dockkit'
import type { SessionId } from '@qilin-agent/session/types'
import { RemoteError } from '@qilin-agent/typert-protocol'
import { contextMenuHook } from '@qilin-agent/client-test-runtime'
import type { MenuPoint, ContextMenuTarget } from '@qilin-agent/client-ui-context-menu/client'
import { FileNavigator } from '../src/client/FileNavigator.tsx'
import type { FileNavigatorInput } from '../src/client/FileNavigator.tsx'
import { navigatorFace } from '../src/client/face.ts'
import type { ListWorkspaceDirectory } from '../src/client/face.ts'
import { createFilesStore } from '../src/client/store.ts'
import type { FilesState } from '../src/client/store.ts'

const SESSION = 's-nav' as SessionId
const PANE = 'pane-1' as PaneId
const TAB = 'tab-1' as TabId
const ROOT = '/work/project'

afterEach(() => { cleanup() })

/**
 * Render the navigator over a real store and a scripted listing.
 * @param opened - collected file addresses the navigator asked to open.
 * @param menus - collected context menu targets.
 * @returns the view and the store actions.
 */
function harness(opened: string[] = [], menus: ContextMenuTarget[] = [], address?: string) {
  const instance = createFilesStore().create()
  const list = vi.fn<ListWorkspaceDirectory>(async (_sessionId, path) => ({
    ok: true,
    value: {
      entries: path === ROOT
        ? [{ name: 'src', type: 'directory' }, { name: 'README.md', type: 'file' }]
        : [{ name: 'index.ts', type: 'file' }],
      truncated: false,
    },
  }))
  const face = navigatorFace(list)(SESSION, instance.actions)
  const controller = new AbortController()
  const subscribe = (listener: () => void): (() => void) => instance.subscribe(listener)
  const snapshot = (): FilesState => instance.getSnapshot()
  function useStore<T>(selector: (state: FilesState) => T): T {
    return selector(useSyncExternalStore(subscribe, snapshot))
  }
  const props = {
    useTabInfo: () => ({
      sidebar: { expanded: true, fullscreen: false },
      panel: { id: PANE, isFloating: false },
      tab: {
        id: TAB, kind: 'text', contentId: address ?? `qilin-resource://file/session/${SESSION}/src/index.ts`, title: 'index.ts',
        visible: true, navigation: { address: '', params: undefined, revision: 0 },
        signal: controller.signal, actions: { openResource: vi.fn(), openTab: vi.fn(), close: vi.fn(), bindCommands: vi.fn() },
      },
    }),
    sessionId: SESSION,
    useSessions: (selector: (sessions: { byId: Record<string, { cwd: string }> }) => unknown) =>
      selector({ byId: { [SESSION]: { cwd: ROOT } } }),
    useStore,
    actions: instance.actions,
    ...face,
    t: (key: string) => key,
    useContextMenu: contextMenuHook((target, point: MenuPoint) => { menus.push(target); void point }),
    renderFactorySlot: () => null,
    useFactorySlot: () => () => null,
    onOpen: (address: string) => { opened.push(address) },
  } as FileNavigatorInput & Parameters<typeof FileNavigator>[0]
  const view = render(<FileNavigator {...props} />)
  return { instance, face, view, list, opened, menus, controller }
}

/** An empty listing answer for navigator-construction cases. */
const emptyListing = (): ListWorkspaceDirectory => vi.fn<ListWorkspaceDirectory>(
  async () => ({ ok: true, value: { entries: [], truncated: false } }),
)

describe('FileNavigator', () => {
  it('draws nothing until the pane shows it, then lists the root', async () => {
    const h = harness()
    expect(h.view.container.querySelector('[data-files-navigator]')).toBeNull()
    await act(async () => { h.instance.actions.navigatorShown(PANE, true) })
    expect(h.view.container.querySelector('[data-files-navigator]')).not.toBeNull()
    expect(h.list).toHaveBeenCalledWith(SESSION, ROOT, expect.anything())
    expect(h.view.container.querySelectorAll('[data-files-entry]')).toHaveLength(2)
  })

  it('opens a file row as a Session address and shows the current file marked', async () => {
    const h = harness()
    await act(async () => { h.instance.actions.navigatorShown(PANE, true) })
    const row = h.view.container.querySelector('[data-files-path="/work/project/README.md"] button')
    expect(row).not.toBeNull()
    act(() => { fireEvent.click(row as Element) })
    expect(h.opened).toEqual([`qilin-resource://file/session/${SESSION}/README.md`])
    // The tab's own file is the row marked current once its directory is listed.
    const folder = h.view.container.querySelector('[data-files-path="/work/project/src"] > button') as HTMLElement
    await act(async () => { fireEvent.click(folder) })
    expect(h.view.container.querySelector('[data-files-path="/work/project/src/index.ts"] button')?.getAttribute('aria-current')).toBe('true')
  })

  it('marks the current file from an absolute address without joining it to the root', async () => {
    // An empty first path segment is what an absolute address carries; the row
    // it names is already keyed absolutely.
    const h = harness([], [], `qilin-resource://file/session/${SESSION}//work/project/README.md`)
    await act(async () => { h.instance.actions.navigatorShown(PANE, true) })
    expect(h.view.container.querySelector('[data-files-path="/work/project/README.md"] button')?.getAttribute('aria-current')).toBe('true')
  })

  it('marks nothing when the tab address names no file', async () => {
    const h = harness([], [], 'not-a-file-address')
    await act(async () => { h.instance.actions.navigatorShown(PANE, true) })
    const rows = [...h.view.container.querySelectorAll('[data-files-path]')]
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.some(row => row.getAttribute('aria-current') !== null || row.querySelector('[aria-current]') !== null)).toBe(false)
  })

  it('lists an expanded directory once and toggles it closed', async () => {
    const h = harness()
    await act(async () => { h.instance.actions.navigatorShown(PANE, true) })
    const folder = h.view.container.querySelector('[data-files-path="/work/project/src"] > button') as HTMLElement
    await act(async () => { fireEvent.click(folder) })
    expect(h.list).toHaveBeenLastCalledWith(SESSION, '/work/project/src', expect.anything())
    expect(h.view.container.querySelector('[data-files-path="/work/project/src/index.ts"]')).not.toBeNull()
    await act(async () => { fireEvent.click(folder) })
    expect(h.view.container.querySelector('[data-files-path="/work/project/src/index.ts"]')).toBeNull()
  })

  it('hands a row gesture to the shared menu with the pane and path', async () => {
    const h = harness()
    await act(async () => { h.instance.actions.navigatorShown(PANE, true) })
    const row = h.view.container.querySelector('[data-files-path="/work/project/src"] > button') as HTMLElement
    act(() => { fireEvent.contextMenu(row, { clientX: 5, clientY: 6 }) })
    expect(h.menus).toEqual([{ kind: 'directory', value: { sessionId: SESSION, path: '/work/project/src' } }])
  })

  it('offers no row mutations of its own', async () => {
    const h = harness()
    await act(async () => { h.instance.actions.navigatorShown(PANE, true) })
    // The navigator cannot create, rename, or delete: its background opens no menu
    // at all, so no item exists that would only be a no-op.
    act(() => { fireEvent.contextMenu(h.view.container.querySelector('[data-files-tree]') as Element, { clientX: 5, clientY: 6 }) })
    expect(h.view.queryByRole('menuitem')).toBeNull()
  })

  it('forgets the pane tree when its last drawing goes', async () => {
    const h = harness()
    await act(async () => { h.instance.actions.navigatorShown(PANE, true) })
    expect(h.instance.getSnapshot().navigators[PANE]?.tree).toBeDefined()
    act(() => { h.controller.abort() })
    expect(h.instance.getSnapshot().navigators[PANE]).toBeUndefined()
  })

  it('comes back to the scroll offset the body reported', async () => {
    const h = harness()
    await act(async () => { h.instance.actions.navigatorShown(PANE, true) })
    const body = h.view.container.querySelector('[data-files-body]') as HTMLElement
    body.scrollTop = 42
    act(() => { fireEvent.scroll(body) })
    // The pane outlives the drawing, so leaving publishes where the reader was.
    h.view.unmount()
    expect(h.instance.getSnapshot().navigators[PANE]?.tree?.scrollTop).toBe(42)
  })
})

describe('navigatorFace', () => {
  it('records why a level could not be listed', async () => {
    const instance = createFilesStore().create()
    const failure = new RemoteError('gateway/internal', 'listing failed', {})
    const list = vi.fn<ListWorkspaceDirectory>(async () => ({ ok: false, error: failure }))
    const face = navigatorFace(list)(SESSION, instance.actions)
    face.start(PANE, ROOT, new AbortController().signal)
    await Promise.resolve()
    await Promise.resolve()
    expect(instance.getSnapshot().navigators[PANE]?.tree?.levels[ROOT]).toEqual({ kind: 'failed', failure })
  })

  it('keeps the pane tree while another drawing still holds it', () => {
    const instance = createFilesStore().create()
    const face = navigatorFace(emptyListing())(SESSION, instance.actions)
    const first = new AbortController()
    const second = new AbortController()
    face.attach(PANE, first.signal)
    face.attach(PANE, second.signal)
    face.start(PANE, ROOT, second.signal)
    first.abort()
    expect(instance.getSnapshot().navigators[PANE]?.tree).toBeDefined()
    second.abort()
    expect(instance.getSnapshot().navigators[PANE]).toBeUndefined()
  })

  it('ignores work asked for by a drawing that already ended', () => {
    const instance = createFilesStore().create()
    const listed = vi.fn<ListWorkspaceDirectory>(async () => ({ ok: true, value: { entries: [], truncated: false } }))
    const face = navigatorFace(listed)(SESSION, instance.actions)
    const ended = new AbortController()
    ended.abort()
    face.attach(PANE, ended.signal)
    face.start(PANE, ROOT, ended.signal)
    face.load(PANE, ROOT, ended.signal)
    expect(listed).not.toHaveBeenCalled()
    expect(instance.getSnapshot().navigators[PANE]).toBeUndefined()
  })

  it('refuses to record a scroll offset for a pane with no tree', () => {
    const instance = createFilesStore().create()
    const face = navigatorFace(vi.fn())(SESSION, instance.actions)
    expect(() => { face.scrolled(PANE, 10) }).toThrow('no navigator tree')
  })

  it('records the pane choice the header control writes', () => {
    const instance = createFilesStore().create()
    const face = navigatorFace(emptyListing())(SESSION, instance.actions)
    face.shown(PANE, true)
    expect(instance.getSnapshot().navigators[PANE]?.open).toBe(true)
    face.shown(PANE, false)
    expect(instance.getSnapshot().navigators[PANE]?.open).toBe(false)
  })
})
