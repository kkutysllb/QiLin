/**
 * The identity, timestamp, link, mutation, and durability-sink guarantees
 * MemoryVfs owes its consumers, asserted directly rather than through the
 * `node:fs` bridge.
 *
 * `qilin-fs-local` builds a version token from `dev:ino:size:mtimeNs:ctimeNs` and
 * refuses a write whose token moved since it read. Two properties carry that:
 * `ino` identifies the entry at a path, and `mtimeMs` moves on every write. The
 * timestamp cases freeze the clock, because these writes are in memory and two
 * revisions routinely land in the same millisecond — a real-clock test passes
 * whether or not the strict increment exists.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryVfs } from '../../src/storage/memory.ts'
import type { VfsBigIntStats, VfsMutation, VfsMutationSink, VfsStats } from '../../src/storage/types.ts'

const identity = (vfs: MemoryVfs, path: string): bigint =>
  (vfs.statSync(path, { bigint: true }) as VfsBigIntStats).ino

const linkCount = (vfs: MemoryVfs, path: string): bigint =>
  (vfs.statSync(path, { bigint: true }) as VfsBigIntStats).nlink

const modified = (vfs: MemoryVfs, path: string): number => (vfs.statSync(path) as VfsStats).mtimeMs

afterEach(() => { vi.restoreAllMocks() })

describe('entry identity', () => {
  it('distinguishes paths and holds each identity across repeated stats', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/qilin/one.txt', 'one')
    vfs.seed('/qilin/two.txt', 'two')
    const first = identity(vfs, '/qilin/one.txt')
    expect(identity(vfs, '/qilin/two.txt')).not.toBe(first)
    expect(identity(vfs, '/qilin/one.txt')).toBe(first)
  })

  it('forgets the identities under a directory removed as a subtree', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/qilin/skills/git/SKILL.md', '# git\n')
    const before = identity(vfs, '/qilin/skills/git/SKILL.md')
    vfs.rmSync('/qilin/skills', { recursive: true })
    vfs.seed('/qilin/skills/git/SKILL.md', '# git rebuilt\n')
    expect(identity(vfs, '/qilin/skills/git/SKILL.md')).not.toBe(before)
  })

  it('moves the source identity when a file replaces another path', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/qilin/from.txt', 'moved')
    vfs.seed('/qilin/to.txt', 'replaced')
    const [source, destination] = [identity(vfs, '/qilin/from.txt'), identity(vfs, '/qilin/to.txt')]
    vfs.renameSync('/qilin/from.txt', '/qilin/to.txt')
    const renamed = identity(vfs, '/qilin/to.txt')
    expect(vfs.readFileSync('/qilin/to.txt', 'utf8')).toBe('moved')
    expect([renamed === source, renamed === destination]).toEqual([true, false])
  })
})

describe('modification time', () => {
  it('hydrates explicit metadata without confusing timestamps with permission bits', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/qilin/restored', 'value', { mode: 0o600, mtimeMs: 1_600_000_000_000 })
    vfs.seedDirectory('/qilin/restored-directory', { mode: 0o700, mtimeMs: 1_600_000_000_001 })
    const stats = vfs.statSync('/qilin/restored') as VfsStats
    const directory = vfs.statSync('/qilin/restored-directory') as VfsStats
    expect([stats.mode & 0o777, stats.mtimeMs]).toEqual([0o600, 1_600_000_000_000])
    expect([directory.mode & 0o777, directory.mtimeMs]).toEqual([0o700, 1_600_000_000_001])
  })

  it('advances on every write even while the clock stands still', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seed('/qilin/log.jsonl', 'first\n')
    const seeded = modified(vfs, '/qilin/log.jsonl')
    vfs.writeFileSync('/qilin/log.jsonl', 'second\n')
    const written = modified(vfs, '/qilin/log.jsonl')
    vfs.appendFileSync('/qilin/log.jsonl', 'third\n')
    const appended = modified(vfs, '/qilin/log.jsonl')
    vfs.truncateSync('/qilin/log.jsonl', 6)
    const truncated = modified(vfs, '/qilin/log.jsonl')
    expect([written > seeded, appended > written, truncated > appended]).toEqual([true, true, true])
    // One millisecond per revision: the increment is the minimum that separates
    // two tokens, not a coarser bump that would skew a real timestamp.
    expect(truncated - seeded).toBe(3)
  })

  it('takes the clock once the clock has passed the entry', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seed('/qilin/log.jsonl', 'first\n')
    clock.mockReturnValue(1_700_000_005_000)
    vfs.writeFileSync('/qilin/log.jsonl', 'second\n')
    expect(modified(vfs, '/qilin/log.jsonl')).toBe(1_700_000_005_000)
  })

  it('extends truncation with zero bytes', async () => {
    const vfs = new MemoryVfs()
    vfs.seed('/qilin/file', new Uint8Array([1, 2]))
    vfs.truncateSync('/qilin/file', 5)
    expect([...vfs.readFileSync('/qilin/file') as Uint8Array]).toEqual([1, 2, 0, 0, 0])
    const handle = vfs.open('/qilin/file', 'r+')
    await handle.truncate(7)
    expect([...vfs.readFileSync('/qilin/file') as Uint8Array]).toEqual([1, 2, 0, 0, 0, 0, 0])
  })

  it('advances a directory only when its immediate entry set changes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/qilin/workspace')
    const empty = modified(vfs, '/qilin/workspace')
    vfs.writeFileSync('/qilin/workspace/file.txt', 'one')
    const created = modified(vfs, '/qilin/workspace')
    vfs.writeFileSync('/qilin/workspace/file.txt', 'two')
    const rewritten = modified(vfs, '/qilin/workspace')
    vfs.rmSync('/qilin/workspace/file.txt')
    const removed = modified(vfs, '/qilin/workspace')
    expect([created > empty, rewritten === created, removed > rewritten]).toEqual([true, true, true])
  })
})

describe('mutation publication', () => {
  it('publishes only committed runtime changes and keeps image seeding silent', () => {
    const vfs = new MemoryVfs()
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })
    vfs.seed('/qilin/seeded.txt', 'seeded')
    expect(mutations).toEqual([])
    vfs.writeFileSync('/qilin/seeded.txt', 'changed')
    vfs.mkdirSync('/qilin/created')
    vfs.chmodSync('/qilin/created', 0o700)
    vfs.renameSync('/qilin/seeded.txt', '/qilin/renamed.txt')
    vfs.rmSync('/qilin/created', { recursive: true })
    expect(mutations.map(mutation => ({
      kind: mutation.kind,
      path: mutation.path,
      ...mutation.kind === 'write' ? { entryChanged: mutation.entryChanged } : {},
      ...mutation.kind === 'chmod' ? { mode: mutation.mode } : {},
    }))).toEqual([
      { kind: 'write', path: '/qilin/seeded.txt', entryChanged: false },
      { kind: 'mkdir', path: '/qilin/created' },
      { kind: 'chmod', path: '/qilin/created', mode: 0o700 },
      { kind: 'remove', path: '/qilin/seeded.txt' },
      { kind: 'write', path: '/qilin/renamed.txt', entryChanged: true },
      { kind: 'remove', path: '/qilin/created' },
    ])
    const renamed = mutations[4]
    expect(renamed?.kind === 'write' && new TextDecoder().decode(renamed.bytes)).toBe('changed')
    expect(() => { vfs.writeFileSync('/missing/file', 'no') }).toThrow(/ENOENT/)
    expect(mutations).toHaveLength(6)
  })

  it('contains a faulty observer and lets disposal stop later notifications', () => {
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/qilin')
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const first = vfs.subscribe(() => { throw new Error('observer failed') })
    const seen: string[] = []
    const second = vfs.subscribe((mutation) => { seen.push(mutation.path) })
    vfs.writeFileSync('/qilin/one', '1')
    first()
    second()
    vfs.writeFileSync('/qilin/two', '2')
    expect(seen).toEqual(['/qilin/one'])
    expect(reported).toHaveBeenCalledOnce()
  })

  it('feeds the same complete mutations to a durable sink and live subscribers', async () => {
    const recorded: VfsMutation[] = []
    let flushes = 0
    const sink: VfsMutationSink = {
      record: (mutation) => { recorded.push(mutation) },
      flush: async () => { flushes += 1 },
    }
    const vfs = new MemoryVfs({ sink })
    vfs.seedDirectory('/qilin')
    const observed: VfsMutation[] = []
    vfs.subscribe((mutation) => { observed.push(mutation) })
    vfs.writeFileSync('/qilin/log', 'a')
    vfs.appendFileSync('/qilin/log', 'bc')
    await vfs.flush()
    expect(observed).toEqual(recorded)
    expect(observed[0]).toBe(recorded[0])
    expect(recorded[0]).toMatchObject({ kind: 'write', path: '/qilin/log', mode: 0o644, entryChanged: true })
    expect(recorded[1]).toMatchObject({ kind: 'write', path: '/qilin/log', mode: 0o644, entryChanged: false, appendedFrom: 1 })
    expect(recorded[1]?.kind === 'write' && new TextDecoder().decode(recorded[1].bytes)).toBe('abc')
    expect(flushes).toBe(1)
  })

  it('publishes descriptor writes at the file identity current path', () => {
    const mutations: VfsMutation[] = []
    const vfs = new MemoryVfs()
    vfs.seed('/qilin/source', 'old')
    const descriptor = vfs.openFileSync('/qilin/source', 'r+')
    vfs.subscribe((mutation) => { mutations.push(mutation) })
    vfs.renameSync('/qilin/source', '/qilin/destination')
    mutations.length = 0
    descriptor.write(0, new TextEncoder().encode('new'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/qilin/destination'])
    expect(vfs.readFileSync('/qilin/destination', 'utf8')).toBe('new')
    vfs.unlinkSync('/qilin/destination')
    mutations.length = 0
    descriptor.write(0, new TextEncoder().encode('detached'))
    expect(mutations).toEqual([])
    expect(new TextDecoder().decode(descriptor.read(0, descriptor.stat().size))).toBe('detached')
  })

  it('reports the path identity through a BigInt file handle stat', async () => {
    const vfs = new MemoryVfs()
    vfs.seed('/qilin/session.lock', '')
    const handle = vfs.open('/qilin/session.lock', 'w')
    const held = await handle.stat({ bigint: true }) as VfsBigIntStats
    const current = vfs.statSync('/qilin/session.lock', { bigint: true }) as VfsBigIntStats

    expect([held.dev, held.ino]).toEqual([current.dev, current.ino])
    await handle.chmod(0o600)
    expect((vfs.statSync('/qilin/session.lock') as VfsStats).mode & 0o777).toBe(0o600)
    await handle.close()
  })

  it('decomposes a directory rename into replayable destination state', () => {
    const recorded: VfsMutation[] = []
    const vfs = new MemoryVfs({
      sink: { record: (mutation) => { recorded.push(mutation) }, flush: () => Promise.resolve() },
    })
    vfs.seedDirectory('/qilin/staging/nested', { mode: 0o700 })
    vfs.seed('/qilin/staging/nested/file', 'value', { mode: 0o600 })
    vfs.renameSync('/qilin/staging', '/qilin/published')

    expect(recorded.map(mutation => [mutation.kind, mutation.path])).toEqual([
      ['remove', '/qilin/staging'],
      ['mkdir', '/qilin/published'],
      ['mkdir', '/qilin/published/nested'],
      ['write', '/qilin/published/nested/file'],
    ])
    expect(recorded[3]).toMatchObject({ kind: 'write', mode: 0o600, entryChanged: true })
    expect(recorded[3]?.kind === 'write' && new TextDecoder().decode(recorded[3].bytes)).toBe('value')
  })
})

describe('directory rename', () => {
  it('rejects file, non-empty directory, and missing-parent destinations before mutation', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/qilin/source/nested/file', 'source')
    vfs.seed('/qilin/file', 'destination')
    vfs.seed('/qilin/non-empty/child', 'destination')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    expect(() => { vfs.renameSync('/qilin/source', '/qilin/file') })
      .toThrow(expect.objectContaining({ code: 'ENOTDIR' }))
    expect(() => { vfs.renameSync('/qilin/source', '/qilin/non-empty') })
      .toThrow(expect.objectContaining({ code: 'ENOTEMPTY' }))
    expect(() => { vfs.renameSync('/qilin/source', '/missing/destination') })
      .toThrow(expect.objectContaining({ code: 'ENOENT' }))

    expect(vfs.readFileSync('/qilin/source/nested/file', 'utf8')).toBe('source')
    expect(vfs.readFileSync('/qilin/file', 'utf8')).toBe('destination')
    expect(vfs.readFileSync('/qilin/non-empty/child', 'utf8')).toBe('destination')
    expect(mutations).toEqual([])
  })

  it('replaces an empty directory with the source subtree', () => {
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/qilin/source/nested', { mode: 0o700 })
    vfs.seed('/qilin/source/nested/file', 'source')
    vfs.seedDirectory('/qilin/destination', { mode: 0o711 })

    vfs.renameSync('/qilin/source', '/qilin/destination')

    expect(vfs.existsSync('/qilin/source')).toBe(false)
    expect(vfs.readFileSync('/qilin/destination/nested/file', 'utf8')).toBe('source')
    expect((vfs.statSync('/qilin/destination') as VfsStats).mode & 0o777).toBe(0o755)
    expect((vfs.statSync('/qilin/destination/nested') as VfsStats).mode & 0o777).toBe(0o700)
  })
})

describe('hard links', () => {
  it('shares identity, bytes, and mode until one name is removed', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/qilin/session.jsonl', 'committed\n')
    vfs.linkSync('/qilin/session.jsonl', '/qilin/session-latest.jsonl')
    vfs.linkSync('/qilin/session-latest.jsonl', '/qilin/session-archive.jsonl')
    expect(identity(vfs, '/qilin/session-latest.jsonl')).toBe(identity(vfs, '/qilin/session.jsonl'))
    expect(linkCount(vfs, '/qilin/session.jsonl')).toBe(3n)
    expect(vfs.readFileSync('/qilin/session-latest.jsonl', 'utf8')).toBe('committed\n')
    const changedPaths: string[] = []
    vfs.subscribe((mutation) => { changedPaths.push(mutation.path) })
    vfs.appendFileSync('/qilin/session.jsonl', 'appended\n')
    expect(changedPaths).toEqual([
      '/qilin/session.jsonl',
      '/qilin/session-latest.jsonl',
      '/qilin/session-archive.jsonl',
    ])
    expect(vfs.readFileSync('/qilin/session.jsonl', 'utf8')).toBe('committed\nappended\n')
    expect(vfs.readFileSync('/qilin/session-latest.jsonl', 'utf8')).toBe('committed\nappended\n')
    vfs.chmodSync('/qilin/session-latest.jsonl', 0o600)
    expect((vfs.statSync('/qilin/session.jsonl') as VfsStats).mode & 0o777).toBe(0o600)
    vfs.unlinkSync('/qilin/session-latest.jsonl')
    expect(linkCount(vfs, '/qilin/session.jsonl')).toBe(2n)
    vfs.unlinkSync('/qilin/session-archive.jsonl')
    expect(linkCount(vfs, '/qilin/session.jsonl')).toBe(1n)
    expect(vfs.readFileSync('/qilin/session.jsonl', 'utf8')).toBe('committed\nappended\n')
  })

  it('treats rename between names of the same node as a no-op', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/qilin/source', 'value')
    vfs.linkSync('/qilin/source', '/qilin/alias')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    vfs.renameSync('/qilin/source', '/qilin/alias')

    expect(vfs.readFileSync('/qilin/source', 'utf8')).toBe('value')
    expect(vfs.readFileSync('/qilin/alias', 'utf8')).toBe('value')
    expect(linkCount(vfs, '/qilin/source')).toBe(2n)
    expect(mutations).toEqual([])
  })

  it('retargets linked names through file replacement and directory moves', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/qilin/replacement', 'replacement')
    vfs.seed('/qilin/target', 'old')
    vfs.linkSync('/qilin/target', '/qilin/target-alias')
    const replaced = vfs.openFileSync('/qilin/target', 'r+')
    vfs.renameSync('/qilin/replacement', '/qilin/target')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    replaced.write(0, new TextEncoder().encode('changed'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/qilin/target-alias'])
    expect(vfs.readFileSync('/qilin/target', 'utf8')).toBe('replacement')
    expect(vfs.readFileSync('/qilin/target-alias', 'utf8')).toBe('changed')
    expect(linkCount(vfs, '/qilin/target-alias')).toBe(1n)

    vfs.seed('/qilin/tree/file', 'tree')
    vfs.linkSync('/qilin/tree/file', '/qilin/outside')
    const moved = vfs.openFileSync('/qilin/tree/file', 'r+')
    vfs.renameSync('/qilin/tree', '/qilin/moved')
    mutations.length = 0
    moved.write(0, new TextEncoder().encode('moved'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/qilin/outside', '/qilin/moved/file'])
    expect(linkCount(vfs, '/qilin/moved/file')).toBe(2n)

    vfs.rmSync('/qilin/moved', { recursive: true })
    mutations.length = 0
    moved.write(0, new TextEncoder().encode('kept!'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/qilin/outside'])
    expect(vfs.readFileSync('/qilin/outside', 'utf8')).toBe('kept!')
    expect(linkCount(vfs, '/qilin/outside')).toBe(1n)
  })

  it('rejects renaming a file over an existing directory', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/qilin/file', 'value')
    vfs.seedDirectory('/qilin/directory')
    expect(() => { vfs.renameSync('/qilin/file', '/qilin/directory') }).toThrow(expect.objectContaining({ code: 'EISDIR' }))
    expect(vfs.readFileSync('/qilin/file', 'utf8')).toBe('value')
    expect(vfs.statSync('/qilin/directory').isDirectory()).toBe(true)
  })
})
