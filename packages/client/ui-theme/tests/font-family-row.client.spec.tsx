// @vitest-environment jsdom
/** FontFamilyRow behavior: the persisted list, blur and Enter commits, IME guard. */
import type { GlobalStandardProps } from '@qilin-agent/client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector, makeTranslate } from '@qilin-agent/client-test-runtime'
import { createSnapshotStore } from '@qilin-agent/client-store'
import type { SessionListState } from '@qilin-agent/api-session-controller/client'
import type { WorkspaceSnapshot } from '@qilin-agent/api-workspace-controller/client'
import type { SessionStatusSnapshot } from '@qilin-agent/client-ui-session/client'
import { DEFAULT_FONT_SIZES, type FontFamilies, type FontRole } from '../src/theme-settings.ts'
import { FontFamilyRow, type FontFamilyRowComponentProps } from '../src/client/FontFamilyRow.tsx'
import { createFontRowStore } from '../src/client/settings-store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const useRemoteAccess: GlobalStandardProps['useRemoteAccess'] = () => true
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })
const useSessionStatus: FontFamilyRowComponentProps['useSessionStatus'] = selector => selector(new Map() as SessionStatusSnapshot)
const EMPTY: FontFamilies = { text: '', code: '', terminal: '' }

function mount(role: FontRole = 'text', families: FontFamilies = EMPTY) {
  const store = createFontRowStore().create()
  store.actions.sync(DEFAULT_FONT_SIZES, families, 0)
  const setFontFamily = vi.fn()
  const props: FontFamilyRowComponentProps = {
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
    role,
    setFontFamily,
  }
  render(<FontFamilyRow {...props} />)
  return { store, setFontFamily, field: screen.getByLabelText(en[`fontFamily.${role}.title`]) }
}

describe('FontFamilyRow', () => {
  it('shows the role copy, the placeholder, and the persisted list', () => {
    const b = mount('text', { text: '"Inter"', code: '', terminal: '' })
    expect(screen.getByText(en['fontFamily.text.title'])).toBeDefined()
    expect(screen.getByText(en['fontFamily.text.description'])).toBeDefined()
    expect((b.field as HTMLInputElement).value).toBe('"Inter"')
    expect((b.field as HTMLInputElement).placeholder).toBe(en['fontFamily.placeholder'])
    expect((b.field as HTMLInputElement).maxLength).toBe(200)
  })

  it('normalizes the list on blur and commits it', () => {
    const b = mount('text')
    fireEvent.change(b.field, { target: { value: ' Inter , sans-serif ,  ' } })
    fireEvent.blur(b.field)
    expect(b.setFontFamily).toHaveBeenCalledWith('"Inter", sans-serif')
  })

  it('commits on Enter through blur', () => {
    const b = mount('text', { text: '"Inter"', code: '', terminal: '' })
    b.field.focus()
    fireEvent.change(b.field, { target: { value: 'Menlo,monospace' } })
    fireEvent.keyDown(b.field, { key: 'Enter' })
    expect(b.setFontFamily).toHaveBeenCalledWith('"Menlo", monospace')
  })

  it('leaves an IME composition to the input method', () => {
    const b = mount('text')
    b.field.focus()
    fireEvent.change(b.field, { target: { value: 'Menlo' } })
    fireEvent.keyDown(b.field, { key: 'Enter', keyCode: 229 })
    expect(b.setFontFamily).not.toHaveBeenCalled()
  })

  it('leaves other keys to the input', () => {
    const b = mount('text')
    b.field.focus()
    fireEvent.change(b.field, { target: { value: 'Menlo' } })
    fireEvent.keyDown(b.field, { key: 'a' })
    expect(b.setFontFamily).not.toHaveBeenCalled()
  })

  it('resets the field when the persisted list changes', () => {
    const b = mount('terminal', { text: '', code: '', terminal: '' })
    fireEvent.change(screen.getByLabelText(en['fontFamily.terminal.title']), { target: { value: 'draft' } })
    act(() => {
      b.store.actions.sync(DEFAULT_FONT_SIZES, { text: '', code: '', terminal: '"MesloLGS NF"' }, 2)
    })
    expect(screen.getByLabelText(en['fontFamily.terminal.title'])).toHaveProperty('value', '"MesloLGS NF"')
  })
})
