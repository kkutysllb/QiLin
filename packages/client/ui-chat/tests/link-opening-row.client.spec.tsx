// @vitest-environment jsdom
/** LinkOpeningRow: browser availability gating, destination display, and writes. */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { SessionListState } from '@qilin-agent/api-session-controller/client'
import type { WorkspaceSnapshot } from '@qilin-agent/api-workspace-controller/client'
import type { SessionStatusSnapshot } from '@qilin-agent/client-ui-session/client'
import type { GlobalStandardProps } from '@qilin-agent/client-ui-slots'
import { createSnapshotStore } from '@qilin-agent/client-store'
import { bindSnapshotSelector, makeTranslate } from '@qilin-agent/client-test-runtime'
import { LinkOpeningRow, type LinkOpeningRowProps } from '../src/client/settings/LinkOpeningRow.tsx'
import type { LinkOpening } from '../src/chat-settings.ts'
import { en } from '../src/client/locale.ts'

afterEach(cleanup)

const useResource = (() => ({ status: 'none' as const, value: undefined, failure: undefined })) as GlobalStandardProps['useResource']
const useRemoteAccess: GlobalStandardProps['useRemoteAccess'] = () => true

function emptySessions() {
  return bindSnapshotSelector(createSnapshotStore<SessionListState>({
    ids: [], byId: {}, phase: 'ready', projectionsBySession: {},
  }))
}

function emptyWorkspaces() {
  return bindSnapshotSelector(createSnapshotStore<WorkspaceSnapshot>({
    items: [], archivedSessionIds: [], pinnedSessionIds: [], state: 'idle', phase: 'ready', error: null,
  }))
}

function noPendingInteraction() {
  return bindSnapshotSelector(createSnapshotStore<SessionStatusSnapshot>(new Map()))
}

function mount(destination: LinkOpening = 'sidebar', browserAvailable = true) {
  const source = createSnapshotStore(destination)
  const setLinkOpening = vi.fn((next: LinkOpening) => { source.set(next) })
  const props: LinkOpeningRowProps = {
    usePanelInfo: selector => selector({ activePanelId: null }),
    useSessions: emptySessions(),
    useSessionStatus: noPendingInteraction(),
    useWorkspaces: emptyWorkspaces(),
    useSessionRetainInfo: () => undefined,
    useResource,
    useRemoteAccess,
    useLinkOpening: bindSnapshotSelector(source),
    useBrowserAvailable: bindSnapshotSelector(createSnapshotStore(browserAvailable)),
    setLinkOpening,
    t: makeTranslate(en),
  }
  render(<LinkOpeningRow {...props} />)
  return { setLinkOpening }
}

describe('LinkOpeningRow', () => {
  it('renders nothing while the built-in browser is unregistered', () => {
    mount('sidebar', false)
    expect(screen.queryByText(en['settings.links.title'])).toBeNull()
  })

  it('shows the sidebar destination and offers both placements', () => {
    mount('sidebar')
    expect(screen.getByText(en['settings.links.title'])).toBeDefined()
    expect(screen.getByText(en['settings.links.description'])).toBeDefined()
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en['settings.links.sidebar']) }))
    expect(screen.getByRole('menuitem', { name: en['settings.links.sidebar'] })).toBeDefined()
    expect(screen.getByRole('menuitem', { name: en['settings.links.newTab'] })).toBeDefined()
  })

  it('reports the new-tab destination label and writes the chosen placement', () => {
    const b = mount('new-tab')
    fireEvent.click(screen.getByRole('button', { name: new RegExp(en['settings.links.newTab']) }))
    fireEvent.click(screen.getByRole('menuitem', { name: en['settings.links.sidebar'] }))
    expect(b.setLinkOpening).toHaveBeenCalledWith('sidebar')
  })
})
