/**
 * Serves the usage page's read from this runtime's own session logs.
 *
 * A deployment that keeps a ledger of its own reports usage through the
 * external ledger and does not mount this row. A single-user surface — the
 * desktop, a hand-started web runtime — has no ledger, so this plugin derives
 * the same answer from the session logs the runtime owns: every Turn the
 * token-meter derivation can prove, totalled over the whole ledger and listed
 * for the requested window.
 * @module @qilin-agent/usage-local
 */
// KStock patch (K30): 大会话库并发读取 + 单日志失败跳过 + 60s 缓存与启动预热。

import type { Context } from '@qilin-agent/kylin'
import type {} from '@qilin-agent/client-connection'
import type {} from '@qilin-agent/session-query'
import { collectSessionUsage, readWindow, usageAnswer, withinWindow, type LocalUsageRecord } from './usage.ts'

/** Plugin name the Loader mounts. */
export const name = 'usage-local'

/** Services this plugin reads: the session-history query and the API route registry. */
export const inject: readonly string[] = ['sessionQuery', 'connection']

/**
 * Register the local usage read on the shared API channel.
 * @param ctx - plugin context carrying the query service and the route registry.
 */
export function apply(ctx: Context): void {
  const query = ctx.sessionQuery
  ctx.effect(() => ctx.connection.fetch.register({
    path: '/api/usage/me',
    methods: ['GET'],
    requestBody: 'buffered',
    fetch: request => serveUsage(query, new URL(request.url)),
  }), 'usage-local: /api/usage/me')
  // Fold this month's ledger before the page asks. A home with hundreds of legacy
  // sessions takes ~20s to read; the page must not make the user wait for that.
  ctx.effect(() => {
    const timer = setTimeout(() => {
      const now = new Date()
      void loadUsage(query, { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime() })
        .catch((error: unknown) => {
          console.warn(`usage-local: usage warm failed: ${error instanceof Error ? error.message : String(error)}`)
        })
    }, 3_000)
    return () => { clearTimeout(timer) }
  }, 'usage-local: warm this month')
}

/** Sessions read concurrently; each read parses a whole log, so this bounds the page's latency. */
const READ_CONCURRENCY = 8
/** How long one folded answer serves repeated reads of the same window. */
const ANSWER_TTL_MS = 60_000

/** One folded answer, keyed by the window it covers. */
interface CachedAnswer {
  readonly from: number
  readonly to: number | undefined
  readonly answer: ReturnType<typeof usageAnswer>
  readonly at: number
}

let cachedAnswer: CachedAnswer | undefined
let loadingAnswer: { readonly key: string; readonly promise: Promise<ReturnType<typeof usageAnswer>> } | undefined

/**
 * Drop the memoized answer.
 *
 * A Host keeps one cache for its own lifetime and the TTL bounds staleness; tests boot
 * several Hosts in one module, so they reset it between compositions.
 */
export function resetUsageAnswerCache(): void {
  cachedAnswer = undefined
  loadingAnswer = undefined
}

/**
 * Fold one window, reusing a recent answer or an in-flight fold.
 * @param query - the session-history query service.
 * @param window - requested window.
 * @returns The usage answer.
 */
async function loadUsage(
  query: Context['sessionQuery'],
  window: { readonly from: number; readonly to?: number | undefined },
): Promise<ReturnType<typeof usageAnswer>> {
  const key = `${String(window.from)}:${String(window.to ?? '')}`
  if (cachedAnswer !== undefined && cachedAnswer.from === window.from && cachedAnswer.to === window.to
    && Date.now() - cachedAnswer.at < ANSWER_TTL_MS) {
    return cachedAnswer.answer
  }
  if (loadingAnswer !== undefined && loadingAnswer.key === key) return loadingAnswer.promise
  const promise = (async () => {
    const records = await collectUsage(query, await listSessionsSafely(query))
    const answer = usageAnswer('local', records, withinWindow(records, window.from, window.to))
    cachedAnswer = { from: window.from, to: window.to, answer, at: Date.now() }
    return answer
  })().finally(() => { loadingAnswer = undefined })
  loadingAnswer = { key, promise }
  return promise
}

/**
 * Answer one usage read from the local session logs.
 *
 * A home with hundreds of sessions makes a serial read take tens of seconds, and one
 * unreadable log (an interrupted migration, a truncated append) would otherwise fail
 * the whole page. Reads run concurrently and a failed session is skipped with a warning:
 * the page shows the usage it can prove instead of hanging or reporting an unavailable
 * deployment.
 *
 * @param query - the session-history query service.
 * @param url - request URL carrying the window.
 * @returns the usage answer, or the refusal a malformed window owes.
 */
async function serveUsage(query: Context['sessionQuery'], url: URL): Promise<Response> {
  const window = readWindow(url)
  if (window === undefined) {
    return Response.json({ error: { code: 'invalid-window' } }, { status: 400, headers: { 'cache-control': 'no-store' } })
  }
  const answer = await loadUsage(query, window)
  return Response.json(answer, { headers: { 'cache-control': 'no-store' } })
}

/**
 * Walk the session corpus, degrading to an empty ledger instead of failing the page.
 * @param query - the session-history query service.
 * @returns The listed sessions, or none when the corpus walk itself fails.
 */
async function listSessionsSafely(
  query: Context['sessionQuery'],
): Promise<Awaited<ReturnType<Context['sessionQuery']['listSessions']>>> {
  try {
    return await query.listSessions()
  } catch (error) {
    console.warn(`usage-local: session listing failed, reporting no usage: ${error instanceof Error ? error.message : String(error)}`)
    return []
  }
}

/**
 * Read every listed session's usage with bounded concurrency, skipping unreadable logs.
 * @param query - the session-history query service.
 * @param sessions - the corpus walk's session records.
 * @returns Usage records in completion order.
 */
async function collectUsage(
  query: Context['sessionQuery'],
  sessions: Awaited<ReturnType<Context['sessionQuery']['listSessions']>>,
): Promise<LocalUsageRecord[]> {
  const records: LocalUsageRecord[] = []
  let next = 0
  const workers = Array.from({ length: Math.min(READ_CONCURRENCY, sessions.length) }, async () => {
    while (next < sessions.length) {
      const session = sessions[next]
      next += 1
      if (session === undefined) continue
      try {
        const snapshot = await query.readSession(session.header.id)
        records.push(...collectSessionUsage(session.header.id, snapshot.events))
      } catch (error) {
        console.warn(`usage-local: skipped unreadable session ${session.header.id}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
  })
  await Promise.all(workers)
  return records
}
