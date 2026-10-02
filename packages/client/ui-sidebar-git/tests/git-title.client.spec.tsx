// @vitest-environment jsdom
/** The chip title: the branch glyph, then the type's label. */
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import type { PaneId, TabId } from '@qilin/client-ui-dockkit'
import type { SidebarRightTabInfo } from '@qilin/client-ui-sidebar-right/client'
import type { PropsRuntime } from '@qilin/client-ui-slots'
import { GitTitle } from '../src/client/GitTitle.tsx'

afterEach(cleanup)

function props(title: string): PropsRuntime<'sidebar.right.pane.tab.title'> {
  const tabInfo: SidebarRightTabInfo = {
    sidebar: { expanded: true, fullscreen: false },
    panel: { id: 'pane-1' as PaneId },
    tab: {
      id: 'tab-git' as TabId, kind: 'git', contentId: 'git', title, visible: true,
      navigation: { address: 'git', params: undefined, revision: 0 },
      signal: new AbortController().signal,
      actions: { bindCommands: () => () => {}, openResource: () => {}, openTab: () => {}, close: () => {} },
    },
  }
  const runtime: Partial<PropsRuntime<'sidebar.right.pane.tab.title'>> = { useTabInfo: () => tabInfo }
  return runtime as PropsRuntime<'sidebar.right.pane.tab.title'>
}

describe('GitTitle', () => {
  it('draws the branch glyph before the title text, sized to the chip line', () => {
    const { container } = render(<GitTitle {...props('源代码管理')} />)
    const svg = container.querySelector('svg')
    expect(svg?.getAttribute('width')).toBe('16')
    expect(svg?.getAttribute('aria-hidden')).toBe('true')
    expect(container.textContent).toBe('源代码管理')
  })
})
