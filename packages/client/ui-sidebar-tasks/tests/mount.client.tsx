/**
 * Mount the page and its chip badge over hand-built Session state.
 *
 * The components read a handful of their props; the rest of the standard kit is
 * framework-injected and never touched here, so one documented cast keeps the
 * harness to what is actually exercised.
 */
import { useSyncExternalStore } from 'react'
import { render } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import { vi } from 'vitest'
import type { Mock } from 'vitest'
import type { SessionListState } from '@qilin-agent/api-session-controller/client'
import type { JobsSnapshot } from '@qilin-agent/api-job-controller/client'
import type { JobView } from '@qilin-agent/jobs/view'
import { makeTranslate } from '@qilin-agent/client-test-runtime'
import type { SessionId } from '@qilin-agent/session/types'
import type { TasksInjected } from '../src/client/face.ts'
import { zh } from '../src/client/locales.ts'
import { TasksBadge } from '../src/client/TasksBadge.tsx'
import type { TasksBadgeProps } from '../src/client/TasksBadge.tsx'
import { TasksBody } from '../src/client/TasksBody.tsx'
import type { TasksBodyProps } from '../src/client/TasksBody.tsx'
import { createTasksGraphStore } from '../src/client/tasks-graph-store.ts'

/** The Session every mount draws. */
export const SESSION = 's-root' as SessionId

/** Test-local selector hook over a framework-neutral store instance. */
function hookOf<T>(inst: { subscribe: (fn: () => void) => () => void; getSnapshot: () => T }) {
  return function useSelector<S>(sel: (s: T) => S): S {
    return sel(useSyncExternalStore(inst.subscribe, inst.getSnapshot))
  }
}

/** A live instance of the graph store, as the registration would mint one. */
export type TasksGraphInstance = ReturnType<ReturnType<typeof createTasksGraphStore>['create']>

/** What a spec holds after mounting: the rendered view and the injected actions. */
export interface Mounted {
  readonly view: RenderResult
  readonly graph: TasksGraphInstance
  readonly openChild: Mock<TasksInjected['openChild']>
  readonly refresh: Mock<TasksInjected['refresh']>
  readonly interruptChild: Mock<TasksInjected['interruptChild']>
}

/** The live tab information the seat injects; a page tab reads none of it. */
function tabInfo() {
  return {
    sidebar: { expanded: true, fullscreen: false },
    panel: { id: 'pane-1' },
    tab: {
      id: 'tab-1',
      kind: 'tasks',
      contentId: 'tasks',
      title: zh['type.label'],
      visible: true,
      navigation: { address: 'tasks', params: undefined, revision: 1 },
      signal: new AbortController().signal,
      actions: { openResource: () => {}, openTab: () => {}, close: () => {} },
    },
  }
}

/** One Session list snapshot with the spec's overrides applied. */
function listState(state: Partial<SessionListState>): SessionListState {
  return {
    ids: [SESSION],
    byId: {},
    phase: 'ready',
    projectionsBySession: {},
    ...state,
  }
}

/** A bare jobs source over the rows a spec hands the mount. */
function jobsSource(rows: readonly JobView[]) {
  const snapshot: JobsSnapshot = {
    rows: rows.length === 0 ? {} : { [SESSION]: rows },
    observed: {},
  }
  return {
    getSnapshot: () => snapshot,
    subscribe: () => () => {},
  }
}

/** The shares a mount needs, plus the actions a spec asserts on. */
function hands(state: Partial<SessionListState>, rows: readonly JobView[] = []) {
  const openChild = vi.fn<TasksInjected['openChild']>()
  const refresh = vi.fn<TasksInjected['refresh']>()
  const interruptChild = vi.fn<TasksInjected['interruptChild']>()
  const snapshot = listState(state)
  const jobs = jobsSource(rows)
  const graph = createTasksGraphStore().create()
  const shared = {
    useTabInfo: tabInfo,
    sessionId: SESSION,
    useSessions: <S,>(selector: (snapshot: SessionListState) => S): S => selector(snapshot),
    useStore: hookOf(graph),
    actions: graph.actions,
    openChild,
    refresh,
    interruptChild,
    hooks: { jobs },
    useJobs: <S,>(selector: (snapshot: JobsSnapshot) => S): S => selector(jobs.getSnapshot()),
    watchRows: () => () => {},
    t: makeTranslate(zh),
  }
  return { shared, graph, openChild, refresh, interruptChild }
}

/**
 * Mount the page body.
 * @param state - the Session list fields the spec wants the body to see.
 * @param rows - the background jobs the Session holds.
 * @returns the rendered view, the graph store instance, and the action mocks.
 */
export function mountBody(state: Partial<SessionListState> = {}, rows: readonly JobView[] = []): Mounted {
  const { shared, graph, openChild, refresh, interruptChild } = hands(state, rows)
  const view = render(<TasksBody {...shared as unknown as TasksBodyProps} />)
  return { view, graph, openChild, refresh, interruptChild }
}

/**
 * Mount the chip badge.
 * @param state - the Session list fields the spec wants the badge to see.
 * @param rows - the background jobs the Session holds.
 * @returns the rendered view.
 */
export function mountBadge(state: Partial<SessionListState> = {}, rows: readonly JobView[] = []): RenderResult {
  const { shared } = hands(state, rows)
  return render(<TasksBadge {...shared as unknown as TasksBadgeProps} />)
}
