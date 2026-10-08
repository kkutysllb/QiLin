/**
 * The tree's write set, one tab at a time.
 *
 * Two facts here are load-bearing for the body: a collapsed level keeps what it
 * loaded (reopening draws at once), and `reset` clears levels while keeping the
 * expanded set, which is what lets the reload gesture know which levels to ask
 * for again.
 */
import { describe, expect, it } from 'vitest'
import { RemoteError } from '@qilin-agent/client-test-runtime'
import { createFilesStore } from '../src/client/store.ts'
import type { DirLevel } from '../src/client/store.ts'
import type { TabId } from '@qilin-agent/client-ui-dockkit'

const ROOT = '/work/app'
const TAB = 'tab-1' as TabId

const LEVEL: DirLevel = {
  entries: [{ name: 'src', type: 'directory' }, { name: 'README.md', type: 'file', size: 12 }],
  truncated: false,
}

describe('createFilesStore', () => {
  it('mints an independent instance per call', () => {
    const first = createFilesStore().create()
    const second = createFilesStore().create()
    first.actions.start(TAB, ROOT)
    expect(second.getSnapshot().byTab[TAB]).toBeUndefined()
  })

  it('seeds a tab at its root with the root expanded and nothing loaded', () => {
    const store = createFilesStore().create()
    const { actions } = store
    const getSnapshot = (): ReturnType<typeof store.getSnapshot> => store.getSnapshot()
    actions.start(TAB, ROOT)
    expect(getSnapshot().byTab[TAB]).toEqual({
      root: ROOT, levels: {}, expanded: [ROOT], scrollTop: 0, search: { kind: 'idle', query: '' }, mutation: { kind: 'idle' },
    })
  })

  it('walks one level through loading, ready, and failed', () => {
    const store = createFilesStore().create()
    const { actions } = store
    const getSnapshot = (): ReturnType<typeof store.getSnapshot> => store.getSnapshot()
    actions.start(TAB, ROOT)
    actions.loading(TAB, ROOT)
    expect(getSnapshot().byTab[TAB]!.levels[ROOT]).toEqual({ kind: 'loading' })
    actions.loaded(TAB, ROOT, LEVEL)
    expect(getSnapshot().byTab[TAB]!.levels[ROOT]).toEqual({ kind: 'ready', level: LEVEL })
    const failure = new RemoteError('workspace-file/not-found', 'gone', { path: ROOT })
    actions.failed(TAB, ROOT, failure)
    expect(getSnapshot().byTab[TAB]!.levels[ROOT]).toEqual({ kind: 'failed', failure })
  })

  it('toggles a directory in and out of the expanded set without touching its level', () => {
    const store = createFilesStore().create()
    const { actions } = store
    const getSnapshot = (): ReturnType<typeof store.getSnapshot> => store.getSnapshot()
    const child = `${ROOT}/src`
    actions.start(TAB, ROOT)
    actions.loaded(TAB, child, LEVEL)
    actions.toggled(TAB, child)
    expect(getSnapshot().byTab[TAB]!.expanded).toEqual([ROOT, child])
    actions.toggled(TAB, child)
    expect(getSnapshot().byTab[TAB]!.expanded).toEqual([ROOT])
    // Collapsing keeps the listing, so reopening draws without another fetch.
    expect(getSnapshot().byTab[TAB]!.levels[child]).toEqual({ kind: 'ready', level: LEVEL })
  })

  it('reset drops every level and keeps the expanded set', () => {
    const store = createFilesStore().create()
    const { actions } = store
    const getSnapshot = (): ReturnType<typeof store.getSnapshot> => store.getSnapshot()
    const child = `${ROOT}/src`
    actions.start(TAB, ROOT)
    actions.loaded(TAB, ROOT, LEVEL)
    actions.toggled(TAB, child)
    actions.loaded(TAB, child, LEVEL)
    actions.reset(TAB)
    expect(getSnapshot().byTab[TAB]).toEqual({
      root: ROOT, levels: {}, expanded: [ROOT, child], scrollTop: 0, search: { kind: 'idle', query: '' }, mutation: { kind: 'idle' },
    })
  })

  it('remembers where the body is scrolled to', () => {
    const store = createFilesStore().create()
    const { actions } = store
    actions.start(TAB, ROOT)
    actions.scrolled(TAB, 120)
    expect(store.getSnapshot().byTab[TAB]!.scrollTop).toBe(120)
  })

  it('refuses to write a level for a tab that was never started', () => {
    const { actions } = createFilesStore().create()
    expect(() => { actions.loading('tab-nowhere' as TabId, ROOT) }).toThrow('no tree for tab "tab-nowhere"')
  })

  it('forget removes exactly the tab that went away', () => {
    const store = createFilesStore().create()
    const { actions } = store
    const getSnapshot = (): ReturnType<typeof store.getSnapshot> => store.getSnapshot()
    actions.start(TAB, ROOT)
    actions.start('tab-2' as TabId, ROOT)
    actions.forget(TAB)
    expect(Object.keys(getSnapshot().byTab)).toEqual(['tab-2'])
  })

  it('walks the search through typed, running, ready, and failed', () => {
    const store = createFilesStore().create()
    const { actions } = store
    const getSnapshot = (): ReturnType<typeof store.getSnapshot> => store.getSnapshot()
    actions.start(TAB, ROOT)
    // Typing drops whatever the previous text had answered, whatever it was.
    actions.searchRunning(TAB, 're')
    actions.searchTyped(TAB, 'read')
    expect(getSnapshot().byTab[TAB]!.search).toEqual({ kind: 'idle', query: 'read' })
    actions.searchRunning(TAB, 'read')
    expect(getSnapshot().byTab[TAB]!.search).toEqual({ kind: 'running', query: 'read' })
    actions.searchSettled(TAB, 'read', [{ path: 'README.md', bytes: 12 }], true)
    expect(getSnapshot().byTab[TAB]!.search).toEqual({
      kind: 'ready', query: 'read', matches: [{ path: 'README.md', bytes: 12 }], truncated: true,
    })
    const failure = new RemoteError('workspace-file/not-found', 'gone', { path: ROOT })
    actions.searchFailed(TAB, 'read', failure)
    expect(getSnapshot().byTab[TAB]!.search).toEqual({ kind: 'failed', query: 'read', failure })
    actions.searchCleared(TAB)
    expect(getSnapshot().byTab[TAB]!.search).toEqual({ kind: 'idle', query: '' })
  })

  it('walks one row mutation through running, failed, and cleared', () => {
    const store = createFilesStore().create()
    const { actions } = store
    const getSnapshot = (): ReturnType<typeof store.getSnapshot> => store.getSnapshot()
    actions.start(TAB, ROOT)
    expect(getSnapshot().byTab[TAB]!.mutation).toEqual({ kind: 'idle' })
    actions.mutationStarted(TAB)
    expect(getSnapshot().byTab[TAB]!.mutation).toEqual({ kind: 'running' })
    const failure = new RemoteError('workspace-file/exists', 'taken', { path: ROOT })
    actions.mutationFailed(TAB, failure)
    expect(getSnapshot().byTab[TAB]!.mutation).toEqual({ kind: 'failed', failure })
    actions.mutationCleared(TAB)
    expect(getSnapshot().byTab[TAB]!.mutation).toEqual({ kind: 'idle' })
  })

  it('refuses to record a row mutation for a tab that was never started', () => {
    const { actions } = createFilesStore().create()
    expect(() => { actions.mutationStarted('tab-nowhere' as TabId) }).toThrow('no tree for tab "tab-nowhere"')
  })
})
