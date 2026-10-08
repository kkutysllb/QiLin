/**
 * The tree's row mutations on their own: the name, path, and failure decisions
 * each one is built from, and the tab reconciliation a move or a removal
 * performs.
 *
 * The decisions are pure, so they are asserted directly; the Remote binding and
 * the reconciliation are asserted against recorders, because what matters is
 * which call each gesture makes and exactly which tabs it settles.
 */
import { describe, expect, it, vi } from 'vitest'
import { RemoteError, makeTranslate } from '@qilin-agent/client-test-runtime'
import type { SessionId } from '@qilin-agent/session/types'
import type { TabId } from '@qilin-agent/client-ui-dockkit'
import { absoluteFileAddress, sessionFileAddress } from '@qilin-agent/util-workspace-path'
import {
  createMutations, createTabReconcile, joinEntryPath, mutationFailureLine, normalizedEntryName, parentDirectoryOf,
  pathAtOrUnder,
} from '../src/client/file-mutations.ts'
import type { OpenTabRef, WorkspaceFilesMutationRemote } from '../src/client/file-mutations.ts'
import type {} from '../src/client/locales.ts'
import { zh } from '../src/client/locales.ts'
import { recordedReconcile } from './scripted-mutations.client.ts'

const SESSION = 's-1' as SessionId
const ROOT = '/work/app'

/** One open tab, as the reconciliation reads it. */
function tab(id: string, contentId: string): OpenTabRef {
  return { id: id as TabId, contentId }
}

describe('normalizedEntryName', () => {
  it('takes one plain name and trims what surrounds it', () => {
    expect(normalizedEntryName('  note.md  ')).toBe('note.md')
  })

  it('refuses a blank, a dot segment, and anything carrying a separator', () => {
    expect(normalizedEntryName('   ')).toBeUndefined()
    expect(normalizedEntryName('.')).toBeUndefined()
    expect(normalizedEntryName('..')).toBeUndefined()
    expect(normalizedEntryName('a/b')).toBeUndefined()
    expect(normalizedEntryName('a\\b')).toBeUndefined()
  })
})

describe('parentDirectoryOf', () => {
  it('drops the last segment, keeping the directory that held it', () => {
    expect(parentDirectoryOf(`${ROOT}/src/a.ts`)).toBe(`${ROOT}/src`)
    expect(parentDirectoryOf('C:\\work\\a.ts')).toBe('C:\\work')
  })

  it('answers a root for a path one level below it, and nothing for a bare name', () => {
    expect(parentDirectoryOf('/work')).toBe('/')
    expect(parentDirectoryOf('a.ts')).toBe('')
  })
})

describe('joinEntryPath', () => {
  it('joins with one slash whatever the parent ends in', () => {
    expect(joinEntryPath(ROOT, 'src')).toBe(`${ROOT}/src`)
    expect(joinEntryPath(`${ROOT}/`, 'src')).toBe(`${ROOT}/src`)
    expect(joinEntryPath('/', 'etc')).toBe('/etc')
    expect(joinEntryPath('C:\\work\\', 'src')).toBe('C:\\work/src')
  })
})

describe('pathAtOrUnder', () => {
  it('matches the target itself and its descendants, and nothing beside them', () => {
    expect(pathAtOrUnder(`${ROOT}/src`, `${ROOT}/src`)).toBe(true)
    expect(pathAtOrUnder(`${ROOT}/src/a.ts`, `${ROOT}/src`)).toBe(true)
    expect(pathAtOrUnder(`${ROOT}/src/`, `${ROOT}/src`)).toBe(true)
    expect(pathAtOrUnder(`${ROOT}/src-other`, `${ROOT}/src`)).toBe(false)
    expect(pathAtOrUnder(`${ROOT}/README.md`, `${ROOT}/src`)).toBe(false)
  })

  it('compares backslash spellings as one path', () => {
    expect(pathAtOrUnder('C:\\work\\src\\a.ts', 'C:/work/src')).toBe(true)
  })

  it('matches only the empty path against an empty target', () => {
    expect(pathAtOrUnder('', '')).toBe(true)
    expect(pathAtOrUnder(`${ROOT}/src`, '')).toBe(false)
  })
})

describe('mutationFailureLine', () => {
  const t = makeTranslate(zh)

  it('names each refusal the tree can explain', () => {
    expect(mutationFailureLine(t, new RemoteError('workspace-file/not-found', 'x', { path: ROOT })))
      .toBe(zh['error.gone'])
    expect(mutationFailureLine(t, new RemoteError('workspace-file/exists', 'x', { path: ROOT })))
      .toBe(zh['error.exists'])
    expect(mutationFailureLine(t, new RemoteError('workspace-file/not-empty', 'x', { path: ROOT })))
      .toBe(zh['error.notEmpty'])
    expect(mutationFailureLine(t, new RemoteError('workspace-file/not-regular-file', 'x', { path: ROOT, kind: 'symlink' })))
      .toBe(zh['error.notRegular'])
    expect(mutationFailureLine(t, new RemoteError('workspace-file/outside-workspace', 'x', { path: ROOT })))
      .toBe(zh['error.outsideWorkspace'])
  })

  it('carries a filesystem pass-through failure\'s own message', () => {
    // A carrier code the tree does not name: the reader gets the transport's
    // own message rather than a wrong local label.
    const failure = new RemoteError('gateway/internal', 'permission denied', {})
    expect(mutationFailureLine(t, failure)).toBe('操作失败：permission denied')
  })
})

describe('createMutations', () => {
  it('passes every call through with its own arguments', async () => {
    const signal = new AbortController().signal
    // Typed by the face the binding accepts, so the recorder and the endpoint
    // cannot drift apart unnoticed.
    type Mutations = WorkspaceFilesMutationRemote['workspaceFiles']
    const calls: Mutations = {
      write: vi.fn<Mutations['write']>().mockResolvedValue({
        ok: true, value: { absolutePath: `${ROOT}/a.ts`, version: 'v1', bytes: 0 },
      }),
      createDirectory: vi.fn<Mutations['createDirectory']>().mockResolvedValue({ ok: true, value: undefined }),
      move: vi.fn<Mutations['move']>().mockResolvedValue({ ok: true, value: undefined }),
      // The wire operation is `delete`; `remove` is the Client-side name for it.
      delete: vi.fn<Mutations['delete']>().mockResolvedValue({ ok: true, value: undefined }),
    }
    const remote: WorkspaceFilesMutationRemote = { workspaceFiles: calls }
    const mutations = createMutations(remote)
    await mutations.createFile(SESSION, `${ROOT}/a.ts`, signal)
    expect(calls.write).toHaveBeenCalledWith(SESSION, `${ROOT}/a.ts`, '', {}, signal)
    await mutations.createDirectory(SESSION, `${ROOT}/docs`, signal)
    expect(calls.createDirectory).toHaveBeenCalledWith(SESSION, `${ROOT}/docs`, signal)
    await mutations.move(SESSION, `${ROOT}/a.ts`, `${ROOT}/b.ts`, signal)
    expect(calls.move).toHaveBeenCalledWith(SESSION, `${ROOT}/a.ts`, `${ROOT}/b.ts`, signal)
    await mutations.remove(SESSION, `${ROOT}/docs`, true, signal)
    expect(calls.delete).toHaveBeenCalledWith(SESSION, `${ROOT}/docs`, true, signal)
  })
})

describe('createTabReconcile', () => {
  it('retargets every tab at or under the moved path, and touches nothing else', () => {
    const recorded = recordedReconcile([
      tab('t1', sessionFileAddress(SESSION, 'src/a.ts')),
      tab('t2', sessionFileAddress(SESSION, 'src')),
      tab('t3', sessionFileAddress(SESSION, 'README.md')),
      tab('t4', 'files'),
      tab('t5', absoluteFileAddress('/elsewhere/x.ts')),
      tab('t6', sessionFileAddress('s-other', 'src/a.ts')),
    ])
    recorded.reconcile.moved(SESSION, ROOT, `${ROOT}/src`, `${ROOT}/lib`)
    expect(recorded.openResourceIn.mock.calls).toEqual([
      [SESSION, sessionFileAddress(SESSION, 'lib/a.ts'), { replaceTab: 't1' }],
      [SESSION, sessionFileAddress(SESSION, 'lib'), { replaceTab: 't2' }],
    ])
    expect(recorded.closeIn).not.toHaveBeenCalled()
  })

  it('closes every tab at or under the removed path, and touches nothing else', () => {
    const recorded = recordedReconcile([
      tab('t1', sessionFileAddress(SESSION, 'src/a.ts')),
      tab('t2', sessionFileAddress(SESSION, 'src')),
      tab('t3', sessionFileAddress(SESSION, 'README.md')),
      tab('t4', 'files'),
    ])
    recorded.reconcile.removed(SESSION, ROOT, `${ROOT}/src`)
    expect(recorded.closeIn.mock.calls).toEqual([[SESSION, 't1'], [SESSION, 't2']])
    expect(recorded.openResourceIn).not.toHaveBeenCalled()
  })

  it('reads a tab opened at a workspace root as that root, and leaves it alone', () => {
    const recorded = recordedReconcile([tab('t1', sessionFileAddress(SESSION, ''))])
    // A root spelled `/` resolves to itself rather than to an empty path, so it
    // is a path of its own and not a descendant of anything below it.
    recorded.reconcile.moved(SESSION, '/', '/work', '/lib')
    recorded.reconcile.removed(SESSION, '/', '/work')
    expect(recorded.openResourceIn).not.toHaveBeenCalled()
    expect(recorded.closeIn).not.toHaveBeenCalled()
  })

  it('settles a session\'s tabs through that session\'s own reads', () => {
    const recorded = recordedReconcile([])
    createTabReconcile(recorded).removed(SESSION, ROOT, `${ROOT}/src`)
    expect(recorded.tabsIn).toHaveBeenCalledWith(SESSION)
  })
})
