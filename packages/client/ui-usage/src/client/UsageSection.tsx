/**
 * The usage page: metric cards, a stacked column chart with a hit-rate line,
 * and a per-session table. The chart is measured in pixels so column corners,
 * gridlines, labels, and the rate line keep their proportions at any width.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@qilin-agent/client-ui-slots'
import css from './UsageSection.module.css'
import {
  cacheHitRate, formatTokens, summarize, toggleSeries, usageByAccount, usageByDay, usageChart, USAGE_SERIES,
  type UsageRecord, type UsageSeries, type UsageSummary,
} from './chart.ts'

/** This account's all-time total, as the deployment's read reports it. */
interface UsageTotal {
  readonly sessions: number
  readonly turns: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly cacheHitRate: number
}

/** One answer from the deployment's read. */
interface UsageAnswer {
  /** Present, and equal to `deployment`, when the reader is the deployment administrator. */
  readonly scope?: string
  readonly accountId?: string
  readonly totals?: Record<string, UsageTotal>
  readonly total?: UsageTotal
  readonly records?: readonly UsageRecord[]
  readonly truncated?: boolean
}

/** Rendered height of the plot box, axis labels included. */
const CHART_HEIGHT = 232

/** Fill of each stacked band. Tokens only: the palette follows the theme. */
const BAND_FILL: Record<UsageSeries, string> = {
  inputTokens: 'var(--qilin-alias-state-business-primary)',
  outputTokens: 'var(--qilin-alias-state-success-primary)',
  cacheReadTokens: 'var(--qilin-alias-state-business-tertiary)',
}

/** Share of some prompt traffic served from cache, as a percentage. */
function rate(value: number): string {
  return `${(value * 100).toFixed(value >= 0.1 || value === 0 ? 0 : 1)}%`
}

/** The local first instant of the month one time falls in. */
function monthStart(at: Date): Date {
  return new Date(at.getFullYear(), at.getMonth(), 1)
}

/** Props of the usage page, as its Settings registration supplies them. */
export type UsageSectionComponentProps = PropsRuntime<'settings.section'> & PropsLocale<'usage'>

/**
 * Render what this account spent, by day and by session.
 * @param props - the Settings section seats: runtime data and the page's dictionary.
 */
export function UsageSection({ t }: UsageSectionComponentProps) {
  const [answer, setAnswer] = useState<UsageAnswer | undefined>(undefined)
  const [failed, setFailed] = useState(false)
  const [hidden, setHidden] = useState<readonly UsageSeries[]>([])
  const [areaHidden, setAreaHidden] = useState(false)
  const [active, setActive] = useState<string | undefined>(undefined)
  const [frameWidth, setFrameWidth] = useState(0)
  const frame = useRef<HTMLDivElement | null>(null)
  const bars = useRef<(SVGGElement | null)[]>([])

  useEffect(() => {
    const controller = new AbortController()
    const from = monthStart(new Date()).getTime()
    void (async () => {
      try {
        const response = await fetch(`api/usage/me?from=${String(from)}`, { signal: controller.signal })
        if (!response.ok) throw new Error(`the usage read answered HTTP ${String(response.status)}`)
        setAnswer(await response.json() as UsageAnswer)
      } catch {
        // An aborted read is this component unmounting; anything else is a
        // deployment this page cannot reach, which it says instead of showing zeroes.
        if (!controller.signal.aborted) setFailed(true)
      }
    })()
    return () => { controller.abort() }
  }, [])

  // The plot draws in whole pixels: a percentage view box would stretch column
  // corners and the rate line as the pane resizes. Re-run once the read lands,
  // because the measured frame mounts with the chart rather than at first render.
  useLayoutEffect(() => {
    const element = frame.current
    if (element === null) return
    const measure = (): void => { setFrameWidth(Math.floor(element.clientWidth)) }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => { observer.disconnect() }
  }, [answer, failed])

  if (failed) return <p className={css.state}>{t('unavailable')}</p>
  if (answer === undefined) return <p className={css.state}>{t('loading')}</p>

  const now = new Date()
  const records = answer.records ?? []
  const days = usageByDay(records, monthStart(now), now)
  const chart = usageChart(days, { width: frameWidth, height: CHART_HEIGHT, hidden })
  const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const month = summarize(records)
  const today = summarize(records.filter(record => record.at >= todayTime))
  const all = answer.total
  const allTokens = all === undefined
    ? 0
    : all.inputTokens + all.outputTokens + all.cacheReadTokens + all.cacheWriteTokens

  /** The administrator reads the deployment; everyone else reads their own account. */
  const deployment = answer.scope === 'deployment'

  /** Rows the table breaks the month into: one per account, or one per session. */
  const rows: UsageRow[] = deployment
    ? usageByAccount(records).map(entry => ({ key: entry.accountId, ...entry }))
    : sessionRows(records)
  const accounts = Object.keys(answer.totals ?? {}).length

  const label: Record<UsageSeries, string> = {
    inputTokens: t('metric.input'),
    outputTokens: t('metric.output'),
    cacheReadTokens: t('metric.cacheRead'),
  }
  const activeIndex = active === undefined ? -1 : days.findIndex(entry => entry.day === active)
  const activeDay = activeIndex < 0 ? undefined : days[activeIndex]
  const activeBar = chart.bars[activeIndex]

  return (
    <div className={css.page}>
      <header>
        <h2 className={css.title}>{t('title')}</h2>
        <p className={css.subtitle}>
          {deployment ? t('scope.deployment') : t('subtitle', { account: answer.accountId ?? '—' })}
        </p>
      </header>

      <div className={css.cards}>
        <Card label={t('today')} value={formatTokens(today.totalTokens)} note={rate(today.cacheHitRate)} />
        <Card label={t('month')} value={formatTokens(month.totalTokens)} note={rate(month.cacheHitRate)} />
        <Card label={t('all')} value={formatTokens(allTokens)} note={rate(all?.cacheHitRate ?? 0)} />
        <Card
          label={t('metric.turns')}
          value={String(all?.turns ?? 0)}
          note={deployment
            ? `${t('table.account')} ${String(accounts)}`
            : `${t('metric.sessions')} ${String(all?.sessions ?? 0)}`}
        />
      </div>

      <section className={css.chart}>
        <header className={css.chartHeader}>
          <div>
            <h3 className={css.chartTitle}>{t('chart.title')}</h3>
            <p className={css.caption}>{t('chart.caption')}</p>
          </div>
          {answer.truncated === true ? <span className={css.chartNote}>{t('truncated')}</span> : null}
        </header>
        {records.length === 0
          ? <p className={css.state}>{t('chart.empty')}</p>
          : (
            <div className={css.chartFrame} ref={frame}>
              {frameWidth > 0 ? (
                <svg
                  className={css.plot}
                  width={frameWidth}
                  height={CHART_HEIGHT}
                  viewBox={`0 0 ${String(frameWidth)} ${String(CHART_HEIGHT)}`}
                  role="img"
                  aria-label={t('chart.title')}
                >
                  {chart.ticks.map(tick => (
                    <line
                      key={`grid-${String(tick.y)}`}
                      className={css.grid}
                      x1={chart.plot.left}
                      x2={chart.plot.right}
                      y1={tick.y}
                      y2={tick.y}
                    />
                  ))}
                  {chart.ticks.map(tick => (
                    <text
                      key={`tick-${String(tick.y)}`}
                      className={css.tickText}
                      x={chart.plot.left - 8}
                      y={tick.y}
                      textAnchor="end"
                      dominantBaseline="middle"
                    >
                      {tick.label}
                    </text>
                  ))}
                  {chart.rateTicks.map(tick => (
                    <text
                      key={`rate-${tick.label}`}
                      className={css.rateTickText}
                      x={chart.plot.right + 8}
                      y={tick.y}
                      dominantBaseline="middle"
                    >
                      {tick.label}
                    </text>
                  ))}
                  {areaHidden ? null : (
                    <>
                      <path className={css.rateLine} d={chart.ratePath} />
                      {chart.ratePoints.map(point => (
                        <circle
                          key={`dot-${String(point.x)}`}
                          className={css.rateDot}
                          cx={point.x}
                          cy={point.y}
                          r={2.5}
                        />
                      ))}
                    </>
                  )}
                  {chart.bars.map((bar, index) => (
                    <g
                      key={bar.day}
                      ref={(element) => { bars.current[index] = element }}
                      className={css.column}
                      data-day={bar.day}
                      tabIndex={0}
                      role="button"
                      aria-label={`${bar.day} · ${label.cacheReadTokens} ${formatTokens(days[index]?.cacheReadTokens ?? 0)}`}
                      onMouseEnter={() => { setActive(bar.day) }}
                      onMouseLeave={() => { setActive(undefined) }}
                      onFocus={() => { setActive(bar.day) }}
                      onBlur={() => { setActive(undefined) }}
                      onKeyDown={(event) => {
                        if (event.key === 'ArrowRight') bars.current[Math.min(index + 1, chart.bars.length - 1)]?.focus()
                        if (event.key === 'ArrowLeft') bars.current[Math.max(index - 1, 0)]?.focus()
                        if (event.key === 'Escape') setActive(undefined)
                      }}
                    >
                      <rect
                        className={css.hoverColumn}
                        x={bar.x}
                        y={chart.plot.top}
                        width={bar.width}
                        height={chart.plot.height}
                        rx={4}
                      />
                      {bar.bands.map((band, bandIndex) => {
                        const isTop = bandIndex === bar.bands.length - 1
                        return isTop
                          ? (
                            <path
                              key={band.series}
                              className={css.band}
                              data-series={band.series}
                              fill={BAND_FILL[band.series]}
                              d={barPath(bar.barX, band.y, bar.barWidth, band.height)}
                            />
                          )
                          : (
                            <rect
                              key={band.series}
                              className={css.band}
                              data-series={band.series}
                              fill={BAND_FILL[band.series]}
                              x={bar.barX}
                              y={band.y}
                              width={bar.barWidth}
                              height={Math.max(0, band.height)}
                            />
                          )
                      })}
                    </g>
                  ))}
                  {chart.xLabels.map(({ day, x }) => (
                    <text
                      key={`label-${day}`}
                      className={css.tickText}
                      x={x}
                      y={CHART_HEIGHT - 6}
                      textAnchor="middle"
                    >
                      {day.slice(5)}
                    </text>
                  ))}
                </svg>
              ) : null}
              {activeDay === undefined || activeBar === undefined ? null : (
                <div
                  role="tooltip"
                  className={css.tooltip}
                  style={{
                    left: `${String(Math.min(Math.max(activeBar.x + activeBar.width / 2, 96), Math.max(96, frameWidth - 96)))}px`,
                    top: `${String(Math.max(8, activeBar.top - 10))}px`,
                  }}
                >
                  <div className={css.tooltipDay}>{activeDay.day}</div>
                  <div className={css.tooltipRow}>
                    <span className={css.tooltipDot} style={{ background: BAND_FILL.inputTokens }} />
                    {label.inputTokens}
                    <span className={css.tooltipValue}>{formatTokens(activeDay.inputTokens)}</span>
                  </div>
                  <div className={css.tooltipRow}>
                    <span className={css.tooltipDot} style={{ background: BAND_FILL.outputTokens }} />
                    {label.outputTokens}
                    <span className={css.tooltipValue}>{formatTokens(activeDay.outputTokens)}</span>
                  </div>
                  <div className={css.tooltipRow}>
                    <span className={css.tooltipDot} style={{ background: BAND_FILL.cacheReadTokens }} />
                    {label.cacheReadTokens}
                    <span className={css.tooltipValue}>{formatTokens(activeDay.cacheReadTokens)}</span>
                  </div>
                  <div className={css.tooltipRow}>
                    <span className={css.tooltipDot} style={{ background: 'var(--qilin-alias-state-business-primary)' }} />
                    {t('metric.hitRate')}
                    <span className={css.tooltipValue}>
                      {activeDay.inputTokens + activeDay.cacheReadTokens === 0
                        ? '—'
                        : rate(cacheHitRate(activeDay.cacheReadTokens, activeDay.inputTokens))}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        <div className={css.legend}>
          {USAGE_SERIES.map(series => (
            <button
              key={series}
              type="button"
              className={css.legendButton}
              aria-pressed={!hidden.includes(series)}
              title={hidden.includes(series) ? t('chart.unfold', { series: label[series] }) : t('chart.fold', { series: label[series] })}
              onClick={() => { setHidden(toggleSeries(hidden, series)) }}
            >
              <span className={css.swatch} style={{ background: BAND_FILL[series] }} />
              {label[series]}
            </button>
          ))}
          <button
            type="button"
            className={css.legendButton}
            aria-pressed={!areaHidden}
            onClick={() => { setAreaHidden(!areaHidden) }}
          >
            <span className={`${css.swatch} ${css.rateSwatch}`} />
            {t('metric.hitRate')}
          </button>
        </div>
      </section>

      {rows.length === 0 ? null : (
        <div className={css.tableWrap}>
          <table className={css.table}>
            <thead>
              <tr>
                <th>{deployment ? t('table.account') : t('table.session')}</th>
                <th>{t('table.input')}</th>
                <th>{t('table.output')}</th>
                <th>{t('table.cacheRead')}</th>
                <th>{t('table.hitRate')}</th>
                <th>{t('table.total')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.key}>
                  <td title={row.key}>{row.key.slice(0, 8)}</td>
                  <td>{formatTokens(row.inputTokens)}</td>
                  <td>{formatTokens(row.outputTokens)}</td>
                  <td>{formatTokens(row.cacheReadTokens)}</td>
                  <td>{rate(row.cacheHitRate)}</td>
                  <td>{formatTokens(row.totalTokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

/** The rounded-top column a stacked bar paints. */
function barPath(x: number, top: number, width: number, height: number): string {
  if (height <= 0) return ''
  const radius = Math.max(0, Math.min(3, width / 2, height))
  const bottom = top + height
  const right = x + width
  return [
    `M ${x.toFixed(2)} ${bottom.toFixed(2)}`,
    `L ${x.toFixed(2)} ${(top + radius).toFixed(2)}`,
    `Q ${x.toFixed(2)} ${top.toFixed(2)} ${(x + radius).toFixed(2)} ${top.toFixed(2)}`,
    `L ${(right - radius).toFixed(2)} ${top.toFixed(2)}`,
    `Q ${right.toFixed(2)} ${top.toFixed(2)} ${right.toFixed(2)} ${(top + radius).toFixed(2)}`,
    `L ${right.toFixed(2)} ${bottom.toFixed(2)}`,
    'Z',
  ].join(' ')
}

/** One row of the per-session table: a key to name it and the buckets it spent. */
interface UsageRow extends UsageSummary {
  readonly key: string
}

/** One session's usage this month, most expensive first. */
function sessionRows(records: readonly UsageRecord[]): UsageRow[] {
  const bySession = new Map<string, UsageRecord[]>()
  for (const record of records) bySession.set(record.sessionId, [...bySession.get(record.sessionId) ?? [], record])
  return [...bySession.entries()]
    .map(([key, sessionRecords]) => ({ key, ...summarize(sessionRecords) }))
    .sort((left, right) => right.totalTokens - left.totalTokens)
}

/** One metric card. */
function Card({ label, value, note }: { readonly label: string; readonly value: string; readonly note: string }) {
  return (
    <div className={css.card}>
      <div className={css.cardLabel}>{label}</div>
      <div className={css.cardValue}>{value}</div>
      <div className={css.cardNote}>{note}</div>
    </div>
  )
}
