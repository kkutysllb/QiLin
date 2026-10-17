// @vitest-environment jsdom
/** FontSettingsGroup behavior: the text size row, the collapsed disclosure, and role writes. */
import type { GlobalStandardProps } from '@qilin-agent/client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector, makeTranslate } from '@qilin-agent/client-test-runtime'
import { createSnapshotStore } from '@qilin-agent/client-store'
import type { SessionListState } from '@qilin-agent/api-session-controller/client'
import type { WorkspaceSnapshot } from '@qilin-agent/api-workspace-controller/client'
import type { SessionStatusSnapshot } from '@qilin-agent/client-ui-session/client'
import { DEFAULT_FONT_SIZES } from '../src/theme-settings.ts'
import { FontSettingsGroup, type FontSettingsGroupProps } from '../src/client/FontSettingsGroup.tsx'
import { createFontRowStore } from '../src/client/settings-store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const useRemoteAccess: GlobalStandardProps['useRemoteAccess'] = () => true
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
const useSessionStatus: FontSettingsGroupProps['useSessionStatus'] = selector => selector(new Map() as SessionStatusSnapshot)

function mount() {
  const store = createFontRowStore().create()
  store.actions.sync(DEFAULT_FONT_SIZES, { text: '', code: '', terminal: '' }, 0)
  const setFontFamily = vi.fn()
  const setFontSize = vi.fn()
  const props: FontSettingsGroupProps = {
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
    useRemoteAccess,
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: makeTranslate(en),
    setFontFamily,
    setFontSize,
  }
  render(<FontSettingsGroup {...props} />)
  return { store, setFontFamily, setFontSize }
}

const toggle = (): HTMLElement => screen.getByRole('button', { name: en['fontSize.more'] })

describe('FontSettingsGroup', () => {
  it('starts collapsed on the text size row', () => {
    mount()
    expect(screen.getByText(en['fontSize.text.title'])).toBeDefined()
    expect(screen.queryByLabelText(en['fontFamily.text.title'])).toBeNull()
    expect(screen.queryByText(en['fontSize.code.title'])).toBeNull()
    expect(toggle().getAttribute('aria-expanded')).toBe('false')
  })

  it('expands every role row and collapses them again', () => {
    mount()
    fireEvent.click(toggle())
    expect(toggle().getAttribute('aria-expanded')).toBe('true')
    for (const role of ['text', 'code', 'terminal'] as const) {
      expect(screen.getByLabelText(en[`fontFamily.${role}.title`])).toBeDefined()
    }
    expect(screen.getByText(en['fontSize.code.title'])).toBeDefined()
    expect(screen.getByText(en['fontSize.terminal.title'])).toBeDefined()

    fireEvent.click(toggle())
    expect(screen.queryByLabelText(en['fontFamily.code.title'])).toBeNull()
  })

  it('routes family and size edits to the role they belong to', () => {
    const b = mount()
    fireEvent.click(toggle())
    const codeFont = screen.getByLabelText(en['fontFamily.code.title'])
    fireEvent.change(codeFont, { target: { value: 'Menlo' } })
    fireEvent.blur(codeFont)
    expect(b.setFontFamily).toHaveBeenCalledWith('code', '"Menlo"')

    fireEvent.click(screen.getByRole('button', { name: en['fontSize.terminal.increase'] }))
    expect(b.setFontSize).toHaveBeenCalledWith('terminal', DEFAULT_FONT_SIZES.terminal + 1)
  })
})
