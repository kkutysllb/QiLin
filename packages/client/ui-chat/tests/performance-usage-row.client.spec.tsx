// @vitest-environment jsdom
/** PerformanceUsageRow: current detail level, both choices, and writes. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionListState } from '@qilin-agent/api-session-controller/client'
import type { WorkspaceSnapshot } from '@qilin-agent/api-workspace-controller/client'
import type { SessionStatusSnapshot } from '@qilin-agent/client-ui-session/client'
import type { GlobalStandardProps } from '@qilin-agent/client-ui-slots'
import { createSnapshotStore } from '@qilin-agent/client-store'
import { bindSnapshotSelector, makeTranslate } from '@qilin-agent/client-test-runtime'
import { PerformanceUsageRow, type PerformanceUsageRowProps } from '../src/client/settings/PerformanceUsageRow.tsx'
import type { PerformanceUsageMode } from '../src/chat-settings.ts'
import { en } from '../src/client/locale.ts'

afterEach(cleanup)

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const useRemoteAccess: GlobalStandardProps['useRemoteAccess'] = () => true

function mount(mode: PerformanceUsageMode = 'compact') {
  const source = createSnapshotStore(mode)
  const setPerformanceUsage = vi.fn((next: PerformanceUsageMode) => { source.set(next) })
  const props: PerformanceUsageRowProps = {
    usePanelInfo: selector => selector({ activePanelId: null }),
    useSessions: bindSnapshotSelector(createSnapshotStore<SessionListState>({
      ids: [], byId: {}, phase: 'ready', projectionsBySession: {},
    })),
    useSessionStatus: bindSnapshotSelector(createSnapshotStore<SessionStatusSnapshot>(new Map())),
    useWorkspaces: bindSnapshotSelector(createSnapshotStore<WorkspaceSnapshot>({
      items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
    })),
    useSessionRetainInfo: () => undefined,
    useResource,
    useRemoteAccess,
    usePerformanceUsage: bindSnapshotSelector(source),
    setPerformanceUsage,
    t: makeTranslate(en),
  }
  render(<PerformanceUsageRow {...props} />)
  return { setPerformanceUsage, source }
}

describe('PerformanceUsageRow', () => {
  it('explains the preference and shows Compact by default', () => {
    mount()
    expect(screen.getByText(en['settings.performance.title'])).toBeDefined()
    expect(screen.getByText(en['settings.performance.description'])).toBeDefined()
    expect(screen.getByRole('button', { name: new RegExp(en['settings.performance.compact']) })).toBeDefined()
  })

  it('shows the accepted Detailed value and persists a change', () => {
    const b = mount('detailed')
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en['settings.performance.detailed']) }))
    fireEvent.click(screen.getByRole('menuitem', { name: en['settings.performance.compact'] }))
    expect(b.setPerformanceUsage).toHaveBeenCalledWith('compact')
  })
})
