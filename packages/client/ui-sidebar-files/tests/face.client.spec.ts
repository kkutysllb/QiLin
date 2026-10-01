/**
 * The tree's asynchronous half against a scripted listing, and the Remote
 * adapter under it.
 *
 * The face's contract is what reaches the store and when: a level is `loading`
 * before the listing settles, `ready` or `failed` after, never written once the
 * owner's signal aborted or a newer listing of the level was asked for, and a
 * tab whose record is gone leaves no bucket behind. The adapter's is what it
 * keeps and what it drops: entries and the
 * truncation flag reach the store, the endpoint's workspace-relative path does
 * not, and a failure passes through untouched.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RemoteError } from '@qilin/client-test-runtime'
import type { SessionId } from '@qilin/session/types'
import type { WorkspaceDirectoryListing } from '@qilin/api-workspace-files/types'
import { SEARCH_SETTLE_MS, childPath, createList, createSearch, filesFace } from '../src/client/face.ts'
import type { WorkspaceFilesTreeRemote } from '../src/client/face.ts'
import { createFilesStore } from '../src/client/store.ts'
import type { DirLevel } from '../src/client/store.ts'
import { scriptedList } from './scripted-list.client.ts'
import { scriptedSearch } from './scripted-search.client.ts'
import type { TabId } from '@qilin/client-ui-dockkit'
import type { WorkspaceFileNameSearch } from '@qilin/api-workspace-files/types'

const SESSION = 's-1' as SessionId
const ROOT = '/work/app'
const TAB = 'tab-1' as TabId

const LEVEL: DirLevel = { entries: [{ name: 'src', type: 'directory' }], truncated: false }

function mount() {
  const instance = createFilesStore().create()
  const script = scriptedList()
  const searchScript = scriptedSearch()
  const face = filesFace(script.list, searchScript.search)(SESSION, instance.actions)
  // The two scripts each own a `settle`; keep the listing's name for itself.
  return {
    ...script,
    searchMock: searchScript.search,
    settleSearch: searchScript.settle,
    face,
    snapshot: () => instance.getSnapshot().byTab[TAB],
  }
}

describe('filesFace', () => {
  it('start seeds the tab and lists the root with the session and the absolute root path', async () => {
    const { face, list, settle, snapshot } = mount()
    const controller = new AbortController()
    face.start(TAB, ROOT, controller.signal)
    expect(list).toHaveBeenCalledWith(SESSION, ROOT, controller.signal)
    expect(snapshot()!.levels[ROOT]).toEqual({ kind: 'loading' })
    await settle({ ok: true, value: LEVEL })
    expect(snapshot()!.levels[ROOT]).toEqual({ kind: 'ready', level: LEVEL })
  })

  it('records a failed listing under its level', async () => {
    const { face, settle, snapshot } = mount()
    face.start(TAB, ROOT, new AbortController().signal)
    const error = new RemoteError('workspace-file/not-directory', 'not a directory', { path: ROOT, kind: 'file' })
    await settle({ ok: false, error })
    expect(snapshot()!.levels[ROOT]).toEqual({ kind: 'failed', failure: error })
  })

  it('toggle expands and lists a directory the first time, and only toggles afterwards', async () => {
    const { face, list, settle, snapshot } = mount()
    const signal = new AbortController().signal
    const child = `${ROOT}/src`
    face.start(TAB, ROOT, signal)
    await settle({ ok: true, value: LEVEL })
    face.toggle(TAB, child, false, signal)
    expect(list).toHaveBeenLastCalledWith(SESSION, child, signal)
    expect(snapshot()!.expanded).toEqual([ROOT, child])
    await settle({ ok: true, value: LEVEL })
    face.toggle(TAB, child, true, signal)
    expect(snapshot()!.expanded).toEqual([ROOT])
    expect(list).toHaveBeenCalledTimes(2)
  })

  it('abort forgets the bucket and a late settlement writes nothing', async () => {
    const { face, settle, snapshot } = mount()
    const controller = new AbortController()
    face.start(TAB, ROOT, controller.signal)
    controller.abort()
    expect(snapshot()).toBeUndefined()
    await settle({ ok: true, value: LEVEL })
    expect(snapshot()).toBeUndefined()
  })

  it('makes no request for a record that already ended', () => {
    const { face, list } = mount()
    const controller = new AbortController()
    controller.abort()
    face.load(TAB, ROOT, controller.signal)
    expect(list).not.toHaveBeenCalled()
  })

  it('lets the latest listing of a level win, whichever settles first', async () => {
    const { face, list, settle, settleLatest, snapshot, outstanding } = mount()
    const signal = new AbortController().signal
    const older: DirLevel = { entries: [{ name: 'old.txt', type: 'file' }], truncated: false }
    face.start(TAB, ROOT, signal)
    // The reload gesture asks for the root again while the first listing is still out.
    face.load(TAB, ROOT, signal)
    expect(list).toHaveBeenCalledTimes(2)
    expect(outstanding()).toEqual([ROOT, ROOT])
    await settleLatest({ ok: true, value: LEVEL })
    expect(snapshot()!.levels[ROOT]).toEqual({ kind: 'ready', level: LEVEL })
    // The retired listing lands afterwards and changes nothing.
    await settle({ ok: true, value: older })
    expect(snapshot()!.levels[ROOT]).toEqual({ kind: 'ready', level: LEVEL })
    // A retired failure is dropped the same way.
    face.load(TAB, ROOT, signal)
    face.load(TAB, ROOT, signal)
    await settleLatest({ ok: true, value: LEVEL })
    await settle({ ok: false, error: new RemoteError('workspace-file/not-found', 'gone', { path: ROOT }) })
    expect(snapshot()!.levels[ROOT]).toEqual({ kind: 'ready', level: LEVEL })
  })
})

describe('createList', () => {
  it('passes the session, the absolute path, and the signal through, and keeps entries and truncation', async () => {
    const listing: WorkspaceDirectoryListing = {
      path: 'src',
      entries: [{ name: 'a.ts', type: 'file', size: 3 }],
      truncated: true,
    }
    const list = vi.fn<WorkspaceFilesTreeRemote['workspaceFiles']['list']>()
      .mockResolvedValue({ ok: true, value: listing })
    const signal = new AbortController().signal
    const result = await createList({ workspaceFiles: { list } })(SESSION, `${ROOT}/src`, signal)
    expect(list).toHaveBeenCalledWith(SESSION, `${ROOT}/src`, signal)
    expect(result).toEqual({ ok: true, value: { entries: listing.entries, truncated: true } })
  })

  it('returns a failure as the endpoint reported it', async () => {
    const error = new RemoteError('workspace-file/not-directory', 'file', { path: 'x', kind: 'file' })
    const list = vi.fn<WorkspaceFilesTreeRemote['workspaceFiles']['list']>()
      .mockResolvedValue({ ok: false, error })
    const result = await createList({ workspaceFiles: { list } })(SESSION, `${ROOT}/x`, new AbortController().signal)
    expect(result).toEqual({ ok: false, error })
  })
})

describe('filesFace search', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  /** Type into the box through the face, as the body does. */
  function type(face: ReturnType<typeof mount>['face'], query: string, signal: AbortSignal): void {
    face.search(TAB, query, signal)
    vi.advanceTimersByTime(SEARCH_SETTLE_MS)
  }

  const SIGNAL = (): AbortSignal => new AbortController().signal

  it('asks nothing until the box settles, then asks with the trimmed query and records the answer', async () => {
    const { face, searchMock, settleSearch, snapshot } = mount()
    const signal = SIGNAL()
    face.start(TAB, ROOT, signal)
    face.search(TAB, '  read  ', signal)
    expect(searchMock).not.toHaveBeenCalled()
    vi.advanceTimersByTime(SEARCH_SETTLE_MS)
    expect(searchMock).toHaveBeenCalledWith(SESSION, 'read', signal)
    expect(snapshot()!.search).toEqual({ kind: 'running', query: '  read  ' })
    await settleSearch({ ok: true, value: { matches: [{ path: 'README.md', bytes: 1 }], truncated: false } })
    expect(snapshot()!.search).toEqual({
      kind: 'ready', query: '  read  ', matches: [{ path: 'README.md', bytes: 1 }], truncated: false,
    })
  })

  it('records a failed search under the box', async () => {
    const { face, settleSearch, snapshot } = mount()
    const signal = SIGNAL()
    face.start(TAB, ROOT, signal)
    type(face, 'read', signal)
    const error = new RemoteError('workspace-file/not-found', 'gone', { path: ROOT })
    await settleSearch({ ok: false, error })
    expect(snapshot()!.search).toEqual({ kind: 'failed', query: 'read', failure: error })
  })

  it('replaces a pending query inside the settle window, so the Host is asked once, for the latest text', () => {
    const { face, searchMock, snapshot } = mount()
    const signal = SIGNAL()
    face.start(TAB, ROOT, signal)
    face.search(TAB, 're', signal)
    vi.advanceTimersByTime(SEARCH_SETTLE_MS - 1)
    face.search(TAB, 'readme', signal)
    vi.advanceTimersByTime(SEARCH_SETTLE_MS)
    expect(searchMock).toHaveBeenCalledTimes(1)
    expect(searchMock).toHaveBeenCalledWith(SESSION, 'readme', signal)
    expect(snapshot()!.search).toEqual({ kind: 'running', query: 'readme' })
  })

  it('drops an answer whose query was replaced while it was out', async () => {
    const { face, searchMock, settleSearch, snapshot } = mount()
    const signal = SIGNAL()
    face.start(TAB, ROOT, signal)
    type(face, 're', signal)
    type(face, 'readme', signal)
    expect(searchMock).toHaveBeenCalledTimes(2)
    await settleSearch({ ok: true, value: { matches: [{ path: 'a' }], truncated: false } })
    expect(snapshot()!.search).toEqual({ kind: 'running', query: 'readme' })
    await settleSearch({ ok: true, value: { matches: [{ path: 'README.md' }], truncated: true } })
    expect(snapshot()!.search).toEqual({ kind: 'ready', query: 'readme', matches: [{ path: 'README.md' }], truncated: true })
  })

  it('clears the box outright on blank text and asks nothing', () => {
    const { face, searchMock, snapshot } = mount()
    const signal = SIGNAL()
    face.start(TAB, ROOT, signal)
    type(face, 'read', signal)
    face.search(TAB, '   ', signal)
    vi.advanceTimersByTime(SEARCH_SETTLE_MS)
    expect(searchMock).toHaveBeenCalledTimes(1)
    expect(snapshot()!.search).toEqual({ kind: 'idle', query: '' })
  })

  it('cancels the pending ask when the record aborts, and a late settlement writes nothing', async () => {
    const { face, searchMock, snapshot } = mount()
    const controller = new AbortController()
    face.start(TAB, ROOT, controller.signal)
    face.search(TAB, 'read', controller.signal)
    controller.abort()
    vi.advanceTimersByTime(SEARCH_SETTLE_MS)
    expect(searchMock).not.toHaveBeenCalled()
    expect(snapshot()).toBeUndefined()
  })

  it('makes no request for a record that already ended', () => {
    const { face, searchMock } = mount()
    const controller = new AbortController()
    controller.abort()
    face.search(TAB, 'read', controller.signal)
    vi.advanceTimersByTime(SEARCH_SETTLE_MS)
    expect(searchMock).not.toHaveBeenCalled()
  })
})

describe('createSearch', () => {
  it('passes the session, the query, and the signal through untouched', async () => {
    const answer: WorkspaceFileNameSearch = { matches: [{ path: 'a.ts', bytes: 2 }], truncated: false }
    const searchNames = vi.fn<WorkspaceFilesTreeRemote['workspaceFiles']['searchNames']>()
      .mockResolvedValue({ ok: true, value: answer })
    const signal = new AbortController().signal
    const result = await createSearch({ workspaceFiles: { searchNames } })(SESSION, 'a', signal)
    expect(searchNames).toHaveBeenCalledWith(SESSION, 'a', signal)
    expect(result).toEqual({ ok: true, value: answer })
  })
})

describe('childPath', () => {
  it('joins with one slash whatever the parent ends in', () => {
    expect(childPath('/work/app', 'src')).toBe('/work/app/src')
    expect(childPath('/work/app/', 'src')).toBe('/work/app/src')
    expect(childPath('/', 'etc')).toBe('/etc')
    expect(childPath('C:\\work\\', 'src')).toBe('C:\\work/src')
  })
})
