/**
 * The tasks page: this Session's subagent topology and its background jobs.
 *
 * Two sections, both open on arrival. Everything drawn comes from the Session
 * list snapshot through `useSessions` — the page issues no read of its own —
 * and every action travels through the injected face. Section and fold state is
 * this component's own; it never leaves the body.
 */
import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import type { SessionJob } from '@qilin/api-session-controller/types'
import {
  IconChevronDownOutline14, IconChevronRightOutline14, IconRefreshOutline14, IconRefreshOutline16,
  StateDot,
} from '@qilin/client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, TranslateNS } from '@qilin/client-ui-slots'
import type {} from '@qilin/client-ui-session/client'
import type { TasksInjected } from './face.ts'
import { NS } from './locales.ts'
import { indexSubagentDescendants } from './lineage.ts'
import {
  NO_JOBS, childRowCount, formatDuration, isLive, jobDotState, jobElapsed, jobStatusLabel,
  orderedJobs, subagentRows, subagentTotal,
} from './rows.ts'
import type { SubagentRow } from './rows.ts'
import css from './TasksBody.module.css'

/** The body's composed props: the tab it draws, its face, and its copy. */
export type TasksBodyProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & InjectFace<TasksInjected>
  & PropsLocale<typeof NS>

/** How many subagent rows an unfolded section shows before folding the rest. */
export const SUBAGENT_PREVIEW = 5

/** How many job rows an unfolded section shows before folding the rest. */
export const TASK_PREVIEW = 3

/** The pixel indent one nesting level adds. */
const INDENT_PX = 14

/** The clock interval a running job's duration needs. */
const TICK_MS = 1_000

/** Which sections are open. Both start open. */
interface Sections {
  readonly subagents: boolean
  readonly tasks: boolean
}

/**
 * One collapsible section header: its chevron, its title, its stated count, and
 * the section's own control in the header's trailing slot.
 */
function SectionHeader({ section, title, count, expanded, onToggle, action }: {
  readonly section: 'subagents' | 'tasks'
  readonly title: string
  readonly count: string
  readonly expanded: boolean
  readonly onToggle: () => void
  readonly action?: ReactNode
}): ReactNode {
  return (
    <div className={css.sectionHeader} data-tasks-section={section}>
      <button type="button" className={css.sectionToggle} aria-expanded={expanded} onClick={onToggle}>
        {expanded
          ? <IconChevronDownOutline14 className={css.chevron} />
          : <IconChevronRightOutline14 className={css.chevron} />}
        <span className={css.sectionTitle}>{title}</span>
        <span className={css.sectionCount}>{count}</span>
      </button>
      {action}
    </div>
  )
}

/**
 * Why one child carries no readable record.
 * @param reason - the catalog's diagnostic reason.
 * @param t - namespace-bound translate.
 * @returns the line the row shows.
 */
function diagnosticLabel(
  reason: 'corrupt' | 'unsupported' | 'unavailable',
  t: TranslateNS<typeof NS>,
): string {
  switch (reason) {
    case 'corrupt': return t('subagents.diagnostic.corrupt')
    case 'unsupported': return t('subagents.diagnostic.unsupported')
    case 'unavailable': return t('subagents.diagnostic.unavailable')
  }
}

/** One subagent row: the open gesture across the row, the interrupt beside it. */
function SubagentRowView({ row, t, onOpen, onInterrupt }: {
  readonly row: SubagentRow
  readonly t: TranslateNS<typeof NS>
  readonly onOpen: TasksInjected['openChild']
  readonly onInterrupt: TasksInjected['interruptChild']
}): ReactNode {
  if (row.kind === 'diagnostic') {
    return (
      <li className={clsx(css.row, css.disabled)} data-tasks-subagent={row.id} data-tasks-depth={row.depth}>
        <StateDot state="error" className={css.dot} />
        <span className={css.label}>{row.id}</span>
        <span className={css.secondary}>{diagnosticLabel(row.reason, t)}</span>
      </li>
    )
  }
  return (
    <li
      className={css.row}
      data-tasks-subagent={row.id}
      data-tasks-depth={row.depth}
      style={{ paddingInlineStart: row.depth * INDENT_PX }}
    >
      <button type="button" className={css.open} onClick={() => { onOpen(row.address) }}>
        <StateDot state={row.running ? 'ongoing' : 'done'} className={css.dot} />
        <span className={css.label}>{row.label}</span>
        <span className={css.secondary}>
          {t(row.address.mode === 'one-shot' ? 'subagents.mode.oneShot' : 'subagents.mode.continuable')}
        </span>
      </button>
      {row.running && row.address.mode === 'continuable' && (
        <button
          type="button"
          className={css.action}
          onClick={() => { onInterrupt(row.address.childSessionId, row.address.parentSessionId) }}
        >
          {t('subagents.interrupt')}
        </button>
      )}
    </li>
  )
}

/** One job row: status marker, kind, label, the producer's detail, and elapsed time. */
function TaskRowView({ job, now, t }: {
  readonly job: SessionJob
  readonly now: number
  readonly t: TranslateNS<typeof NS>
}): ReactNode {
  const live = isLive(job)
  const duration = formatDuration(jobElapsed(job, now), t)
  const status = job.detail ?? jobStatusLabel(job.status, t)
  return (
    <li
      className={clsx(css.row, !live && css.settled)}
      data-tasks-job={job.id}
      data-tasks-status={job.status}
    >
      <StateDot state={jobDotState(job.status)} className={css.dot} />
      <span className={css.kind}>{job.kind}</span>
      <span className={css.label} title={job.label}>{job.label}</span>
      <span className={css.secondary} title={status}>{status}</span>
      <span
        className={css.duration}
        title={t(live ? 'tasks.duration.live' : 'tasks.duration.done', { duration })}
      >
        {duration}
      </span>
    </li>
  )
}

/**
 * The page body.
 * @param props - the tab's runtime share, the injected face, and the copy.
 * @returns the two sections, or the single line a Session with no work shows.
 */
export function TasksBody({
  sessionId, useSessions, openChild, refresh, interruptChild, t,
}: TasksBodyProps): ReactNode {
  const summaries = useSessions(state => state.byId)
  const catalogs = useSessions(state => state.subagentsByParent)
  const jobs = useSessions(state => state.jobsBySession[sessionId]) ?? NO_JOBS
  const catalog = catalogs[sessionId]
  const [sections, setSections] = useState<Sections>({ subagents: true, tasks: true })
  const [allSubagents, setAllSubagents] = useState(false)
  const [allTasks, setAllTasks] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  const rows = useMemo(() => subagentRows(catalogs, sessionId), [catalogs, sessionId])
  const total = useMemo(
    () => subagentTotal(childRowCount(rows), indexSubagentDescendants(summaries), sessionId),
    [rows, summaries, sessionId],
  )
  const tasks = useMemo(() => orderedJobs(jobs), [jobs])
  const liveTasks = useMemo(() => jobs.filter(isLive).length, [jobs])

  // The clock runs only while a row still measures; a settled list is fixed.
  useEffect(() => {
    if (liveTasks === 0) return
    setNow(Date.now())
    const timer = setInterval(() => { setNow(Date.now()) }, TICK_MS)
    return () => { clearInterval(timer) }
  }, [liveTasks])

  if (rows.length === 0 && tasks.length === 0 && catalog?.state === 'ready') {
    return (
      <div className={css.root} data-tasks-state="empty">
        <p className={css.note}>{t('empty')}</p>
      </div>
    )
  }

  const shownSubagents = allSubagents ? rows : rows.slice(0, SUBAGENT_PREVIEW)
  const shownTasks = allTasks ? tasks : tasks.slice(0, TASK_PREVIEW)
  const hiddenSubagents = rows.length - shownSubagents.length
  const hiddenTasks = tasks.length - shownTasks.length

  return (
    <div className={css.root} data-tasks-state="ready">
      <SectionHeader
        section="subagents"
        title={t('subagents.title')}
        count={t(total === 1 ? 'subagents.count.one' : 'subagents.count.other', { count: total })}
        expanded={sections.subagents}
        onToggle={() => { setSections(current => ({ ...current, subagents: !current.subagents })) }}
        action={(
          <button
            type="button"
            className={css.sectionAction}
            aria-label={t('subagents.refresh')}
            title={t('subagents.refresh')}
            data-tasks-refresh
            onClick={() => { refresh(sessionId) }}
          >
            <IconRefreshOutline16 className={css.refreshIcon} />
          </button>
        )}
      />
      {sections.subagents && (
        <div className={css.sectionBody} data-tasks-panel="subagents">
          {catalog?.state === 'error'
            ? (
              <div className={css.failure}>
                <span className={css.failureText}>{catalog?.error?.message ?? t('subagents.failed')}</span>
                <button type="button" className={css.retry} onClick={() => { refresh(sessionId) }}>
                  <IconRefreshOutline14 className={css.retryIcon} />
                  {t('subagents.retry')}
                </button>
              </div>
            )
            : rows.length === 0
              ? (
                <p className={css.note}>
                  {catalog === undefined || catalog.state === 'loading'
                    ? t('subagents.loading')
                    : t('subagents.empty')}
                </p>
              )
              : (
                <>
                  <ul className={css.list}>
                    {shownSubagents.map(row => (
                      <SubagentRowView
                        key={row.id}
                        row={row}
                        t={t}
                        onOpen={openChild}
                        onInterrupt={interruptChild}
                      />
                    ))}
                  </ul>
                  {rows.length > SUBAGENT_PREVIEW && (
                    <button
                      type="button"
                      className={css.more}
                      aria-expanded={allSubagents}
                      data-tasks-more="subagents"
                      onClick={() => { setAllSubagents(current => !current) }}
                    >
                      {allSubagents
                        ? t('more.collapse')
                        : t('more.expand', { count: hiddenSubagents })}
                    </button>
                  )}
                </>
              )}
        </div>
      )}
      <SectionHeader
        section="tasks"
        title={t('tasks.title')}
        count={t(tasks.length === 1 ? 'tasks.count.one' : 'tasks.count.other', { count: tasks.length })}
        expanded={sections.tasks}
        onToggle={() => { setSections(current => ({ ...current, tasks: !current.tasks })) }}
      />
      {sections.tasks && (
        <div className={css.sectionBody} data-tasks-panel="tasks">
          {tasks.length === 0
            ? <p className={css.note}>{t('tasks.empty')}</p>
            : (
              <>
                <ul className={css.list}>
                  {shownTasks.map(job => <TaskRowView key={job.id} job={job} now={now} t={t} />)}
                </ul>
                {tasks.length > TASK_PREVIEW && (
                  <button
                    type="button"
                    className={css.more}
                    aria-expanded={allTasks}
                    data-tasks-more="tasks"
                    onClick={() => { setAllTasks(current => !current) }}
                  >
                    {allTasks ? t('more.collapse') : t('more.expand', { count: hiddenTasks })}
                  </button>
                )}
              </>
            )}
        </div>
      )}
    </div>
  )
}
