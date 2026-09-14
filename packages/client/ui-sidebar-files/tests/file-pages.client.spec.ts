/**
 * The whole-file walk and the failure lines beside it.
 *
 * The walk's contract: pages read from line 1 until `eof`, the assembly
 * restores a file-final newline through the reported byte size, the editor's
 * byte cap refuses before the second page, and a page failure ends the walk.
 * The failure lines name each code the editor can meet.
 */
import { describe, expect, it, vi } from 'vitest'
import { makeTranslate, RemoteError } from '@qilin/client-test-runtime'
import type { SessionId } from '@qilin/session/types'
import type { RemoteFailure } from '@qilin/api-remotes/client'
import type { WorkspaceFileText } from '@qilin/api-workspace-files/types'
import { createReadWhole, MAX_EDIT_BYTES, reassemblePages } from '../src/client/file-pages.ts'
import type { ReadWorkspaceFilePage } from '../src/client/file-pages.ts'
import { fileFailureLine } from '../src/client/file-failure.ts'
import { zh } from '../src/client/locales.ts'

const PATH = 'src/a.ts'
const SESSION = 's-1' as SessionId

function page(overrides: Partial<WorkspaceFileText>): WorkspaceFileText {
  return { absolutePath: '/work/' + PATH, version: 'v1', offset: 1, text: '', lines: 0, eof: true, ...overrides }
}

describe('reassemblePages', () => {
  it('joins pages and restores a file-final newline through the byte size', () => {
    expect(reassemblePages([
      page({ text: 'a', lines: 1, eof: false, bytes: 4 }),
      page({ offset: 2, text: 'b', lines: 1, eof: true, bytes: 4 }),
    ])).toBe('a\nb\n')
    expect(reassemblePages([
      page({ text: 'a', lines: 1, eof: false, bytes: 3 }),
      page({ offset: 2, text: 'b', lines: 1, eof: true, bytes: 3 }),
    ])).toBe('a\nb')
    expect(reassemblePages([page({ text: '', lines: 0, eof: true, bytes: 0 })])).toBe('')
  })

  it('keeps the assembly as-is when the size is missing or matches neither', () => {
    expect(reassemblePages([page({ text: 'a', lines: 1, eof: true })])).toBe('a')
    expect(reassemblePages([page({ text: 'a', lines: 1, eof: true, bytes: 99 })])).toBe('a')
  })
})

describe('createReadWhole', () => {
  it('walks pages from line 1 until eof and reports the last version', async () => {
    const read = vi.fn<ReadWorkspaceFilePage>()
      .mockResolvedValueOnce({ ok: true, value: page({ text: 'one', lines: 1, eof: false, version: 'v1' }) })
      .mockResolvedValueOnce({ ok: true, value: page({ offset: 2, text: 'two', lines: 1, eof: true, version: 'v2' }) })
    const signal = new AbortController().signal
    const result = await createReadWhole(read)(SESSION, PATH, signal)
    expect(read.mock.calls.map(call => [call[1], call[2], call[3]]))
      .toEqual([[PATH, 1, signal], [PATH, 2, signal]])
    expect(result).toEqual({ ok: true, value: { text: 'one\ntwo', version: 'v2' } })
  })

  it('refuses a file past the editor byte cap with the endpoint\'s own code', async () => {
    const read = vi.fn<ReadWorkspaceFilePage>()
      .mockResolvedValueOnce({ ok: true, value: page({ text: 'x', lines: 1, eof: false, bytes: MAX_EDIT_BYTES + 1 }) })
    const result = await createReadWhole(read)(SESSION, PATH, new AbortController().signal)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('workspace-file/too-large')
      expect(result.error.details).toEqual({ path: PATH, limit: MAX_EDIT_BYTES })
    }
    expect(read).toHaveBeenCalledTimes(1)
  })

  it('ends the walk with the first page failure, untouched', async () => {
    const error = new RemoteError('workspace-file/not-text', 'NUL', { path: PATH })
    const read = vi.fn<ReadWorkspaceFilePage>().mockResolvedValue({ ok: false, error })
    const result = await createReadWhole(read)(SESSION, PATH, new AbortController().signal)
    expect(result).toEqual({ ok: false, error })
  })

  it('accepts a file exactly at the cap', async () => {
    const read = vi.fn<ReadWorkspaceFilePage>()
      .mockResolvedValueOnce({ ok: true, value: page({ text: 'x', lines: 1, eof: true, bytes: MAX_EDIT_BYTES }) })
    const result = await createReadWhole(read)(SESSION, PATH, new AbortController().signal)
    expect(result).toEqual({ ok: true, value: { text: 'x', version: 'v1' } })
  })
})

describe('fileFailureLine', () => {
  const t = makeTranslate(zh)

  it('names each read and save failure the editor can meet', () => {
    expect(fileFailureLine(t, new RemoteError('workspace-file/not-found', 'x', { path: PATH }))).toBe(zh['file.error.notFound'])
    expect(fileFailureLine(t, new RemoteError('workspace-file/not-text', 'x', { path: PATH }))).toBe(zh['file.error.notText'])
    expect(fileFailureLine(t, new RemoteError('workspace-file/not-regular-file', 'x', { path: PATH, kind: 'directory' }))).toBe(zh['file.error.notRegularFile'])
    expect(fileFailureLine(t, new RemoteError('workspace-file/outside-workspace', 'x', { path: PATH }))).toBe(zh['file.error.outsideWorkspace'])
    expect(fileFailureLine(t, new RemoteError('workspace-file/stale', 'x', { path: PATH }))).toBe(zh['file.conflict'])
  })

  it('sizes a too-large refusal in the line', () => {
    const line = fileFailureLine(t, new RemoteError('workspace-file/too-large', 'x', { path: PATH, limit: 2 * 1024 * 1024 }))
    expect(line).toBe('文件太大，无法在编辑器中打开（2 MB）。')
    const kb = fileFailureLine(t, new RemoteError('workspace-file/too-large', 'x', { path: PATH, limit: 1536 }))
    expect(kb).toBe('文件太大，无法在编辑器中打开（2 KB）。')
    const bytes = fileFailureLine(t, new RemoteError('workspace-file/too-large', 'x', { path: PATH, limit: 512 }))
    expect(bytes).toBe('文件太大，无法在编辑器中打开（512 B）。')
  })

  it('carries an unclassified failure\'s own message', () => {
    const failure = { code: 'remote/transport', message: 'socket closed' } as unknown as RemoteFailure
    expect(fileFailureLine(t, failure)).toBe('操作失败：socket closed')
  })
})
