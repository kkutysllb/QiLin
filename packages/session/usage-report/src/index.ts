/**
 * Reports each settled Turn's token usage to the deployment that started this
 * runtime.
 *
 * A deployment that serves one web entry gives every account a runtime of its
 * own and keeps one ledger of what each account spent. This plugin is the
 * runtime's half of that: it folds one Turn's durable attempts into exact usage
 * — the same derivation the transcript shows — and posts it to the endpoint the
 * supervisor named in this process's environment. A runtime started by hand
 * carries no such endpoint and this plugin then does nothing at all.
 * @module @qilin-agent/usage-report
 */

import type {} from '@qilin-agent/client-connection'
import type { Context } from '@qilin-agent/kylin'
import type { SessionEvent } from '@qilin-agent/session'
import { deriveTurnTokenUsage } from '@qilin-agent/token-meter'

/** Environment variable naming the deployment's usage endpoint. */
export const USAGE_URL_VARIABLE = 'QILIN_USAGE_URL'

/** Environment variable carrying the credential that endpoint accepts. */
export const USAGE_TOKEN_VARIABLE = 'QILIN_USAGE_TOKEN'

/** Plugin name the Loader mounts. */
export const name = 'usage-report'

/** This plugin reads no service; it only follows the session event stream. */
export const inject: readonly string[] = []

/** Path the browser reads its own account's usage from. */
export const USAGE_READ_PATH = '/api/usage/me'

/** How long one report may take before it is abandoned. */
const REPORT_TIMEOUT_MS = 5_000

/** The usage of one Turn, as the deployment's ledger records it. */
interface TurnReport {
  readonly sessionId: string
  readonly turn: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
}

/**
 * Report every Turn this process settles to the deployment that started it.
 * @param ctx - plugin context carrying the session event stream.
 */
export function apply(ctx: Context): void {
  const url = process.env[USAGE_URL_VARIABLE]
  const token = process.env[USAGE_TOKEN_VARIABLE]
  if (url === undefined || url === '' || token === undefined || token === '') return

  // The browser's view of its own account, when this runtime serves a web
  // transport. A runtime without one keeps reporting and serves no read.
  const connection = ctx.get('connection')
  if (connection !== undefined) {
    connection.fetch.register({
      path: USAGE_READ_PATH,
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: request => readOwnUsage(new URL(request.url).search, url, token),
    })
  }

  /** Durable events of the Turn each session is inside, from `turn/start` on. */
  const turns = new Map<string, SessionEvent[]>()
  ctx.effect(() => () => { turns.clear() })

  ctx.on('session/event', (session, event) => {
    const sessionId = session.id
    if (event.type === 'turn/start') {
      turns.set(sessionId, [event])
      return
    }
    const buffered = turns.get(sessionId)
    // A Turn whose start this process never saw — replayed history, or a session
    // that began before this plugin mounted — is not one it can account for.
    if (buffered === undefined) return
    buffered.push(event)
    if (event.type !== 'turn/end') return
    turns.delete(sessionId)
    const usage = deriveTurnTokenUsage(buffered)
    // An incomplete attempt lifecycle has no exact usage, and the ledger takes
    // reports rather than estimates, so nothing is sent.
    if (usage === undefined) return
    void report(ctx, url, token, {
      sessionId,
      turn: event.data.turn,
      inputTokens: usage.uncachedInputTokens,
      outputTokens: usage.outputTokens,
      ...usage.cacheReadTokens === undefined ? {} : { cacheReadTokens: usage.cacheReadTokens },
      ...usage.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: usage.cacheWriteTokens },
    })
  })
}

/**
 * Answer the browser with its own account's usage, read from the deployment
 * with the credential this runtime reports under.
 * @param query - query string the browser asked with, such as a report-time window.
 * @param url - endpoint the deployment named.
 * @param token - credential that endpoint accepts.
 * @returns the ledger's answer, or a refusal when the deployment cannot be reached.
 */
async function readOwnUsage(query: string, url: string, token: string): Promise<Response> {
  try {
    const answered = await fetch(`${url}${query}`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
    })
    return new Response(await answered.text(), {
      status: answered.status,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
  } catch (error) {
    // The page shows a refused read as a deployment that cannot be reached
    // rather than as an account with no usage.
    return new Response(JSON.stringify({ error: { code: 'ledger-unavailable', message: error instanceof Error ? error.message : String(error) } }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    })
  }
}

/**
 * Post one Turn's report, without letting the deployment's health reach the
 * session that produced it.
 * @param ctx - plugin context the diagnostic goes to.
 * @param url - endpoint the deployment named.
 * @param token - credential that endpoint accepts.
 * @param report - the Turn's usage.
 */
async function report(ctx: Context, url: string, token: string, report: TurnReport): Promise<void> {
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ ...report, at: Date.now() }),
      signal: AbortSignal.timeout(REPORT_TIMEOUT_MS),
    })
    // A refused report is the deployment's to diagnose; the session carries on.
    if (!response.ok) ctx.logger.warn(`usage-report: the deployment refused one report (HTTP ${String(response.status)})`)
  } catch (error) {
    // A ledger is a report, not an obligation: an unreachable deployment must
    // not delay the Turn or fail it.
    ctx.logger.warn(`usage-report: one report failed: ${error instanceof Error ? error.message : String(error)}`)
  }
}
