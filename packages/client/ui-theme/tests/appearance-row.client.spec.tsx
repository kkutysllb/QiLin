// @vitest-environment jsdom
/** AppearanceRow behavior: the three preference cubes, selection state, and writes. */
import type { GlobalStandardProps } from '@qilin-agent/client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector, makeTranslate } from '@qilin-agent/client-test-runtime'
import { createSnapshotStore } from '@qilin-agent/client-store'
import type { SessionListState } from '@qilin-agent/api-session-controller/client'
import type { WorkspaceSnapshot } from '@qilin-agent/api-workspace-controller/client'
import type { SessionStatusSnapshot } from '@qilin-agent/client-ui-session/client'
import type { ThemePreference } from '../src/theme-settings.ts'
import { AppearanceRow, type AppearanceRowComponentProps } from '../src/client/AppearanceRow.tsx'
import { createAppearanceRowStore } from '../src/client/settings-store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
const useSessionStatus: AppearanceRowComponentProps['useSessionStatus'] = selector => selector(new Map() as SessionStatusSnapshot)

function mount(preference: ThemePreference = 'system') {
  const store = createAppearanceRowStore().create()
  store.actions.sync(preference, 1)
  const setTheme = vi.fn()
  const props: AppearanceRowComponentProps = {
    useSessions: bindSnapshotSelector(createSnapshotStore<SessionListState>({
      ids: [], byId: {}, phase: 'ready', projectionsBySession: {},
    })),
    useWorkspaces: bindSnapshotSelector(createSnapshotStore<WorkspaceSnapshot>({
      items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    })),
    useSessionStatus,
    usePanelInfo,
    useSessionRetainInfo: () => undefined,
    useResource,
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: makeTranslate(en),
    setTheme,
  }
  render(<AppearanceRow {...props} />)
  return { store, setTheme }
}

describe('AppearanceRow', () => {
  it('renders the row title and one cube per built-in preference', () => {
    mount()
    expect(screen.getByText(en['appearance.title'])).toBeDefined()
    expect(screen.getAllByRole('button').map(button => button.textContent))
      .toEqual([en['appearance.light'], en['appearance.dark'], en['appearance.system']])
  })

  it('marks the persisted preference and switches away from it', () => {
    const b = mount('dark')
    const dark = screen.getByRole('button', { name: en['appearance.dark'] })
    expect(dark.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: en['appearance.light'] }).getAttribute('aria-pressed')).toBe('false')

    fireEvent.click(screen.getByRole('button', { name: en['appearance.light'] }))
    expect(b.setTheme).toHaveBeenCalledWith('light')
  })

  it('follows the mirror when the accepted preference changes', () => {
    const b = mount('light')
    expect(screen.getByRole('button', { name: en['appearance.light'] }).getAttribute('aria-pressed')).toBe('true')
    act(() => { b.store.actions.sync('system', 2) })
    expect(screen.getByRole('button', { name: en['appearance.system'] }).getAttribute('aria-pressed')).toBe('true')
  })
})
