// @vitest-environment jsdom
/**
 * The panel against a virtual workspace.
 *
 * What is asserted is the reader's contract: the first scan runs on mount and
 * its rows come out in the convention's order, a row opens exactly that
 * session-scoped file address through the owner, the search filters titles and
 * paths, reload asks again, the poll runs only while the tab is visible, an
 * aborted record leaves nothing behind, and the status line says which of
 * loading, empty, no-match, and failed the panel is in. The notice helper the
 * status line is built from is checked on its own.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent } from '@testing-library/react'
import { makeTranslate, RemoteError } from '@qilin/client-test-runtime'
import type { RemoteFailure } from '@qilin/api-remotes/client'
import { fileAddressFor } from '@qilin/util-workspace-path'
import { PLAN_POLL_MS, plansNotice } from '../src/client/PlansBody.tsx'
import type { PlansTabState } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'
import { mountBody, ROOT, SESSION, TAB } from './mount.client.tsx'
import type { VirtualWorkspace } from './scripted-reader.client.ts'

const TRANSPORT: RemoteFailure = new RemoteError('gateway/internal', 'socket closed', {})

const WORKSPACE: VirtualWorkspace = {
  dirs: {
    [`${ROOT}/plans`]: [
      { name: 'alpha.md', type: 'file' },
      { name: 'notes.txt', type: 'file' },
    ],
  },
  heads: {
    [`${ROOT}/plans/alpha.md`]: '# Alpha plan',
    [`${ROOT}/plan.md`]: 'no heading',
  },
}

afterEach(() => { cleanup() })

/** Let every already-started scan settle and the panel draw its result. */
async function flush(): Promise<void> {
  await act(async () => { for (let i = 0; i < 40; i++) await Promise.resolve() })
}

/** Row paths in document order. */
function rows(root: HTMLElement): string[] {
  return [...root.querySelectorAll('[data-plans-path]')].map(row => row.getAttribute('data-plans-path')!)
}

/** The panel's one status line, or `undefined` while it lists rows. */
function notice(root: HTMLElement): { kind: string; line: string } | undefined {
  const line = root.querySelector('[data-plans-row]')
  return line === null ? undefined : { kind: line.getAttribute('data-plans-row')!, line: line.textContent! }
}

describe('PlansBody', () => {
  it('says so when the session has no workspace directory, and scans nothing', () => {
    const { view, script } = mountBody({ cwd: null })
    expect(view.container.querySelector('[data-plans-state="no-workspace"]')?.textContent).toBe(zh.noWorkspace)
    expect(script.list).not.toHaveBeenCalled()
  })

  it('scans on mount, reads while it waits, then lists each document with its title and path', async () => {
    const { view, script } = mountBody({ workspace: WORKSPACE })
    expect(notice(view.container)).toEqual({ kind: 'loading', line: zh.loading })
    expect(script.list).toHaveBeenCalledWith(SESSION, `${ROOT}/plans`, expect.any(AbortSignal))
    await flush()
    expect(view.container.querySelector('[data-plans-state="plans"]')?.getAttribute('data-plans-root')).toBe(ROOT)
    expect(rows(view.container)).toEqual(['plans/alpha.md', 'plan.md'])
    const first = view.container.querySelector('[data-plans-path="plans/alpha.md"]')
    expect(first?.textContent).toBe('Alpha planplans/alpha.md')
    expect(notice(view.container)).toBeUndefined()
  })

  it('says the workspace holds no plan documents when the convention is absent', async () => {
    const { view } = mountBody()
    await flush()
    expect(notice(view.container)).toEqual({ kind: 'empty', line: zh.empty })
  })

  it('shows a scan it could not trust instead of an empty workspace', async () => {
    const { view } = mountBody({ workspace: { failures: { [`${ROOT}/plans`]: TRANSPORT } } })
    await flush()
    expect(notice(view.container))
      .toEqual({ kind: 'failed', line: makeTranslate(zh)('error.failed', { message: 'socket closed' }) })
  })

  it('opens a row as the session-scoped file address through the owner', async () => {
    const { view, tabActions } = mountBody({ workspace: WORKSPACE })
    await flush()
    fireEvent.click(view.container.querySelector('[data-plans-path="plans/alpha.md"]')!)
    // Every row is under the workspace root, so its address is the path relative to it.
    expect(tabActions.openResource).toHaveBeenCalledWith(
      fileAddressFor(SESSION, ROOT, `${ROOT}/plans/alpha.md`),
    )
    expect(tabActions.openResource).toHaveBeenCalledWith('qilin-resource://file/session/s-test/plans/alpha.md')
  })

  it('filters on title or path, and says so when nothing matches', async () => {
    const { view } = mountBody({ workspace: WORKSPACE })
    await flush()
    const search = view.container.querySelector<HTMLInputElement>('[data-plans-search]')!
    expect(search.getAttribute('aria-label')).toBe(zh['search.label'])
    expect(search.getAttribute('placeholder')).toBe(zh['search.placeholder'])
    act(() => { fireEvent.change(search, { target: { value: 'ALPHA' } }) })
    expect(rows(view.container)).toEqual(['plans/alpha.md'])
    act(() => { fireEvent.change(search, { target: { value: 'plan.md' } }) })
    expect(rows(view.container)).toEqual(['plan.md'])
    act(() => { fireEvent.change(search, { target: { value: 'zzz' } }) })
    expect(rows(view.container)).toEqual([])
    expect(notice(view.container)).toEqual({ kind: 'noMatch', line: zh.noMatch })
  })

  it('scans again on the reload control', async () => {
    const { view, script } = mountBody({ workspace: WORKSPACE })
    await flush()
    script.list.mockClear()
    const reload = view.container.querySelector('[data-plans-reload]')!
    expect(reload.getAttribute('aria-label')).toBe(zh.reload)
    act(() => { fireEvent.click(reload) })
    await flush()
    expect(script.list.mock.calls.map(call => call[1])).toEqual([
      `${ROOT}/plans`, `${ROOT}/docs/plans`, `${ROOT}/.plans`,
    ])
  })

  it('polls while the tab is visible and not while it is hidden', async () => {
    vi.useFakeTimers()
    try {
      const shown = mountBody({ workspace: WORKSPACE })
      await flush()
      const afterMount = shown.script.list.mock.calls.length
      await act(async () => { await vi.advanceTimersByTimeAsync(PLAN_POLL_MS) })
      expect(shown.script.list.mock.calls.length).toBeGreaterThan(afterMount)

      const hidden = mountBody({ workspace: WORKSPACE, visible: false })
      await flush()
      const hiddenAfterMount = hidden.script.list.mock.calls.length
      // A hidden tab draws what its one mount scan found and asks for nothing more.
      expect(rows(hidden.view.container)).toEqual(['plans/alpha.md', 'plan.md'])
      await act(async () => { await vi.advanceTimersByTimeAsync(PLAN_POLL_MS * 2) })
      expect(hidden.script.list.mock.calls.length).toBe(hiddenAfterMount)
    } finally {
      cleanup()
      vi.useRealTimers()
    }
  })

  it('leaves nothing behind when the record is gone', async () => {
    const { view, instance, controller, script } = mountBody({ workspace: WORKSPACE })
    await flush()
    expect(instance.getSnapshot().byTab[TAB]).toBeDefined()
    act(() => { controller.abort() })
    expect(instance.getSnapshot().byTab[TAB]).toBeUndefined()
    expect(view.container.querySelector('[data-plans-state="plans"]')).toBeNull()
    expect(script.list).toHaveBeenCalledTimes(3)
  })
})

describe('plansNotice', () => {
  const t = makeTranslate(zh)
  const base: PlansTabState = { rows: [], scanning: true }

  it('reads the scan in flight, then the empty workspace', () => {
    expect(plansNotice(t, base, 0)).toEqual({ kind: 'loading', line: zh.loading })
    expect(plansNotice(t, { rows: [], scanning: false }, 0)).toEqual({ kind: 'empty', line: zh.empty })
  })

  it('reads a failed scan before anything it found, naming the failure', () => {
    expect(plansNotice(t, { rows: [], scanning: false, failure: TRANSPORT }, 0))
      .toEqual({ kind: 'failed', line: t('error.failed', { message: 'socket closed' }) })
  })

  it('reads no match only when the search emptied a list that has rows', () => {
    const rows = [{ path: 'p', base: 'p.md', rel: 'p.md', title: 'P' }]
    expect(plansNotice(t, { rows, scanning: false }, 1)).toBeUndefined()
    expect(plansNotice(t, { rows, scanning: false }, 0)).toEqual({ kind: 'noMatch', line: zh.noMatch })
  })
})
