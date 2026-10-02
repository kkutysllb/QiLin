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
import { SEARCH_SETTLE_MS, createList, createSearch, filesFace } from '../src/client/face.ts'
import type { WorkspaceFilesTreeRemote } from '../src/client/face.ts'
import { createFilesStore } from '../src/client/store.ts'
import type { DirLevel } from '../src/client/store.ts'
import { scriptedList } from './scripted-list.client.ts'
import { scriptedSearch } from './scripted-search.client.ts'
import { recordedReconcile, scriptedMutations } from './scripted-mutations.client.ts'
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
  const mutations = scriptedMutations()
  const tabs = recordedReconcile()
  const face = filesFace(script.list, searchScript.search, mutations.mutations, tabs.reconcile)(
    SESSION, instance.actions,
  )
  // The two scripts each own a `settle`; keep the listing's name for itself.
  return {
    ...script,
    searchMock: searchScript.search,
    settleSearch: searchScript.settle,
    mutations,
    tabs,
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

describe('filesFace mutations', () => {
  const SIGNAL = (): AbortSignal => new AbortController().signal

  /** A started tab with its root listed, so the mutations have a bucket and a directory. */
  async function started() {
    const mounted = mount()
    const signal = SIGNAL()
    mounted.face.start(TAB, ROOT, signal)
    await mounted.settle({ ok: true, value: LEVEL })
    mounted.list.mockClear()
    return { ...mounted, signal }
  }

  it('creates an empty file at the joined path and re-lists the directory that holds it', async () => {
    const { face, mutations, list, snapshot, signal } = await started()
    face.createEntry(TAB, ROOT, 'note.md', 'file', signal)
    expect(mutations.createFile.mock).toHaveBeenCalledWith(SESSION, `${ROOT}/note.md`, signal)
    expect(snapshot()!.mutation).toEqual({ kind: 'running' })
    await mutations.createFile.settle({ ok: true, value: { absolutePath: `${ROOT}/note.md`, version: 'v1' } })
    expect(snapshot()!.mutation).toEqual({ kind: 'idle' })
    expect(list).toHaveBeenCalledWith(SESSION, ROOT, signal)
  })

  it('creates a directory and records a refusal with its own code', async () => {
    const { face, mutations, list, snapshot, signal } = await started()
    face.createEntry(TAB, ROOT, 'docs', 'directory', signal)
    expect(mutations.createDirectory.mock).toHaveBeenCalledWith(SESSION, `${ROOT}/docs`, signal)
    const error = new RemoteError('workspace-file/exists', 'taken', { path: `${ROOT}/docs` })
    await mutations.createDirectory.settle({ ok: false, error })
    expect(snapshot()!.mutation).toEqual({ kind: 'failed', failure: error })
    // Nothing changed on disk, so no level is asked for again.
    expect(list).not.toHaveBeenCalled()
  })

  it('moves one entry to the name it was given and retargets the tabs open on it', async () => {
    const { face, mutations, list, tabs, snapshot, signal } = await started()
    const from = `${ROOT}/src`
    face.renameEntry(TAB, from, 'lib', ROOT, signal)
    expect(mutations.move.mock).toHaveBeenCalledWith(SESSION, from, `${ROOT}/lib`, signal)
    await mutations.move.settle({ ok: true, value: undefined })
    expect(tabs.tabsIn).toHaveBeenCalledWith(SESSION)
    expect(snapshot()!.mutation).toEqual({ kind: 'idle' })
    expect(list).toHaveBeenCalledWith(SESSION, ROOT, signal)
  })

  it('removes a file without recursion and a directory with it', async () => {
    const { face, mutations, tabs, signal } = await started()
    face.removeEntry(TAB, `${ROOT}/a.ts`, 'file', ROOT, signal)
    expect(mutations.remove.mock).toHaveBeenCalledWith(SESSION, `${ROOT}/a.ts`, false, signal)
    await mutations.remove.settle({ ok: true, value: undefined })
    face.removeEntry(TAB, `${ROOT}/src`, 'directory', ROOT, signal)
    expect(mutations.remove.mock).toHaveBeenLastCalledWith(SESSION, `${ROOT}/src`, true, signal)
    await mutations.remove.settle({ ok: true, value: undefined })
    // Each successful removal settled the tabs of the session it happened in.
    expect(tabs.tabsIn.mock.calls).toEqual([[SESSION], [SESSION]])
  })

  it('lets the newest gesture win: a retired settlement writes nothing and re-lists nothing', async () => {
    const { face, mutations, list, snapshot, signal } = await started()
    face.createEntry(TAB, ROOT, 'a.md', 'file', signal)
    face.createEntry(TAB, ROOT, 'b.md', 'file', signal)
    await mutations.createFile.settle({ ok: false, error: new RemoteError('workspace-file/exists', 'taken', { path: `${ROOT}/a.md` }) })
    // The retired failure is dropped; the newest gesture is still out.
    expect(snapshot()!.mutation).toEqual({ kind: 'running' })
    await mutations.createFile.settle({ ok: true, value: undefined })
    expect(snapshot()!.mutation).toEqual({ kind: 'idle' })
    expect(list).toHaveBeenCalledTimes(1)
  })

  it('makes no call for a record that already ended', async () => {
    const { face, mutations, snapshot } = await started()
    const controller = new AbortController()
    controller.abort()
    face.createEntry(TAB, ROOT, 'late.md', 'file', controller.signal)
    expect(mutations.createFile.mock).not.toHaveBeenCalled()
    expect(snapshot()!.mutation).toEqual({ kind: 'idle' })
  })

  it('drops a settlement whose record aborted while the call was out', async () => {
    const mounted = mount()
    const controller = new AbortController()
    mounted.face.start(TAB, ROOT, controller.signal)
    await mounted.settle({ ok: true, value: LEVEL })
    mounted.face.createEntry(TAB, ROOT, 'a.md', 'file', controller.signal)
    expect(mounted.snapshot()!.mutation).toEqual({ kind: 'running' })
    controller.abort()
    expect(mounted.snapshot()).toBeUndefined()
    await mounted.mutations.createFile.settle({ ok: true, value: undefined })
    expect(mounted.snapshot()).toBeUndefined()
  })

  it('refuses a path with no parent directory to rename or remove in', async () => {
    const { face, mutations, signal } = await started()
    expect(() => { face.renameEntry(TAB, 'a.ts', 'b.ts', ROOT, signal) })
      .toThrow('"a.ts" has no parent directory')
    expect(() => { face.removeEntry(TAB, 'a.ts', 'file', ROOT, signal) })
      .toThrow('"a.ts" has no parent directory')
    expect(mutations.move.mock).not.toHaveBeenCalled()
    expect(mutations.remove.mock).not.toHaveBeenCalled()
  })
})
