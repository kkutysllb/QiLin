/**
 * The filename search against a real workspace: case-insensitive basename
 * matches in breadth-first order, files only, excluded and non-contained
 * directories walked around, and both budgets reporting their cut.
 */
import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FsDirEntry } from '@qilin-agent/fs'
import { openWorkspace, signal, type Harness } from './harness.ts'

/** One listed child as a backend that cannot report byte sizes returns it. */
function withoutSize(entry: FsDirEntry): FsDirEntry {
  const copy: FsDirEntry = { ...entry }
  delete copy.size
  return copy
}

let harness: Harness

beforeEach(async () => { harness = await openWorkspace('qilin-wf-search-') })
afterEach(async () => { await harness.dispose() })

/** Write one file into the workspace. */
async function write(path: string, data = 'x'): Promise<void> {
  await mkdir(join(harness.workspace, join(path, '..')), { recursive: true })
  await writeFile(join(harness.workspace, path), data)
}

describe('searchNames', () => {
  it('matches basenames case-insensitively, shallow before deep, and files only, carrying byte sizes', async () => {
    await write('readme.md', 'hi')
    await write('src/readme.ts', '!')
    await mkdir(join(harness.workspace, 'docs'))
    const found = await harness.endpoint().searchNames(harness.scope, { query: 'ReadMe' }, signal())
    expect(found).toEqual({
      matches: [{ path: 'readme.md', bytes: 2 }, { path: 'src/readme.ts', bytes: 1 }],
      truncated: false,
    })
  })

  it('matches the workspace path instead of the basename in path mode', async () => {
    await write('src/feature/readme.ts')
    await write('manual/readme.md')
    const found = await harness.endpoint().searchNames(harness.scope, { query: 'src/feature', mode: 'path' }, signal())
    expect(found).toEqual({ matches: [{ path: 'src/feature/readme.ts', bytes: 1 }], truncated: false })
  })

  it('skips request-only excluded directories without changing the configured list', async () => {
    await write('generated/a.md')
    await write('src/b.md')
    const found = await harness.endpoint().searchNames(harness.scope, {
      query: '.md', extraExcludedDirectories: ['Generated'],
    }, signal())
    expect(found).toEqual({ matches: [{ path: 'src/b.md', bytes: 1 }], truncated: false })
    // The request's own rule does not leak into the configured walk.
    const all = await harness.endpoint().searchNames(harness.scope, { query: 'a.md' }, signal())
    expect(all.matches.map(match => match.path)).toEqual(['generated/a.md'])
  })

  it('skips dot-prefixed entries while the hidden choice asks for it', async () => {
    await write('.config/readme.md')
    await write('.readme-notes')
    await write('readme.md')
    const hidden = await harness.endpoint().searchNames(harness.scope, { query: 'readme', hidden: { dotfiles: true } }, signal())
    expect(hidden).toEqual({ matches: [{ path: 'readme.md', bytes: 1 }], truncated: false })
    const shown = await harness.endpoint().searchNames(harness.scope, { query: 'readme' }, signal())
    expect(shown.matches.map(match => match.path)).toEqual(['.readme-notes', 'readme.md', '.config/readme.md'])
  })

  it('enters the dependency store when the hidden choice turns it back on', async () => {
    await write('node_modules/pkg/readme.md')
    await write('src/readme.ts')
    const found = await harness.endpoint({ searchExcludedDirectories: ['node_modules', 'dist'] })
      .searchNames(harness.scope, { query: 'readme', hidden: { nodeModules: false } }, signal())
    expect(found.matches.map(match => match.path)).toEqual(['src/readme.ts', 'node_modules/pkg/readme.md'])
  })

  it('keeps the dependency store excluded when the hidden choice states it', async () => {
    await write('node_modules/pkg/readme.md')
    await write('src/readme.ts')
    const found = await harness.endpoint({ searchExcludedDirectories: ['node_modules'] }).searchNames(harness.scope, {
      query: 'readme', hidden: { nodeModules: true },
    }, signal())
    expect(found.matches.map(match => match.path)).toEqual(['src/readme.ts'])
  })

  it('matches nothing for a blank query', async () => {
    await write('readme.md')
    const found = await harness.endpoint().searchNames(harness.scope, { query: '   ' }, signal())
    expect(found).toEqual({ matches: [], truncated: false })
  })

  it('neither matches nor descends a configured excluded directory', async () => {
    await write('node_modules/pkg/readme.md')
    await write('src/readme.ts')
    const found = await harness.endpoint({ searchExcludedDirectories: ['node_modules'] })
      .searchNames(harness.scope, { query: 'readme' }, signal())
    expect(found).toEqual({ matches: [{ path: 'src/readme.ts', bytes: 1 }], truncated: false })
  })

  it('does not descend a symbolic-link directory that leaves the workspace', async () => {
    await writeFile(join(harness.outside, 'readme-outside.md'), 'x')
    await symlink(harness.outside, join(harness.workspace, 'elsewhere'))
    await write('readme-inside.md')
    const found = await harness.endpoint().searchNames(harness.scope, { query: 'readme' }, signal())
    expect(found).toEqual({ matches: [{ path: 'readme-inside.md', bytes: 1 }], truncated: false })
  })

  it('reports the cut when the match cap stops the walk', async () => {
    await write('a-readme.md')
    await write('b-readme.md')
    const found = await harness.endpoint({ maxSearchMatches: 1 })
      .searchNames(harness.scope, { query: 'readme' }, signal())
    expect(found).toEqual({ matches: [{ path: 'a-readme.md', bytes: 1 }], truncated: true })
  })

  it('reports the cut when the visit budget runs out', async () => {
    await write('a.md')
    await write('b.md')
    await write('c.md')
    const found = await harness.endpoint({ maxSearchVisited: 2 })
      .searchNames(harness.scope, { query: 'a' }, signal())
    expect(found).toEqual({ matches: [{ path: 'a.md', bytes: 1 }], truncated: true })
  })

  it('reports a match without bytes when the backend cannot size the file', async () => {
    await write('readme.md')
    const listDir = harness.ctx.fs.listDir.bind(harness.ctx.fs)
    // A provider that cannot report a byte size omits it; the match must still
    // be offered, with `bytes` left absent rather than fabricated.
    vi.spyOn(harness.ctx.fs, 'listDir').mockImplementation(async (target, abort) =>
      (await listDir(target, abort)).map(withoutSize))
    const found = await harness.endpoint().searchNames(harness.scope, { query: 'readme' }, signal())
    expect(found).toEqual({ matches: [{ path: 'readme.md' }], truncated: false })
  })

  it('refuses to walk for a caller that already aborted', async () => {
    await write('readme.md')
    const controller = new AbortController()
    controller.abort()
    await expect(harness.endpoint().searchNames(harness.scope, { query: 'readme' }, controller.signal)).rejects.toThrow()
  })
})
