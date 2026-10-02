/**
 * The `remove`, `move`, and `createDirectory` endpoints: the workspace
 * containment gates they share with `list`/`write`, the provider refusals they
 * re-name, and the `fs/observed` observations they publish for the change feed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdir, readFile, stat, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { FsError } from '@qilin/fs'
import type { FsObservation, FsTarget } from '@qilin/fs'
import { failureOf, openWorkspace, signal, type Harness } from './harness.ts'

let harness: Harness
let workspace: string
let outside: string
let observed: { path: string; observation: FsObservation }[]

beforeEach(async () => {
  harness = await openWorkspace('qilin-workspace-files-mutate-')
  workspace = harness.workspace
  outside = harness.outside
  observed = []
  harness.ctx.on('fs/observed', (target: FsTarget, observation: FsObservation) => {
    observed.push({ path: harness.ctx.fs.processPath(target), observation })
  })
})

afterEach(async () => {
  await harness.dispose()
})

const endpoint = (): ReturnType<Harness['endpoint']> => harness.endpoint()

/** Whether a path still exists, so a refused mutation can be shown to have changed nothing. */
const exists = (path: string): Promise<boolean> => stat(path).then(() => true, () => false)

/** The absolute path the host reports for a workspace path, after resolution (a realpath). */
const absolute = async (path: string): Promise<string> =>
  harness.ctx.fs.processPath(await harness.ctx.fs.resolve(path, { cwd: workspace }))

describe('workspaceFiles.remove', () => {
  it('removes a file and reports it absent', async () => {
    await writeFile(join(workspace, 'notes.txt'), 'x', 'utf8')
    await endpoint().remove(harness.scope, 'notes.txt', false, signal())
    expect(await exists(join(workspace, 'notes.txt'))).toBe(false)
    expect(observed).toEqual([
      { path: await absolute('notes.txt'), observation: { kind: 'absent' } },
    ])
  })

  it('removes a populated directory only with recursive', async () => {
    await mkdir(join(workspace, 'tree/inner'), { recursive: true })
    await writeFile(join(workspace, 'tree/inner/a.txt'), 'x', 'utf8')
    await endpoint().remove(harness.scope, 'tree', true, signal())
    expect(await exists(join(workspace, 'tree'))).toBe(false)
  })

  it('refuses a non-empty directory without recursive and leaves it intact', async () => {
    await mkdir(join(workspace, 'tree'))
    await writeFile(join(workspace, 'tree/a.txt'), 'x', 'utf8')
    const failure = await failureOf(endpoint().remove(harness.scope, 'tree', false, signal()))
    expect(failure.code).toBe('workspace-file/not-empty')
    expect(failure.details).toMatchObject({ path: 'tree' })
    expect(await readFile(join(workspace, 'tree/a.txt'), 'utf8')).toBe('x')
    expect(observed).toEqual([])
  })

  it('reports a missing path as not found', async () => {
    const failure = await failureOf(endpoint().remove(harness.scope, 'gone.txt', false, signal()))
    expect(failure.code).toBe('workspace-file/not-found')
    expect(failure.details).toMatchObject({ path: 'gone.txt' })
  })

  it('refuses a non-boolean recursive flag before touching the workspace', async () => {
    await writeFile(join(workspace, 'notes.txt'), 'x', 'utf8')
    const failure = await failureOf(endpoint().remove(harness.scope, 'notes.txt', 'yes' as never, signal()))
    expect(failure.code).toBe('gateway/bad-request')
    expect(await exists(join(workspace, 'notes.txt'))).toBe(true)
  })

  it('refuses an absolute target outside the workspace', async () => {
    await writeFile(join(outside, 'keep.txt'), 'keep', 'utf8')
    const failure = await failureOf(endpoint().remove(harness.scope, join(outside, 'keep.txt'), true, signal()))
    expect(failure.code).toBe('workspace-file/outside-workspace')
    expect(await readFile(join(outside, 'keep.txt'), 'utf8')).toBe('keep')
  })

  it('refuses a symbolic link before resolution follows it', async () => {
    await writeFile(join(workspace, 'real.txt'), 'x', 'utf8')
    await symlink(join(workspace, 'real.txt'), join(workspace, 'link.txt'))
    const failure = await failureOf(endpoint().remove(harness.scope, 'link.txt', false, signal()))
    expect(failure.code).toBe('workspace-file/not-regular-file')
    expect(failure.details).toMatchObject({ path: 'link.txt', kind: 'symlink' })
    expect(await exists(join(workspace, 'real.txt'))).toBe(true)
  })

  it('leaves a backend failure it does not classify unchanged', async () => {
    await writeFile(join(workspace, 'notes.txt'), 'x', 'utf8')
    const fault = new FsError('backend fault', 'FS_IO_ERROR')
    vi.spyOn(harness.ctx.fs, 'remove').mockRejectedValueOnce(fault)
    const error = await endpoint().remove(harness.scope, 'notes.txt', false, signal())
      .then(() => undefined, (caught: unknown) => caught)
    expect(error).toBe(fault)
  })
})

describe('workspaceFiles.move', () => {
  it('renames one entry and reports the source absent and the destination present', async () => {
    await writeFile(join(workspace, 'from.txt'), 'x', 'utf8')
    await endpoint().move(harness.scope, 'from.txt', 'to.txt', signal())
    expect(await readFile(join(workspace, 'to.txt'), 'utf8')).toBe('x')
    expect(await exists(join(workspace, 'from.txt'))).toBe(false)
    expect(observed.map(entry => entry.path)).toEqual([
      await absolute('from.txt'),
      await absolute('to.txt'),
    ])
    expect(observed[0]?.observation).toEqual({ kind: 'absent' })
    expect(observed[1]?.observation).toMatchObject({ kind: 'present' })
  })

  it('reports a missing source as not found, naming the source', async () => {
    const failure = await failureOf(endpoint().move(harness.scope, 'gone.txt', 'to.txt', signal()))
    expect(failure.code).toBe('workspace-file/not-found')
    expect(failure.details).toMatchObject({ path: 'gone.txt' })
  })

  it('refuses an existing destination, naming the destination', async () => {
    await writeFile(join(workspace, 'from.txt'), 'x', 'utf8')
    await writeFile(join(workspace, 'to.txt'), 'y', 'utf8')
    const failure = await failureOf(endpoint().move(harness.scope, 'from.txt', 'to.txt', signal()))
    expect(failure.code).toBe('workspace-file/exists')
    expect(failure.details).toMatchObject({ path: 'to.txt' })
    expect(await readFile(join(workspace, 'from.txt'), 'utf8')).toBe('x')
    expect(await readFile(join(workspace, 'to.txt'), 'utf8')).toBe('y')
    expect(observed).toEqual([])
  })

  it('refuses an existing destination directory and leaves it populated', async () => {
    await writeFile(join(workspace, 'from.txt'), 'x', 'utf8')
    await mkdir(join(workspace, 'tree'))
    await writeFile(join(workspace, 'tree/keep.txt'), 'y', 'utf8')
    const failure = await failureOf(endpoint().move(harness.scope, 'from.txt', 'tree', signal()))
    expect(failure.code).toBe('workspace-file/exists')
    expect(failure.details).toMatchObject({ path: 'tree' })
    expect(await readFile(join(workspace, 'from.txt'), 'utf8')).toBe('x')
    expect(await readFile(join(workspace, 'tree/keep.txt'), 'utf8')).toBe('y')
    expect(observed).toEqual([])
  })

  it('refuses a destination outside the workspace and leaves the source', async () => {
    await writeFile(join(workspace, 'from.txt'), 'x', 'utf8')
    const failure = await failureOf(endpoint().move(harness.scope, 'from.txt', join(outside, 'to.txt'), signal()))
    expect(failure.code).toBe('workspace-file/outside-workspace')
    expect(await readFile(join(workspace, 'from.txt'), 'utf8')).toBe('x')
    expect(await exists(join(outside, 'to.txt'))).toBe(false)
  })

  it('refuses a symbolic-link source before resolution follows it', async () => {
    await writeFile(join(workspace, 'real.txt'), 'x', 'utf8')
    await symlink(join(workspace, 'real.txt'), join(workspace, 'link.txt'))
    const failure = await failureOf(endpoint().move(harness.scope, 'link.txt', 'to.txt', signal()))
    expect(failure.code).toBe('workspace-file/not-regular-file')
    expect(failure.details).toMatchObject({ path: 'link.txt', kind: 'symlink' })
  })
})

describe('workspaceFiles.createDirectory', () => {
  it('creates one directory and reports it present at its version', async () => {
    await endpoint().createDirectory(harness.scope, 'created', signal())
    expect((await stat(join(workspace, 'created'))).isDirectory()).toBe(true)
    expect(observed).toHaveLength(1)
    expect(observed[0]).toMatchObject({ path: await absolute('created'), observation: { kind: 'present' } })
  })

  it('refuses an entry that already exists', async () => {
    await writeFile(join(workspace, 'notes.txt'), 'x', 'utf8')
    const failure = await failureOf(endpoint().createDirectory(harness.scope, 'notes.txt', signal()))
    expect(failure.code).toBe('workspace-file/exists')
    expect(failure.details).toMatchObject({ path: 'notes.txt' })
    expect(await readFile(join(workspace, 'notes.txt'), 'utf8')).toBe('x')
  })

  it('reports a missing parent as not found', async () => {
    const failure = await failureOf(endpoint().createDirectory(harness.scope, 'missing/child', signal()))
    expect(failure.code).toBe('workspace-file/not-found')
    expect(failure.details).toMatchObject({ path: 'missing/child' })
    expect(await exists(join(workspace, 'missing'))).toBe(false)
  })

  it('refuses a target outside the workspace', async () => {
    const failure = await failureOf(endpoint().createDirectory(harness.scope, join(outside, 'dir'), signal()))
    expect(failure.code).toBe('workspace-file/outside-workspace')
    expect(await exists(join(outside, 'dir'))).toBe(false)
  })

  it('refuses a symbolic link before resolution follows it', async () => {
    await mkdir(join(workspace, 'real-dir'))
    await symlink(join(workspace, 'real-dir'), join(workspace, 'link-dir'))
    const failure = await failureOf(endpoint().createDirectory(harness.scope, 'link-dir', signal()))
    expect(failure.code).toBe('workspace-file/not-regular-file')
    expect(failure.details).toMatchObject({ path: 'link-dir', kind: 'symlink' })
  })

  it('publishes no observation when the backend cannot name the new directory version', async () => {
    vi.spyOn(harness.ctx.fs, 'stat').mockResolvedValue(undefined)
    await endpoint().createDirectory(harness.scope, 'created', signal())
    expect((await stat(join(workspace, 'created'))).isDirectory()).toBe(true)
    expect(observed).toEqual([])
  })
})
