/**
 * The deployment's per-account token ledger.
 *
 * One runtime serves one account and reports each completed Turn of that
 * account's sessions; the hub appends every report to that account's own file.
 * A report is one Turn's increment, identified by its session and turn number,
 * so a repeated report never double counts and a session that spans a month
 * boundary lands in each month it actually spent in. Files are plain JSON lines
 * the operator can read.
 * @module @qilin-agent/cli/usage-ledger
 */

import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/** One account's reported spend for one completed Turn. */
export interface UsageReport {
  /** Session the Turn belongs to. */
  readonly sessionId: string
  /** Turn number inside that session; session plus turn identifies the record. */
  readonly turn: number
  /** Prompt tokens billed as uncached input. */
  readonly inputTokens: number
  /** Completion tokens billed for the Turn. */
  readonly outputTokens: number
  /** Prompt tokens the provider served from its cache, when every attempt reported them. */
  readonly cacheReadTokens?: number
  /** Prompt tokens written to that cache, when every attempt reported them. */
  readonly cacheWriteTokens?: number
  /** When the runtime reported it, in epoch milliseconds. */
  readonly at: number
}

/** A window of report times; an absent bound is unbounded on that side. */
export interface UsageWindow {
  /** Earliest report time to include, inclusive. */
  readonly from?: number | undefined
  /** Latest report time to include, inclusive. */
  readonly to?: number | undefined
}

/** What one account spent across the records inside a window. */
export interface UsageTotal {
  /** Sessions with at least one record in the window. */
  readonly sessions: number
  /** Turns recorded in the window. */
  readonly turns: number
  /** Uncached prompt tokens across those Turns. */
  readonly inputTokens: number
  /** Completion tokens across those Turns. */
  readonly outputTokens: number
  /** Prompt tokens served from the provider cache, summed over the Turns that reported them. */
  readonly cacheReadTokens: number
  /** Prompt tokens written to that cache, likewise. */
  readonly cacheWriteTokens: number
  /** Share of prompt tokens that came from cache, in [0, 1]; 0 when the window never read cache. */
  readonly cacheHitRate: number
  /** The most recent report time in the window. */
  readonly at: number
}

/** Directory of the ledger inside one deployment home. */
export function usageDirectory(home: string): string {
  return join(home, 'tenants', '.usage')
}

/** Absolute path of one account's ledger file. */
export function usageFilePath(home: string, accountId: string): string {
  return join(usageDirectory(home), `${accountId}.jsonl`)
}

/**
 * Append one report to an account's ledger, creating the directory on first use.
 * @param home - deployment home.
 * @param accountId - the account the reporting runtime serves.
 * @param report - the values it reported.
 */
export async function appendUsage(home: string, accountId: string, report: UsageReport): Promise<void> {
  const directory = usageDirectory(home)
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await appendFile(usageFilePath(home, accountId), `${JSON.stringify(report)}\n`, { encoding: 'utf8', mode: 0o600 })
}

/** Whether one report's time falls inside a window. */
function insideWindow(report: UsageReport, window: UsageWindow | undefined): boolean {
  if (window?.from !== undefined && report.at < window.from) return false
  if (window?.to !== undefined && report.at > window.to) return false
  return true
}

/**
 * Read one account's records, latest line per Turn, oldest first.
 *
 * A Turn reported twice keeps the later line and an out-of-order earlier line
 * never replaces it; a line that is not a report is skipped rather than failing
 * the read, because runtimes append to this file while the hub reads it.
 * @param home - deployment home.
 * @param accountId - the account whose ledger to read.
 * @param window - report times to include.
 * @returns the records inside the window, sorted by report time.
 */
export async function readUsageRecords(home: string, accountId: string, window?: UsageWindow): Promise<UsageReport[]> {
  let source: string
  try {
    source = await readFile(usageFilePath(home, accountId), 'utf8')
  } catch (error) {
    // No ledger for this account yet is an ordinary state.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const perTurn = new Map<string, UsageReport>()
  for (const line of source.split('\n')) {
    const report = parseUsageReport(line)
    if (report === undefined || !insideWindow(report, window)) continue
    const key = `${report.sessionId}\n${String(report.turn)}`
    const previous = perTurn.get(key)
    if (previous === undefined || previous.at <= report.at) perTurn.set(key, report)
  }
  return [...perTurn.values()].sort((left, right) => left.at - right.at)
}

/**
 * Total the records of one account's ledger inside a window.
 * @param home - deployment home.
 * @param accountId - the account whose ledger to total.
 * @param window - report times to include.
 * @returns the total, zeroes when nothing was reported in the window.
 */
export async function readUsageTotal(home: string, accountId: string, window?: UsageWindow): Promise<UsageTotal> {
  return totalUsage(await readUsageRecords(home, accountId, window))
}

/**
 * Sum one account's records into a total.
 * @param records - records already deduplicated per Turn.
 * @returns the total they add up to.
 */
export function totalUsage(records: readonly UsageReport[]): UsageTotal {
  const sessions = new Set<string>()
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  let at = 0
  for (const record of records) {
    sessions.add(record.sessionId)
    inputTokens += record.inputTokens
    outputTokens += record.outputTokens
    cacheReadTokens += record.cacheReadTokens ?? 0
    cacheWriteTokens += record.cacheWriteTokens ?? 0
    at = Math.max(at, record.at)
  }
  const prompt = inputTokens + cacheReadTokens
  return {
    sessions: sessions.size,
    turns: records.length,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cacheHitRate: prompt === 0 ? 0 : cacheReadTokens / prompt,
    at,
  }
}

/**
 * Total every account's ledger inside a window.
 * @param home - deployment home.
 * @param window - report times to include.
 * @returns one total per account that reported in the window.
 */
export async function readUsageTotals(home: string, window?: UsageWindow): Promise<Record<string, UsageTotal>> {
  const directory = usageDirectory(home)
  let entries: string[]
  try {
    entries = await readdir(directory)
  } catch (error) {
    // No ledger yet is an ordinary state of a deployment nobody has used.
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw error
  }
  const totals: Record<string, UsageTotal> = {}
  for (const entry of entries) {
    if (!entry.endsWith('.jsonl')) continue
    totals[entry.slice(0, -'.jsonl'.length)] = await readUsageTotal(home, entry.slice(0, -'.jsonl'.length), window)
  }
  return totals
}

/**
 * Sum every account's total into the deployment's own.
 *
 * The session and turn counts add up rather than deduplicating, because one
 * session belongs to one account: two accounts reporting a session each
 * reported two.
 * @param totals - totals keyed by account identity.
 * @returns the summed total, zeroes when no account has reported.
 */
export function sumUsageTotals(totals: Readonly<Record<string, UsageTotal>>): UsageTotal {
  let sessions = 0
  let turns = 0
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  let at = 0
  for (const total of Object.values(totals)) {
    sessions += total.sessions
    turns += total.turns
    inputTokens += total.inputTokens
    outputTokens += total.outputTokens
    cacheReadTokens += total.cacheReadTokens
    cacheWriteTokens += total.cacheWriteTokens
    at = Math.max(at, total.at)
  }
  const prompt = inputTokens + cacheReadTokens
  return {
    sessions,
    turns,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    cacheHitRate: prompt === 0 ? 0 : cacheReadTokens / prompt,
    at,
  }
}

/**
 * Read one ledger line as a report.
 * @param line - one line of an account's ledger.
 * @returns the report, or undefined when the line is empty, torn, or not a report.
 */
export function parseUsageReport(line: string): UsageReport | undefined {
  if (line === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch (error) {
    if (error instanceof SyntaxError) return undefined
    throw error
  }
  return isUsageReport(parsed) ? parsed : undefined
}

/**
 * Whether a parsed value carries the report fields with usable values.
 * @param value - the parsed line.
 * @returns true when it is one report.
 */
export function isUsageReport(value: unknown): value is UsageReport {
  if (typeof value !== 'object' || value === null) return false
  const report = value as Record<string, unknown>
  if (typeof report['sessionId'] !== 'string' || report['sessionId'] === '') return false
  if (!isCount(report['inputTokens']) || !isCount(report['outputTokens'])) return false
  if (!isCount(report['turn'])) return false
  if (report['cacheReadTokens'] !== undefined && !isCount(report['cacheReadTokens'])) return false
  if (report['cacheWriteTokens'] !== undefined && !isCount(report['cacheWriteTokens'])) return false
  return typeof report['at'] === 'number' && Number.isSafeInteger(report['at']) && report['at'] >= 0
}

/** Whether a value is a whole, non-negative count. */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
