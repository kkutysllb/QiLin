// @vitest-environment jsdom
/** Branch coverage for the original-file menu contributions: every action, save outcome, and source shape. */
import { Context } from '@qilin-agent/kylin'
import { SessionId } from '@qilin-agent/session'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FileActions, FileActionSource, FileSaveResult } from '../src/types.ts'
import type { FileActionKey } from '../src/client/locales.ts'
import { en } from '../src/client/locales.ts'
import { registerFileMenus } from '../src/client/context-menus.tsx'

const t = (key: FileActionKey): string => en[key]

interface Contribution {
  readonly id: string
  readonly target: string
  readonly resolve: (target: Record<string, unknown>, signal: AbortSignal) => unknown
}

interface MenuAction {
  readonly id: string
  readonly label: string
  readonly icon: { readonly key: string }
  readonly disabled?: boolean
  readonly failureLabel?: string
  readonly separatorBefore?: boolean
  readonly run?: () => Promise<void> | void
}

/** Menu actions one resolve produced, keyed by their un-prefixed id. */
type Actions = readonly MenuAction[]

const BASE = 'http://localhost:3000/'
const originalBase = Object.getOwnPropertyDescriptor(document, 'baseURI')

afterEach(() => {
  if (originalBase === undefined) delete (document as { baseURI?: string }).baseURI
  else Object.defineProperty(document, 'baseURI', originalBase)
  delete (document.documentElement.dataset as { platform?: string }).platform
  vi.restoreAllMocks()
})

function stubBase(value: string): void {
  Object.defineProperty(document, 'baseURI', { configurable: true, get: () => value })
}

function actionsWith(over: {
  canSaveAs?: boolean
  save?: (source: FileActionSource, mode: 'download' | 'saveAs') => Promise<FileSaveResult>
  copyImage?: (source: FileActionSource) => Promise<void>
} = {}): FileActions {
  return {
    canSaveAs: over.canSaveAs ?? false,
    save: over.save ?? vi.fn(async () => ({ status: 'cancelled' as const })),
    copyImage: over.copyImage ?? vi.fn(async (_source: FileActionSource): Promise<void> => {}),
  }
}

async function bench(over: {
  actions?: FileActions
  stat?: (sessionId: string, path: string) => Promise<unknown>
  readBytes?: (sessionId: string, path: string) => Promise<unknown>
  openWorkspacePath?: (request: { path: string; action: string }) => Promise<unknown>
} = {}) {
  const ctx = new Context()
  const contributions: Contribution[] = []
  const notify = vi.fn()
  ctx.provide('contextMenus', {
    register: (contribution: Contribution) => {
      contributions.push(contribution)
      return () => { contributions.splice(contributions.indexOf(contribution), 1) }
    },
    notify,
  } as never)
  const stat = vi.fn(over.stat ?? (async () => ({ ok: true, value: { absolutePath: '/ws/photo.png' } })))
  const readBytes = vi.fn(over.readBytes ?? (async () => ({ ok: true, value: { data: [1, 2, 3] } })))
  const openWorkspacePath = vi.fn(over.openWorkspacePath ?? (async () => ({ ok: true, value: { opened: true } })))
  ctx.provide('remote', {
    workspaceFiles: { stat, readBytes },
    session: { openWorkspacePath },
  } as never)
  const actions = over.actions ?? actionsWith()
  const fiber = ctx.plugin({ name: 'file-actions-test', apply: (child) => { registerFileMenus(child, actions, t) } })
  await fiber.await()
  const contribution = (id: string): Contribution => {
    const found = contributions.find(entry => entry.id === id)
    if (found === undefined) throw new Error('missing contribution ' + id)
    return found
  }
  const resolveFile = async (path: string): Promise<Actions> =>
    await contribution('file-actions.file').resolve(
      { sessionId: SessionId('s1'), path }, new AbortController().signal,
    ) as Actions
  const resolveImage = (value: Record<string, unknown>): Actions =>
    contribution('file-actions.image').resolve(value, new AbortController().signal) as Actions
  const byId = (actions: Actions, id: string): MenuAction => {
    const found = actions.find(action => action.id === id)
    if (found === undefined) throw new Error('missing action ' + id)
    return found
  }
  return { ctx, fiber, contributions, notify, stat, readBytes, openWorkspacePath, resolveFile, resolveImage, byId }
}

describe('file target menu', () => {
  it('offers copy, download, and save-as for an image and reports each completed save', async () => {
    document.documentElement.dataset.platform = 'darwin'
    const save = vi.fn(async (): Promise<FileSaveResult> => ({ status: 'saved', path: '/dl/photo.png' }))
    const copyImage = vi.fn(async (_source: FileActionSource): Promise<void> => {})
    const b = await bench({ actions: actionsWith({ canSaveAs: true, save, copyImage }) })
    try {
      const actions = await b.resolveFile('photo.png')
      expect(actions.map(action => action.id)).toEqual(['copyImage', 'download', 'saveAs'])
      expect(actions.map(action => action.label)).toEqual([
        'Copy image', 'Download', 'Save as…',
      ])
      expect(actions[0]?.separatorBefore).toBe(true)
      expect(actions.map(action => action.icon.key)).toEqual([
        'file-actions.copy', 'file-actions.download', 'file-actions.save',
      ])
      expect(actions.every(action => action.disabled === false)).toBe(true)
      // The retained source names the original file above its bytes reader.
      void b.byId(actions, 'copyImage').run?.()
      await vi.waitFor(() => { expect(copyImage).toHaveBeenCalledOnce() })
      expect(copyImage.mock.calls[0]?.[0]).toMatchObject({
        url: BASE + 'api/file?path=%2Fws%2Fphoto.png',
        name: 'photo.png',
        mediaType: 'image/png',
      })
      expect(b.notify).toHaveBeenCalledWith('Copied', true)

      b.notify.mockClear()
      void b.byId(actions, 'download').run?.()
      await vi.waitFor(() => { expect(save).toHaveBeenCalledWith(expect.anything(), 'download') })
      const [, , details] = b.notify.mock.calls[0] as [string, boolean, {
        label: string
        failureLabel: string
        run: () => Promise<void>
      }]
      expect(b.notify.mock.calls[0]?.slice(0, 2)).toEqual(['Download complete', true])
      expect(details.label).toBe('Show in Finder')
      expect(details.failureLabel).toBe('Could not show the file location. Try again.')
      await details.run()
      expect(b.openWorkspacePath).toHaveBeenCalledWith(
        { path: '/dl/photo.png', action: 'reveal' }, expect.any(AbortSignal),
      )

      b.openWorkspacePath.mockResolvedValueOnce({ ok: false, error: { code: 'denied' } })
      await expect(details.run()).rejects.toThrow('File location unavailable')

      b.notify.mockClear()
      void b.byId(actions, 'saveAs').run?.()
      await vi.waitFor(() => { expect(b.notify).toHaveBeenCalledOnce() })
      expect(b.notify.mock.calls[0]?.[0]).toBe('Saved')
      expect((b.notify.mock.calls[0]?.[2] as { label: string }).label).toBe('Show in Finder')
    } finally { await b.fiber.dispose() }
  })

  it('reports a started download without a reveal affordance and a cancelled save silently', async () => {
    const requested = vi.fn(async (): Promise<FileSaveResult> => ({ status: 'requested' }))
    const cancelled = vi.fn(async (): Promise<FileSaveResult> => ({ status: 'cancelled' }))
    const b = await bench({ actions: actionsWith({ save: requested }) })
    try {
      const [download] = await b.resolveFile('report.txt')
      expect(download?.id).toBe('download')
      expect(download?.label).toBe('Download')
      void download?.run?.()
      await vi.waitFor(() => { expect(b.notify).toHaveBeenCalledWith('Download started', true, undefined) })

      // Outside macOS the completion names the generic reveal, not Finder.
      b.notify.mockClear()
      const saved = await bench({ actions: actionsWith({ save: async () => ({ status: 'saved', path: '/dl/report.txt' }) }) })
      try {
        const [savedDownload] = await saved.resolveFile('report.txt')
        void savedDownload?.run?.()
        await vi.waitFor(() => { expect(saved.notify).toHaveBeenCalledOnce() })
        expect((saved.notify.mock.calls[0]?.[2] as { label: string }).label).toBe('Show in folder')
      } finally { await saved.fiber.dispose() }

      b.notify.mockClear()
      const c = await bench({ actions: actionsWith({ save: cancelled }) })
      try {
        const [only] = await c.resolveFile('report.txt')
        void only?.run?.()
        await vi.waitFor(() => { expect(c.notify).not.toHaveBeenCalled() })
      } finally { await c.fiber.dispose() }
    } finally { await b.fiber.dispose() }
  })

  it('disables metadata-dependent actions when the stat result fails or the carrier throws', async () => {
    const b = await bench({
      actions: actionsWith({ canSaveAs: true }),
      stat: async () => ({ ok: false, error: { code: 'not-found' } }),
    })
    try {
      // A non-image file with a save picker offers only save-as; the failed stat keeps it disabled.
      const actions = await b.resolveFile('notes.md')
      expect(actions.map(action => action.id)).toEqual(['saveAs'])
      expect(actions[0]?.disabled).toBe(true)
    } finally { await b.fiber.dispose() }

    const thrown = await bench({
      stat: async () => { throw new Error('remote unavailable') },
    })
    try {
      const actions = await thrown.resolveFile('notes.md')
      expect(actions.map(action => action.id)).toEqual(['download'])
      expect(actions[0]?.disabled).toBe(true)
    } finally { await thrown.fiber.dispose() }
  })

  it('falls back to the recorded path when the document cannot serve the original', async () => {
    stubBase('app://qilin/index.html')
    const save = vi.fn(async (_source: FileActionSource, _mode: 'download' | 'saveAs'): Promise<FileSaveResult> => ({ status: 'cancelled' }))
    const b = await bench({
      actions: actionsWith({ save }),
      stat: async () => { throw new Error('remote unavailable') },
    })
    try {
      const actions = await b.resolveFile('dir\\blob.unknownext')
      expect(actions.map(action => action.id)).toEqual(['download'])
      expect(actions[0]?.disabled).toBe(true)
      void b.byId(actions, 'download').run?.()
      await vi.waitFor(() => { expect(save).toHaveBeenCalledOnce() })
      // An unusable document base keeps the recorded path, and the unknown extension leaves the media type empty.
      expect(save.mock.calls[0]?.[0]).toMatchObject({ url: 'dir\\blob.unknownext', name: 'blob.unknownext', mediaType: '' })
    } finally { await b.fiber.dispose() }
  })

  it('rejects a pending save and a reveal after the contribution lifetime ends', async () => {
    let settle: ((result: FileSaveResult) => void) | undefined
    const save = vi.fn(async (): Promise<FileSaveResult> => await new Promise((resolve) => { settle = resolve }))
    const b = await bench({ actions: actionsWith({ save }) })
    const status = { value: undefined as Promise<void> | undefined }
    try {
      const actions = await b.resolveFile('photo.png')
      status.value = b.byId(actions, 'download').run?.() as Promise<void>
      await vi.waitFor(() => { expect(save).toHaveBeenCalledOnce() })
      await b.fiber.dispose()
      settle?.({ status: 'cancelled' })
      await expect(status.value).rejects.toThrow()
      expect(b.notify).not.toHaveBeenCalled()
    } finally { await b.fiber.dispose() }
  })
})

describe('image target menu', () => {
  it('offers copy, download, and save-as for a recorded image and reads its original bytes', async () => {
    const save = vi.fn(async (_source: FileActionSource, _mode: 'download' | 'saveAs'): Promise<FileSaveResult> => ({ status: 'requested' }))
    const copyImage = vi.fn(async (_source: FileActionSource): Promise<void> => {})
    const b = await bench({
      actions: actionsWith({ canSaveAs: true, save, copyImage }),
      readBytes: async () => ({ ok: true, value: { data: 'AQID' } }),
    })
    try {
      const actions = b.resolveImage({
        sessionId: SessionId('s1'), path: '/a/b/pic.png', name: 'Pic', mediaType: 'image/png', url: 'https://x/pic.png',
      })
      expect(actions.map(action => action.id)).toEqual(['copy', 'download', 'saveAs'])
      void b.byId(actions, 'copy').run?.()
      await vi.waitFor(() => { expect(copyImage).toHaveBeenCalledOnce() })
      const source = copyImage.mock.calls[0]?.[0]
      expect(source).toMatchObject({ name: 'Pic', mediaType: 'image/png', url: 'https://x/pic.png' })
      await expect(source!.read!(new AbortController().signal)).resolves.toBeInstanceOf(Blob)
      expect(b.readBytes).toHaveBeenCalledWith(SessionId('s1'), '/a/b/pic.png', {}, expect.any(AbortSignal))

      void b.byId(actions, 'download').run?.()
      await vi.waitFor(() => { expect(b.notify).toHaveBeenCalledWith('Download started', true, undefined) })
      void b.byId(actions, 'saveAs').run?.()
      await vi.waitFor(() => { expect(save).toHaveBeenCalledTimes(2) })
      expect(save.mock.calls[1]?.[1]).toBe('saveAs')
    } finally { await b.fiber.dispose() }
  })

  it('derives the name and media type from the URL, and omits save-as without a picker', async () => {
    const copyImage = vi.fn(async (_source: FileActionSource): Promise<void> => {})
    const b = await bench({ actions: actionsWith({ copyImage }) })
    try {
      const actions = b.resolveImage({ url: 'https://x/y.png' })
      expect(actions.map(action => action.id)).toEqual(['copy', 'download'])
      void b.byId(actions, 'copy').run?.()
      await vi.waitFor(() => { expect(copyImage).toHaveBeenCalledOnce() })
      expect(copyImage.mock.calls[0]?.[0]).toEqual({ url: 'https://x/y.png', mediaType: 'image/png' })
    } finally { await b.fiber.dispose() }
  })

  it('keeps an unknown media type empty and reports a failed original read', async () => {
    const save = vi.fn(async (_source: FileActionSource, _mode: 'download' | 'saveAs'): Promise<FileSaveResult> => ({ status: 'cancelled' }))
    const b = await bench({
      actions: actionsWith({ save }),
      readBytes: async () => ({ ok: false, error: { code: 'missing' } }),
    })
    try {
      const actions = b.resolveImage({ sessionId: SessionId('s1'), path: '/w/y.zzz', url: 'https://x/y.zzz' })
      expect(actions.map(action => action.id)).toEqual(['copy', 'download'])
      void b.byId(actions, 'download').run?.()
      await vi.waitFor(() => { expect(save).toHaveBeenCalledOnce() })
      const source = save.mock.calls[0]?.[0] as FileActionSource
      expect(source.name).toBe('y.zzz')
      expect(source.mediaType).toBeUndefined()
      await expect(source.read!(new AbortController().signal)).rejects.toThrow('Original image unavailable')
      expect(b.readBytes).toHaveBeenCalledWith(SessionId('s1'), '/w/y.zzz', {}, expect.any(AbortSignal))
    } finally { await b.fiber.dispose() }
  })

  it('omits the reader when the target has no Session-scoped path', async () => {
    const copyImage = vi.fn(async (_source: FileActionSource): Promise<void> => {})
    const b = await bench({ actions: actionsWith({ copyImage }) })
    try {
      const actions = b.resolveImage({ path: '/w/y.png', url: 'https://x/y.png' })
      void b.byId(actions, 'copy').run?.()
      await vi.waitFor(() => { expect(copyImage).toHaveBeenCalledOnce() })
      expect(copyImage.mock.calls[0]?.[0]?.read).toBeUndefined()
    } finally { await b.fiber.dispose() }
  })
})
