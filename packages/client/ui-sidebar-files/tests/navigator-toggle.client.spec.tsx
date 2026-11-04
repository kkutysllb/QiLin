// @vitest-environment jsdom
/** The navigator's header control: one pane's show/hide choice, written through the shared face. */
import { useSyncExternalStore } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { PaneId } from '@qilin-agent/client-ui-dockkit'
import type { SessionId } from '@qilin-agent/session/types'
import { NavigatorToggle } from '../src/client/NavigatorToggle.tsx'
import type { NavigatorToggleInput } from '../src/client/NavigatorToggle.tsx'
import { createFilesStore } from '../src/client/store.ts'
import type { FilesState } from '../src/client/store.ts'

const SESSION = 's-nav-toggle' as SessionId
const PANE = 'pane-1' as PaneId

afterEach(() => { cleanup() })

/**
 * Render the control over a real store and a scripted session list.
 * @param options - the workspace cwd to advertise, and whether the pane already shows its navigator.
 * @returns the view, the recorded face write, and the store instance.
 */
function harness(options: { cwd?: string; open?: boolean } = {}) {
  const instance = createFilesStore().create()
  if (options.open !== undefined) instance.actions.navigatorShown(PANE, options.open)
  const shown = vi.fn()
  const subscribe = (listener: () => void): (() => void) => instance.subscribe(listener)
  const snapshot = (): FilesState => instance.getSnapshot()
  function useStore<T>(selector: (state: FilesState) => T): T {
    return selector(useSyncExternalStore(subscribe, snapshot))
  }
  const props = {
    useTabInfo: () => ({
      sidebar: { expanded: true, fullscreen: false },
      panel: { id: PANE, isFloating: false },
      tab: { id: 'tab-1', kind: 'text', contentId: 'qilin-resource://file/session/s-nav-toggle/a.ts', title: 'a.ts' },
    }),
    sessionId: SESSION,
    useSessions: (selector: (sessions: { byId: Record<string, { cwd: string }> }) => unknown) =>
      selector({ byId: options.cwd === undefined ? {} : { [SESSION]: { cwd: options.cwd } } }),
    useStore,
    shown,
    t: (key: string) => key,
  }
  const view = render(<NavigatorToggle {...props as NavigatorToggleInput & Parameters<typeof NavigatorToggle>[0]} />)
  return { view, shown, instance }
}

describe('NavigatorToggle', () => {
  it('draws nothing in a session without a workspace', () => {
    const { view } = harness()
    expect(view.container.querySelector('[data-files-navigator-toggle]')).toBeNull()
  })

  it('shows the hidden navigator of its own pane', () => {
    const { view, shown } = harness({ cwd: '/work/project', open: false })
    const button = view.container.querySelector('[data-files-navigator-toggle]') as HTMLElement
    expect(button.tagName).toBe('BUTTON')
    expect(button.getAttribute('aria-expanded')).toBe('false')
    expect(button.getAttribute('aria-label')).toBe('navigator.show')
    act(() => { fireEvent.click(button) })
    expect(shown).toHaveBeenCalledWith(PANE, true)
  })

  it('hides a navigator the pane already shows', () => {
    const { view, shown } = harness({ cwd: '/work/project', open: true })
    const button = view.container.querySelector('[data-files-navigator-toggle]') as HTMLElement
    expect(button.getAttribute('aria-expanded')).toBe('true')
    expect(button.getAttribute('aria-label')).toBe('navigator.hide')
    act(() => { fireEvent.click(button) })
    expect(shown).toHaveBeenCalledWith(PANE, false)
  })
})
