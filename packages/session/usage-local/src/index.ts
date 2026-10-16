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
}

/**
 * Answer one usage read from the local session logs.
 * @param query - the session-history query service.
 * @param url - request URL carrying the window.
 * @returns the usage answer, or the refusal a malformed window owes.
 */
async function serveUsage(query: Context['sessionQuery'], url: URL): Promise<Response> {
  const window = readWindow(url)
  if (window === undefined) {
    return Response.json({ error: { code: 'invalid-window' } }, { status: 400, headers: { 'cache-control': 'no-store' } })
  }
  const records: LocalUsageRecord[] = []
  for (const session of await query.listSessions()) {
    const snapshot = await query.readSession(session.header.id)
    records.push(...collectSessionUsage(session.header.id, snapshot.events))
  }
  const answer = usageAnswer('local', records, withinWindow(records, window.from, window.to))
  return Response.json(answer, { headers: { 'cache-control': 'no-store' } })
}
