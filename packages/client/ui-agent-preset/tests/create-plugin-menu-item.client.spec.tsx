// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ComponentProps } from 'react'
import { bindSnapshotSelector } from '@qilin/client-test-runtime'
import { createSnapshotStore } from '@qilin/client-store'
import { CreatePluginMenuItem } from '../src/client/CreatePluginMenuItem.tsx'
import type { AgentPresetSettingsState } from '../src/client/settings-store.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
const translations: ReadonlyMap<string, string> = new Map(Object.entries(en))

function view(roster: Partial<AgentPresetSettingsState> = {}) {
  const agentPresets = createSnapshotStore<AgentPresetSettingsState>({
    status: 'ready',
    error: null,
    options: [{ id: 'standard', trust: 'system' }, { id: 'cordis', trust: 'system' }],
    ...roster,
  })
  const calls: string[] = []
  const startCreatorDraft = vi.fn(() => { calls.push('start') })
  const onDismiss = vi.fn(() => { calls.push('dismiss') })
  const load = vi.fn(async () => {})
  render(<CreatePluginMenuItem {...({
    t: (key: keyof typeof en) => translations.get(key) ?? key,
    useAgentPresets: bindSnapshotSelector(agentPresets),
    load,
    onDismiss,
    startCreatorDraft,
  } as unknown as ComponentProps<typeof CreatePluginMenuItem>)} />)
  return { agentPresets, load, startCreatorDraft, onDismiss, calls }
}

function item(): HTMLElement {
  return screen.getByRole('menuitem', { name: new RegExp(en.createPlugin) })
}

describe('Create plugin menu item', () => {
  it('explains Creator and dismisses the menu before starting it exactly once', () => {
    const actions = view()
    expect(actions.load).toHaveBeenCalledOnce()
    expect(item().textContent).toContain(en.createPluginDescription)
    expect(actions.startCreatorDraft).not.toHaveBeenCalled()
    fireEvent.click(item())
    expect(actions.calls).toEqual(['dismiss', 'start'])
  })

  it.each(['idle', 'loading', 'error', 'unavailable'] as const)('keeps a disabled entry while the roster is %s', (status) => {
    const actions = view({ status })
    expect(item()).toHaveProperty('disabled', true)
    const description = status === 'idle' || status === 'loading' ? en.createPluginChecking : en.createPluginUnavailable
    expect(item().textContent).toContain(description)
    fireEvent.click(item())
    expect(actions.calls).toEqual([])
  })

  it('disables the same entry when Creator leaves the roster', () => {
    const actions = view()
    const original = item()
    act(() => { actions.agentPresets.set({ status: 'ready', error: null, options: [{ id: 'standard', trust: 'system' }] }) })
    expect(item()).toBe(original)
    expect(item()).toHaveProperty('disabled', true)
    expect(item().textContent).toContain(en.createPluginMissing)
    fireEvent.click(item())
    expect(actions.calls).toEqual([])
  })

  it('keeps one stable entry through ready, loading, and ready states', () => {
    const actions = view()
    const original = item()
    expect(original).toHaveProperty('disabled', false)

    act(() => { actions.agentPresets.set({ ...actions.agentPresets.getSnapshot(), status: 'loading' }) })
    expect(item()).toBe(original)
    expect(original).toHaveProperty('disabled', true)
    expect(original.textContent).toContain(en.createPluginChecking)
    fireEvent.click(original)
    expect(actions.calls).toEqual([])

    act(() => { actions.agentPresets.set({ ...actions.agentPresets.getSnapshot(), status: 'ready' }) })
    expect(item()).toBe(original)
    expect(original).toHaveProperty('disabled', false)
    expect(original.textContent).toContain(en.createPluginDescription)
    fireEvent.click(original)
    expect(actions.calls).toEqual(['dismiss', 'start'])
  })
})
