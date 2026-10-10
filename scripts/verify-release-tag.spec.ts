import { describe, expect, it } from 'vitest'
import { evaluateReleaseReadiness, mainPushSha, parsePushRefs, releaseTagsAt, tagVersion } from './verify-release-tag.ts'

const NOTES = '# QiLin vX.Y.Z · 标题\n\n> 发布时间: 2026-09-19\n\n概述段落，足够长以越过最小说明长度阈值。'.repeat(2)

describe('parsePushRefs', () => {
  it('parses one ref update per line and drops blank or malformed lines', () => {
    const raw = [
      'refs/heads/main 1111111111111111111111111111111111111111 refs/heads/main 2222222222222222222222222222222222222222',
      '',
      'refs/tags/v3.0.2 3333333333333333333333333333333333333333 refs/tags/v3.0.2 0000000000000000000000000000000000000000',
      'not-a-ref-line',
    ].join('\n')
    expect(parsePushRefs(raw)).toEqual([
      {
        localRef: 'refs/heads/main',
        sha: '1111111111111111111111111111111111111111',
        remoteRef: 'refs/heads/main',
      },
      {
        localRef: 'refs/tags/v3.0.2',
        sha: '3333333333333333333333333333333333333333',
        remoteRef: 'refs/tags/v3.0.2',
      },
    ])
  })
})

describe('mainPushSha', () => {
  const sha = 'a'.repeat(40)
  const tagPush = { localRef: 'refs/tags/v3.0.2', sha: 'b'.repeat(40), remoteRef: 'refs/tags/v3.0.2' }
  const branchPush = { localRef: 'refs/heads/3.0.1', sha: 'c'.repeat(40), remoteRef: 'refs/heads/3.0.1' }
  const mainPush = { localRef: 'refs/heads/main', sha, remoteRef: 'refs/heads/main' }

  it('picks the ref update that lands on main', () => {
    expect(mainPushSha([tagPush, mainPush, branchPush])).toBe(sha)
  })

  it('enforces nothing for branch- or tag-only pushes', () => {
    expect(mainPushSha([tagPush])).toBeUndefined()
    expect(mainPushSha([branchPush])).toBeUndefined()
  })

  it('enforces nothing for a main deletion', () => {
    expect(mainPushSha([{ localRef: 'refs/heads/main', sha: '0'.repeat(40), remoteRef: 'refs/heads/main' }])).toBeUndefined()
  })
})

describe('releaseTagsAt', () => {
  it('keeps version tags, prerelease candidates included, and drops every other tag shape', () => {
    expect(releaseTagsAt(['v3.0.2', 'v3', 'dsh-v0.1.5-rc.2', 'nightly', 'v3.0.2-rc.1'])).toEqual(['v3.0.2', 'v3', 'v3.0.2-rc.1'])
  })
})

describe('tagVersion', () => {
  it('names the tagged version with its prerelease verbatim', () => {
    expect(tagVersion('v3.1.4')).toBe('3.1.4')
    expect(tagVersion('v3.1.4-rc.1')).toBe('3.1.4-rc.1')
    expect(tagVersion('dsh-v0.1.5-rc.2')).toBeUndefined()
    expect(tagVersion('nightly')).toBeUndefined()
  })
})

describe('evaluateReleaseReadiness', () => {
  const sha = 'a'.repeat(40)

  it('fails with the tag remedy when no v* tag points at the commit', () => {
    const result = evaluateReleaseReadiness(sha, [], () => undefined)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problem).toBe('tag')
    expect(result.message).toContain('git tag -a vX.Y.Z[-prerelease] ' + sha)
  })

  it('fails with the publish remedy when the tag has no release', () => {
    const result = evaluateReleaseReadiness(sha, ['v3.0.2'], () => undefined, '3.0.2')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problem).toBe('release')
    expect(result.message).toContain('gh release create')
  })

  it('fails when the release body is too short to be written notes', () => {
    const result = evaluateReleaseReadiness(sha, ['v3.0.2'], () => 'TODO', '3.0.2')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problem).toBe('notes')
  })

  it('passes with the first tag whose release carries notes', () => {
    const result = evaluateReleaseReadiness(
      sha,
      ['v3.0.1', 'v3.0.2'],
      tag => (tag === 'v3.0.2' ? NOTES : undefined),
      '3.0.2',
    )
    expect(result).toEqual({ ok: true, tag: 'v3.0.2' })
  })

  it('fails when the commit declares a version other than its tag', () => {
    const result = evaluateReleaseReadiness(sha, ['v3.0.2'], () => NOTES, '3.0.1')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problem).toBe('version')
    expect(result.message).toContain('pnpm run version:set 3.0.2')
  })

  it('fails when the commit declares no version at all', () => {
    const result = evaluateReleaseReadiness(sha, ['v3.0.2'], () => NOTES, undefined)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problem).toBe('version')
  })

  it('passes for a prerelease tag whose release carries notes and the matching declared version', () => {
    const result = evaluateReleaseReadiness(sha, ['v3.1.4-rc.1'], () => NOTES, '3.1.4-rc.1')
    expect(result).toEqual({ ok: true, tag: 'v3.1.4-rc.1' })
  })

  it('fails a prerelease tag whose commit declares the final version', () => {
    const result = evaluateReleaseReadiness(sha, ['v3.1.4-rc.1'], () => NOTES, '3.1.4')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problem).toBe('version')
    expect(result.message).toContain('pnpm run version:set 3.1.4-rc.1')
  })

  it('fails a prerelease tag whose commit declares a different prerelease', () => {
    const result = evaluateReleaseReadiness(sha, ['v3.1.4-rc.1'], () => NOTES, '3.1.4-rc.2')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problem).toBe('version')
  })
})
