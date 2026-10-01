/**
 * The filename search against a real workspace: case-insensitive basename
 * matches in breadth-first order, files only, excluded and non-contained
 * directories walked around, and both budgets reporting their cut.
 */
import { mkdir, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { openWorkspace, signal, type Harness } from './harness.ts'

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
    const found = await harness.endpoint().searchNames(harness.scope, 'ReadMe', signal())
    expect(found).toEqual({
      matches: [{ path: 'readme.md', bytes: 2 }, { path: 'src/readme.ts', bytes: 1 }],
      truncated: false,
    })
  })

  it('matches nothing for a blank query', async () => {
    await write('readme.md')
    const found = await harness.endpoint().searchNames(harness.scope, '   ', signal())
    expect(found).toEqual({ matches: [], truncated: false })
  })

  it('neither matches nor descends a configured excluded directory', async () => {
    await write('node_modules/pkg/readme.md')
    await write('src/readme.ts')
    const found = await harness.endpoint({ searchExcludedDirectories: ['node_modules'] })
      .searchNames(harness.scope, 'readme', signal())
    expect(found).toEqual({ matches: [{ path: 'src/readme.ts', bytes: 1 }], truncated: false })
  })

  it('does not descend a symbolic-link directory that leaves the workspace', async () => {
    await writeFile(join(harness.outside, 'readme-outside.md'), 'x')
    await symlink(harness.outside, join(harness.workspace, 'elsewhere'))
    await write('readme-inside.md')
    const found = await harness.endpoint().searchNames(harness.scope, 'readme', signal())
    expect(found).toEqual({ matches: [{ path: 'readme-inside.md', bytes: 1 }], truncated: false })
  })

  it('reports the cut when the match cap stops the walk', async () => {
    await write('a-readme.md')
    await write('b-readme.md')
    const found = await harness.endpoint({ maxSearchMatches: 1 })
      .searchNames(harness.scope, 'readme', signal())
    expect(found).toEqual({ matches: [{ path: 'a-readme.md', bytes: 1 }], truncated: true })
  })

  it('reports the cut when the visit budget runs out', async () => {
    await write('a.md')
    await write('b.md')
    await write('c.md')
    const found = await harness.endpoint({ maxSearchVisited: 2 })
      .searchNames(harness.scope, 'a', signal())
    expect(found).toEqual({ matches: [{ path: 'a.md', bytes: 1 }], truncated: true })
  })

  it('refuses to walk for a caller that already aborted', async () => {
    await write('readme.md')
    const controller = new AbortController()
    controller.abort()
    await expect(harness.endpoint().searchNames(harness.scope, 'readme', controller.signal)).rejects.toThrow()
  })
})
