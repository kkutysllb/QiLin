/**
 * The editor's write set, one tab at a time.
 *
 * The load-bearing facts the body relies on: a load becomes the clean content
 * and bumps `loadSeq` (the surface remounts), a draft marks the tab dirty and
 * is what a remount restores, a save lands the written text and its version
 * as the new clean content, and the stale refusal keeps the draft intact
 * behind the conflict.
 */
import { describe, expect, it } from 'vitest'
import { RemoteError } from '@qilin/client-test-runtime'
import { createFilesStore } from '../src/client/store.ts'
import type { TabId } from '@qilin/client-ui-dockkit'

const TAB = 'tab-f' as TabId

function mounted() {
  const store = createFilesStore().create()
  const get = () => store.getSnapshot().edits[TAB]
  return { store, actions: store.actions, get }
}

describe('file edit store', () => {
  it('starts a fresh read', () => {
    const { actions, get, store } = mounted()
    actions.editRead(TAB)
    expect(get()).toMatchObject({ phase: { kind: 'reading' }, dirty: false, wrap: true, loadSeq: 0 })
    expect(store.getSnapshot().byTab).toEqual({})
  })

  it('refuses writes before the first read', () => {
    const { actions } = mounted()
    expect(() => actions.editDraft(TAB, 'x')).toThrow('no editor for tab "tab-f"')
  })

  it('a load becomes the clean content and remounts the surface', () => {
    const { actions, get } = mounted()
    actions.editRead(TAB)
    actions.editLoaded(TAB, 'one\ntwo', 'v1')
    expect(get()).toMatchObject({ phase: { kind: 'ready' }, text: 'one\ntwo', version: 'v1', dirty: false, draft: undefined, loadSeq: 1 })
    actions.editDraft(TAB, 'one\ntwo\nthree')
    actions.editRead(TAB)
    actions.editLoaded(TAB, 'fresh', 'v2')
    // The reload dropped the draft and remounted again: `loadSeq` only climbs.
    expect(get()).toMatchObject({ text: 'fresh', version: 'v2', dirty: false, draft: undefined, loadSeq: 2 })
  })

  it('a draft marks the tab dirty and clears a finished save\'s status', () => {
    const { actions, get } = mounted()
    actions.editRead(TAB)
    actions.editLoaded(TAB, 'one', 'v1')
    actions.editSaved(TAB, 'one', 'v2')
    expect(get()).toMatchObject({ saveState: 'saved', dirty: false })
    actions.editDraft(TAB, 'one!')
    expect(get()).toMatchObject({ dirty: true, draft: 'one!', saveState: 'idle', saveFailure: undefined })
  })

  it('a save lands the written text and version, and clears the draft', () => {
    const { actions, get } = mounted()
    actions.editRead(TAB)
    actions.editLoaded(TAB, 'one', 'v1')
    actions.editDraft(TAB, 'one!')
    actions.editSaving(TAB)
    expect(get()).toMatchObject({ saving: true, saveState: 'idle' })
    actions.editSaved(TAB, 'one!', 'v9')
    expect(get()).toMatchObject({ saving: false, saveState: 'saved', text: 'one!', version: 'v9', dirty: false, draft: undefined, conflict: false })
  })

  it('a stale refusal keeps the draft behind the conflict; another failure does not', () => {
    const { actions, get } = mounted()
    actions.editRead(TAB)
    actions.editLoaded(TAB, 'one', 'v1')
    actions.editDraft(TAB, 'mine')
    actions.editSaving(TAB)
    actions.editSaveFailed(TAB, new RemoteError('workspace-file/stale', 'moved on', { path: 'p' }))
    expect(get()).toMatchObject({ saving: false, saveState: 'failed', conflict: true, draft: 'mine', dirty: true })
    // A non-stale failure clears the conflict: the banner is not its business.
    actions.editSaveFailed(TAB, new RemoteError('workspace-file/not-regular-file', 'dir', { path: 'p', kind: 'directory' }))
    expect(get()).toMatchObject({ conflict: false, saveState: 'failed' })
  })

  it('a read failure names its code, and wrap flips in place', () => {
    const { actions, get } = mounted()
    actions.editRead(TAB)
    const failure = new RemoteError('workspace-file/not-found', 'gone', { path: 'p' })
    actions.editFailed(TAB, failure)
    expect(get()!.phase).toEqual({ kind: 'failed', failure })
    actions.editWrap(TAB, false)
    expect(get()!.wrap).toBe(false)
  })

  it('editForget removes exactly the tab that went away', () => {
    const { actions, get, store } = mounted()
    const other = 'tab-g' as TabId
    actions.editRead(other)
    actions.editForget(TAB)
    expect(get()).toBeUndefined()
    expect(store.getSnapshot().edits[other]).toBeDefined()
  })
})
