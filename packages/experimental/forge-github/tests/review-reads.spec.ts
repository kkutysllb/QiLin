import { describe, expect, it } from 'vitest'
import type { ForgeFailure } from '@qilin-agent/experimental-forge'
import type { ChangeRequestRef } from '@qilin-agent/experimental-forge/types'
import { readGitHubReviewThreads } from '../src/review-reads.ts'
import { pull } from './fixtures.ts'

const signal = new AbortController().signal

/** One read whose answer is `body`, or the failure it names. */
function reader(body: unknown): () => Promise<string | ForgeFailure> {
  return async () => (typeof body === 'string' ? body : JSON.stringify(body))
}

function read(body: unknown, ref: ChangeRequestRef = pull(4)): ReturnType<typeof readGitHubReviewThreads> {
  return readGitHubReviewThreads(ref, signal, reader(body))
}

/** One review thread node with the fields the query returns. */
function node(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'T1', isResolved: false, isOutdated: false, path: 'src/a.ts', line: 6, startLine: 4, diffSide: 'RIGHT',
    comments: { nodes: [{ author: { login: 'octocat' }, body: 'First' }] },
    ...overrides,
  }
}

function response(nodes: readonly unknown[]): Record<string, unknown> {
  return { data: { repository: { pullRequest: { reviewThreads: { nodes } } } } }
}

describe('GitHub review read mapping', () => {
  it('reads a failure from the caller unchanged', async () => {
    await expect(readGitHubReviewThreads(pull(4), signal, async () => ({ code: 'too-large', message: 'over limit' })))
      .resolves.toEqual({ code: 'too-large', message: 'over limit' })
  })

  it('keeps the range, side, author, and joined text of each thread', async () => {
    await expect(read(response([
      node(),
      node({ id: 'T2', path: 'src/b.ts', line: null, startLine: null, diffSide: null, isResolved: true, isOutdated: true,
        comments: { nodes: [] } }),
    ]))).resolves.toEqual([
      { id: 'T1', path: 'src/a.ts', side: 'R', startLine: 4, endLine: 6, author: 'octocat', body: 'First', resolved: false, outdated: false },
    ])
  })

  it('anchors a thread without line numbers at the first line and keeps comments without authors', async () => {
    await expect(read(response([
      node({ line: null, startLine: null, diffSide: 'LEFT', comments: { nodes: [{ author: null, body: ' left ' }] } }),
    ]))).resolves.toEqual([
      { id: 'T1', path: 'src/a.ts', side: 'L', startLine: 1, endLine: 1, author: null, body: 'left', resolved: false, outdated: false },
    ])
  })

  it('joins only the comments that carry text and takes the first author', async () => {
    await expect(read(response([
      node({ comments: { nodes: [{ author: { login: 'octocat' }, body: '  ' }, { author: { login: 'hubot' }, body: 'Second' }, { author: { login: 'other' }, body: 'Third' }] } }),
    ]))).resolves.toEqual([
      { id: 'T1', path: 'src/a.ts', side: 'R', startLine: 4, endLine: 6, author: 'hubot', body: 'Second\n\nThird', resolved: false, outdated: false },
    ])
  })

  it('refuses answers without GraphQL fields and answers without usable error messages', async () => {
    await expect(read('{}')).resolves.toEqual({ code: 'unavailable', message: 'GitHub returned no review data' })
    await expect(read(response(null))).resolves.toEqual({
      code: 'unavailable', message: 'GitHub returned an unexpected review response',
    })
    await expect(read({ data: { repository: {} } })).resolves.toEqual({
      code: 'unavailable', message: 'GitHub returned an unexpected review response',
    })
  })

  it('reports the first usable GraphQL error message', async () => {
    await expect(read({ errors: ['oops', { message: 5 }, { message: '   ' }, { message: ' Real error ' }] }))
      .resolves.toEqual({ code: 'unavailable', message: 'Real error' })
    await expect(read({ errors: [{ message: 5 }] }))
      .resolves.toEqual({ code: 'unavailable', message: 'GitHub returned an unexpected review response' })
  })
})
