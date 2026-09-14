// @vitest-environment jsdom
/**
 * The Sidebar's settings page: one switch per registered tab type.
 *
 * The page is a view of the registry, so it is asserted as a user meets it — a
 * row named after the type rather than after any open tab, a glyph where the
 * type brought one, a switch that reports the turn it was given — and it
 * follows the registry when that list changes under it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createSnapshotStore } from '@qilin/client-store'
import { bindSnapshotSelector } from '@qilin/client-test-runtime'
import type { IconProps } from '@qilin/client-ui-primitives'
import type { SidebarRightTabDefinition } from '../src/client/tab-registry.ts'
import { TabSettingsSection } from '../src/client/tabs/settings/TabSettingsSection.tsx'
import type { TabSettingsSectionProps } from '../src/client/tabs/settings/TabSettingsSection.tsx'

afterEach(cleanup)

/** A glyph that marks its box, so a spec can tell a row with an icon from one without. */
function Glyph({ size }: IconProps): ReactNode {
  return <span data-settings-glyph={size} />
}

/** Two types: a page that brought a glyph, and one that did not. */
const TYPES: readonly SidebarRightTabDefinition[] = [
  { id: 'pkg/files', kind: 'files', label: () => 'Files', icon: Glyph, title: () => 'Files' },
  { id: 'pkg/text', kind: 'text', label: () => 'Text', title: () => 'Text' },
]

/**
 * Mount the section over a real observable of registered types, with the
 * switches' own store standing in for the registry behind them.
 */
function mountSection(types: readonly SidebarRightTabDefinition[] = TYPES, switchedOff: readonly string[] = []) {
  const tabTypes = createSnapshotStore<readonly SidebarRightTabDefinition[]>(types)
  const enabled = new Map(types.map(type => [type.id, !switchedOff.includes(type.id)]))
  const setEnabled = vi.fn((id: string, next: boolean) => { enabled.set(id, next) })
  const props = {
    useTabTypes: bindSnapshotSelector(tabTypes),
    setEnabled,
    isEnabled: (id: string) => enabled.get(id) ?? true,
    // Copy is the dictionary's contract; the key stands in for the translation.
    t: (key: string) => key,
  } as unknown as TabSettingsSectionProps
  const view = render(<TabSettingsSection {...props} />)
  const rows = (): HTMLElement[] =>
    [...view.container.querySelectorAll<HTMLElement>('[data-sidebar-right-settings-row]')]
  const row = (kind: string): HTMLElement => {
    const found = view.container.querySelector<HTMLElement>(`[data-sidebar-right-settings-row="${kind}"]`)
    if (found === null) throw new Error(`expected a settings row for ${kind}`)
    return found
  }
  const switchOf = (kind: string): HTMLElement => {
    const control = row(kind).querySelector<HTMLElement>('[role="switch"]')
    if (control === null) throw new Error(`expected a switch in the ${kind} row`)
    return control
  }
  return { view, tabTypes, setEnabled, enabled, rows, row, switchOf }
}

describe('TabSettingsSection', () => {
  it('draws one row per registered type, named after the type itself', () => {
    const { rows, switchOf } = mountSection()
    expect(rows().map(element => element.getAttribute('data-sidebar-right-settings-row'))).toEqual(['files', 'text'])
    expect(rows().map(element => element.textContent)).toEqual(['Files', 'Text'])
    // The accessible name is the type's own name, not the title of any open tab.
    expect(switchOf('files').getAttribute('aria-label')).toBe('Files')
    expect(switchOf('text').getAttribute('aria-label')).toBe('Text')
  })

  it('draws a type\'s glyph where it brought one, and nothing where it did not', () => {
    const { row } = mountSection()
    expect(row('files').querySelector('[data-settings-glyph]')?.getAttribute('data-settings-glyph')).toBe('16')
    expect(row('text').querySelector('[data-settings-glyph]')).toBeNull()
  })

  it('shows each switch in the state the registry reports and asks for the opposite turn', () => {
    const { setEnabled, switchOf } = mountSection(TYPES, ['pkg/text'])
    expect(switchOf('files').getAttribute('aria-checked')).toBe('true')
    expect(switchOf('text').getAttribute('aria-checked')).toBe('false')

    fireEvent.click(switchOf('files'))
    expect(setEnabled).toHaveBeenCalledExactlyOnceWith('pkg/files', false)
    fireEvent.click(switchOf('text'))
    expect(setEnabled).toHaveBeenLastCalledWith('pkg/text', true)
    expect(setEnabled).toHaveBeenCalledTimes(2)
  })

  it('follows the registry: a type registering later gains a row, one that leaves loses it', () => {
    const { tabTypes, rows, row, switchOf } = mountSection()
    act(() => {
      tabTypes.set([...TYPES, { id: 'pkg/terminal', kind: 'terminal', label: () => 'Terminal', title: () => 'Terminal' }])
    })
    expect(rows().map(element => element.getAttribute('data-sidebar-right-settings-row'))).toEqual(['files', 'text', 'terminal'])
    expect(switchOf('terminal').getAttribute('aria-label')).toBe('Terminal')

    act(() => { tabTypes.set([{ id: 'pkg/text', kind: 'text', label: () => 'Text', title: () => 'Text' }]) })
    expect(rows().map(element => element.getAttribute('data-sidebar-right-settings-row'))).toEqual(['text'])
    expect(row('text').textContent).toBe('Text')
  })

  it('reads each switch from the registry rather than assuming the turn landed', () => {
    const { tabTypes, setEnabled, enabled, switchOf } = mountSection()
    expect(enabled.get('pkg/files')).toBe(true)
    fireEvent.click(switchOf('files'))
    expect(setEnabled).toHaveBeenCalledExactlyOnceWith('pkg/files', false)
    // The switch owns nothing: it still draws what the registry last answered.
    expect(switchOf('files').getAttribute('aria-checked')).toBe('true')
    // The next registry commit is what moves it.
    act(() => { tabTypes.set([...TYPES]) })
    expect(switchOf('files').getAttribute('aria-checked')).toBe('false')
  })
})
