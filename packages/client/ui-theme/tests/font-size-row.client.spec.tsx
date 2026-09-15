// @vitest-environment jsdom
/** FontSizeRow behavior: value display, arrow clicks drive setFontSize,
 * bound-value arrows disable, display follows the store mirror. */
import type { GlobalStandardProps } from '@qilin/client-ui-slots'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionListState } from '@qilin/api-session-controller/client'
import type { WorkspaceSnapshot } from '@qilin/api-workspace-controller/client'
import { createSnapshotStore } from '@qilin/client-store'
import { bindSnapshotSelector } from '@qilin/client-test-runtime'
import { FontSizeRow } from '../src/client/FontSizeRow.tsx'
import type { FontSizeRowComponentProps } from '../src/client/FontSizeRow.tsx'
import { createTypographyRowStore } from '../src/client/settings-store.ts'

// Every fixture carries the resource hook the resources plugin merges into GlobalStandardProps.
const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined, reload: () => {} })) as GlobalStandardProps['useResource']
const usePanelInfo: GlobalStandardProps['usePanelInfo'] = selector => selector({ activePanelId: null })

afterEach(cleanup)

const COPY: Record<string, string> = {
  'fontSize.title': '字号大小',
  'fontSize.description': '仅影响会话内容的字号',
  'fontSize.increase': '增大字号',
  'fontSize.decrease': '减小字号',
}

/** Empty global standard-kit hooks (the row reads neither). */
function emptySessions() {
  const store = createSnapshotStore<SessionListState>(
    { ids: [], byId: {}, current: undefined, phase: 'ready', subagentsByParent: {}, jobsBySession: {}, currentAddress: undefined })
  return bindSnapshotSelector(store)
}
function emptyWorkspaces() {
  const store = createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  })
  return bindSnapshotSelector(store)
}

type AttentionSnapshot = Parameters<Parameters<FontSizeRowComponentProps['useSessionPendingInteraction']>[0]>[0]
const noAttention: AttentionSnapshot = new Map()
const useSessionPendingInteraction: FontSizeRowComponentProps['useSessionPendingInteraction'] = selector => selector(noAttention)

function mount(fontSize = 14) {
  // Real store instance — the sanctioned zero-machinery path for tests.
  const store = createTypographyRowStore().create()
  store.actions.sync(fontSize, 0, 0)
  const setFontSize = vi.fn()
  const props: FontSizeRowComponentProps = {
    useSessions: emptySessions(),
    useSessionPendingInteraction,
    usePanelInfo, useResource,
    useWorkspaces: emptyWorkspaces(),
    useStore: bindSnapshotSelector(store),
    actions: store.actions,
    t: (key: string) => COPY[key] ?? key,
    setFontSize,
  }
  render(<FontSizeRow {...props} />)
  return { store, setFontSize }
}

const arrow = (name: string): HTMLButtonElement =>
  screen.getByRole('button', { name }) as HTMLButtonElement

describe('FontSizeRow', () => {
  it('renders the title and the current size with both arrows enabled mid-range', () => {
    mount(14)
    expect(screen.getByText('字号大小')).toBeDefined()
    expect(screen.getByText('仅影响会话内容的字号')).toBeDefined()
    expect(screen.getByText('14')).toBeDefined()
    expect(arrow('增大字号').disabled).toBe(false)
    expect(arrow('减小字号').disabled).toBe(false)
  })

  it('arrow clicks step by 1; display follows the store mirror, not the click echo', () => {
    const b = mount(14)
    fireEvent.click(arrow('增大字号'))
    expect(b.setFontSize).toHaveBeenCalledWith(15)
    // No store write yet: the display is unchanged.
    expect(screen.getByText('14')).toBeDefined()
    act(() => { b.store.actions.sync(15, 0, 1) })
    expect(screen.getByText('15')).toBeDefined()
    fireEvent.click(arrow('减小字号'))
    expect(b.setFontSize).toHaveBeenCalledWith(14)
  })

  it('disables the outward arrow at each bound', () => {
    mount(17)
    expect(arrow('增大字号').disabled).toBe(true)
    expect(arrow('减小字号').disabled).toBe(false)
    cleanup()
    mount(12)
    expect(arrow('增大字号').disabled).toBe(false)
    expect(arrow('减小字号').disabled).toBe(true)
  })
})
