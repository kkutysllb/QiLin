/**
 * The editor's asynchronous half against scripted reads and writes.
 *
 * What matters is what reaches the store and when: a read resets the bucket
 * before it goes out and lands as loaded or failed; a save marks saving and
 * lands as saved (text + version) or failed (conflict on stale); a force save
 * omits `baseVersion`; a record that is gone, or a retired call, writes
 * nothing.
 */
import { describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { RemoteError } from '@qilin/client-test-runtime'
import type { SessionId } from '@qilin/session/types'
import type { TabId } from '@qilin/client-ui-dockkit'
import { fileEditFace } from '../src/client/file-face.ts'
import type { WriteWorkspaceFile } from '../src/client/file-face.ts'
import type { SessionFile } from '../src/client/file-guard.ts'
import type { WholeFileResult } from '../src/client/file-pages.ts'
import { createFilesStore } from '../src/client/store.ts'

const SESSION = 's-1' as SessionId
const TAB = 'tab-1' as TabId
const FILE: SessionFile = { sessionId: SESSION, path: 'src/a.ts' }

/** One deferred call, as the spec settles it. */
function scripted<A extends unknown[], R>(): { fn: Mock<(...args: A) => Promise<R>>; calls: { args: A; resolve(result: R): void }[] } {
  const calls: { args: A; resolve(result: R): void }[] = []
  const fn = vi.fn<(...args: A) => Promise<R>>((...args: A) =>
    new Promise<R>((resolve) => { calls.push({ args, resolve }) }))
  return { fn, calls }
}

function mount() {
  const instance = createFilesStore().create()
  const reads = scripted<[SessionId, string, AbortSignal], WholeFileResult>()
  const writes = scripted<
    [SessionId, string, string, { readonly baseVersion?: string }, AbortSignal],
    Awaited<ReturnType<WriteWorkspaceFile>>
  >()
  const face = fileEditFace(reads.fn, writes.fn)(SESSION, instance.actions)
  const edit = () => instance.getSnapshot().edits[TAB]
  return { face, reads, writes, edit }
}

/** Settle one scripted call and flush the face's then-chain into the store. */
async function land(settle: () => void): Promise<void> {
  settle()
  await Promise.resolve()
  await Promise.resolve()
}

describe('fileEditFace', () => {
  it('readFile resets the bucket, then lands the whole file', async () => {
    const { face, reads, edit } = mount()
    const signal = new AbortController().signal
    face.readFile(TAB, FILE, signal)
    expect(reads.fn).toHaveBeenCalledWith(SESSION, FILE.path, signal)
    expect(edit()).toMatchObject({ phase: { kind: 'reading' } })
    await land(() => reads.calls[0]!.resolve({ ok: true, value: { text: 'one', version: 'v1' } }))
    expect(edit()).toMatchObject({ phase: { kind: 'ready' }, text: 'one', version: 'v1' })
  })

  it('a failed read lands under its code', async () => {
    const { face, reads, edit } = mount()
    const signal = new AbortController().signal
    face.readFile(TAB, FILE, signal)
    const error = new RemoteError('workspace-file/not-text', 'NUL', { path: FILE.path })
    await land(() => reads.calls[0]!.resolve({ ok: false, error }))
    expect(edit()!.phase).toEqual({ kind: 'failed', failure: error })
  })

  it('saveFile writes against the given baseVersion and lands the saved version', async () => {
    const { face, reads, writes, edit } = mount()
    const signal = new AbortController().signal
    face.readFile(TAB, FILE, signal)
    await land(() => reads.calls[0]!.resolve({ ok: true, value: { text: 'one', version: 'v1' } }))
    face.saveFile(TAB, FILE, 'one!', { baseVersion: 'v1', force: false }, signal)
    expect(writes.fn).toHaveBeenCalledWith(SESSION, FILE.path, 'one!', { baseVersion: 'v1' }, signal)
    expect(edit()).toMatchObject({ saving: true })
    await land(() => writes.calls[0]!.resolve({ ok: true, value: { absolutePath: '/a.ts', version: 'v2' } }))
    expect(edit()).toMatchObject({ saving: false, saveState: 'saved', text: 'one!', version: 'v2' })
  })

  it('a force save omits baseVersion; a stale answer raises the conflict', async () => {
    const { face, reads, writes, edit } = mount()
    const signal = new AbortController().signal
    face.readFile(TAB, FILE, signal)
    await land(() => reads.calls[0]!.resolve({ ok: true, value: { text: 'one', version: 'v1' } }))
    face.saveFile(TAB, FILE, 'one!', { baseVersion: 'v1', force: true }, signal)
    expect(writes.calls[0]!.args[3]).toEqual({})
    const error = new RemoteError('workspace-file/stale', 'moved on', { path: FILE.path })
    await land(() => writes.calls[0]!.resolve({ ok: false, error }))
    expect(edit()).toMatchObject({ saveState: 'failed', conflict: true, text: 'one', version: 'v1' })
  })

  it('a save failure that is not stale keeps the conflict down', async () => {
    const { face, writes, edit } = mount()
    const signal = new AbortController().signal
    face.readFile(TAB, FILE, signal)
    face.saveFile(TAB, FILE, 'x', { baseVersion: '', force: true }, signal)
    const error = new RemoteError('workspace-file/too-large', 'cap', { path: FILE.path, limit: 1 })
    await land(() => writes.calls[0]!.resolve({ ok: false, error }))
    expect(edit()).toMatchObject({ saveState: 'failed', conflict: false })
  })

  it('an aborted record makes no request and forgets its bookkeeping', () => {
    const { face, reads, writes, edit } = mount()
    const controller = new AbortController()
    controller.abort()
    face.readFile(TAB, FILE, controller.signal)
    face.saveFile(TAB, FILE, 'x', { baseVersion: '', force: false }, controller.signal)
    expect(reads.fn).not.toHaveBeenCalled()
    expect(writes.fn).not.toHaveBeenCalled()
    expect(edit()).toBeUndefined()
  })

  it('a save overtaken by another writes nothing when it lands', async () => {
    const { face, reads, writes, edit } = mount()
    const signal = new AbortController().signal
    face.readFile(TAB, FILE, signal)
    await land(() => reads.calls[0]!.resolve({ ok: true, value: { text: 'one', version: 'v1' } }))
    face.saveFile(TAB, FILE, 'first', { baseVersion: 'v1', force: false }, signal)
    face.saveFile(TAB, FILE, 'second', { baseVersion: 'v1', force: false }, signal)
    expect(writes.calls.length).toBe(2)
    await land(() => writes.calls[1]!.resolve({ ok: true, value: { absolutePath: '/a.ts', version: 'v3' } }))
    expect(edit()).toMatchObject({ saveState: 'saved', text: 'second', version: 'v3' })
    await land(() => writes.calls[0]!.resolve({ ok: true, value: { absolutePath: '/a.ts', version: 'v2' } }))
    // The retired save lands afterwards and changes nothing.
    expect(edit()).toMatchObject({ saveState: 'saved', text: 'second', version: 'v3' })
  })

  it('a retirement lets only the latest call write: the older read lands after and changes nothing', async () => {
    const { face, reads, edit } = mount()
    const signal = new AbortController().signal
    face.readFile(TAB, FILE, signal)
    face.readFile(TAB, FILE, signal)
    expect(reads.calls.length).toBe(2)
    await land(() => reads.calls[1]!.resolve({ ok: true, value: { text: 'newest', version: 'v2' } }))
    expect(edit()).toMatchObject({ text: 'newest' })
    await land(() => reads.calls[0]!.resolve({ ok: true, value: { text: 'oldest', version: 'v1' } }))
    expect(edit()).toMatchObject({ text: 'newest', version: 'v2' })
  })
})
