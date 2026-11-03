/** Whole-file captures and the mutation paths that trigger them. */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { captureFile, mutationPaths, sameCapture } from '../src/capture.ts'
import { scratchDir } from './support.ts'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const cleanup of cleanups.reverse()) await cleanup()
  cleanups.length = 0
})

describe('captureFile', () => {
  it('stores text once by content, reads no more than the cap, and classifies absent, oversized, binary, and non-regular paths', async () => {
    const root = await scratchDir('qilin-capture-', cleanups)
    const store = join(root, 'captures')
    await writeFile(join(root, 'a.txt'), 'one\ntwo\n')
    await writeFile(join(root, 'same.txt'), 'one\ntwo\n')
    await writeFile(join(root, 'big.txt'), 'x'.repeat(17))
    await writeFile(join(root, 'bin.dat'), Uint8Array.of(65, 0, 66))
    await mkdir(join(root, 'dir'))
    const a = await captureFile(join(root, 'a.txt'), store, 16)
    const same = await captureFile(join(root, 'same.txt'), store, 16)
    expect(a).toMatchObject({ kind: 'file', binary: false })
    expect(same).toEqual(a)
    if (a?.kind !== 'file' || same === undefined) throw new Error('expected a stored copy')
    expect(await readFile(a.file, 'utf8')).toBe('one\ntwo\n')
    expect(await readdir(store)).toHaveLength(1)
    expect(await captureFile(join(root, 'big.txt'), store, 16)).toEqual({ kind: 'oversized' })
    expect(await captureFile(join(root, 'missing.txt'), store, 16)).toEqual({ kind: 'absent' })
    expect(await captureFile(join(root, 'bin.dat'), store, 16)).toMatchObject({ kind: 'file', binary: true })
    expect(await captureFile(join(root, 'dir'), store, 16)).toBeUndefined()
    // The cap is inclusive: exactly `maxBytes` is stored, one byte more is not.
    await writeFile(join(root, 'edge.txt'), 'y'.repeat(16))
    expect(await captureFile(join(root, 'edge.txt'), store, 16)).toMatchObject({ kind: 'file' })
    expect(sameCapture({ kind: 'absent' }, { kind: 'absent' })).toBe(true)
    expect(sameCapture({ kind: 'absent' }, { kind: 'oversized' })).toBe(false)
    expect(sameCapture(a, same)).toBe(true)
    expect(sameCapture(a, { kind: 'file', file: 'elsewhere', binary: false })).toBe(false)
    // Unread content is never known to match: two oversized sides may differ.
    expect(sameCapture({ kind: 'oversized' }, { kind: 'oversized' })).toBe(false)
    expect(sameCapture({ kind: 'oversized' }, a)).toBe(false)
  })
})

describe('mutationPaths', () => {
  it('names the path of write, edit, and mutating editor calls', () => {
    expect(mutationPaths('write', { file_path: 'a.txt', content: 'x' })).toEqual(['a.txt'])
    expect(mutationPaths('edit', { file_path: 'a.txt', old_string: 'x', new_string: 'y' })).toEqual(['a.txt'])
    expect(mutationPaths('str_replace_editor', { command: 'create', path: 'b.txt', file_text: 'b' })).toEqual(['b.txt'])
    expect(mutationPaths('str_replace_editor', { command: 'str_replace', path: 'b.txt', old_str: 'b' })).toEqual(['b.txt'])
    expect(mutationPaths('str_replace_editor', { command: 'insert', path: 'b.txt', insert_line: 1, new_str: 'i' })).toEqual(['b.txt'])
  })

  it('names every apply_patch path, keeping both ends of a move in patch order', () => {
    const patch = (...operations: string[]) => ['*** Begin Patch', ...operations, '*** End Patch'].join('\n')
    expect(mutationPaths('apply_patch', { input: patch(
      '*** Add File: added.txt', '+created',
      '*** Update File: source.txt', '@@', '-old', '+new',
      '*** Update File: moved.txt', '*** Move to: nested/target.txt', '@@', '-old', '+new',
      '*** Delete File: gone.txt',
    ) })).toEqual(['added.txt', 'source.txt', 'moved.txt', 'nested/target.txt', 'gone.txt'])
    // A malformed patch changes nothing, so it captures nothing.
    expect(mutationPaths('apply_patch', { input: 'invalid' })).toEqual([])
  })

  it('yields nothing for reads, unknown tools, and incomplete arguments', () => {
    expect(mutationPaths('write', undefined)).toEqual([])
    expect(mutationPaths('write', [])).toEqual([])
    expect(mutationPaths('read', { file_path: 'a.txt' })).toEqual([])
    expect(mutationPaths('write', { file_path: ' ', content: 'x' })).toEqual([])
    expect(mutationPaths('write', { file_path: 'a.txt' })).toEqual([])
    expect(mutationPaths('edit', { file_path: 'a.txt', old_string: 'x' })).toEqual([])
    expect(mutationPaths('str_replace_editor', { command: 'view', path: 'b.txt' })).toEqual([])
    expect(mutationPaths('str_replace_editor', { command: 'create', path: '' })).toEqual([])
    expect(mutationPaths('apply_patch', { input: '   ' })).toEqual([])
  })
})
