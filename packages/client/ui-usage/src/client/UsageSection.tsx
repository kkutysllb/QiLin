/** The usage page: metric cards, a foldable stacked bar chart with a hit-rate area, and a per-session table. */

import { useEffect, useRef, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@qilin-agent/client-ui-slots'
import css from './UsageSection.module.css'
import {
  cacheHitRate, formatTokens, summarize, toggleSeries, usageByDay, usageChart, USAGE_SERIES,
  type UsageRecord, type UsageSeries,
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
  readonly accountId?: string
  readonly total?: UsageTotal
  readonly records?: readonly UsageRecord[]
  readonly truncated?: boolean
}

/** Baseline of the plot in canvas units; the top of the plot is zero. */
const BASELINE = 100

/** Fill of each stacked band, and of the hit-rate area. */
const BAND_FILL: Record<UsageSeries, string> = {
  inputTokens: 'var(--qilin-alias-brand-primary)',
  outputTokens: 'var(--qilin-alias-state-success-secondary)',
  cacheReadTokens: 'var(--qilin-alias-state-business-primary)',
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
  const bars = useRef<(SVGGElement | null)[]>([])

  useEffect(() => {
    const controller = new AbortController()
    const from = monthStart(new Date()).getTime()
    void (async () => {
      try {
        const response = await fetch(`/api/usage/me?from=${String(from)}`, { signal: controller.signal })
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

  if (failed) return <p className={css.state}>{t('unavailable')}</p>
  if (answer === undefined) return <p className={css.state}>{t('loading')}</p>

  const now = new Date()
  const records = answer.records ?? []
  const days = usageByDay(records, monthStart(now), now)
  const chart = usageChart(days, { height: 0, baseline: BASELINE, hidden })
  const todayTime = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const month = summarize(records)
  const today = summarize(records.filter(record => record.at >= todayTime))
  const all = answer.total
  const allTokens = all === undefined
    ? 0
    : all.inputTokens + all.outputTokens + all.cacheReadTokens + all.cacheWriteTokens

  /** Sessions this month, most expensive first. */
  const bySession = new Map<string, UsageRecord[]>()
  for (const record of records) bySession.set(record.sessionId, [...bySession.get(record.sessionId) ?? [], record])
  const sessions = [...bySession.entries()]
    .map(([sessionId, sessionRecords]) => ({ sessionId, ...summarize(sessionRecords) }))
    .sort((left, right) => right.totalTokens - left.totalTokens)

  const label: Record<UsageSeries, string> = {
    inputTokens: t('metric.input'),
    outputTokens: t('metric.output'),
    cacheReadTokens: t('metric.cacheRead'),
  }
  const activeDay = days.find(entry => entry.day === active)

  return (
    <div className={css.page}>
      <header>
        <h2 className={css.title}>{t('title')}</h2>
        <p className={css.subtitle}>{t('subtitle', { account: answer.accountId ?? '—' })}</p>
      </header>

      <div className={css.cards}>
        <Card label={t('today')} value={formatTokens(today.totalTokens)} note={rate(today.cacheHitRate)} />
        <Card label={t('month')} value={formatTokens(month.totalTokens)} note={rate(month.cacheHitRate)} />
        <Card label={t('all')} value={formatTokens(allTokens)} note={rate(all?.cacheHitRate ?? 0)} />
        <Card
          label={t('metric.turns')}
          value={String(all?.turns ?? 0)}
          note={`${t('metric.sessions')} ${String(all?.sessions ?? 0)}`}
        />
      </div>

      <section className={css.chart}>
        <h3 className={css.chartTitle}>{t('chart.title')}</h3>
        <p className={css.caption}>{t('chart.caption')}</p>
        {answer.truncated === true ? <p className={css.cardNote}>{t('truncated')}</p> : null}
        {records.length === 0
          ? <p className={css.state}>{t('chart.empty')}</p>
          : (
            <div className={css.plotRow}>
              <div className={css.tickColumn} aria-hidden="true">
                {chart.ticks.map(tick => (
                  <span key={tick.label + String(tick.y)} className={css.tickLabel} style={{ top: `${String(tick.y)}%` }}>{tick.label}</span>
                ))}
              </div>
              <div className={css.plotArea}>
                <svg className={css.plot} viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={t('chart.title')}>
                  {chart.ticks.map(tick => (
                    <line key={tick.label + String(tick.y)} className={css.grid} x1={0} x2={100} y1={tick.y} y2={tick.y} />
                  ))}
                  {areaHidden ? null : <path className={css.area} d={chart.area} />}
                  {chart.bars.map((bar, index) => (
                    <g
                      key={bar.day}
                      ref={(element) => { bars.current[index] = element }}
                      className={css.bar}
                      tabIndex={0}
                      role="button"
                      aria-label={`${bar.day} ${label.cacheReadTokens}`}
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
                      <rect x={bar.x} y={0} width={bar.width} height={BASELINE} fill="transparent" />
                      {bar.bands.map(band => (
                        <rect
                          key={band.series}
                          className={css.band}
                          x={bar.x}
                          y={band.y}
                          width={bar.width}
                          height={band.height}
                          fill={BAND_FILL[band.series]}
                        />
                      ))}
                    </g>
                  ))}
                </svg>
                {activeDay === undefined ? null : (
                  <div
                    className={css.tooltip}
                    style={{ left: `${((days.findIndex(entry => entry.day === activeDay.day) + 0.5) * (100 / Math.max(1, days.length))).toFixed(2)}%` }}
                  >
                    {activeDay.day} · {label.inputTokens} {formatTokens(activeDay.inputTokens)} · {label.outputTokens} {formatTokens(activeDay.outputTokens)} · {label.cacheReadTokens} {formatTokens(activeDay.cacheReadTokens)} · {t('metric.hitRate')} {rate(cacheHitRate(activeDay.cacheReadTokens, activeDay.inputTokens))}
                  </div>
                )}
              </div>
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
            <span className={css.swatch} style={{ background: 'var(--qilin-alias-brand-primary)' }} />
            {t('metric.hitRate')}
          </button>
        </div>
      </section>

      {sessions.length === 0 ? null : (
        <div className={css.tableWrap}>
          <table className={css.table}>
            <thead>
              <tr>
                <th>{t('table.session')}</th>
                <th>{t('table.input')}</th>
                <th>{t('table.output')}</th>
                <th>{t('table.cacheRead')}</th>
                <th>{t('table.hitRate')}</th>
                <th>{t('table.total')}</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(session => (
                <tr key={session.sessionId}>
                  <td title={session.sessionId}>{session.sessionId.slice(0, 8)}</td>
                  <td>{formatTokens(session.inputTokens)}</td>
                  <td>{formatTokens(session.outputTokens)}</td>
                  <td>{formatTokens(session.cacheReadTokens)}</td>
                  <td>{rate(session.cacheHitRate)}</td>
                  <td>{formatTokens(session.totalTokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
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
