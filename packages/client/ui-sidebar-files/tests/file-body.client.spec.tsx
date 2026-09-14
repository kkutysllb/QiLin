// @vitest-environment jsdom
/**
 * The editor body against a scripted tree, read, and write.
 *
 * What is asserted is the reader's and writer's contract: the tab's file is
 * read whole on mount and shown ready; tree rows open through the owner; the
 * dirty dot, save, reload, wrap, and the conflict banner follow the store;
 * reload with unsaved changes asks first; and a record that is gone leaves no
 * bucket behind. The CodeMirror surface itself is the adapter's suite.
 */
import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent } from '@testing-library/react'
import { RemoteError } from '@qilin/client-test-runtime'
import { EditorView } from '@codemirror/view'
import { fileAddressFor } from '@qilin/util-workspace-path'
import { ADDRESS, PATH, ROOT, SESSION, TAB, mountFileBody } from './mount-file.client.tsx'
import type { DirLevel } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

const READ = { ok: true as const, value: { text: 'one\ntwo', version: 'v1' } }
const ROOT_LEVEL: DirLevel = {
  entries: [{ name: 'src', type: 'directory' }, { name: 'README.md', type: 'file', size: 3 }],
  truncated: false,
}
const SRC_LEVEL: DirLevel = { entries: [{ name: 'a.ts', type: 'file', size: 7 }], truncated: false }

async function settled(cwd: string | null = ROOT) {
  const mounted = mountFileBody(cwd)
  await act(() => Promise.all([
    mounted.edits.settleRead(READ),
    mounted.script.settle({ ok: true, value: ROOT_LEVEL }),
  ]))
  return mounted
}

describe('FileBody', () => {
  it('says so when the session has no workspace directory, and asks for nothing', () => {
    const { view, script, edits } = mountFileBody(null)
    expect(view.container.querySelector('[data-file-state="no-workspace"]')?.textContent).toBe(zh.noWorkspace)
    expect(script.list).not.toHaveBeenCalled()
    expect(edits.readWhole).not.toHaveBeenCalled()
  })

  it('reads the tab\'s file whole on mount, seeds the tree, and shows the surface when ready', async () => {
    const { view, edits, script, controller } = await settled()
    expect(edits.readWhole).toHaveBeenCalledWith(SESSION, PATH, controller.signal)
    expect(script.list).toHaveBeenCalledWith(SESSION, ROOT, expect.any(AbortSignal))
    expect(view.container.querySelector('[data-file-state="ready"]')).not.toBeNull()
    expect(view.container.querySelector('[data-file-host] .cm-editor')).not.toBeNull()
    expect(view.container.querySelector('[data-file-path]')?.textContent).toBe(PATH)
    // The tree pane lists the workspace root.
    expect(view.container.querySelector(`[data-files-path="${ROOT}/src"]`)).not.toBeNull()
  })

  it('a tree row opens its session file address through the owner', async () => {
    const { view, script, tabActions } = await settled()
    act(() => { fireEvent.click(view.container.querySelector(`[data-files-path="${ROOT}/src"] > button`)!) })
    await act(() => script.settle({ ok: true, value: SRC_LEVEL }))
    const row = view.container.querySelector(`[data-files-path="${ROOT}/src/a.ts"] > button`)!
    fireEvent.click(row)
    expect(tabActions.openResource).toHaveBeenCalledWith(fileAddressFor(SESSION, ROOT, `${ROOT}/src/a.ts`))
    expect(tabActions.openResource).toHaveBeenCalledWith(ADDRESS)
  })

  it('preview opens the tab\'s address on the text viewer in this session', async () => {
    const { view, sidebarRight } = await settled()
    const button = view.container.querySelector('[data-file-preview]')!
    expect(button.getAttribute('aria-label')).toBe(zh['file.preview'])
    fireEvent.click(button)
    expect(sidebarRight.openResource).toHaveBeenCalledWith(ADDRESS, { kind: 'text', scope: SESSION })
  })

  it('the tree pane toggle hides and restores the pane', async () => {
    const { view } = await settled()
    expect(view.container.querySelector('[data-file-tree-open]')).not.toBeNull()
    act(() => { fireEvent.click(view.container.querySelector('[data-file-tree-toggle]')!) })
    expect(view.container.querySelector('[data-file-tree-open]')).toBeNull()
    act(() => { fireEvent.click(view.container.querySelector('[data-file-tree-toggle]')!) })
    expect(view.container.querySelector('[data-file-tree-open]')).not.toBeNull()
  })

  it('a dirty draft shows the dot, a save writes against the read version, and success lands the saved state', async () => {
    const { view, instance, edits } = await settled()
    expect(view.container.querySelector('[data-file-dirty]')).toBeNull()
    // Type into the surface: the adapter's update listener carries the whole
    // document into the store, which is what the toolbar reads.
    const surface = EditorView.findFromDOM(view.container.querySelector('.cm-editor')!)!
    act(() => { surface.dispatch({ changes: { from: surface.state.doc.length, insert: '!' } }) })
    expect(view.container.querySelector('[data-file-dirty]')).not.toBeNull()
    expect(instance.getSnapshot().edits[TAB]!.draft).toBe('one\ntwo!')
    fireEvent.click(view.container.querySelector('[data-file-save]')!)
    expect(edits.write).toHaveBeenCalledWith(SESSION, PATH, 'one\ntwo!', { baseVersion: 'v1' }, expect.any(AbortSignal))
    await act(() => edits.settleWrite({ ok: true, value: { absolutePath: '/work/a.ts', version: 'v2' } }))
    expect(view.container.querySelector('[data-file-dirty]')).toBeNull()
    expect(view.container.querySelector('[data-file-status]')?.textContent).toBe(zh['file.saved'])
  })

  it('Mod-s in the editor runs the same save', async () => {
    const { view, instance, edits } = await settled()
    act(() => { instance.actions.editDraft(TAB, 'typed') })
    const content = view.container.querySelector('.cm-content')!
    fireEvent(content, new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true }))
    expect(edits.write).toHaveBeenCalledWith(SESSION, PATH, 'typed', { baseVersion: 'v1' }, expect.any(AbortSignal))
  })

  it('a stale save raises the conflict banner; overwrite drops the version, reload discards the draft', async () => {
    const { view, instance, edits } = await settled()
    act(() => { instance.actions.editDraft(TAB, 'mine') })
    fireEvent.click(view.container.querySelector('[data-file-save]')!)
    const stale = new RemoteError('workspace-file/stale', 'moved on', { path: PATH })
    await act(() => edits.settleWrite({ ok: false, error: stale }))
    const banner = view.container.querySelector('[data-file-conflict-banner]')!
    expect(banner).not.toBeNull()
    expect(banner.textContent).toContain(zh['file.conflict'])
    // The draft survives the refusal.
    expect(instance.getSnapshot().edits[TAB]).toMatchObject({ draft: 'mine', conflict: true })
    edits.write.mockClear()
    fireEvent.click(view.container.querySelector('[data-file-conflict-overwrite]')!)
    expect(edits.write).toHaveBeenCalledWith(SESSION, PATH, 'mine', {}, expect.any(AbortSignal))
    await act(() => edits.settleWrite({ ok: true, value: { absolutePath: '/work/a.ts', version: 'v9' } }))
    expect(view.container.querySelector('[data-file-conflict-banner]')).toBeNull()
    expect(instance.getSnapshot().edits[TAB]).toMatchObject({ text: 'mine', version: 'v9' })
  })

  it('the conflict\'s reload reads the disk again and drops the draft', async () => {
    const { view, instance, edits } = await settled()
    act(() => { instance.actions.editDraft(TAB, 'mine') })
    fireEvent.click(view.container.querySelector('[data-file-save]')!)
    await act(() => edits.settleWrite({ ok: false, error: new RemoteError('workspace-file/stale', 'moved on', { path: PATH }) }))
    edits.readWhole.mockClear()
    fireEvent.click(view.container.querySelector('[data-file-conflict-reload]')!)
    expect(edits.readWhole).toHaveBeenCalledTimes(1)
    await act(() => edits.settleRead(READ))
    expect(instance.getSnapshot().edits[TAB]).toMatchObject({ draft: undefined, dirty: false, text: 'one\ntwo' })
  })

  it('a navigation carrying a line lands the selection there, clamped into the file', async () => {
    const { view, navigate } = await settled()
    const surface = () => EditorView.findFromDOM(view.container.querySelector('.cm-editor')!)!
    expect(surface().state.selection.main.head).toBe(0)
    navigate({ line: 2 })
    expect(surface().state.selection.main.head).toBe(surface().state.doc.line(2).from)
    // Beyond the end clamps to the last line; before the first clamps up.
    navigate({ line: 99 })
    expect(surface().state.selection.main.head).toBe(surface().state.doc.line(2).from)
    navigate({ line: 0 })
    expect(surface().state.selection.main.head).toBe(0)
  })

  it('a line carried by the opening navigation answers when the surface mounts', async () => {
    const { view, edits } = mountFileBody(ROOT, { line: 2 })
    // Still reading: nothing to land on yet, and nothing answered.
    expect(view.container.querySelector('.cm-editor')).toBeNull()
    await act(() => edits.settleRead(READ))
    const surface = EditorView.findFromDOM(view.container.querySelector('.cm-editor')!)!
    expect(surface.state.selection.main.head).toBe(surface.state.doc.line(2).from)
  })

  it('one navigation revision is answered once; a params-only navigation lands nothing', async () => {
    const { view, instance, navigate } = await settled()
    navigate({ line: 2 })
    const surface = () => EditorView.findFromDOM(view.container.querySelector('.cm-editor')!)!
    expect(surface().state.selection.main.head).toBe(surface().state.doc.line(2).from)
    // The reader moves elsewhere; the answered revision must not re-jump them.
    act(() => { surface().dispatch({ selection: { anchor: 0 } }) })
    act(() => { instance.actions.editDraft(TAB, 'one\ntwo!') })
    expect(surface().state.selection.main.head).toBe(0)
    // Params without a line navigate quietly.
    navigate({})
    expect(surface().state.selection.main.head).toBe(0)
  })

  it('Mod-s while a save is in flight does not double-save', async () => {
    const { view, edits } = await settled()
    fireEvent.click(view.container.querySelector('[data-file-save]')!)
    const content = view.container.querySelector('.cm-content')!
    fireEvent(content, new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true }))
    expect(edits.write).toHaveBeenCalledTimes(1)
    await act(() => edits.settleWrite({ ok: true, value: { absolutePath: '/work/a.ts', version: 'v2' } }))
  })

  it('a save gesture before the file is ready does nothing', async () => {
    const mounted = mountFileBody()
    await act(() => mounted.edits.settleRead({ ok: false, error: new RemoteError('workspace-file/not-found', 'gone', { path: PATH }) }))
    // The toolbar is up while the read failed; saving refuses quietly.
    fireEvent.click(mounted.view.container.querySelector('[data-file-save]')!)
    expect(mounted.edits.write).not.toHaveBeenCalled()
  })

  it('reload with unsaved changes asks first; confirmed, it discards; clean, it just reads', async () => {
    const { view, instance, edits } = await settled()
    // Clean: reload reads at once (the second read; the mount did the first).
    fireEvent.click(view.container.querySelector('[data-file-reload]')!)
    expect(edits.readWhole).toHaveBeenCalledTimes(2)
    await act(() => edits.settleRead(READ))
    // Dirty: reload asks.
    act(() => { instance.actions.editDraft(TAB, 'keep me') })
    fireEvent.click(view.container.querySelector('[data-file-reload]')!)
    expect(view.container.querySelector('[data-file-confirm]')?.textContent).toContain(zh['file.reloadDirty'])
    expect(edits.readWhole).toHaveBeenCalledTimes(2)
    fireEvent.click(view.container.querySelector('[data-file-confirm-cancel]')!)
    expect(view.container.querySelector('[data-file-confirm]')).toBeNull()
    expect(instance.getSnapshot().edits[TAB]!.draft).toBe('keep me')
    fireEvent.click(view.container.querySelector('[data-file-reload]')!)
    fireEvent.click(view.container.querySelector('[data-file-confirm-reload]')!)
    expect(edits.readWhole).toHaveBeenCalledTimes(3)
    await act(() => edits.settleRead(READ))
    expect(instance.getSnapshot().edits[TAB]).toMatchObject({ draft: undefined, dirty: false })
  })

  it('a failed read names its code; reload recovers; a failed save shows its line', async () => {
    const mounted = mountFileBody()
    await act(() => mounted.edits.settleRead({ ok: false, error: new RemoteError('workspace-file/not-found', 'gone', { path: PATH }) }))
    const failed = mounted.view.container.querySelector('[data-file-row="failed"]')!
    expect(failed.getAttribute('data-file-code')).toBe('workspace-file/not-found')
    expect(failed.textContent).toBe(zh['file.error.notFound'])
    // A clean reload reads again without asking: nothing to discard.
    fireEvent.click(mounted.view.container.querySelector('[data-file-reload]')!)
    await act(() => mounted.edits.settleRead(READ))
    expect(mounted.view.container.querySelector('[data-file-state="ready"]')).not.toBeNull()
    act(() => { mounted.instance.actions.editDraft(TAB, 'x') })
    fireEvent.click(mounted.view.container.querySelector('[data-file-save]')!)
    await act(() => mounted.edits.settleWrite({ ok: false, error: new RemoteError('workspace-file/not-regular-file', 'dir', { path: PATH, kind: 'directory' }) }))
    expect(mounted.view.container.querySelector('[data-file-status]')?.textContent).toBe(zh['file.error.notRegularFile'])
  })

  it('a save in flight disables the controls', async () => {
    const { view, edits } = await settled()
    fireEvent.click(view.container.querySelector('[data-file-save]')!)
    expect((view.container.querySelector('[data-file-save]') as HTMLButtonElement).disabled).toBe(true)
    expect((view.container.querySelector('[data-file-reload]') as HTMLButtonElement).disabled).toBe(true)
    expect((view.container.querySelector('[data-file-wrap]') as HTMLButtonElement).disabled).toBe(true)
    expect(view.container.querySelector('[data-file-status]')?.textContent).toBe(zh['file.saving'])
    await act(() => edits.settleWrite({ ok: true, value: { absolutePath: '/work/a.ts', version: 'v2' } }))
    expect((view.container.querySelector('[data-file-save]') as HTMLButtonElement).disabled).toBe(false)
  })

  it('the wrap toggle flips the store and reaches the surface', async () => {
    const { view, instance } = await settled()
    const wrap = view.container.querySelector('[data-file-wrap]')!
    expect(wrap.getAttribute('aria-pressed')).toBe('true')
    act(() => { fireEvent.click(wrap) })
    expect(wrap.getAttribute('aria-pressed')).toBe('false')
    expect(instance.getSnapshot().edits[TAB]!.wrap).toBe(false)
  })

  it('a failed save\'s status yields to the conflict banner, and a fresh edit clears it', async () => {
    const { view, instance, edits } = await settled()
    fireEvent.click(view.container.querySelector('[data-file-save]')!)
    await act(() => edits.settleWrite({ ok: false, error: new RemoteError('workspace-file/stale', 'moved on', { path: PATH }) }))
    // Stale is the banner's business: no duplicated status line.
    expect(view.container.querySelector('[data-file-status]')).toBeNull()
    act(() => { instance.actions.editDraft(TAB, 'again') })
    expect(view.container.querySelector('[data-file-status]')).toBeNull()
    expect(view.container.querySelector('[data-file-confirm]')).toBeNull()
  })

  it('an aborted record is forgotten and not re-read while the body is still mounted', async () => {
    const { view, instance, controller, edits } = await settled()
    act(() => { controller.abort() })
    expect(instance.getSnapshot().edits[TAB]).toBeUndefined()
    expect(instance.getSnapshot().byTab[TAB]).toBeUndefined()
    expect(view.container.querySelector('[data-file-state="loading"]')).not.toBeNull()
    expect(edits.readWhole).toHaveBeenCalledTimes(1)
  })
})
