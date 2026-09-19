import { describe, expect, it } from 'vitest'
import { evaluateReleaseReadiness, mainPushSha, parsePushRefs, releaseTagsAt } from './verify-release-tag.ts'

const NOTES = '# QiLin vX.Y.Z · 标题\n\n> 发布时间: 2026-09-19\n\n概述段落，足够长以越过最小说明长度阈值。'.repeat(2)

describe('parsePushRefs', () => {
  it('parses one ref update per line and drops blank or malformed lines', () => {
    const raw = [
      'refs/heads/main 8522bb4bf8a7b413a12f803dcba6f330ef98cf2f refs/heads/main 6f604af86e59416896b904bdcdc7df61de136725',
      '',
      'refs/tags/v3.0.2 eb49bebb31213c3ace25cb9e84d820a12d7aaa61 refs/tags/v3.0.2 0000000000000000000000000000000000000000',
      'not-a-ref-line',
    ].join('\n')
    expect(parsePushRefs(raw)).toEqual([
      {
        localRef: 'refs/heads/main',
        sha: '8522bb4bf8a7b413a12f803dcba6f330ef98cf2f',
        remoteRef: 'refs/heads/main',
      },
      {
        localRef: 'refs/tags/v3.0.2',
        sha: 'eb49bebb31213c3ace25cb9e84d820a12d7aaa61',
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
  it('keeps version tags and drops every other tag shape', () => {
    expect(releaseTagsAt(['v3.0.2', 'v3', 'dsh-v0.1.5-rc.2', 'nightly', 'v3.0.2-rc.1'])).toEqual(['v3.0.2', 'v3'])
  })
})

describe('evaluateReleaseReadiness', () => {
  const sha = 'a'.repeat(40)

  it('fails with the tag remedy when no v* tag points at the commit', () => {
    const result = evaluateReleaseReadiness(sha, [], () => undefined)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problem).toBe('tag')
    expect(result.message).toContain(`git tag -a vX.Y.Z ${sha}`)
  })

  it('fails with the publish remedy when the tag has no release', () => {
    const result = evaluateReleaseReadiness(sha, ['v3.0.2'], () => undefined)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problem).toBe('release')
    expect(result.message).toContain('gh release create')
  })

  it('fails when the release body is too short to be written notes', () => {
    const result = evaluateReleaseReadiness(sha, ['v3.0.2'], () => 'TODO')
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problem).toBe('notes')
  })

  it('passes with the first tag whose release carries notes', () => {
    const result = evaluateReleaseReadiness(sha, ['v3.0.1', 'v3.0.2'], tag => (tag === 'v3.0.2' ? NOTES : undefined))
    expect(result).toEqual({ ok: true, tag: 'v3.0.2' })
  })
})
