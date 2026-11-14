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

/**
 * The local calendar day of one report time.
 * @param at - report time in epoch milliseconds.
 * @returns the local day as `YYYY-MM-DD`.
 */
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

/**
 * Short token count a card, a tick, or a table cell shows.
 * @param value - tokens to shorten.
 * @returns the shortened count, without a unit suffix.
 */
export function formatTokens(value: number): string {
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return `${(value / 1_000).toFixed(1)}k`
  return `${(value / 1_000_000).toFixed(1)}M`
}

/** One stacked band, in pixels inside the plot box. */
export interface UsageBand {
  readonly series: UsageSeries
  /** Top edge of the band. */
  readonly y: number
  /** Band height; a zero band is omitted from drawing by its height. */
  readonly height: number
}

/** One day's column, in pixels inside the plot box. */
export interface UsageBar {
  readonly day: string
  /** Left edge of the column, including its hover target. */
  readonly x: number
  /** Column width: the whole day's step, so quiet days still own space. */
  readonly width: number
  /** Left edge of the painted bar. */
  readonly barX: number
  /** Painted bar width. */
  readonly barWidth: number
  /** Top of the stacked bar. */
  readonly top: number
  /** Hit rate of the day, or null when no prompt token was billed. */
  readonly rate: number | null
  readonly bands: readonly UsageBand[]
}

/** One labelled axis tick, in pixels from the plot box top. */
export interface UsageTick {
  readonly y: number
  readonly label: string
}

/** A day's rate point, in pixels inside the plot box. */
export interface UsageRatePoint {
  readonly x: number
  readonly y: number
  readonly rate: number
}

/** Everything one chart render draws. */
export interface UsageChart {
  readonly bars: readonly UsageBar[]
  /** Rate path in pixels; a gap between two runs is a null rate, never a zero. */
  readonly ratePath: string
  readonly ratePoints: readonly UsageRatePoint[]
  /** Largest stacked total, before folding, in tokens. */
  readonly peakTokens: number
  /** Token gridlines, from the baseline upward. */
  readonly ticks: readonly UsageTick[]
  /** Percentage gridlines on the right edge, from the baseline upward. */
  readonly rateTicks: readonly UsageTick[]
  /** Day labels that fit their columns. */
  readonly xLabels: readonly { readonly day: string; readonly x: number }[]
  /** Plot box inside the measured chart, in pixels. */
  readonly plot: {
    readonly left: number
    readonly top: number
    readonly right: number
    readonly bottom: number
    readonly width: number
    readonly height: number
  }
}

/** Widest one bar may render, in pixels: a sparse range never spans the plot. */
const MAX_BAR_WIDTH = 24
/** Narrowest one bar may render, in pixels. */
const MIN_BAR_WIDTH = 3
/** Share of a day's step the painted bar may take. */
const BAR_SHARE = 0.58
/** Horizontal lines across the token axis. */
const TICKS = 4
/** Percentage marks on the right axis. */
const RATE_TICKS = 2
/** Room the axis labels need, in pixels. */
const PADDING = { left: 46, right: 40, top: 8, bottom: 24 } as const
/** Smallest gap between two day labels, in pixels. */
const LABEL_SPACING = 56

/** Round a peak token count up to a value whose quarter steps read cleanly. */
function nicePeak(value: number): number {
  if (!(value > 0)) return 1
  const magnitude = 10 ** Math.floor(Math.log10(value))
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude
    if (value <= candidate) return candidate
  }
  return 10 * magnitude
}

/**
 * Lay one range of days out as slim stacked columns with a hit-rate line.
 *
 * The caller supplies the measured plot size, so every band, label, and line
 * lands on whole pixels instead of a stretched percentage grid.
 * @param days - day buckets, oldest first.
 * @param options - measured width and height, and the series folded away.
 * @returns the columns, the rate line, both axes, and the plot box.
 */
export function usageChart(days: readonly UsageDay[], options: UsageChartOptions): UsageChart {
  const hidden = options.hidden ?? []
  const visible = USAGE_SERIES.filter(series => !hidden.includes(series))
  const plot = {
    left: PADDING.left,
    top: PADDING.top,
    right: options.width - PADDING.right,
    bottom: options.height - PADDING.bottom,
  }
  const plotWidth = Math.max(0, plot.right - plot.left)
  const plotHeight = Math.max(0, plot.bottom - plot.top)
  const peakTokens = nicePeak(Math.max(1, ...days.map(day => visible.reduce((sum, series) => sum + day[series], 0))))
  const step = days.length === 0 ? 0 : plotWidth / days.length
  const barWidth = Math.max(MIN_BAR_WIDTH, Math.min(step * BAR_SHARE, MAX_BAR_WIDTH))
  const bars: UsageBar[] = days.map((day, index) => {
    let offset = 0
    const bands = visible.map((series) => {
      const height = (day[series] / peakTokens) * plotHeight
      const band = { series, y: plot.bottom - offset - height, height }
      offset += height
      return band
    })
    const topBand = bands.at(-1)
    return {
      day: day.day,
      x: index * step,
      width: step,
      barX: index * step + (step - barWidth) / 2,
      barWidth,
      top: topBand === undefined ? plot.bottom : topBand.y,
      rate: day.cacheReadTokens + day.inputTokens === 0
        ? null
        : cacheHitRate(day.cacheReadTokens, day.inputTokens),
      bands,
    }
  })
  const ratePoints = bars.flatMap((bar) => {
    if (bar.rate === null) return []
    const x = bar.x + bar.width / 2
    return [{ x, y: plot.bottom - bar.rate * plotHeight, rate: bar.rate }]
  })
  const segments: string[] = []
  for (const [index, point] of ratePoints.entries()) {
    const previous = ratePoints[index - 1]
    const contiguous = previous !== undefined && Math.abs(previous.x - point.x) <= step * 1.5
    segments.push(`${contiguous ? 'L' : 'M'} ${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
  }
  const ratePath = segments.join(' ')
  const ticks = Array.from({ length: TICKS + 1 }, (_, index) => {
    const share = index / TICKS
    return {
      y: plot.bottom - share * plotHeight,
      label: formatTokens(Math.round(peakTokens * share)),
    }
  })
  const rateTicks = Array.from({ length: RATE_TICKS + 1 }, (_, index) => {
    const share = index / RATE_TICKS
    return { y: plot.bottom - share * plotHeight, label: `${String(Math.round(share * 100))}%` }
  })
  const labelStep = Math.max(1, Math.ceil(LABEL_SPACING / Math.max(step, 1)))
  const xLabels = bars.flatMap((bar, index) => (index % labelStep === 0 || index === bars.length - 1
    ? [{ day: bar.day, x: bar.x + bar.width / 2 }]
    : []))
  return { bars, ratePath, ratePoints, peakTokens, ticks, rateTicks, xLabels, plot: { ...plot, width: plotWidth, height: plotHeight } }
}

/** Geometry inputs one chart render needs. */
export interface UsageChartOptions {
  /** Measured plot width in pixels, axis padding included. */
  readonly width: number
  /** Measured plot height in pixels, axis padding included. */
  readonly height: number
  /** Series folded away by the legend. */
  readonly hidden?: readonly UsageSeries[]
}
