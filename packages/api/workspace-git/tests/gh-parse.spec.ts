import { describe, expect, it } from 'vitest'
import { firstLine, parseGhAccount, parseGhPrNumber, parseGhPrUrl, parseGhPrs } from '../src/parse.ts'

describe('gh parsers', () => {
  it('reads pull requests from one gh pr list --json answer', () => {
    const fixture = JSON.stringify([
      {
        number: 7,
        title: 'Fix parser',
        headRefName: 'fix/parser',
        baseRefName: 'main',
        isDraft: false,
        updatedAt: '2026-09-30T08:00:00Z',
        author: { login: 'monalisa' },
      },
      {
        number: 8,
        title: 'Draft: parser notes',
        headRefName: 'notes',
        baseRefName: 'main',
        isDraft: true,
        updatedAt: '2026-09-30T09:00:00Z',
        author: { login: 'octocat' },
      },
    ])
    expect(parseGhPrs(fixture)).toEqual([
      {
        number: 7,
        title: 'Fix parser',
        headRefName: 'fix/parser',
        baseRefName: 'main',
        isDraft: false,
        updatedAt: '2026-09-30T08:00:00Z',
        author: 'monalisa',
      },
      {
        number: 8,
        title: 'Draft: parser notes',
        headRefName: 'notes',
        baseRefName: 'main',
        isDraft: true,
        updatedAt: '2026-09-30T09:00:00Z',
        author: 'octocat',
      },
    ])
  })

  it('drops rows without a positive integer number and defaults omitted fields', () => {
    const fixture = JSON.stringify([
      { title: 'no number' },
      { number: 0, title: 'zero' },
      { number: 2.5, title: 'fraction' },
      { number: 9, title: 'kept' },
    ])
    expect(parseGhPrs(fixture)).toEqual([
      {
        number: 9,
        title: 'kept',
        headRefName: '',
        baseRefName: '',
        isDraft: false,
        updatedAt: '',
        author: '',
      },
    ])
  })

  it('yields no rows for output that is not a JSON array', () => {
    expect(parseGhPrs('{"number": 7}')).toEqual([])
    expect(parseGhPrs('not json at all')).toEqual([])
    expect(parseGhPrs('')).toEqual([])
  })

  it('reads the account from an auth answer that names its credential source', () => {
    expect(parseGhAccount('✓ Logged in to github.com account monalisa (keyring)\n')).toBe('monalisa')
    expect(parseGhAccount('account octo-cat (env)')).toBe('octo-cat')
  })

  it('reads no account from prose without the credential source', () => {
    expect(parseGhAccount('account talk in a sentence')).toBeUndefined()
    expect(parseGhAccount('✗ Not logged in')).toBeUndefined()
    expect(parseGhAccount('')).toBeUndefined()
  })

  it('takes the last https URL of one create answer', () => {
    expect(parseGhPrUrl('Creating pull request for monalisa into main in qilin/api\nhttps://github.com/qilin/api/pull/9\n')).toBe('https://github.com/qilin/api/pull/9')
    expect(parseGhPrUrl('created https://github.com/qilin/api/pull/1 in favor of https://github.com/qilin/api/pull/2')).toBe('https://github.com/qilin/api/pull/2')
  })

  it('reads no URL from output without one', () => {
    expect(parseGhPrUrl('done, nothing printed here')).toBeUndefined()
    expect(parseGhPrUrl('')).toBeUndefined()
  })

  it('reads the number from one pull URL and refuses every other shape', () => {
    expect(parseGhPrNumber('https://github.com/qilin/api/pull/42')).toBe(42)
    expect(parseGhPrNumber('https://github.com/qilin/api/pull/42/')).toBe(42)
    expect(parseGhPrNumber('https://github.com/qilin/api/pull/42/files')).toBeUndefined()
    expect(parseGhPrNumber('https://github.com/qilin/api/issues/42')).toBeUndefined()
  })

  it('returns the first non-empty line and undefined for blank output', () => {
    expect(firstLine('\n  ✗ Failed to log in to github.com  \naccount file not found\n')).toBe('✗ Failed to log in to github.com')
    expect(firstLine('single')).toBe('single')
    expect(firstLine('\n \n')).toBeUndefined()
  })
})
