/** The pure parsers, pinned against recorded fixture strings from real git output. */
import { describe, expect, it } from 'vitest'
import { parseAheadBehind, parseBranches, parseStatusPorcelain } from '../src/parse.ts'

describe('parseStatusPorcelain — NUL-terminated porcelain v1', () => {
  it('classifies staged, unstaged, untracked, and clean-modified records', () => {
    const fixture = 'M  staged-only.txt\0 M worktree-only.txt\0?? new.txt\0MM both.txt\0'
    expect(parseStatusPorcelain(fixture)).toEqual([
      { path: 'staged-only.txt', index: 'M', worktree: ' ', staged: true, unstaged: false, untracked: false },
      { path: 'worktree-only.txt', index: ' ', worktree: 'M', staged: false, unstaged: true, untracked: false },
      { path: 'new.txt', index: '?', worktree: '?', staged: false, unstaged: false, untracked: true },
      { path: 'both.txt', index: 'M', worktree: 'M', staged: true, unstaged: true, untracked: false },
    ])
  })

  it('reads a rename as its current path and drops the origin record that follows', () => {
    const fixture = 'R  moved.txt\0origin.txt\0'
    expect(parseStatusPorcelain(fixture)).toEqual([
      { path: 'moved.txt', index: 'R', worktree: ' ', staged: true, unstaged: false, untracked: false },
    ])
  })

  it('reads a copy the same way and keeps `/`-joined directory paths verbatim', () => {
    const fixture = 'C  src/copied.ts\0src/template.ts\0'
    expect(parseStatusPorcelain(fixture)).toEqual([
      { path: 'src/copied.ts', index: 'C', worktree: ' ', staged: true, unstaged: false, untracked: false },
    ])
  })

  it('reports both sides of an unmerged conflict as staged and unstaged', () => {
    expect(parseStatusPorcelain('UU conflict.txt\0')).toEqual([
      { path: 'conflict.txt', index: 'U', worktree: 'U', staged: true, unstaged: true, untracked: false },
    ])
  })

  it('returns no entry for empty output and for the trailing NUL of a complete record', () => {
    expect(parseStatusPorcelain('')).toEqual([])
    expect(parseStatusPorcelain('\0')).toEqual([])
  })
})

describe('parseAheadBehind — rev-list --left-right --count', () => {
  it('reads the tab-joined ahead and behind counts with trailing newline', () => {
    expect(parseAheadBehind('2\t1\n')).toEqual({ ahead: 2, behind: 1 })
    expect(parseAheadBehind('0\t0\n')).toEqual({ ahead: 0, behind: 0 })
  })

  it('rejects anything that is not two integers', () => {
    expect(parseAheadBehind('')).toBeUndefined()
    expect(parseAheadBehind('ahead 2\n')).toBeUndefined()
    expect(parseAheadBehind('1\n')).toBeUndefined()
  })
})

describe('parseBranches — the fixed for-each-ref format', () => {
  it('marks the current branch and reads upstream names and track counts', () => {
    const fixture = [
      'feature\t*\torigin/feature\tahead 2, behind 1',
      'main\t \torigin/main\tbehind 3',
      'solo\t\t\t',
      'gone\t \torigin/gone\tgone',
      '',
    ].join('\n')
    expect(parseBranches(fixture)).toEqual([
      { name: 'feature', current: true, upstream: 'origin/feature', ahead: 2, behind: 1 },
      { name: 'main', current: false, upstream: 'origin/main', ahead: 0, behind: 3 },
      { name: 'solo', current: false, upstream: undefined, ahead: 0, behind: 0 },
      { name: 'gone', current: false, upstream: 'origin/gone', ahead: 0, behind: 0 },
    ])
  })

  it('keeps slash-bearing short names whole and drops non-records', () => {
    const fixture = 'release/1.x\t \t\t\nnot a branch line\n'
    expect(parseBranches(fixture)).toEqual([
      { name: 'release/1.x', current: false, upstream: undefined, ahead: 0, behind: 0 },
    ])
  })
})
