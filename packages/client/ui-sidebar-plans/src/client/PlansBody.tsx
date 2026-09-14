/**
 * The plan panel's body: the session workspace's plan documents, as rows.
 *
 * Everything the panel keeps lives in its store, keyed by tab; everything it
 * asks for goes through its injected face. The component decides when to scan
 * — on mount, on the reload gesture, and on a poll that runs only while the
 * tab is visible — what the search box filters, and what a click means: open
 * the document through the owner's `tabActions` for a `file` viewer to claim.
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { IconRefreshOutline16, IconSearchOutline16, Input } from '@qilin/client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore, TranslateNS } from '@qilin/client-ui-slots'
import { fileAddressFor } from '@qilin/util-workspace-path'
import type { PlansInjected } from './face.ts'
import type {} from './locales.ts'
import { filterPlans } from './plans.ts'
import type { PlansTabState, createPlansStore } from './store.ts'
import css from './PlansBody.module.css'

/**
 * How often a visible panel scans again.
 *
 * The scan is a handful of directory listings and short reads, and this
 * interval is what makes a plan document the agent just wrote appear without a
 * gesture. A hidden tab polls nothing.
 */
export const PLAN_POLL_MS = 5_000

/** The body's composed props: the tab it draws, its store, its face, and its copy. */
export type PlansBodyProps =
  & PropsRuntime<'sidebar.right.pane.tab'>
  & PropsStore<ReturnType<typeof createPlansStore>>
  & InjectFace<PlansInjected>
  & PropsLocale<'sidebarPlans'>

/** The one status line the panel shows in place of rows. */
export interface PlansNotice {
  /** Which state the panel is in; the value a spec reads off the DOM. */
  readonly kind: 'loading' | 'empty' | 'noMatch' | 'failed'
  /** The line to show. */
  readonly line: string
}

/**
 * The panel's single status line, or `undefined` while it lists rows.
 *
 * A scan that could not be trusted takes the panel over: reporting no plans
 * because the wire is down would be a lie about the workspace.
 * @param t - namespace-bound translate.
 * @param state - the tab's bucket.
 * @param matches - how many rows the search kept.
 * @returns the notice to draw, or `undefined` while rows are listed.
 */
export function plansNotice(
  t: TranslateNS<'sidebarPlans'>,
  state: PlansTabState,
  matches: number,
): PlansNotice | undefined {
  if (state.failure !== undefined) {
    return { kind: 'failed', line: t('error.failed', { message: state.failure.message }) }
  }
  if (state.rows.length === 0) {
    return state.scanning ? { kind: 'loading', line: t('loading') } : { kind: 'empty', line: t('empty') }
  }
  return matches === 0 ? { kind: 'noMatch', line: t('noMatch') } : undefined
}

/** The panel: the search row, then the plan documents of the session's workspace. */
export function PlansBody({ useTabInfo, sessionId, useSessions, useStore, refresh, t }: PlansBodyProps): ReactNode {
  const { tab } = useTabInfo()
  const { signal, visible, actions: tabActions } = tab
  const cwd = useSessions(sessions => sessions.byId[sessionId]?.cwd)
  const state = useStore(store => store.byTab[tab.id])
  const [query, setQuery] = useState('')
  useEffect(() => {
    if (cwd === undefined || signal.aborted) return undefined
    refresh(tab.id, cwd, signal)
    // A hidden tab draws what it already scanned and asks for nothing more.
    if (!visible) return undefined
    const timer = setInterval(() => { refresh(tab.id, cwd, signal) }, PLAN_POLL_MS)
    return () => { clearInterval(timer) }
  }, [cwd, visible, tab.id, signal, refresh])

  if (cwd === undefined) {
    return (
      <div className={css.status} data-plans-state="no-workspace">
        <p className={css.statusLine}>{t('noWorkspace')}</p>
      </div>
    )
  }
  if (state === undefined) return null
  const shown = filterPlans(state.rows, query)
  const notice = plansNotice(t, state, shown.length)
  return (
    <div className={css.root} data-plans-state="plans" data-plans-root={cwd}>
      <div className={css.header}>
        <Input
          className={clsx(css.search)}
          type="search"
          icon={<IconSearchOutline16 />}
          value={query}
          placeholder={t('search.placeholder')}
          aria-label={t('search.label')}
          data-plans-search
          onChange={(event) => { setQuery(event.target.value) }}
        />
        <button
          type="button"
          className={css.tool}
          aria-label={t('reload')}
          title={t('reload')}
          data-plans-reload
          onClick={() => { refresh(tab.id, cwd, signal) }}
        >
          <IconRefreshOutline16 />
        </button>
      </div>
      <div className={css.body}>
        {notice !== undefined && (
          <p className={clsx(css.note, notice.kind === 'failed' && css.failed)} data-plans-row={notice.kind}>
            {notice.line}
          </p>
        )}
        <ul className={css.list}>
          {shown.map(row => (
            <li key={row.path} className={css.item}>
              <button
                type="button"
                className={css.row}
                data-plans-path={row.rel}
                // Every row is under the workspace root, so its address is the
                // path relative to that root.
                onClick={() => { tabActions.openResource(fileAddressFor(sessionId, cwd, row.path)) }}
              >
                <span className={css.title}>{row.title}</span>
                <span className={css.path}>{row.rel}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
