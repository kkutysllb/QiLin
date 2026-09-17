// @vitest-environment jsdom
/** LineSpacingRow behavior: signed value display, arrow clicks drive
 * setLeading, bound-value arrows disable, display follows the store mirror. */
import type { GlobalStandardProps } from '@qilin/client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionListState } from '@qilin/api-session-controller/client'
import type { WorkspaceSnapshot } from '@qilin/api-workspace-controller/client'
import { createSnapshotStore } from '@qilin/client-store'
import { bindSnapshotSelector } from '@qilin/client-test-runtime'
import { LineSpacingRow } from '../src/client/LineSpacingRow.tsx'
import type { LineSpacingRowComponentProps } from '../src/client/LineSpacingRow.tsx'
import { createTypographyRowStore } from '../src/client/settings-store.ts'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

afterEach(cleanup)

const COPY: Record<string, string> = {
  'leading.title': '行间距',
  'leading.description': '在默认行高上增减会话正文的行间距，0 为默认',
  'leading.unit': 'px',
  'leading.increase': '增大行间距',
  'leading.decrease': '减小行间距',
}

/** Empty global standard-kit hooks (the row reads neither). */
function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, phase: 'ready', subagentsByParent: {}, jobsBySession: {} })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  })
  return bindSnapshotSelector(store)
}

type AttentionSnapshot = Parameters<Parameters<LineSpacingRowComponentProps['useSessionStatus']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionStatus: LineSpacingRowComponentProps['useSessionStatus'] = selector => selector(noAttention)
const useSessionRetainInfo: LineSpacingRowComponentProps['useSessionRetainInfo'] = () => undefined

function mount(leading = 0) {
  // Real store instance — the sanctioned zero-machinery path for tests.
  const store = createTypographyRowStore().create()
  store.actions.sync(14, leading, 0)
  const setLeading = vi.fn()
  const props: LineSpacingRowComponentProps = {
    useSessions: emptySessions(),
    useSessionStatus,
    useSessionRetainInfo,
    usePanelInfo, useResource,
    useWorkspaces: emptyWorkspaces(),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => COPY[key] ?? key,
    setLeading,
  }
  render(<LineSpacingRow {...props} />)
  return { store, setLeading }
}

const arrow = (name: string): HTMLButtonElement =>
  screen.getByRole('button', { name }) as HTMLButtonElement

describe('LineSpacingRow', () => {
  it('renders the title and a zero adjustment with both arrows enabled', () => {
    mount()
    expect(screen.getByText('行间距')).toBeDefined()
    expect(screen.getByText('在默认行高上增减会话正文的行间距，0 为默认')).toBeDefined()
    expect(screen.getByText('0')).toBeDefined()
    expect(screen.getByText('px')).toBeDefined()
    expect(arrow('增大行间距').disabled).toBe(false)
    expect(arrow('减小行间距').disabled).toBe(false)
  })

  it('signs a positive adjustment and shows a negative one verbatim', () => {
    mount(3)
    expect(screen.getByText('+3')).toBeDefined()
    cleanup()
    mount(-2)
    expect(screen.getByText('-2')).toBeDefined()
  })

  it('arrow clicks step by 1; display follows the store mirror, not the click echo', () => {
    const b = mount(0)
    fireEvent.click(arrow('增大行间距'))
    expect(b.setLeading).toHaveBeenCalledWith(1)
    expect(screen.getByText('0')).toBeDefined()
    act(() => { b.store.actions.sync(14, 1, 1) })
    expect(screen.getByText('+1')).toBeDefined()
    fireEvent.click(arrow('减小行间距'))
    expect(b.setLeading).toHaveBeenCalledWith(0)
  })

  it('disables the outward arrow at each bound', () => {
    mount(8)
    expect(arrow('增大行间距').disabled).toBe(true)
    expect(arrow('减小行间距').disabled).toBe(false)
    cleanup()
    mount(-2)
    expect(arrow('增大行间距').disabled).toBe(false)
    expect(arrow('减小行间距').disabled).toBe(true)
  })
})
