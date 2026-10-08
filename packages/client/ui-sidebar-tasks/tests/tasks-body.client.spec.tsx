// @vitest-environment jsdom
/**
 * The page body: section and fold state, the list's rows and actions, and the
 * graph form's toggle and node routing, over hand-built Session state.
 *
 * The graph store instance is real, so the toggle and the node gestures assert
 * the state a mounted canvas would act on.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { SessionSummary } from '@qilin-agent/api-session-controller/client'
import type { SessionId } from '@qilin-agent/session/types'
import { RemoteError } from '@qilin-agent/typert-protocol'
import { makeTranslate } from '@qilin-agent/client-test-runtime'
import { child, job, projection, sid } from './fixtures.client.ts'
import { SESSION, mountBody } from './mount.client.tsx'
import { SubagentRowView } from '../src/client/TasksBody.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

/**
 * One Session-list summary row.
 * @param id - the Session.
 * @param running - its liveness.
 * @returns the summary.
 */
function summary(id: string, running: boolean): [SessionId, SessionSummary] {
  return [sid(id), { id: sid(id), displayTitle: id, running, retainedBy: {}, blank: false, updatedAt: 0 }]
}

describe('TasksBody sections', () => {
  it('shows the empty line only when both sections are settled and bare', () => {
    const { view } = mountBody({
      projectionsBySession: { [SESSION]: projection([]) },
    })
    expect(view.container.querySelector('[data-tasks-state="empty"]')?.textContent).toContain(zh['empty'])
  })

  it('shows the reading note while the catalog has not settled', () => {
    const { view } = mountBody({
      projectionsBySession: { [SESSION]: projection([], 'loading') },
    })
    expect(view.container.querySelector('[data-tasks-state="ready"]')).not.toBeNull()
  })

  it('shows the failure with a retry that re-reads the catalog', () => {
    const { refresh, view } = mountBody({
      projectionsBySession: { [SESSION]: projection([], 'error', new RemoteError('gateway/internal', 'boom', {})) },
    })
    expect(view.container.textContent).toContain('boom')
    fireEvent.click(view.container.querySelector('[class*="retry"]') as Element)
    expect(refresh).toHaveBeenCalledWith(SESSION)
  })

  it('falls back to the dictionary line when the failure carries no message', () => {
    const { view } = mountBody({
      projectionsBySession: { [SESSION]: projection([], 'error', null) },
    })
    expect(view.container.querySelector('[data-tasks-panel="subagents"]')?.textContent)
      .toContain(zh['subagents.failed'])
  })

  it('re-reads the catalog from the section header control', () => {
    const { refresh, view } = mountBody({
      projectionsBySession: { [SESSION]: projection([child('c1')]) },
    })
    fireEvent.click(view.container.querySelector('[data-tasks-refresh]') as Element)
    expect(refresh).toHaveBeenCalledWith(SESSION)
  })

  it('collapses and reopens each section from its header', () => {
    const { view } = mountBody({
      projectionsBySession: { [SESSION]: projection([child('c1', { activity: 'running' })]) },
    }, [job('j1')])
    const header = view.container.querySelector('[data-tasks-section="subagents"] button') as Element
    fireEvent.click(header)
    expect(view.container.querySelector('[data-tasks-panel="subagents"]')).toBeNull()
    fireEvent.click(header)
    expect(view.container.querySelector('[data-tasks-panel="subagents"]')).not.toBeNull()
    const tasksHeader = view.container.querySelector('[data-tasks-section="tasks"] button') as Element
    fireEvent.click(tasksHeader)
    expect(view.container.querySelector('[data-tasks-panel="tasks"]')).toBeNull()
  })
})

describe('TasksBody list', () => {
  it('draws one row per catalog child and opens it through the address', () => {
    const entry = child('c1', { activity: 'running', mode: 'continuable', label: 'Scout' })
    const { openChild, view } = mountBody({
      projectionsBySession: { [SESSION]: projection([entry]) },
    })
    const row = view.container.querySelector('[data-tasks-subagent]') as Element
    expect(row.getAttribute('data-tasks-subagent')).toBe(sid('c1'))
    fireEvent.click(row.querySelector('button') as Element)
    expect(openChild).toHaveBeenCalledWith({
      parentSessionId: SESSION, childSessionId: sid('c1'), mode: 'continuable',
    })
  })

  it('offers the interrupt on a live continuable row only', () => {
    const live = child('c1', { mode: 'continuable' })
    const settled = child('c2', { mode: 'continuable' })
    const { interruptChild, view } = mountBody({
      byId: Object.fromEntries([summary('c1', true), summary('c2', false)]),
      projectionsBySession: { [SESSION]: projection([live, settled]) },
    })
    const buttons = view.container.querySelectorAll('[data-tasks-subagent] [class*="action"]')
    expect(buttons).toHaveLength(1)
    fireEvent.click(buttons[0] as Element)
    expect(interruptChild).toHaveBeenCalledWith(sid('c1'), SESSION)
  })

  it('draws a diagnostic row inert, phrased per reason', () => {
    // The projection's catalog values carry described children only; the row
    // view is mounted directly with the diagnostic rows subagentRows produces.
    for (const reason of ['corrupt', 'unsupported', 'unavailable'] as const) {
      const view = render(
        <ul>
          <SubagentRowView
            row={{ kind: 'diagnostic', id: sid('d1'), depth: 0, reason }}
            t={makeTranslate(zh)}
            onOpen={vi.fn()}
            onInterrupt={vi.fn()}
          />
        </ul>,
      )
      const row = view.container.querySelector('[data-tasks-subagent]') as Element
      expect(row.textContent).toContain(sid('d1'))
      expect(row.textContent).toContain(zh[`subagents.diagnostic.${reason}`])
      expect(row.querySelector('button')).toBeNull()
      cleanup()
    }
  })

  it('folds the preview and expands the rest on demand', () => {
    const entries = Array.from({ length: 7 }, (_, index) => child(`c${index}`, { mode: 'one-shot' }))
    const { view } = mountBody({
      projectionsBySession: { [SESSION]: projection(entries) },
    })
    expect(view.container.querySelectorAll('[data-tasks-subagent]')).toHaveLength(5)
    const more = view.container.querySelector('[data-tasks-more="subagents"]') as Element
    expect(more.textContent).toContain('2')
    fireEvent.click(more)
    expect(view.container.querySelectorAll('[data-tasks-subagent]')).toHaveLength(7)
    fireEvent.click(view.container.querySelector('[data-tasks-more="subagents"]') as Element)
    expect(view.container.querySelectorAll('[data-tasks-subagent]')).toHaveLength(5)
  })

  it('shows the bare-catalog line when ready but empty, beside other work', () => {
    const { view } = mountBody({
      projectionsBySession: { [SESSION]: projection([]) },
    }, [job('j1')])
    expect(view.container.querySelector('[data-tasks-panel="subagents"]')?.textContent)
      .toContain(zh['subagents.empty'])
  })
})

describe('TasksBody jobs', () => {
  it('draws the job rows with their status and folds at the preview size', () => {
    const rows = [
      job('live'),
      job('done', { status: 'completed', finishedAt: 5 }),
      job('failed', { status: 'failed', finishedAt: 7, detail: 'exit 1' }),
      job('extra'),
    ]
    const { view } = mountBody({}, rows)
    expect(view.container.querySelectorAll('[data-tasks-job]')).toHaveLength(3)
    const more = view.container.querySelector('[data-tasks-more="tasks"]') as Element
    fireEvent.click(more)
    expect(view.container.querySelectorAll('[data-tasks-job]')).toHaveLength(4)
    const failed = view.container.querySelector('[data-tasks-job="failed"]') as Element
    expect(failed.getAttribute('data-tasks-status')).toBe('failed')
    expect(failed.textContent).toContain('exit 1')
  })

  it('keeps a live job measuring against the clock', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      const { view } = mountBody({}, [job('live', { startedAt: Date.now() })])
      expect(view.container.querySelector('[data-tasks-job="live"]')?.textContent).toContain('0秒')
      act(() => { vi.advanceTimersByTime(1_000) })
      expect(view.container.querySelector('[data-tasks-job="live"]')?.textContent).toContain('1秒')
    } finally {
      vi.useRealTimers()
    }
  })

  it('notes an empty job list', () => {
    const { view } = mountBody({
      projectionsBySession: { [SESSION]: projection([child('c1')]) },
    })
    expect(view.container.querySelector('[data-tasks-panel="tasks"]')?.textContent).toContain(zh['tasks.empty'])
  })
})

describe('TasksBody graph form', () => {
  /** Six done one-shot children, the fold threshold. */
  function doneMount() {
    const entries = Array.from({ length: 6 }, (_, index) => child(`d${index}`, { mode: 'one-shot' }))
    return mountBody({ projectionsBySession: { [SESSION]: projection(entries) } })
  }

  it('toggles between the list and the graph forms', () => {
    const { graph, view } = doneMount()
    expect(view.container.querySelector('[data-tasks-graph]')).toBeNull()
    fireEvent.click(view.container.querySelector('[data-tasks-view="graph"]') as Element)
    expect(graph.getSnapshot().view).toBe('graph')
    expect(view.container.querySelector('[data-tasks-graph]')).not.toBeNull()
    fireEvent.click(view.container.querySelector('[data-tasks-view="list"]') as Element)
    expect(view.container.querySelector('[data-tasks-graph]')).toBeNull()
  })

  it('keeps the toggle buttons pressed-state honest', () => {
    const { view } = doneMount()
    const list = view.container.querySelector('[data-tasks-view="list"]') as Element
    const graph = view.container.querySelector('[data-tasks-view="graph"]') as Element
    expect(list.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(graph)
    expect(graph.getAttribute('aria-pressed')).toBe('true')
    expect(list.getAttribute('aria-pressed')).toBe('false')
  })

  it('folds a large done group and unfolds it from the aggregate card', () => {
    const { graph, view } = doneMount()
    fireEvent.click(view.container.querySelector('[data-tasks-view="graph"]') as Element)
    const aggregate = view.container.querySelector('[data-tasks-graph-node="done-agg:s-root"]') as Element
    expect(aggregate).not.toBeNull()
    expect(view.container.querySelector('[data-tasks-graph-node="d0"]')).toBeNull()
    fireEvent.click(aggregate)
    expect(graph.getSnapshot().expanded).toEqual({ 'done-agg:s-root': true })
    expect(view.container.querySelector('[data-tasks-graph-node="d0"]')).not.toBeNull()
  })

  it('routes a subagent card through its catalog address', () => {
    const { openChild, view } = mountBody({
      projectionsBySession: {
        [SESSION]: projection([child('c1', { activity: 'running', mode: 'continuable' })]),
      },
    })
    fireEvent.click(view.container.querySelector('[data-tasks-view="graph"]') as Element)
    fireEvent.click(view.container.querySelector('[data-tasks-graph-node="c1"]') as Element)
    expect(openChild).toHaveBeenCalledWith({
      parentSessionId: SESSION, childSessionId: sid('c1'), mode: 'continuable',
    })
  })

  it('routes the main card to the page Session and a placeholder to its parent read', () => {
    const { openChild, refresh, view } = mountBody({
      projectionsBySession: {
        [SESSION]: projection([child('c1', { hasChildren: true })]),
      },
    })
    fireEvent.click(view.container.querySelector('[data-tasks-view="graph"]') as Element)
    fireEvent.click(view.container.querySelector(`[data-tasks-graph-node="${SESSION}"]`) as Element)
    expect(openChild).toHaveBeenCalledWith(SESSION)
    fireEvent.click(view.container.querySelector('[data-tasks-graph-node="placeholder:c1"]') as Element)
    expect(refresh).toHaveBeenCalledWith(sid('c1'))
  })
})
