// @vitest-environment jsdom
/**
 * The body against a scripted listing.
 *
 * What is asserted is the reader's contract: the root lists itself on mount,
 * rows come out directories-first, a directory click asks for exactly that
 * level, a file click opens exactly that session-scoped `file:` address through
 * the owner, an `other` entry is shown but not clickable, the tree says when it
 * was cut or could not be read, and reload asks again for the expanded levels
 * only. The two pure helpers the rows are built from are checked on their own.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import { makeTranslate, RemoteError } from '@qilin/client-test-runtime'
import type { RemoteFailure } from '@qilin/api-remotes/client'
import type { TabId } from '@qilin/client-ui-dockkit'
import { fileAddressFor, sessionFileAddress } from '@qilin/util-workspace-path'
import { copyTextOf, failureLine, orderEntries } from '../src/client/FileTree.tsx'
import { SEARCH_SETTLE_MS } from '../src/client/face.ts'
import type { DirLevel } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'
import { mountBody, ROOT, SESSION, TAB } from './mount.client.tsx'

/** The host clipboard write, mocked so a copy lands somewhere observable. */
const clipboard = vi.hoisted(() => ({ write: vi.fn().mockResolvedValue(true) }))
vi.mock('@qilin/client-ui-primitives', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@qilin/client-ui-primitives')>()
  return { ...actual, writeClipboard: clipboard.write }
})

const ROOT_LEVEL: DirLevel = {
  entries: [
    { name: 'README.md', type: 'file', size: 12 },
    { name: 'src', type: 'directory' },
    { name: '.env', type: 'file', size: 2 },
    { name: 'pipe', type: 'other' },
  ],
  truncated: false,
}

const SRC_LEVEL: DirLevel = { entries: [{ name: 'a.ts', type: 'file', size: 7 }], truncated: false }

afterEach(() => { cleanup() })

/** Row labels in document order. */
function names(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[data-files-entry]')].map(li => li.getAttribute('data-files-path')!)
}

describe('FilesBody', () => {
  it('says so when the session has no workspace directory, and asks for nothing', () => {
    const { view, script } = mountBody(null)
    expect(view.container.querySelector('[data-files-state="no-workspace"]')?.textContent).toBe(zh.noWorkspace)
    expect(script.list).not.toHaveBeenCalled()
  })

  it('lists the root on mount, heads it with its path split at the last segment, and draws directories first with dotfiles kept', async () => {
    const { view, script } = mountBody()
    expect(script.list).toHaveBeenCalledWith(SESSION, ROOT, expect.any(AbortSignal))
    expect(view.container.querySelector('[data-files-row="loading"]')).not.toBeNull()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    expect(view.container.querySelector('[data-files-state="tree"]')?.getAttribute('data-files-root')).toBe(ROOT)
    const path = view.container.querySelector('[data-files-path]')
    expect(path?.getAttribute('title')).toBe(ROOT)
    expect([...path?.querySelectorAll('span > span') ?? []].map(span => span.textContent)).toEqual(['/work/', 'app'])
    expect(names(view.container)).toEqual([`${ROOT}/src`, `${ROOT}/.env`, `${ROOT}/pipe`, `${ROOT}/README.md`])
    const envIcon = view.container.querySelector(`[data-files-path="${ROOT}/.env"] svg`)?.innerHTML
    const readmeIcon = view.container.querySelector(`[data-files-path="${ROOT}/README.md"] svg`)?.innerHTML
    expect(envIcon).not.toBe(readmeIcon)
  })

  it('heads a separator-only root by the root itself, since it has no final segment', async () => {
    const { view, script } = mountBody('/')
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    const path = view.container.querySelector('[data-files-path]')
    expect([...path?.querySelectorAll('span > span') ?? []].map(span => span.textContent)).toEqual(['/'])
    expect(names(view.container)).toEqual(['/src', '/.env', '/pipe', '/README.md'])
  })

  it('marks the root path clipped while its text is wider than its box, re-reading on resize', async () => {
    class FakeResizeObserver implements ResizeObserver {
      static latest: FakeResizeObserver | undefined
      readonly observe = vi.fn()
      readonly unobserve = vi.fn()
      readonly disconnect = vi.fn()
      constructor(private readonly callback: ResizeObserverCallback) {
        FakeResizeObserver.latest = this
      }

      fire(): void {
        this.callback([], this)
      }
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    let boxWidth = 300
    const offsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth')
    const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => 200 })
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => boxWidth })
    try {
      const { view, script } = mountBody()
      await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
      const path = view.container.querySelector<HTMLElement>('[data-files-path]')
      const text = path?.firstElementChild
      expect(path?.hasAttribute('data-files-path-clipped')).toBe(false)
      const observer = FakeResizeObserver.latest
      if (observer === undefined) throw new Error('expected the path to observe its size')
      expect(observer.observe).toHaveBeenCalledWith(path)
      expect(observer.observe).toHaveBeenCalledWith(text)

      boxWidth = 120
      act(() => { observer.fire() })
      expect(path?.hasAttribute('data-files-path-clipped')).toBe(true)

      boxWidth = 300
      act(() => { observer.fire() })
      expect(path?.hasAttribute('data-files-path-clipped')).toBe(false)
      view.unmount()
      expect(observer.disconnect).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
      for (const [name, descriptor] of [['offsetWidth', offsetWidth], ['clientWidth', clientWidth]] as const) {
        if (descriptor === undefined) Reflect.deleteProperty(HTMLElement.prototype, name)
        else Object.defineProperty(HTMLElement.prototype, name, descriptor)
      }
    }
  })

  it('a directory click lists that level once and marks it expanded; a second click collapses without asking again', async () => {
    const { view, script } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    const dir = view.container.querySelector(`[data-files-path="${ROOT}/src"] > button`)!
    act(() => { fireEvent.click(dir) })
    expect(script.list).toHaveBeenLastCalledWith(SESSION, `${ROOT}/src`, expect.any(AbortSignal))
    expect(dir.getAttribute('aria-expanded')).toBe('true')
    await act(() => script.settle({ ok: true, value: { entries: [{ name: 'a.ts', type: 'file' }], truncated: false } }))
    expect(names(view.container)).toContain(`${ROOT}/src/a.ts`)
    act(() => { fireEvent.click(dir) })
    expect(dir.getAttribute('aria-expanded')).toBe('false')
    expect(names(view.container)).not.toContain(`${ROOT}/src/a.ts`)
    act(() => { fireEvent.click(dir) })
    expect(names(view.container)).toContain(`${ROOT}/src/a.ts`)
    expect(script.list).toHaveBeenCalledTimes(2)
  })

  it('a file click opens its session-scoped file: address through the owner; an other entry offers no button', async () => {
    const { view, script, tabActions } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    fireEvent.click(view.container.querySelector(`[data-files-path="${ROOT}/README.md"] > button`)!)
    // Every row sits under the tree's root, so the address is the path relative to it.
    expect(tabActions.openResource).toHaveBeenCalledWith(fileAddressFor(SESSION, ROOT, `${ROOT}/README.md`))
    expect(tabActions.openResource).toHaveBeenCalledWith('qilin-resource://file/session/s-test/README.md')
    const other = view.container.querySelector(`[data-files-path="${ROOT}/pipe"]`)!
    expect(other.querySelector('button')).toBeNull()
    expect(other.querySelector('[aria-disabled="true"]')?.getAttribute('title')).toBe(zh['entry.other'])
  })

  it('marks a cut listing and an empty one', async () => {
    const { view, script } = mountBody()
    await act(() => script.settle({ ok: true, value: { entries: [{ name: 'd', type: 'directory' }], truncated: true } }))
    expect(view.container.querySelector('[data-files-row="truncated"]')?.textContent).toBe(zh.truncated)
    act(() => { fireEvent.click(view.container.querySelector(`[data-files-path="${ROOT}/d"] > button`)!) })
    await act(() => script.settle({ ok: true, value: { entries: [], truncated: false } }))
    expect(view.container.querySelector('[data-files-row="empty"]')?.textContent).toBe(zh.empty)
  })

  it('shows a failed level under its directory with the failure code', async () => {
    const { view, script } = mountBody()
    await act(() => script.settle({
      ok: false,
      error: new RemoteError('workspace-file/not-found', 'gone', { path: ROOT }),
    }))
    const failed = view.container.querySelector('[data-files-row="failed"]')
    expect(failed?.getAttribute('data-files-code')).toBe('workspace-file/not-found')
    expect(failed?.textContent).toBe(zh['error.notFound'])
  })

  it('reload resets every level and lists the expanded ones again', async () => {
    const { view, script, controller, instance } = mountBody()
    const child = `${ROOT}/src`
    const collapsed = `${ROOT}/docs`
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    act(() => { fireEvent.click(view.container.querySelector(`[data-files-path="${child}"] > button`)!) })
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    // A level listed earlier and since collapsed is dropped, not re-fetched.
    act(() => { instance.actions.loaded(TAB, collapsed, ROOT_LEVEL) })
    script.list.mockClear()

    act(() => { fireEvent.click(view.container.querySelector('[data-files-reload]')!) })
    expect(script.list.mock.calls.map(call => call[1])).toEqual([ROOT, child])
    expect(script.list).toHaveBeenCalledWith(SESSION, ROOT, controller.signal)
    const state = instance.getSnapshot().byTab[TAB]!
    expect(state.expanded).toEqual([ROOT, child])
    expect(state.levels).toEqual({ [ROOT]: { kind: 'loading' }, [child]: { kind: 'loading' } })
    expect(view.container.querySelector('[data-files-reload]')?.getAttribute('aria-label')).toBe(zh.reload)
  })

  it('captures the body scroll offset on unmount and restores it when a tab switch remounts the tree', async () => {
    const { view, script, instance, remount } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    const body = view.container.querySelector('[data-files-body]')!
    fireEvent.scroll(body, { target: { scrollTop: 120 } })
    // Scrolling writes nothing yet: the store hears the offset once, on unmount.
    expect(instance.getSnapshot().byTab[TAB]!.scrollTop).toBe(0)
    view.unmount()
    expect(instance.getSnapshot().byTab[TAB]!.scrollTop).toBe(120)
    const back = remount()
    expect(back.container.querySelector('[data-files-body]')!.scrollTop).toBe(120)
  })

  it('a scroll before the owner aborts is not written to a forgotten bucket', async () => {
    const { view, script, controller, instance } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    fireEvent.scroll(view.container.querySelector('[data-files-body]')!, { target: { scrollTop: 80 } })
    act(() => { controller.abort() })
    view.unmount()
    expect(instance.getSnapshot().byTab[TAB]).toBeUndefined()
  })

  it('an aborted record is forgotten and not seeded again while the body is still mounted', async () => {
    const { view, script, controller, instance } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    act(() => { controller.abort() })
    expect(instance.getSnapshot().byTab[TAB]).toBeUndefined()
    expect(view.container.querySelector('[data-files-state="tree"]')).toBeNull()
    expect(script.list).toHaveBeenCalledTimes(1)
  })
})

describe('orderEntries', () => {
  it('puts directories first and orders each group by name, numbers included', () => {
    const ordered = orderEntries([
      { name: 'file10.txt', type: 'file' },
      { name: 'zeta', type: 'directory' },
      { name: 'file2.txt', type: 'file' },
      { name: '.env', type: 'file' },
      { name: 'Alpha', type: 'directory' },
      { name: 'sock', type: 'other' },
    ])
    expect(ordered.map(entry => entry.name)).toEqual(['Alpha', 'zeta', '.env', 'file2.txt', 'file10.txt', 'sock'])
  })

  it('leaves the endpoint\'s array untouched', () => {
    const entries = [{ name: 'b', type: 'file' as const }, { name: 'a', type: 'file' as const }]
    orderEntries(entries)
    expect(entries.map(entry => entry.name)).toEqual(['b', 'a'])
  })
})

describe('failureLine', () => {
  const t = makeTranslate(zh)

  it('names each directory failure', () => {
    expect(failureLine(t, new RemoteError('workspace-file/not-found', 'x', { path: 'p' }))).toBe(zh['error.notFound'])
    expect(failureLine(t, new RemoteError('workspace-file/outside-workspace', 'x', { path: 'p' })))
      .toBe(zh['error.outsideWorkspace'])
    expect(failureLine(t, new RemoteError('workspace-file/not-directory', 'x', { path: 'p', kind: 'file' })))
      .toBe(zh['error.notDirectory'])
  })

  it('carries an unclassified failure\'s own message', () => {
    const failure = { code: 'remote/transport', message: 'socket closed' } as unknown as RemoteFailure
    expect(failureLine(t, failure)).toBe('读取失败：socket closed')
  })
})

describe('FilesBody search', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers(); cleanup() })

  /** Type into the box as the reader does, through the body's own wiring. */
  function type(view: ReturnType<typeof mountBody>['view'], text: string): void {
    const input = view.container.querySelector('[data-files-search-input]') as HTMLInputElement
    fireEvent.change(input, { target: { value: text } })
    act(() => { vi.advanceTimersByTime(SEARCH_SETTLE_MS) })
  }

  it('shows the box beside the header and keeps the tree while it is blank', () => {
    const { view } = mountBody()
    expect(view.container.querySelector('[data-files-search-input]')).not.toBeNull()
    expect(view.container.querySelector('[data-files-search-clear]')).toBeNull()
    expect(view.container.querySelector('[data-files-search-results]')).toBeNull()
  })

  it('takes the body for a standing query and returns the matches as openable rows', async () => {
    const mounted = mountBody()
    const { view, searchScript, tabActions } = mounted
    type(view, 'read')
    expect(searchScript.search).toHaveBeenCalledWith(SESSION, 'read', expect.any(AbortSignal))
    expect(view.container.querySelector('[data-files-row="search-running"]')?.textContent).toBe(zh['search.running'])
    expect(view.container.querySelector('[data-files-search-results]')).not.toBeNull()
    await act(() => searchScript.settle({
      ok: true,
      value: { matches: [{ path: 'src/readme.ts', bytes: 3 }, { path: 'README.md' }], truncated: true },
    }))
    const rows = [...view.container.querySelectorAll('[data-files-entry="match"]')]
      .map(li => li.getAttribute('data-files-path'))
    expect(rows).toEqual(['src/readme.ts', 'README.md'])
    expect(view.container.querySelector('[data-files-row="search-truncated"]')?.textContent).toBe(zh['search.truncated'])
    fireEvent.click(view.container.querySelector('[data-files-path="src/readme.ts"] button')!)
    expect(tabActions.openResource).toHaveBeenCalledWith(fileAddressFor(SESSION, ROOT, 'src/readme.ts'))
  })

  it('says so when nothing matched', async () => {
    const { view, searchScript } = mountBody()
    type(view, 'zzz')
    await act(() => searchScript.settle({ ok: true, value: { matches: [], truncated: false } }))
    expect(view.container.querySelector('[data-files-row="search-empty"]')?.textContent).toBe(zh['search.empty'])
  })

  it('names a failed search with the tree failure lines', async () => {
    const { view, searchScript } = mountBody()
    type(view, 'read')
    await act(() => searchScript.settle({
      ok: false,
      error: new RemoteError('workspace-file/not-directory', 'not a directory', { path: ROOT, kind: 'file' }),
    }))
    expect(view.container.querySelector('[data-files-row="search-failed"]')?.textContent).toBe(zh['error.notDirectory'])
  })

  it('clearing the box brings the tree back and asks nothing more', async () => {
    const { view, searchScript } = mountBody()
    type(view, 'read')
    await act(() => searchScript.settle({ ok: true, value: { matches: [{ path: 'README.md' }], truncated: false } }))
    expect(view.container.querySelector('[data-files-search-clear]')).not.toBeNull()
    fireEvent.click(view.container.querySelector('[data-files-search-clear]')!)
    expect(view.container.querySelector('[data-files-search-results]')).toBeNull()
    expect(view.container.querySelector('[data-files-search-input]')).not.toBeNull()
    expect(searchScript.search).toHaveBeenCalledTimes(1)
  })
})

describe('FileTree row menu and link marks', () => {
  afterEach(() => { cleanup(); clipboard.write.mockClear() })

  it('derives both copy forms from the root: dot for the root, suffix under it, path otherwise', () => {
    expect(copyTextOf(ROOT, ROOT, 'relative')).toBe('.')
    expect(copyTextOf(ROOT, `${ROOT}/src/a.ts`, 'relative')).toBe('src/a.ts')
    expect(copyTextOf(ROOT, `${ROOT}/src/a.ts`, 'absolute')).toBe(`${ROOT}/src/a.ts`)
    // A tree rooted somewhere the row does not sit under keeps the path whole.
    expect(copyTextOf('/elsewhere', `${ROOT}/README.md`, 'relative')).toBe(`${ROOT}/README.md`)
  })

  it('a file row right-click opens the menu at the cursor: open, and both copies', async () => {
    const { view, script, tabActions } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    act(() => { fireEvent.contextMenu(view.container.querySelector(`[data-files-path="${ROOT}/README.md"] > button`)!, { clientX: 10, clientY: 20 }) })
    fireEvent.click(view.getByRole('menuitem', { name: zh['menu.open'] }))
    expect(tabActions.openResource).toHaveBeenCalledWith(fileAddressFor(SESSION, ROOT, 'README.md'))
    act(() => { fireEvent.contextMenu(view.container.querySelector(`[data-files-path="${ROOT}/README.md"] > button`)!) })
    fireEvent.click(view.getByRole('menuitem', { name: zh['menu.copyRelative'] }))
    expect(clipboard.write).toHaveBeenCalledWith('README.md')
    act(() => { fireEvent.contextMenu(view.container.querySelector(`[data-files-path="${ROOT}/README.md"] > button`)!) })
    fireEvent.click(view.getByRole('menuitem', { name: zh['menu.copyAbsolute'] }))
    expect(clipboard.write).toHaveBeenCalledWith(`${ROOT}/README.md`)
    expect(view.queryByRole('menuitem', { name: zh['menu.open'] })).toBeNull()
  })

  it('a directory row right-click offers the copies but no open', async () => {
    const { view, script } = mountBody()
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))
    act(() => { fireEvent.contextMenu(view.container.querySelector(`[data-files-path="${ROOT}/src"] > button`)!) })
    expect(view.queryByRole('menuitem', { name: zh['menu.open'] })).toBeNull()
    fireEvent.click(view.getByRole('menuitem', { name: zh['menu.copyRelative'] }))
    expect(clipboard.write).toHaveBeenCalledWith('src')
  })

  it('marks a symlinked name with the link glyph and tooltip; plain names carry none', async () => {
    const { view, script } = mountBody()
    await act(() => script.settle({
      ok: true,
      value: {
        entries: [
          { name: 'linked.md', type: 'file', symlink: true },
          { name: 'linked-dir', type: 'directory', symlink: true },
          { name: 'plain.md', type: 'file' },
        ],
        truncated: false,
      },
    }))
    for (const name of ['linked.md', 'linked-dir']) {
      expect(view.container.querySelector(`[data-files-path="${ROOT}/${name}"] [data-files-symlink]`)?.getAttribute('title')).toBe(zh['entry.symlink'])
    }
    expect(view.container.querySelector(`[data-files-path="${ROOT}/plain.md"] [data-files-symlink]`)).toBeNull()
  })
})

describe('FileTree row mutations', () => {
  afterEach(() => { cleanup() })

  /** Right-click one row's own button, as the reader does. */
  function rowMenu(view: RenderResult, path: string): void {
    act(() => {
      fireEvent.contextMenu(view.container.querySelector(`[data-files-path="${path}"] > button`)!, { clientX: 5, clientY: 6 })
    })
  }

  /** Right-click the tree's own background, below its rows. */
  function backgroundMenu(view: RenderResult): void {
    act(() => { fireEvent.contextMenu(view.container.querySelector('[data-files-tree]')!, { clientX: 5, clientY: 6 }) })
  }

  /** The tree's inline name box. */
  function nameBox(view: RenderResult): HTMLInputElement {
    return view.container.querySelector<HTMLInputElement>('[data-files-name-input]')!
  }

  /** A mounted tree with its root listed. */
  async function settled() {
    const mounted = mountBody()
    await act(() => mounted.script.settle({ ok: true, value: ROOT_LEVEL }))
    return mounted
  }

  it('offers create, rename, and delete on a directory row, and open, rename, and delete on a file row', async () => {
    const { view } = await settled()
    rowMenu(view, `${ROOT}/src`)
    expect(view.queryByRole('menuitem', { name: zh['menu.newFile'] })).not.toBeNull()
    expect(view.queryByRole('menuitem', { name: zh['menu.newFolder'] })).not.toBeNull()
    expect(view.queryByRole('menuitem', { name: zh['menu.rename'] })).not.toBeNull()
    expect(view.queryByRole('menuitem', { name: zh['menu.delete'] })).not.toBeNull()
    expect(view.queryByRole('menuitem', { name: zh['menu.open'] })).toBeNull()
    // A new folder lands in that same directory; its dialog is the folder one.
    fireEvent.click(view.getByRole('menuitem', { name: zh['menu.newFolder'] }))
    expect(view.getByRole('dialog').getAttribute('aria-label')).toBe(zh['create.directoryTitle'])
    fireEvent.click(view.getByRole('dialog').querySelector('[data-files-create-cancel]')!)
    expect(view.queryByRole('dialog')).toBeNull()
    rowMenu(view, `${ROOT}/README.md`)
    expect(view.queryByRole('menuitem', { name: zh['menu.open'] })).not.toBeNull()
    expect(view.queryByRole('menuitem', { name: zh['menu.newFile'] })).toBeNull()
  })

  it('creates a file in a collapsed directory, opening it first and re-listing it after the write', async () => {
    const { view, script, mutations, controller } = await settled()
    rowMenu(view, `${ROOT}/src`)
    fireEvent.click(view.getByRole('menuitem', { name: zh['menu.newFile'] }))
    // The entry lands in the directory's own rows, so the tree opens them first.
    expect(script.list).toHaveBeenLastCalledWith(SESSION, `${ROOT}/src`, controller.signal)
    const dialog = view.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe(zh['create.fileTitle'])
    expect(dialog.querySelector('[data-files-create-name]')?.getAttribute('placeholder')).toBe(zh['create.placeholder'])
    fireEvent.change(dialog.querySelector('[data-files-create-name]')!, { target: { value: '  note.md  ' } })
    fireEvent.click(dialog.querySelector('[data-files-create-confirm]')!)
    // The typed text is trimmed before it becomes a name, and the dialog closes.
    expect(mutations.createFile.mock).toHaveBeenCalledWith(SESSION, `${ROOT}/src/note.md`, controller.signal)
    expect(view.queryByRole('dialog')).toBeNull()
    expect(view.container.querySelector('[data-files-row="mutation-running"]')?.textContent).toBe(zh.mutating)
    await act(() => mutations.createFile.settle({ ok: true, value: undefined }))
    expect(script.list).toHaveBeenLastCalledWith(SESSION, `${ROOT}/src`, controller.signal)
    expect(view.container.querySelector('[data-files-row="mutation-running"]')).toBeNull()
  })

  it('creates from the tree background at the workspace root, refusing a blank name in place, and cancels', async () => {
    const { view, script, mutations, controller } = await settled()
    backgroundMenu(view)
    expect(view.queryByRole('menuitem', { name: zh['menu.rename'] })).toBeNull()
    fireEvent.click(view.getByRole('menuitem', { name: zh['menu.newFolder'] }))
    const dialog = view.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe(zh['create.directoryTitle'])
    expect(dialog.textContent).toContain(ROOT)
    fireEvent.click(dialog.querySelector('[data-files-create-confirm]')!)
    expect(dialog.querySelector('[data-files-create-invalid]')?.textContent).toBe(zh['name.invalid'])
    expect(mutations.createDirectory.mock).not.toHaveBeenCalled()
    fireEvent.change(dialog.querySelector('[data-files-create-name]')!, { target: { value: 'docs' } })
    fireEvent.click(dialog.querySelector('[data-files-create-confirm]')!)
    expect(mutations.createDirectory.mock).toHaveBeenCalledWith(SESSION, `${ROOT}/docs`, controller.signal)
    await act(() => mutations.createDirectory.settle({ ok: true, value: undefined }))
    // The directory that gained the entry is read again, so wait for its rows.
    await act(() => script.settle({ ok: true, value: ROOT_LEVEL }))

    // A second create is abandoned: the dialog's own cancel asks the Host nothing.
    fireEvent.click(view.container.querySelector(`[data-files-path="${ROOT}/src"] > button`)!)
    await act(() => script.settle({ ok: true, value: SRC_LEVEL }))
    rowMenu(view, `${ROOT}/src`)
    fireEvent.click(view.getByRole('menuitem', { name: zh['menu.newFile'] }))
    fireEvent.click(view.getByRole('dialog').querySelector('[data-files-create-cancel]')!)
    expect(view.queryByRole('dialog')).toBeNull()
    expect(mutations.createFile.mock).not.toHaveBeenCalled()
  })

  it('closes the create dialog on Escape without asking the Host', async () => {
    const { view, mutations } = await settled()
    backgroundMenu(view)
    fireEvent.click(view.getByRole('menuitem', { name: zh['menu.newFile'] }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(view.queryByRole('dialog')).toBeNull()
    expect(mutations.createFile.mock).not.toHaveBeenCalled()
  })

  it('renames a row in place: Enter moves the entry and retargets the tab open on it', async () => {
    const { view, script, mutations, tabs, controller } = await settled()
    tabs.openTabs([{ id: 'tab-a' as TabId, contentId: sessionFileAddress(SESSION, 'README.md') }])
    script.list.mockClear()
    rowMenu(view, `${ROOT}/README.md`)
    fireEvent.click(view.getByRole('menuitem', { name: zh['menu.rename'] }))
    const box = nameBox(view)
    expect(box.value).toBe('README.md')
    expect(box.getAttribute('aria-label')).toBe(zh['menu.rename'])
    expect(box.hasAttribute('aria-invalid')).toBe(false)
    // A click inside the box stays the box's own.
    fireEvent.click(box)
    fireEvent.change(box, { target: { value: 'GUIDE.md' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(mutations.move.mock).toHaveBeenCalledWith(SESSION, `${ROOT}/README.md`, `${ROOT}/GUIDE.md`, controller.signal)
    expect(view.container.querySelector('[data-files-name-input]')).toBeNull()
    await act(() => mutations.move.settle({ ok: true, value: undefined }))
    expect(tabs.openResourceIn).toHaveBeenCalledWith(
      SESSION,
      sessionFileAddress(SESSION, 'GUIDE.md'),
      { replaceTab: 'tab-a' },
    )
    // The directory that held the entry is read again.
    expect(script.list.mock.calls.map(call => call[1])).toEqual([ROOT])
  })

  it('refuses a rename that is not one name, and abandons it on Escape', async () => {
    const { view, mutations } = await settled()
    rowMenu(view, `${ROOT}/src`)
    fireEvent.click(view.getByRole('menuitem', { name: zh['menu.rename'] }))
    const box = nameBox(view)
    fireEvent.change(box, { target: { value: '   ' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(box.getAttribute('aria-invalid')).toBe('true')
    fireEvent.change(box, { target: { value: 'a/b' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(box.getAttribute('aria-invalid')).toBe('true')
    expect(mutations.move.mock).not.toHaveBeenCalled()
    fireEvent.keyDown(box, { key: 'Escape' })
    expect(view.container.querySelector('[data-files-name-input]')).toBeNull()
    expect(mutations.move.mock).not.toHaveBeenCalled()
  })

  it('leaves an entry named as it already was alone, and lets an IME finish its own Enter', async () => {
    const { view, mutations } = await settled()
    rowMenu(view, `${ROOT}/src`)
    fireEvent.click(view.getByRole('menuitem', { name: zh['menu.rename'] }))
    const box = nameBox(view)
    // A composing Enter commits the composition, not the name.
    fireEvent.keyDown(box, { key: 'Enter', isComposing: true })
    expect(view.container.querySelector('[data-files-name-input]')).not.toBeNull()
    // Any other key leaves the box to the reader.
    fireEvent.keyDown(box, { key: 'a' })
    expect(view.container.querySelector('[data-files-name-input]')).not.toBeNull()
    fireEvent.change(box, { target: { value: ' src ' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    expect(mutations.move.mock).not.toHaveBeenCalled()
    expect(view.container.querySelector('[data-files-name-input]')).toBeNull()
  })

  it('deletes a directory whole after confirming, closing the tabs under it', async () => {
    const { view, script, mutations, tabs, controller } = await settled()
    tabs.openTabs([{ id: 'tab-b' as TabId, contentId: sessionFileAddress(SESSION, 'src/a.ts') }])
    script.list.mockClear()
    rowMenu(view, `${ROOT}/src`)
    fireEvent.click(view.getByRole('menuitem', { name: zh['menu.delete'] }))
    const dialog = view.getByRole('dialog')
    expect(dialog.getAttribute('aria-label')).toBe('删除「src」？')
    expect(dialog.textContent).toContain(zh['delete.directoryBody'])
    fireEvent.click(dialog.querySelector('[data-files-delete-confirm]')!)
    expect(mutations.remove.mock).toHaveBeenCalledWith(SESSION, `${ROOT}/src`, true, controller.signal)
    await act(() => mutations.remove.settle({ ok: true, value: undefined }))
    expect(tabs.closeIn).toHaveBeenCalledWith(SESSION, 'tab-b')
    expect(script.list.mock.calls.map(call => call[1])).toEqual([ROOT])
  })

  it('deletes a file without recursion, and abandoning the dialog asks nothing', async () => {
    const { view, mutations, controller } = await settled()
    rowMenu(view, `${ROOT}/README.md`)
    fireEvent.click(view.getByRole('menuitem', { name: zh['menu.delete'] }))
    const dialog = view.getByRole('dialog')
    expect(dialog.textContent).toContain(zh['delete.fileBody'])
    fireEvent.click(dialog.querySelector('[data-files-delete-cancel]')!)
    expect(view.queryByRole('dialog')).toBeNull()
    expect(mutations.remove.mock).not.toHaveBeenCalled()

    rowMenu(view, `${ROOT}/README.md`)
    fireEvent.click(view.getByRole('menuitem', { name: zh['menu.delete'] }))
    fireEvent.click(view.getByRole('dialog').querySelector('[data-files-delete-confirm]')!)
    expect(mutations.remove.mock).toHaveBeenCalledWith(SESSION, `${ROOT}/README.md`, false, controller.signal)
  })

  it('closes the delete dialog on Escape', async () => {
    const { view, mutations } = await settled()
    rowMenu(view, `${ROOT}/src`)
    fireEvent.click(view.getByRole('menuitem', { name: zh['menu.delete'] }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(view.queryByRole('dialog')).toBeNull()
    expect(mutations.remove.mock).not.toHaveBeenCalled()
  })

  it('closes a row menu on Escape', async () => {
    const { view } = await settled()
    rowMenu(view, `${ROOT}/src`)
    expect(view.queryByRole('menu')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(view.queryByRole('menu')).toBeNull()
  })

  it('reports a refused mutation over the rows and clears it on dismissal', async () => {
    const { view, instance, mutations } = await settled()
    rowMenu(view, `${ROOT}/README.md`)
    fireEvent.click(view.getByRole('menuitem', { name: zh['menu.delete'] }))
    fireEvent.click(view.getByRole('dialog').querySelector('[data-files-delete-confirm]')!)
    await act(() => mutations.remove.settle({
      ok: false,
      error: new RemoteError('workspace-file/not-regular-file', 'link', { path: `${ROOT}/README.md`, kind: 'symlink' }),
    }))
    const strip = view.container.querySelector('[data-files-row="mutation-failed"]')!
    expect(strip.getAttribute('data-files-code')).toBe('workspace-file/not-regular-file')
    expect(strip.textContent).toContain(zh['error.notRegular'])
    fireEvent.click(view.container.querySelector('[data-files-mutation-dismiss]')!)
    expect(view.container.querySelector('[data-files-row="mutation-failed"]')).toBeNull()
    expect(instance.getSnapshot().byTab[TAB]!.mutation).toEqual({ kind: 'idle' })
  })
})
