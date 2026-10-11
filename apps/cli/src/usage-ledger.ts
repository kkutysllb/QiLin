/**
 * The deployment's per-account token ledger.
 *
 * One runtime serves one account and reports what that account's sessions spent;
 * the hub appends each report to that account's own file. A report is cumulative
 * for its session, so the totals take the latest line per session and a repeated
 * report never double counts. Files are plain JSON lines the operator can read.
 * @module @qilin-agent/cli/usage-ledger
 */

import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

/** One account's reported spend. */
export interface UsageReport {
  /** Session the report belongs to; a later report for it replaces the earlier one. */
  readonly sessionId: string
  /** Prompt tokens this session's requests were billed for. */
  readonly inputTokens: number
  /** Completion tokens this session's requests were billed for. */
  readonly outputTokens: number
  /** When the runtime reported it, in epoch milliseconds. */
  readonly at: number
}

/** What one account spent across every session it reported. */
export interface UsageTotal {
  /** Sessions with at least one report. */
  readonly sessions: number
  /** Prompt tokens across those sessions. */
  readonly inputTokens: number
  /** Completion tokens across those sessions. */
  readonly outputTokens: number
  /** The most recent report time seen for the account. */
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

/**
 * Total every account's ledger.
 *
 * A line that is not a report is skipped rather than failing the read: the
 * ledger is appended to by runtimes the hub cannot re-read, and a torn or
 * foreign line must not hide the accounts that reported correctly.
 * @param home - deployment home.
 * @returns one total per account that reported, keyed by account id.
 */
export async function readUsageTotals(home: string): Promise<Record<string, UsageTotal>> {
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
    const accountId = entry.slice(0, -'.jsonl'.length)
    const perSession = new Map<string, UsageReport>()
    for (const line of (await readFile(join(directory, entry), 'utf8')).split('\n')) {
      const report = parseUsageReport(line)
      if (report === undefined) continue
      const previous = perSession.get(report.sessionId)
      if (previous === undefined || previous.at <= report.at) perSession.set(report.sessionId, report)
    }
    let inputTokens = 0
    let outputTokens = 0
    let at = 0
    for (const report of perSession.values()) {
      inputTokens += report.inputTokens
      outputTokens += report.outputTokens
      at = Math.max(at, report.at)
    }
    totals[accountId] = { sessions: perSession.size, inputTokens, outputTokens, at }
  }
  return totals
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
 * Whether a parsed value carries the five report fields with usable values.
 * @param value - the parsed line.
 * @returns true when it is one report.
 */
export function isUsageReport(value: unknown): value is UsageReport {
  if (typeof value !== 'object' || value === null) return false
  const report = value as Record<string, unknown>
  return typeof report['sessionId'] === 'string' && report['sessionId'] !== ''
    && isCount(report['inputTokens']) && isCount(report['outputTokens'])
    && typeof report['at'] === 'number' && Number.isSafeInteger(report['at']) && report['at'] >= 0
}

/** Whether a value is a whole, non-negative token count. */
function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}
