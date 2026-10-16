/**
 * The local usage ledger's pure half: fold one session's complete raw log into
 * per-Turn records with the token-meter derivation, keep the window a read
 * asked for, and total the whole ledger.
 */

import type { SessionEvent } from '@qilin-agent/session/types'
import { deriveTurnTokenUsage } from '@qilin-agent/token-meter'

/** One Turn as the local ledger records it. */
export interface LocalUsageRecord {
  /** Session the Turn belongs to. */
  readonly sessionId: string
  /** Turn number inside that session. */
  readonly turn: number
  /** Prompt tokens billed as uncached input. */
  readonly inputTokens: number
  /** Completion tokens billed for the Turn. */
  readonly outputTokens: number
  /** Prompt tokens the provider served from its cache, when it reported them. */
  readonly cacheReadTokens?: number
  /** Prompt tokens written to that cache, when it reported them. */
  readonly cacheWriteTokens?: number
  /** Turn-end time in epoch milliseconds. */
  readonly at: number
}

/** Whole-ledger totals the usage page's all-time card reads. */
export interface LocalUsageTotal {
  /** Distinct sessions the ledger's Turns belong to. */
  readonly sessions: number
  readonly turns: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  /** Cache reads over uncached input; zero when no Turn billed input. */
  readonly cacheHitRate: number
}

/** The answer the usage page reads: whole-ledger totals plus the requested window. */
export interface LocalUsageAnswer {
  /** Account the ledger names for display. */
  readonly accountId: string
  readonly total: LocalUsageTotal
  /** Turns inside the requested window, in end-time order. */
  readonly records: readonly LocalUsageRecord[]
  /** The local ledger reads complete logs, so an answer is never truncated. */
  readonly truncated: false
}

/**
 * Fold one session's complete raw log into per-Turn usage records.
 * @param sessionId - session every record belongs to.
 * @param events - the complete replay-validated raw log, from its first event on.
 * @returns one record per Turn whose exact usage the derivation proves; a Turn
 * with an incomplete attempt lifecycle yields no record rather than an estimate.
 */
export function collectSessionUsage(sessionId: string, events: readonly SessionEvent[]): LocalUsageRecord[] {
  const records: LocalUsageRecord[] = []
  let buffered: SessionEvent[] | undefined
  for (const event of events) {
    if (event.type === 'turn/start') {
      buffered = [event]
      continue
    }
    if (buffered === undefined) continue
    buffered.push(event)
    if (event.type !== 'turn/end') continue
    const end = event
    const usage = deriveTurnTokenUsage(buffered)
    buffered = undefined
    if (usage === undefined) continue
    records.push({
      sessionId,
      turn: end.data.turn,
      inputTokens: usage.uncachedInputTokens,
      outputTokens: usage.outputTokens,
      ...usage.cacheReadTokens === undefined ? {} : { cacheReadTokens: usage.cacheReadTokens },
      ...usage.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: usage.cacheWriteTokens },
      at: end.time,
    })
  }
  return records
}

/**
 * Keep the Turns whose end time the requested window covers.
 * @param records - the ledger's records.
 * @param from - inclusive window start in epoch milliseconds.
 * @param to - inclusive window end in epoch milliseconds, or undefined for no end.
 */
export function withinWindow(records: readonly LocalUsageRecord[], from: number, to?: number): readonly LocalUsageRecord[] {
  return records.filter(record => record.at >= from && (to === undefined || record.at <= to))
}

/**
 * Total the whole ledger: every Turn, the distinct sessions they belong to, and
 * the prompt cache hit rate.
 * @param records - the ledger's records.
 */
export function totalOf(records: readonly LocalUsageRecord[]): LocalUsageTotal {
  const sessions = new Set(records.map(record => record.sessionId))
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  for (const record of records) {
    inputTokens += record.inputTokens
    outputTokens += record.outputTokens
    cacheReadTokens += record.cacheReadTokens ?? 0
    cacheWriteTokens += record.cacheWriteTokens ?? 0
  }
  return {
    sessions: sessions.size,
    turns: records.length,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cacheHitRate: inputTokens === 0 ? 0 : cacheReadTokens / inputTokens,
  }
}

/**
 * Assemble the answer the usage page reads.
 * @param accountId - account the ledger names for display.
 * @param all - every Turn this runtime's logs prove.
 * @param windowed - the Turns inside the requested window.
 */
export function usageAnswer(accountId: string, all: readonly LocalUsageRecord[], windowed: readonly LocalUsageRecord[]): LocalUsageAnswer {
  return {
    accountId,
    total: totalOf(all),
    records: [...windowed].sort((left, right) => left.at - right.at),
    truncated: false,
  }
}

/** The epoch-milliseconds window one request asked for. */
export interface UsageWindow {
  readonly from: number
  readonly to?: number
}

/**
 * Read the window from the request's query string. A missing bound means no
 * bound: the answer then covers the whole ledger.
 * @param url - request URL carrying from and optionally to, in epoch milliseconds.
 * @returns the window, or undefined when a bound is present but not a safe
 * non-negative epoch-milliseconds integer, or when to precedes from.
 */
export function readWindow(url: URL): UsageWindow | undefined {
  const rawFrom = url.searchParams.get('from')
  const from = rawFrom === null ? 0 : Number(rawFrom)
  if (!Number.isSafeInteger(from) || from < 0) return undefined
  const rawTo = url.searchParams.get('to')
  if (rawTo === null) return { from }
  const to = Number(rawTo)
  if (!Number.isSafeInteger(to) || to < from) return undefined
  return { from, to }
}
