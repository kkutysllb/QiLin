/** GitHub review reads: the threads a pull request's diff holds, with their authors and bodies. */

import { z } from 'zod'
import type { ChangeRequestRef, ForgeFailure, ForgeReviewThread } from '@qilin-agent/experimental-forge'
import { hasGraphqlFields } from './graphql.ts'
import { checkedRepository } from './urls.ts'

/** One read of the first page of review threads; the provider contract keeps the panel to what it shows. */
export const REVIEW_THREADS_QUERY = `query ReviewThreads($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      reviewThreads(first: 100) {
        nodes {
          id
          isResolved
          isOutdated
          path
          line
          startLine
          diffSide
          comments(first: 50) { nodes { author { login } body } }
        }
      }
    }
  }
}`

const commentSchema = z.object({
  author: z.object({ login: z.string() }).nullable(),
  body: z.string(),
})
const threadSchema = z.object({
  id: z.string(),
  isResolved: z.boolean(),
  isOutdated: z.boolean(),
  path: z.string().nullable(),
  line: z.number().int().nullable(),
  startLine: z.number().int().nullable(),
  diffSide: z.string().nullable(),
  comments: z.object({ nodes: z.array(commentSchema) }),
})
const responseSchema = z.object({
  data: z.object({
    repository: z.object({
      pullRequest: z.object({
        reviewThreads: z.object({ nodes: z.array(threadSchema) }),
      }),
    }),
  }),
})

/** The first GraphQL error message, when the response carries one. */
function firstError(errors: unknown): string | undefined {
  if (!Array.isArray(errors)) return undefined
  for (const error of errors as unknown[]) {
    if (typeof error !== 'object' || error === null || !('message' in error)) continue
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim().length > 0) return message.trim()
  }
  return undefined
}

/**
 * One thread as the contract states it, or undefined for a thread the panel cannot anchor.
 * A thread without a file path or with no comment text has nothing to draw.
 */
function threadOf(node: z.infer<typeof threadSchema>): ForgeReviewThread | undefined {
  if (node.path === null) return undefined
  let author: string | null = null
  const texts: string[] = []
  for (const comment of node.comments.nodes) {
    const text = comment.body.trim()
    if (text.length === 0) continue
    if (texts.length === 0) author = comment.author?.login ?? null
    texts.push(text)
  }
  if (texts.length === 0) return undefined
  const first = node.line ?? node.startLine ?? 1
  const last = node.startLine ?? node.line ?? 1
  return {
    id: node.id,
    path: node.path,
    side: node.diffSide === 'LEFT' ? 'L' : 'R',
    startLine: Math.min(first, last),
    endLine: Math.max(first, last),
    author,
    body: texts.join('\n\n'),
    resolved: node.isResolved,
    outdated: node.isOutdated,
  }
}

/**
 * Read the review threads of one change request through one GraphQL query.
 * @param ref - validated pull request address.
 * @param signal - cancellation of the read.
 * @param read - one `gh` read with the provider's failure mapping.
 * @returns the threads in host order, or why the read failed.
 */
export async function readGitHubReviewThreads(
  ref: ChangeRequestRef,
  signal: AbortSignal,
  read: (args: readonly string[], signal: AbortSignal) => Promise<string | ForgeFailure>,
): Promise<readonly ForgeReviewThread[] | ForgeFailure> {
  const { host, owner, name } = checkedRepository(ref)
  const body = await read([
    'api', 'graphql', '--hostname', host,
    '-f', `query=${REVIEW_THREADS_QUERY}`, '-f', `owner=${owner}`, '-f', `name=${name}`, '-F', `number=${ref.number}`,
  ], signal)
  if (typeof body !== 'string') return body
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch (error) {
    void error // gh prints diagnostics instead of JSON when the request fails before GitHub answers.
    return { code: 'unavailable', message: 'GitHub returned no JSON for the review read' }
  }
  if (!hasGraphqlFields(parsed)) return { code: 'unavailable', message: 'GitHub returned no review data' }
  const result = responseSchema.safeParse(parsed)
  if (!result.success) {
    const errors = typeof parsed === 'object' && parsed !== null && 'errors' in parsed
      ? (parsed as { errors?: unknown }).errors : undefined
    return { code: 'unavailable', message: firstError(errors) ?? 'GitHub returned an unexpected review response' }
  }
  const nodes = result.data.data.repository.pullRequest.reviewThreads.nodes
  return nodes.flatMap((node) => {
    const thread = threadOf(node)
    return thread === undefined ? [] : [thread]
  })
}
