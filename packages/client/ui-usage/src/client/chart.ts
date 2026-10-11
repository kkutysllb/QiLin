/** Day buckets and stacked-bar geometry for the usage page. */

/** One Turn as the deployment's ledger reports it. */
export interface UsageRecord {
  /** Account the Turn belongs to; present only in a deployment-wide read. */
  readonly accountId?: string
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
  /** Report time in epoch milliseconds. */
  readonly at: number
}

/** Sums a day accumulates while records are bucketed into it. */
interface UsageBuckets {
  day: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}

/** Local midnight of the day one time falls on. */
function midnight(at: Date): Date {
  return new Date(at.getFullYear(), at.getMonth(), at.getDate())
}

/** The local midnight after one midninght, one day later. */
function nextDay(day: Date): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
}

/** One local day's usage, the unit a bar is drawn from. */
export interface UsageDay {
  /** Local calendar day, `YYYY-MM-DD`. */
  readonly day: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
}

/** The series a bar stacks, bottom first. */
export type UsageSeries = 'inputTokens' | 'outputTokens' | 'cacheReadTokens'

/** Every series a bar stacks, in draw order. */
export const USAGE_SERIES: readonly UsageSeries[] = ['inputTokens', 'outputTokens', 'cacheReadTokens']

/** Five metrics one day or one ledger total answers with. */
export interface UsageSummary {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly totalTokens: number
  /** Share of prompt tokens served from cache, between 0 and 1. */
  readonly cacheHitRate: number
}

/** The local calendar day of one report time. */
export function localDay(at: number): string {
  const date = new Date(at)
  return `${String(date.getFullYear())}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

/**
 * Bucket records into local days, oldest first.
 *
 * Every day between the two ends is present, because a chart that closed a gap
 * would draw a quiet week as a busy one.
 * @param records - records the ledger answered with.
 * @param from - first local day to include.
 * @param to - last local day to include.
 * @returns one bucket per day in the range.
 */
export function usageByDay(records: readonly UsageRecord[], from: Date, to: Date): UsageDay[] {
  const buckets = new Map<string, UsageBuckets>()
  for (const day of localDays(from, to)) {
    buckets.set(day, { day, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })
  }
  for (const record of records) {
    const bucket = buckets.get(localDay(record.at))
    if (bucket === undefined) continue
    bucket.inputTokens += record.inputTokens
    bucket.outputTokens += record.outputTokens
    bucket.cacheReadTokens += record.cacheReadTokens ?? 0
    bucket.cacheWriteTokens += record.cacheWriteTokens ?? 0
  }
  return [...buckets.values()]
}

/**
 * Every local day from one end of a range to the other, inclusive.
 * @param from - first day to include.
 * @param to - last day to include.
 * @returns the day names in order.
 */
export function localDays(from: Date, to: Date): string[] {
  const days: string[] = []
  for (let cursor = midnight(from); cursor.getTime() <= to.getTime(); cursor = nextDay(cursor)) {
    days.push(localDay(cursor.getTime()))
  }
  return days
}

/**
 * Share of prompt tokens the provider served from its cache.
 * @param cacheReadTokens - prompt tokens read from the cache.
 * @param inputTokens - prompt tokens billed as uncached.
 * @returns the rate between 0 and 1, and 0 when no prompt token was billed.
 */
export function cacheHitRate(cacheReadTokens: number, inputTokens: number): number {
  const prompt = cacheReadTokens + inputTokens
  return prompt === 0 ? 0 : cacheReadTokens / prompt
}

/**
 * Total the buckets one summary is built from.
 * @param records - records to sum.
 * @returns the four buckets, their total, and the rate they imply.
 */
export function summarize(records: readonly UsageRecord[]): UsageSummary {
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
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheWriteTokens,
    totalTokens: inputTokens + outputTokens + cacheReadTokens + cacheWriteTokens,
    cacheHitRate: cacheHitRate(cacheReadTokens, inputTokens),
  }
}

/** One account's usage inside the records a read carried. */
export interface UsageAccount extends UsageSummary {
  /** Account the records belong to, or the placeholder a tagless record groups under. */
  readonly accountId: string
}

/**
 * Group records by the account they belong to, most expensive first.
 * @param records - records a deployment-wide read carried.
 * @returns one entry per account, with the buckets and rate of its records.
 */
export function usageByAccount(records: readonly UsageRecord[]): UsageAccount[] {
  const byAccount = new Map<string, UsageRecord[]>()
  for (const record of records) {
    const accountId = record.accountId ?? '\u2014'
    byAccount.set(accountId, [...byAccount.get(accountId) ?? [], record])
  }
  return [...byAccount.entries()]
    .map(([accountId, accountRecords]) => ({ accountId, ...summarize(accountRecords) }))
    .sort((left, right) => right.totalTokens - left.totalTokens)
}

/**
 * Fold or unfold one series in a legend.
 * @param hidden - series currently folded away.
 * @param series - series the click named.
 * @returns the next fold state, in `USAGE_SERIES` order.
 */
export function toggleSeries(hidden: readonly UsageSeries[], series: UsageSeries): UsageSeries[] {
  const next = hidden.includes(series) ? hidden.filter(entry => entry !== series) : [...hidden, series]
  return USAGE_SERIES.filter(entry => next.includes(entry))
}

/** Short token count a card, a tick, or a table cell shows. */
export function formatTokens(value: number): string {
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)}k`
  return `${(value / 1_000_000).toFixed(1)}M`
}

/** One stacked bar, in canvas coordinates. */
export interface UsageBar {
  readonly day: string
  readonly x: number
  readonly width: number
  readonly bands: readonly { series: UsageSeries; y: number; height: number }[]
}

/** Everything one chart render draws. */
export interface UsageChart {
  readonly bars: readonly UsageBar[]
  /** SVG path of the hit-rate area behind the bars. */
  readonly area: string
  /** Largest stacked total, before folding, in tokens. */
  readonly peakTokens: number
  /** Horizontal gridlines with their token labels, bottom first. */
  readonly ticks: readonly { y: number; label: string }[]
  /** Baseline every bar stands on, in canvas coordinates. */
  readonly baseline: number
}

/** How many gridlines a chart draws. */
const TICKS = 4

/**
 * Lay one range of days out as stacked bars with a cache-hit-rate area behind
 * them.
 * @param days - day buckets, oldest first.
 * @param options - canvas height, baseline, and the series folded away.
 * @returns the bars, the area path, and the gridlines.
 */
export function usageChart(
  days: readonly UsageDay[],
  options: { height: number; baseline: number; hidden?: readonly UsageSeries[] },
): UsageChart {
  const hidden = options.hidden ?? []
  const visible = USAGE_SERIES.filter(series => !hidden.includes(series))
  const peakTokens = Math.max(1, ...days.map(day => visible.reduce((sum, series) => sum + day[series], 0)))
  const plot = Math.max(1, options.baseline - options.height)
  const step = days.length === 0 ? 0 : 100 / days.length
  const bars: UsageBar[] = days.map((day, index) => {
    let offset = 0
    const bands = visible.map((series) => {
      const height = (day[series] / peakTokens) * plot
      const band = { series, y: options.baseline - offset - height, height }
      offset += height
      return band
    })
    return { day: day.day, x: index * step, width: step * 0.62, bands }
  })
  const points = days.map((day, index) => {
    const x = index * step + step * 0.31
    const y = options.baseline - cacheHitRate(day.cacheReadTokens, day.inputTokens) * plot
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  const area = points.length === 0
    ? ''
    : `M 0 ${String(options.baseline)} L ${points.join(' L ')} L 100 ${String(options.baseline)} Z`
  const ticks = Array.from({ length: TICKS + 1 }, (_, index) => {
    const share = index / TICKS
    return { y: options.baseline - share * plot, label: formatTokens(Math.round(peakTokens * share)) }
  })
  return { bars, area, peakTokens, ticks, baseline: options.baseline }
}
