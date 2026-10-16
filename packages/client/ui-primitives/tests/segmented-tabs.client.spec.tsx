// @vitest-environment jsdom
/** The segmented tabs are a controlled tablist: the owner holds the selection and the panels. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SegmentedTabs } from '@qilin-agent/client-ui-primitives'

afterEach(cleanup)

type Tab = 'installed' | 'available' | 'market'

const ITEMS = [
  { value: 'installed', label: 'Installed', id: 'tab-installed', panelId: 'panel-installed' },
  { value: 'available', label: 'Available', id: 'tab-available', panelId: 'panel-available' },
  { value: 'market', label: 'Market', id: 'tab-market', panelId: 'panel-market' },
] as const

const NAMES: Record<Tab, string> = { installed: 'Installed', available: 'Available', market: 'Market' }

function mount(value: Tab, className?: string) {
  const onChange = vi.fn<(next: Tab) => void>()
  const view = render(
    <SegmentedTabs
      label="Plugin views"
      items={ITEMS}
      value={value}
      onChange={onChange}
      {...className === undefined ? {} : { className }}
    />,
  )
  return { view, onChange }
}

function tab(name: string): HTMLElement {
  return screen.getByRole('tab', { name })
}

describe('SegmentedTabs', () => {
  it('renders one tab per item with the owner-held selection and its panel wiring', () => {
    mount('available')
    const list = screen.getByRole('tablist', { name: 'Plugin views' })
    expect(list.querySelectorAll('[role="tab"]')).toHaveLength(3)
    expect(tab('Installed').getAttribute('aria-selected')).toBe('false')
    expect(tab('Available').getAttribute('aria-selected')).toBe('true')
    expect(tab('Available').id).toBe('tab-available')
    expect(tab('Available').getAttribute('aria-controls')).toBe('panel-available')
    // Only the selected tab is a tab stop.
    expect(tab('Available').tabIndex).toBe(0)
    expect(tab('Installed').tabIndex).toBe(-1)
  })

  it("keeps the caller's layout class on the tablist", () => {
    mount('installed', 'tabsRow')
    expect(screen.getByRole('tablist').className).toContain('tabsRow')
  })

  it('reports a clicked tab', () => {
    const { onChange } = mount('installed')
    fireEvent.click(tab('Market'))
    expect(onChange).toHaveBeenCalledWith('market')
  })

  it.each([
    ['ArrowRight', 'available'],
    ['ArrowLeft', 'market'],
    ['Home', 'installed'],
    ['End', 'market'],
  ] as const)('moves the selection and focus with %s', (key, expected) => {
    const { onChange } = mount('installed')
    fireEvent.keyDown(tab('Installed'), { key })
    expect(onChange).toHaveBeenCalledWith(expected)
    expect(document.activeElement).toBe(tab(NAMES[expected]))
  })

  it('leaves every other key to the browser', () => {
    const { onChange } = mount('installed')
    expect(fireEvent.keyDown(tab('Installed'), { key: 'a' })).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
  })
})
