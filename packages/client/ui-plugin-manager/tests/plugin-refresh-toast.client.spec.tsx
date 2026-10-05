// @vitest-environment jsdom
/** The refresh-failure toast: one store notice behind one app-wide overlay banner. */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSnapshotStore } from '@qilin/client-store'
import { makeTranslate } from '@qilin/client-test-runtime'
import { PluginRefreshToast, type PluginRefreshToastProps } from '../src/client/PluginRefreshToast.tsx'
import { en, zh } from '../src/client/locales.ts'
import type { InstallState, PluginManagerState } from '../src/client/manager-store.ts'

afterEach(() => { cleanup(); vi.useRealTimers() })

const IDLE_INSTALL: InstallState = {
  open: false, spec: '', phase: 'idle', registries: null, registry: { kind: 'offered', registry: null }, registryOpen: false,
  registryError: false, attempts: null, inputError: null, subject: null, runs: [], detailsOpen: false,
  installed: null, installedVersion: null, restartRequired: false, failure: null, approvedBuilds: [], enabling: false,
}

const BASE: PluginManagerState = {
  status: 'ready', refreshStatus: 'idle', packages: [], busy: [], notice: null,
  install: IDLE_INSTALL, confirm: null, highlight: null,
  updates: { status: 'idle', entries: [], reason: '' },
  catalog: { status: 'idle', query: '', page: 1, entries: [], hasMore: false, reason: '' },
}

function mount(state: PluginManagerState, dictionary: typeof en | typeof zh = en) {
  const dismiss = vi.fn()
  const store = createSnapshotStore<PluginManagerState>(state)
  const props = {
    usePluginManager: <T,>(select: (value: PluginManagerState) => T): T => select(store.getSnapshot()),
    dismissNotice: dismiss,
    t: makeTranslate(dictionary),
  } as PluginRefreshToastProps
  return { view: render(<PluginRefreshToast {...props} />), dismiss, store }
}

describe('PluginRefreshToast', () => {
  it('renders nothing while no notice shows or another notice kind is current', () => {
    mount(BASE)
    expect(screen.queryByRole('alert')).toBeNull()
    mount({ ...BASE, notice: { kind: 'cancelled', seq: 1 } })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows the refresh failure and dismisses once done', () => {
    vi.useFakeTimers()
    const { dismiss } = mount({ ...BASE, notice: { kind: 'refresh-failed', seq: 1 } })
    expect(screen.getByRole('alert').textContent).toBe(en.refreshError)
    act(() => { vi.runAllTimers() })
    expect(dismiss).toHaveBeenCalledOnce()
  })

  it('localizes the refresh failure copy', () => {
    mount({ ...BASE, notice: { kind: 'refresh-failed', seq: 2 } }, zh)
    expect(screen.getByRole('alert').textContent).toBe(zh.refreshError)
  })
})
