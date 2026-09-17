/**
 * Mount the page and its chip badge over hand-built Session state.
 *
 * The components read a handful of their props; the rest of the standard kit is
 * framework-injected and never touched here, so one documented cast keeps the
 * harness to what is actually exercised.
 */
import { render } from '@testing-library/react'
import type { RenderResult } from '@testing-library/react'
import { vi } from 'vitest'
import type { Mock } from 'vitest'
import type { SessionListState } from '@qilin/api-session-controller/client'
import { makeTranslate } from '@qilin/client-test-runtime'
import type { SessionId } from '@qilin/session/types'
import type { TasksInjected } from '../src/client/face.ts'
import { zh } from '../src/client/locales.ts'
import { TasksBadge } from '../src/client/TasksBadge.tsx'
import type { TasksBadgeProps } from '../src/client/TasksBadge.tsx'
import { TasksBody } from '../src/client/TasksBody.tsx'
import type { TasksBodyProps } from '../src/client/TasksBody.tsx'

/** The Session every mount draws. */
export const SESSION = 's-root' as SessionId

/** What a spec holds after mounting: the rendered view and the injected actions. */
export interface Mounted {
  readonly view: RenderResult
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
    subagentsByParent: {},
    jobsBySession: {},
    ...state,
  }
}

/** The four shares a mount needs, plus the actions a spec asserts on. */
function hands(state: Partial<SessionListState>) {
  const openChild = vi.fn<TasksInjected['openChild']>()
  const refresh = vi.fn<TasksInjected['refresh']>()
  const interruptChild = vi.fn<TasksInjected['interruptChild']>()
  const snapshot = listState(state)
  const shared = {
    useTabInfo: tabInfo,
    sessionId: SESSION,
    useSessions: <S,>(selector: (snapshot: SessionListState) => S): S => selector(snapshot),
    openChild,
    refresh,
    interruptChild,
    t: makeTranslate(zh),
  }
  return { shared, openChild, refresh, interruptChild }
}

/**
 * Mount the page body.
 * @param state - the Session list fields the spec wants the body to see.
 * @returns the rendered view and the injected action mocks.
 */
export function mountBody(state: Partial<SessionListState> = {}): Mounted {
  const { shared, openChild, refresh, interruptChild } = hands(state)
  const view = render(<TasksBody {...shared as unknown as TasksBodyProps} />)
  return { view, openChild, refresh, interruptChild }
}

/**
 * Mount the chip badge.
 * @param state - the Session list fields the spec wants the badge to see.
 * @returns the rendered view.
 */
export function mountBadge(state: Partial<SessionListState> = {}): RenderResult {
  const { shared } = hands(state)
  return render(<TasksBadge {...shared as unknown as TasksBadgeProps} />)
}
