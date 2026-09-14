/** The `write` endpoint: its containment and kind gates, the caller's freshness guard, and the change it reports. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FsObservation, FsTarget } from '@qilin/fs'
import { failureOf, openWorkspace, signal, type Harness } from './harness.ts'

let harness: Harness
let workspace: string
let outside: string

beforeEach(async () => {
  harness = await openWorkspace('qilin-workspace-files-write-')
  workspace = harness.workspace
  outside = harness.outside
})

afterEach(async () => {
  await harness.dispose()
})

const endpoint = (caps?: { maxFileBytes?: number }): ReturnType<Harness['endpoint']> => harness.endpoint(caps)

/** The file content on disk, so a refused save can be shown to have changed nothing. */
const contentOf = (path: string): Promise<string> => readFile(join(workspace, path), 'utf8')

describe('workspaceFiles.write — the happy path', () => {
  it('replaces an existing file and reports its absolute path, new version, and byte size', async () => {
    await writeFile(join(workspace, 'notes.txt'), 'before\n', 'utf8')
    const stat = await endpoint().stat(harness.scope, 'notes.txt', signal())
    const result = await endpoint().write(harness.scope, 'notes.txt', 'after\n', {}, signal())
    expect(await contentOf('notes.txt')).toBe('after\n')
    expect(result.absolutePath).toBe(stat.absolutePath)
    expect(result.bytes).toBe(6)
    expect(result.version).not.toBe(stat.version)
  })

  it('creates a file that does not exist yet', async () => {
    await mkdir(join(workspace, 'src'))
    const result = await endpoint().write(harness.scope, 'src/new.ts', 'export {}\n', {}, signal())
    expect(await contentOf('src/new.ts')).toBe('export {}\n')
    expect(result.absolutePath.endsWith(join('src', 'new.ts'))).toBe(true)
    expect(result.bytes).toBe(10)
  })

  it('writes UTF-8 and reports the file byte size, not the character count', async () => {
    const result = await endpoint().write(harness.scope, 'zh.txt', '侧栏', {}, signal())
    expect(await contentOf('zh.txt')).toBe('侧栏')
    expect(result.bytes).toBe(6)
  })
})

describe('workspaceFiles.write — the freshness guard', () => {
  it('saves when the caller\u2019s token is still the version on disk', async () => {
    await writeFile(join(workspace, 'notes.txt'), 'one\n', 'utf8')
    const base = await endpoint().stat(harness.scope, 'notes.txt', signal())
    const result = await endpoint().write(harness.scope, 'notes.txt', 'two\n', { baseVersion: base.version }, signal())
    expect(await contentOf('notes.txt')).toBe('two\n')
    expect(result.version).not.toBe(base.version)
  })

  it('refuses a stale token with workspace-file/stale and leaves the file untouched', async () => {
    await writeFile(join(workspace, 'notes.txt'), 'original\n', 'utf8')
    const stale = await endpoint().stat(harness.scope, 'notes.txt', signal())
    // An external writer moves the file on between the caller's read and its save.
    await writeFile(join(workspace, 'notes.txt'), 'external\n', 'utf8')
    const failure = await failureOf(endpoint().write(harness.scope, 'notes.txt', 'ours\n', { baseVersion: stale.version }, signal()))
    expect(failure.code).toBe('workspace-file/stale')
    expect(failure.details).toMatchObject({ path: 'notes.txt' })
    expect(await contentOf('notes.txt')).toBe('external\n')
    expect((await endpoint().stat(harness.scope, 'notes.txt', signal())).version).not.toBe(stale.version)
  })

  it('refuses a token for a file that is gone, rather than recreating it', async () => {
    await writeFile(join(workspace, 'notes.txt'), 'original\n', 'utf8')
    const gone = await endpoint().stat(harness.scope, 'notes.txt', signal())
    await rm(join(workspace, 'notes.txt'))
    const failure = await failureOf(endpoint().write(harness.scope, 'notes.txt', 'ours\n', { baseVersion: gone.version }, signal()))
    expect(failure.code).toBe('workspace-file/stale')
    await expect(contentOf('notes.txt')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('saves unconditionally when no token is given', async () => {
    await writeFile(join(workspace, 'notes.txt'), 'original\n', 'utf8')
    await endpoint().write(harness.scope, 'notes.txt', 'blind\n', {}, signal())
    expect(await contentOf('notes.txt')).toBe('blind\n')
  })

  it('does not take its guard from the fs/write-intent slot', async () => {
    await writeFile(join(workspace, 'notes.txt'), 'original\n', 'utf8')
    let consulted = 0
    // The observation policy's decision for a target the Agent never read:
    // honouring it would refuse this save with FS_NOT_OBSERVED.
    harness.ctx.on('fs/write-intent', () => {
      consulted += 1
      // The waterfall's contract returns a promise; this listener is never
      // reached, so the intent it would publish does not matter.
      return Promise.resolve({ kind: 'createIfAbsent' } as const)
    })
    const result = await endpoint().write(harness.scope, 'notes.txt', 'saved\n', {}, signal())
    expect(consulted).toBe(0)
    expect(await contentOf('notes.txt')).toBe('saved\n')
    expect(result.bytes).toBe(6)
  })
})

describe('workspaceFiles.write — gates', () => {
  it('rejects an absolute target outside the workspace and writes nothing', async () => {
    await writeFile(join(outside, 'notes.txt'), 'outside\n', 'utf8')
    const failure = await failureOf(endpoint().write(harness.scope, join(outside, 'notes.txt'), 'ours\n', {}, signal()))
    expect(failure.code).toBe('workspace-file/outside-workspace')
    expect(failure.details).toMatchObject({ path: join(outside, 'notes.txt') })
    expect(await readFile(join(outside, 'notes.txt'), 'utf8')).toBe('outside\n')
  })

  it('rejects a traversal that climbs out of the workspace', async () => {
    const failure = await failureOf(endpoint().write(harness.scope, '../outside/notes.txt', 'ours\n', {}, signal()))
    expect(failure.code).toBe('workspace-file/outside-workspace')
  })

  it('rejects a symlink before following it, wherever it points, and leaves its target alone', async () => {
    await writeFile(join(workspace, 'real.txt'), 'original\n', 'utf8')
    await symlink(join(workspace, 'real.txt'), join(workspace, 'link.txt'))
    const failure = await failureOf(endpoint().write(harness.scope, 'link.txt', 'ours\n', {}, signal()))
    expect(failure.code).toBe('workspace-file/not-regular-file')
    expect(failure.details).toMatchObject({ path: 'link.txt', kind: 'symlink' })
    expect(await contentOf('real.txt')).toBe('original\n')
  })

  it('rejects an escaping symlink and a dangling one alike', async () => {
    await symlink(outside, join(workspace, 'escape'))
    await symlink(join(workspace, 'missing'), join(workspace, 'dangling.txt'))
    for (const path of ['escape', 'dangling.txt']) {
      const failure = await failureOf(endpoint().write(harness.scope, path, 'ours\n', {}, signal()))
      expect(failure.code).toBe('workspace-file/not-regular-file')
      expect(failure.details).toMatchObject({ kind: 'symlink' })
    }
  })

  it('rejects a new file under a directory that escapes the workspace', async () => {
    await symlink(outside, join(workspace, 'escape'))
    const failure = await failureOf(endpoint().write(harness.scope, 'escape/new.txt', 'ours\n', {}, signal()))
    expect(failure.code).toBe('workspace-file/outside-workspace')
    await expect(readFile(join(outside, 'new.txt'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a directory', async () => {
    await mkdir(join(workspace, 'src'))
    const failure = await failureOf(endpoint().write(harness.scope, 'src', 'ours\n', {}, signal()))
    expect(failure.code).toBe('workspace-file/not-regular-file')
    expect(failure.details).toMatchObject({ path: 'src', kind: 'directory' })
  })

  it('rejects an empty path as a bad request', async () => {
    const failure = await failureOf(endpoint().write(harness.scope, '', 'ours\n', {}, signal()))
    expect(failure.code).toBe('gateway/bad-request')
  })

  it('rejects text above the configured cap and creates nothing', async () => {
    await writeFile(join(workspace, 'notes.txt'), 'original\n', 'utf8')
    const failure = await failureOf(endpoint({ maxFileBytes: 4 }).write(harness.scope, 'notes.txt', '12345', {}, signal()))
    expect(failure.code).toBe('workspace-file/too-large')
    expect(failure.details).toMatchObject({ path: 'notes.txt', limit: 4 })
    expect(await contentOf('notes.txt')).toBe('original\n')
    const created = await failureOf(endpoint().write(harness.scope, 'new.txt', '12345', {}, signal()))
    expect(created.code).toBe('workspace-file/too-large')
    await expect(contentOf('new.txt')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('accepts text at exactly the cap', async () => {
    const result = await endpoint({ maxFileBytes: 5 }).write(harness.scope, 'notes.txt', '12345', {}, signal())
    expect(result.bytes).toBe(5)
    expect(await contentOf('notes.txt')).toBe('12345')
  })
})

describe('workspaceFiles.write — the reported change', () => {
  it('emits fs/observed for the saved file with the new version and no actor', async () => {
    await writeFile(join(workspace, 'notes.txt'), 'before\n', 'utf8')
    const observed: { target: FsTarget; observation: FsObservation; actor: object | undefined }[] = []
    harness.ctx.on('fs/observed', (target, observation, actor) => {
      observed.push({ target, observation, actor })
    })
    const result = await endpoint().write(harness.scope, 'notes.txt', 'after\n', {}, signal())
    expect(observed).toHaveLength(1)
    expect(observed[0]?.observation).toEqual({ kind: 'present', version: result.version })
    expect(observed[0]?.actor).toBeUndefined()
  })
})
