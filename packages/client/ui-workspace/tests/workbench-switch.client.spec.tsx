// @vitest-environment jsdom
/** The mutual-hide workbench switch: pill on the active tag, icon-only on the other. */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { WorkbenchSwitch } from '../src/client/rows/WorkbenchSwitch.tsx'

afterEach(cleanup)

const LABELS = { general: '通用', coding: '编码' }

function mount(value: 'general' | 'coding', onChange = vi.fn()) {
  render(
    <WorkbenchSwitch
      value={value}
      onChange={onChange}
      labels={LABELS}
      ariaLabel="切换工作台"
      panelId="workbench-list-panel"
    />,
  )
  return onChange
}

describe('WorkbenchSwitch', () => {
  it('renders both tags in the constant order coding then general', () => {
    const { container } = render(
      <WorkbenchSwitch value="general" onChange={() => {}} labels={LABELS} ariaLabel="切换工作台" panelId="p" />,
    )
    const tabs = [...container.querySelectorAll('[role="tab"]')] as HTMLElement[]
    expect(tabs.map(tab => tab.id)).toEqual(['workbench-tab-coding', 'workbench-tab-general'])
  })

  it('shows the label only on the active tag and names both for assistive tech', () => {
    render(<WorkbenchSwitch value="coding" onChange={() => {}} labels={LABELS} ariaLabel="切换工作台" panelId="p" />)
    const coding = screen.getByRole('tab', { name: '编码' })
    const general = screen.getByRole('tab', { name: '通用' })
    expect(coding.textContent).toBe('编码')
    expect(general.textContent).toBe('')
    expect(coding.getAttribute('aria-selected')).toBe('true')
    expect(general.getAttribute('aria-selected')).toBe('false')
  })

  it('moves the tab stop with the selection and points both tabs at the panel', () => {
    render(<WorkbenchSwitch value="general" onChange={() => {}} labels={LABELS} ariaLabel="切换工作台" panelId="workbench-list-panel" />)
    for (const tab of screen.getAllByRole('tab')) {
      expect(tab.getAttribute('aria-controls')).toBe('workbench-list-panel')
      expect(tab.getAttribute('tabindex')).toBe(tab.getAttribute('aria-selected') === 'true' ? '0' : '-1')
    }
  })

  it('switches on click', () => {
    const onChange = mount('general')
    fireEvent.click(screen.getByRole('tab', { name: '编码' }))
    expect(onChange).toHaveBeenCalledWith('coding')
  })

  it('switches with Arrow keys from either tag and prevents scrolling', () => {
    const onChange = mount('general')
    const general = screen.getByRole('tab', { name: '通用' })
    const coding = screen.getByRole('tab', { name: '编码' })
    for (const [tab, key, expected] of [
      [general, 'ArrowLeft', 'coding'],
      [general, 'ArrowRight', 'coding'],
      [coding, 'ArrowRight', 'general'],
    ] as const) {
      onChange.mockClear()
      fireEvent.keyDown(tab, { key })
      expect(onChange).toHaveBeenCalledWith(expected)
    }
  })

  it('focuses the next tag on ArrowRight (roving tab stop)', () => {
    mount('general')
    const coding = screen.getByRole('tab', { name: '编码' })
    fireEvent.keyDown(screen.getByRole('tab', { name: '通用' }), { key: 'ArrowRight' })
    expect(document.activeElement).toBe(coding)
  })
})
