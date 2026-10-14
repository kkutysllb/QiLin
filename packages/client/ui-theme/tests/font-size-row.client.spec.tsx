// @vitest-environment jsdom
/** FontSizeRow behavior per role: value display, arrow clicks drive
 * setFontSize, bound arrows disable, display follows the store mirror, and
 * the text row carries the font-settings disclosure button. */
import type { GlobalStandardProps } from '@qilin-agent/client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionListState } from '@qilin-agent/api-session-controller/client'
import type { WorkspaceSnapshot } from '@qilin-agent/api-workspace-controller/client'
import { createSnapshotStore } from '@qilin-agent/client-store'
import { bindSnapshotSelector } from '@qilin-agent/client-test-runtime'
import type { FontRole, FontSizes } from '../src/theme-settings.ts'
import { FONT_SIZE_SPECS } from '../src/theme-settings.ts'
import { FontSizeRow } from '../src/client/FontSizeRow.tsx'
import type { FontSizeRowComponentProps } from '../src/client/FontSizeRow.tsx'
import { createFontRowStore } from '../src/client/settings-store.ts'

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

afterEach(cleanup)

const COPY: Record<string, string> = {}
for (const role of ['text', 'code', 'terminal'] as const) {
  COPY[`fontSize.${role}.title`] = `fontSize.${role}.title`
  COPY[`fontSize.${role}.description`] = `fontSize.${role}.description`
  COPY[`fontSize.${role}.increase`] = `fontSize.${role}.increase`
  COPY[`fontSize.${role}.decrease`] = `fontSize.${role}.decrease`
}
COPY['fontSize.unit'] = 'px'
COPY['fontSize.more'] = 'fontSize.more'

function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, phase: 'ready', projectionsBySession: {} })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  })
  return bindSnapshotSelector(store)
}

type AttentionSnapshot = Parameters<Parameters<FontSizeRowComponentProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionStatus: FontSizeRowComponentProps['useSessionStatus'] = selector => selector(noAttention)

function mount(role: FontRole = 'text', sizes: FontSizes = { text: 14, code: 11, terminal: 13 }, expander?: FontSizeRowComponentProps['expander']) {
  const store = createFontRowStore().create()
  store.actions.sync(sizes, { text: '', code: '', terminal: '' }, 0)
  const setFontSize = vi.fn()
  const props: FontSizeRowComponentProps = {
    useSessions: emptySessions(),
    useSessionStatus,
    usePanelInfo, useSessionRetainInfo: () => undefined, useResource,
    useWorkspaces: emptyWorkspaces(),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => COPY[key] ?? key,
    role,
    setFontSize,
    expander,
  }
  render(<FontSizeRow {...props} />)
  return { store, setFontSize }
}

const arrow = (role: FontRole, dir: 'increase' | 'decrease'): HTMLButtonElement =>
  screen.getByRole('button', { name: `fontSize.${role}.${dir}` }) as HTMLButtonElement

describe('FontSizeRow', () => {
  it('renders the role copy and the current size with both arrows enabled mid-range', () => {
    mount('text')
    expect(screen.getByText('fontSize.text.title')).toBeDefined()
    expect(screen.getByText('fontSize.text.description')).toBeDefined()
    expect(screen.getByText('14')).toBeDefined()
    expect(arrow('text', 'increase').disabled).toBe(false)
    expect(arrow('text', 'decrease').disabled).toBe(false)
  })

  it('arrow clicks step by 1 per role; display follows the store mirror, not the click echo', () => {
    const b = mount('code', { text: 14, code: 11, terminal: 13 })
    fireEvent.click(arrow('code', 'increase'))
    expect(b.setFontSize).toHaveBeenCalledWith(12)
    expect(screen.getByText('11')).toBeDefined()
    act(() => { b.store.actions.sync({ text: 14, code: 12, terminal: 13 }, { text: '', code: '', terminal: '' }, 1) })
    expect(screen.getByText('12')).toBeDefined()
    fireEvent.click(arrow('code', 'decrease'))
    expect(b.setFontSize).toHaveBeenCalledWith(11)
  })

  it.each([
    ['text', FONT_SIZE_SPECS.text.max, FONT_SIZE_SPECS.text.min],
    ['code', FONT_SIZE_SPECS.code.max, FONT_SIZE_SPECS.code.min],
    ['terminal', FONT_SIZE_SPECS.terminal.max, FONT_SIZE_SPECS.terminal.min],
  ] as const)('disables the outward arrow at each %s bound', (role, max, min) => {
    mount(role, { text: 14, code: 11, terminal: 13, [role]: max })
    expect(arrow(role, 'increase').disabled).toBe(true)
    expect(arrow(role, 'decrease').disabled).toBe(false)
    cleanup()
    mount(role, { text: 14, code: 11, terminal: 13, [role]: min })
    expect(arrow(role, 'increase').disabled).toBe(false)
    expect(arrow(role, 'decrease').disabled).toBe(true)
  })

  it('carries the disclosure button when the group passes one', () => {
    const onToggle = vi.fn()
    mount('text', undefined, { open: false, controls: 'region', onToggle })
    const button = screen.getByRole('button', { name: 'fontSize.more' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-controls')).toBe('region')
    fireEvent.click(button)
    expect(onToggle).toHaveBeenCalledOnce()
  })
})
