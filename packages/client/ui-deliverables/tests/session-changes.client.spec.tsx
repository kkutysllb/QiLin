// @vitest-environment jsdom
/** The Session changes page: the states it draws, its directory tree, and the turn a row reopens. */
import { useSyncExternalStore } from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TabId } from '@qilin/client-ui-dockkit'
import type { SidebarRightTabActions } from '@qilin/client-ui-sidebar-right/client'
import { makeTranslate } from '@qilin/client-test-runtime'
import { SessionId } from '@qilin/session/types'
import { changesSessionUrl, isChangesSession, isSessionChangedFile } from '../src/changes.ts'
import { SessionChangesBody, type SessionChangesInjected, type SessionChangesProps } from '../src/client/SessionChangesBody.tsx'
import { SessionChangesStore } from '../src/client/session-changes.ts'
import { SESSION_CHANGES_ID, sessionChangesDefinition } from '../src/client/session-changes-definition.tsx'
import { en, zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const SESSION = SessionId('viewed')
const TAB = 'tab-1' as TabId

/** Test-local selector hook over a framework-neutral store instance. */
function hookOf<T>(inst: { subscribe: (fn: () => void) => () => void; getSnapshot: () => T }) {
  return function useSelector<S>(sel: (s: T) => S): S {
    return sel(useSyncExternalStore(inst.subscribe, inst.getSnapshot))
  }
}

function mount(state?: Parameters<SessionChangesStore['state']['set']>[0]) {
  const store = new SessionChangesStore()
  if (state !== undefined) store.state.set(state)
  const loadSessionChanges = vi.fn<SessionChangesInjected['loadSessionChanges']>(() => Promise.resolve())
  const openTurn = vi.fn<SessionChangesInjected['openTurn']>()
  const tabActions = {
    openResource: vi.fn<SidebarRightTabActions['openResource']>(),
    openTab: vi.fn<SidebarRightTabActions['openTab']>(),
    close: vi.fn<SidebarRightTabActions['close']>(),
  }
  const injected = { loadSessionChanges, openTurn }
  const props = {
    useTabInfo: () => ({
      sidebar: { expanded: true, fullscreen: false }, panel: { id: 'pane-1' },
      tab: {
        id: TAB, kind: 'session-changes', contentId: 'session-changes', title: 'Changes', visible: true,
        navigation: { address: 'session-changes', params: undefined, revision: 1 }, signal: new AbortController().signal,
        actions: tabActions,
      },
    }),
    sessionId: SESSION,
    useSessionChanges: hookOf(store.state),
    t: makeTranslate(en),
    ...injected,
  } as SessionChangesProps
  const view = render(<SessionChangesBody {...props} />)
  return { view, store, ...injected, rerender: () => { view.rerender(<SessionChangesBody {...props} />) } }
}

const url = changesSessionUrl(SESSION)

describe('Session changes page', () => {
  it('reads the Session list once and draws its header and directory tree', () => {
    const h = mount({
      [url]: {
        total: 3, added: 12, deleted: 4,
        files: [
          { path: 'src/app.ts', display: 'src/app.ts', added: 3, deleted: 1, turns: 2, lastTurn: 2, lastSeq: 9, lastIndex: 0 },
          { path: 'src/client/x.ts', display: 'src/client/x.ts', added: 8, deleted: 3, turns: 1, lastTurn: 1, lastSeq: 4, lastIndex: 1 },
          { path: 'logo.png', display: 'logo.png', added: 0, deleted: 0, turns: 1, lastTurn: 2, lastSeq: 9, lastIndex: 1, binary: true },
        ],
      },
    })
    expect(h.loadSessionChanges).not.toHaveBeenCalled()
    expect(h.view.container.querySelector('[data-session-changes]')?.getAttribute('data-session-changes')).toBe('ready')
    expect(h.view.getByText('3 files')).toBeDefined()
    expect(h.view.getByText('+12')).toBeDefined()
    expect(h.view.getByText('-4')).toBeDefined()
    expect(h.view.container.querySelectorAll('[data-session-changes-dir]')).toHaveLength(2)
    expect(h.view.container.querySelectorAll('[data-session-changes-file]')).toHaveLength(3)
    // A file changed in more than one turn says so; a binary file shows the flag instead of counts.
    expect(h.view.getByText('2 turns')).toBeDefined()
    expect(h.view.getByText('binary')).toBeDefined()
  })

  it('asks the Host when no state stands, and draws the wait', () => {
    const h = mount({})
    expect(h.loadSessionChanges).toHaveBeenCalledExactlyOnceWith(SESSION)
    expect(h.view.container.querySelector('[data-session-changes]')?.getAttribute('data-session-changes')).toBe('loading')
    expect(h.view.getByRole('status').textContent).toBe(en['session.loading'])
  })

  it('says so when the Host no longer holds the record', () => {
    const h = mount({ [url]: 'missing' })
    expect(h.view.container.querySelector('[data-session-changes]')?.getAttribute('data-session-changes')).toBe('missing')
    expect(h.view.getByText(en['session.missing'])).toBeDefined()
  })

  it('says so when the Session changed nothing, and does not read again', () => {
    const h = mount({ [url]: { total: 0, added: 0, deleted: 0, files: [] } })
    expect(h.view.container.querySelector('[data-session-changes]')?.getAttribute('data-session-changes')).toBe('empty')
    expect(h.view.getByText(en['session.empty'])).toBeDefined()
    h.rerender()
    expect(h.loadSessionChanges).not.toHaveBeenCalled()
  })

  it('folds a directory away, keeping its own row', () => {
    const h = mount({
      [url]: {
        total: 2, added: 2, deleted: 0,
        files: [
          { path: 'src/client/a.ts', display: 'src/client/a.ts', added: 1, deleted: 0, turns: 1, lastTurn: 1, lastSeq: 1, lastIndex: 0 },
          { path: 'src/client/b.ts', display: 'src/client/b.ts', added: 1, deleted: 0, turns: 1, lastTurn: 1, lastSeq: 1, lastIndex: 1 },
        ],
      },
    })
    const dir = h.view.container.querySelector('[data-session-changes-dir]') as HTMLElement
    expect(dir.getAttribute('aria-expanded')).toBe('true')
    expect(h.view.container.querySelectorAll('[data-session-changes-file]')).toHaveLength(2)
    fireEvent.click(dir)
    expect(dir.getAttribute('aria-expanded')).toBe('false')
    expect(h.view.container.querySelectorAll('[data-session-changes-file]')).toHaveLength(0)
    fireEvent.click(dir)
    expect(h.view.container.querySelectorAll('[data-session-changes-file]')).toHaveLength(2)
  })

  it('reopens the turn that last changed a file', () => {
    const h = mount({
      [url]: {
        total: 1, added: 1, deleted: 0,
        files: [{ path: 'src/app.ts', display: 'src/app.ts', added: 1, deleted: 0, turns: 3, lastTurn: 4, lastSeq: 11, lastIndex: 2 }],
      },
    })
    fireEvent.click(h.view.container.querySelector('[data-session-changes-file]') as HTMLElement)
    expect(h.openTurn).toHaveBeenCalledExactlyOnceWith(11, 4, 2)
  })

  it('names the type and its guide entry from the dictionary', () => {
    const definition = sessionChangesDefinition(makeTranslate(zh))
    expect(definition).toMatchObject({ id: SESSION_CHANGES_ID, kind: 'session-changes', priority: 'builtin', single: true })
    expect(definition.title?.('session-changes')).toBe(zh['session.title'])
    expect(definition.guide?.map(entry => entry.id)).toEqual(['changes'])
    expect(definition.guide?.[0]?.description?.()).toBe(zh['session.description'])
    expect(sessionChangesDefinition(makeTranslate(en)).label?.()).toBe(en['session.title'])
  })
})

describe('Session changes record validation', () => {
  const file = { path: 'a.ts', display: 'a.ts', added: 1, deleted: 0, turns: 1, lastTurn: 1, lastSeq: 2, lastIndex: 0 }

  it('accepts a counted list and rejects a broken one', () => {
    expect(isChangesSession({ files: [file], total: 1, added: 1, deleted: 0 })).toBe(true)
    expect(isChangesSession({ files: [file], total: 2, added: 1, deleted: 0 })).toBe(false)
    expect(isChangesSession({ files: [{ ...file, turns: 0 }], total: 1, added: 1, deleted: 0 })).toBe(false)
    expect(isChangesSession({ files: [], total: 0, added: 0, deleted: 0 })).toBe(true)
    expect(isChangesSession('nope')).toBe(false)
    expect(isChangesSession({ files: 'nope', total: 0, added: 0, deleted: 0 })).toBe(false)
  })

  it('accepts only the optional binary and oversized flags', () => {
    expect(isSessionChangedFile({ ...file, binary: true })).toBe(true)
    expect(isSessionChangedFile({ ...file, oversized: true })).toBe(true)
    expect(isSessionChangedFile({ ...file, binary: false })).toBe(false)
    expect(isSessionChangedFile({ ...file, display: '' })).toBe(false)
    expect(isSessionChangedFile({ ...file, lastTurn: 0 })).toBe(false)
    expect(isSessionChangedFile(null)).toBe(false)
  })
})

describe('Session changes page — nested rows', () => {
  const nested = {
    [url]: {
      total: 2, added: 2, deleted: 0,
      files: [
        { path: 'src/app.ts', display: 'src/app.ts', added: 1, deleted: 0, turns: 1, lastTurn: 1, lastSeq: 1, lastIndex: 0 },
        { path: 'src/client/x.ts', display: 'src/client/x.ts', added: 1, deleted: 0, turns: 1, lastTurn: 1, lastSeq: 1, lastIndex: 1 },
      ],
    },
  }

  it('indents a nested directory and a nested file by their depth', () => {
    const h = mount(nested)
    const dirs = [...h.view.container.querySelectorAll<HTMLElement>('[data-session-changes-dir]')]
    const files = [...h.view.container.querySelectorAll<HTMLElement>('[data-session-changes-file]')]
    // The outer row keeps the stylesheet's own padding; the inner ones carry a level.
    expect(dirs[0]!.style.paddingLeft).toBe('')
    expect(dirs[1]!.style.paddingLeft).toBe('22px')
    expect(files[0]!.style.paddingLeft).toBe('36px')
    expect(files[1]!.style.paddingLeft).toBe('22px')
  })

  it('draws a deletion-only file with its deletions and no additions', () => {
    const h = mount({
      [url]: {
        total: 1, added: 0, deleted: 4,
        files: [{ path: 'gone.txt', display: 'gone.txt', added: 0, deleted: 4, turns: 1, lastTurn: 1, lastSeq: 3, lastIndex: 0 }],
      },
    })
    expect(h.view.container.querySelector('[data-session-changes-file]')?.textContent).toBe('gone.txt-4')
  })

  it('draws an oversized file with its flag instead of counts', () => {
    const h = mount({
      [url]: {
        total: 1, added: 0, deleted: 0,
        files: [{
          path: 'big.txt', display: 'big.txt', added: 0, deleted: 0, turns: 1, lastTurn: 1, lastSeq: 3, lastIndex: 0,
          oversized: true,
        }],
      },
    })
    expect(h.view.getByText(en['changes.oversized'])).toBeDefined()
    // The flag stands where the counts would.
    expect(h.view.container.querySelector('[data-session-changes-file]')?.textContent)
      .toBe(`big.txt${en['changes.oversized']}`)
  })
})

describe('Session changes glyphs', () => {
  it('draws the icon the guide and the settings row name the type by', () => {
    const definition = sessionChangesDefinition(makeTranslate(en))
    const glyph = definition.icon
    if (glyph === undefined) throw new Error('expected the type to carry a glyph')
    const Glyph = glyph
    const view = render(<Glyph size={20} className="mark" />)
    expect(view.container.querySelector('svg')?.getAttribute('width')).toBe('20')
    expect(view.container.querySelector('svg')?.getAttribute('class')).toBe('mark')
    expect(definition.guide?.[0]?.title?.()).toBe(en['session.title'])
  })
})

describe('Session changes store', () => {
  it('publishes a list, a refusal, a malformed answer, and a transport failure', async () => {
    const fetcher = vi.fn()
    vi.stubGlobal('fetch', fetcher)
    const store = new SessionChangesStore()
    fetcher.mockResolvedValueOnce(Response.json({ files: [], total: 0, added: 0, deleted: 0 }))
    await store.load(SESSION)
    expect(store.state.getSnapshot()[url]).toEqual({ files: [], total: 0, added: 0, deleted: 0 })
    // A standing state is kept: the list only moves when the connection is replaced.
    await store.load(SESSION)
    expect(fetcher).toHaveBeenCalledOnce()

    fetcher.mockResolvedValueOnce(new Response('gone', { status: 404 }))
    await store.load(SessionId('refused'))
    expect(store.state.getSnapshot()[changesSessionUrl(SessionId('refused'))]).toBe('missing')

    fetcher.mockResolvedValueOnce(new Response('not json', { status: 200 }))
    await store.load(SessionId('malformed'))
    expect(store.state.getSnapshot()[changesSessionUrl(SessionId('malformed'))]).toBe('missing')

    // Valid JSON that is not a consistent list is refused the same way.
    fetcher.mockResolvedValueOnce(Response.json({ files: [], total: 1, added: 0, deleted: 0 }))
    await store.load(SessionId('inconsistent'))
    expect(store.state.getSnapshot()[changesSessionUrl(SessionId('inconsistent'))]).toBe('missing')

    fetcher.mockRejectedValueOnce(new Error('offline'))
    await store.load(SessionId('offline'))
    expect(store.state.getSnapshot()[changesSessionUrl(SessionId('offline'))]).toBe('missing')

    store.reset()
    expect(store.state.getSnapshot()).toEqual({})
    await store.dispose()
  })
})
