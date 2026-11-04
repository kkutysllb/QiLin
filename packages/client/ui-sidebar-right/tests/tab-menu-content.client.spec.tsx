// @vitest-environment jsdom
/**
 * `TabMenuContent`: existing tab-menu extension rows render only for a tab
 * target whose Session is retained, inside that Session's provider.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { cleanup, render } from '@testing-library/react'
import type { SessionId } from '@qilin-agent/session/types'
import { TabMenuContent } from '../src/client/shell/TabMenuContent.tsx'
import type { SidebarSessionViewSnapshot } from '../src/client/session-views.ts'

const SESSION = 's-menu' as SessionId
const TAB = 'tab-1'

afterEach(() => { cleanup() })

/**
 * Render the rows seat over a scripted retained-view list.
 * @param options - the clicked target and the retained views.
 * @returns the view, the slot renderer's recorder, and the dismiss recorder.
 */
function harness(options: { target: unknown; views: readonly SidebarSessionViewSnapshot[] }) {
  const dismiss = vi.fn()
  const renderSlot = vi.fn((name: string, props: { tab: { id: string }; dismiss: () => void }): ReactNode =>
    <span data-slot={name} data-tab={props.tab.id} />)
  const SessionProvider = ({ session, children }: { session: { id: string }; children: ReactNode }) =>
    <div data-provider={session.id}>{children}</div>
  const props = {
    target: options.target,
    dismiss,
    useViews: (selector: (value: readonly SidebarSessionViewSnapshot[]) => unknown) => selector(options.views),
    SessionProvider,
    renderSlot,
  }
  const view = render(<TabMenuContent {...props as unknown as Parameters<typeof TabMenuContent>[0]} />)
  return { view, dismiss, renderSlot }
}

const tabTarget = (sessionId: SessionId) => ({ kind: 'tab', value: { sessionId, paneId: 'pane-1', tab: { id: TAB } } })

const viewOf = (sessionId: SessionId): SidebarSessionViewSnapshot[] => [
  // Framework-filled fields the row does not read are supplied by the fixture.
  { sessionId, reference: { id: 'ref-' + sessionId } } as unknown as SidebarSessionViewSnapshot,
]

describe('TabMenuContent', () => {
  it('renders nothing outside a tab target', () => {
    const h = harness({ target: { kind: 'file', value: { sessionId: SESSION, path: '/a.ts' } }, views: viewOf(SESSION) })
    expect(h.view.container.childElementCount).toBe(0)
    expect(h.renderSlot).not.toHaveBeenCalled()
  })

  it('renders nothing when the clicked Session has no retained view', () => {
    const h = harness({ target: tabTarget(SESSION), views: viewOf('s-other' as SessionId) })
    expect(h.view.container.childElementCount).toBe(0)
    expect(h.renderSlot).not.toHaveBeenCalled()
  })

  it('renders the extension rows inside the clicked Session provider', () => {
    const h = harness({ target: tabTarget(SESSION), views: viewOf(SESSION) })
    expect(h.view.container.querySelector('[data-provider]')?.getAttribute('data-provider')).toBe('ref-s-menu')
    expect(h.renderSlot).toHaveBeenCalledWith('sidebar.right.tab.menu.item', { tab: { id: TAB }, dismiss: h.dismiss })
    expect(h.view.container.querySelector('[data-slot="sidebar.right.tab.menu.item"]')?.getAttribute('data-tab')).toBe(TAB)
  })
})
