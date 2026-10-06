// @vitest-environment jsdom
/** The hero run-mode chip: tag-ordered choices, the remembered pick, and the
 * hiding rules (no roster, failed roster, fewer than two choices). */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { bindSnapshotSelector, makeTranslate } from '@qilin/client-test-runtime'
import { zh as commonZh } from '@qilin/client-locale/src/locales/zh.ts'
import type { WorkbenchState } from '@qilin/client-ui-workbench/client'
import type { AgentPresetChipProps, AgentPresetRosterState } from '../src/client/contract/slots.ts'
import { AgentPresetChip } from '../src/client/AgentPresetChip.tsx'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t: AgentPresetChipProps['t'] = makeTranslate(zh, commonZh)

const WORKBENCH: WorkbenchState = {
  active: 'general',
  presets: { general: 'standard', coding: 'ptc' },
}

const ROSTER: AgentPresetRosterState = {
  status: 'ready',
  presets: [
    { id: 'standard', name: '标准模式', description: '通用工作台默认' },
    { id: 'ptc', name: '编码模式' },
    { id: 'cordis', name: '创造模式', description: '让 Agent 帮你创作' },
    { id: 'custom', name: '我的预设' },
  ],
}

function hook<T>(snapshot: T) {
  return function select<S>(selector: (state: T) => S): S { return selector(snapshot) }
}

// The session-maybe standard kit the renderer merges into every hero occupant:
// the chip reads none of it, but the props type requires the faces.
const STANDARD = {
  sessionId: undefined,
  useSession: (() => undefined) as never,
  useProjection: (() => undefined) as never,
  useConversation: (() => undefined) as never,
  useInput: (() => undefined) as never,
  inputActions: undefined,
  useSessions: (() => undefined) as never,
  useSessionStatus: (() => undefined) as never,
  useSessionRetainInfo: (() => undefined) as never,
  usePanelInfo: (() => undefined) as never,
  useResource: (() => undefined) as never,
  useWorkspaces: (() => undefined) as never,
} as unknown as Pick<AgentPresetChipProps,
  | 'sessionId' | 'useSession' | 'useProjection' | 'useConversation' | 'useInput' | 'inputActions'
  | 'useSessions' | 'useSessionStatus' | 'useSessionRetainInfo' | 'usePanelInfo' | 'useResource' | 'useWorkspaces'
>

// The workbench owner's D2 vocabulary, as the registration injects it.
const TAG_CHOICES: AgentPresetChipProps['tagChoices'] = tag => tag === 'general'
  ? ['standard', 'cordis']
  : ['ptc', 'cordis']

function mount(
  workbench: WorkbenchState = WORKBENCH,
  roster: AgentPresetRosterState = ROSTER,
  pick = vi.fn(),
) {
  const view = render(
    <AgentPresetChip
      {...STANDARD}
      useWorkbench={hook(workbench)}
      useRoster={hook(roster)}
      tagChoices={TAG_CHOICES}
      pick={pick}
      t={t}
    />,
  )
  return {
    pick,
    rerender: (nextWorkbench: WorkbenchState, nextRoster: AgentPresetRosterState = roster) => {
      view.rerender(
        <AgentPresetChip
          {...STANDARD}
          useWorkbench={hook(nextWorkbench)}
          useRoster={hook(nextRoster)}
          tagChoices={TAG_CHOICES}
          pick={pick}
          t={t}
        />,
      )
    },
  }
}

/** Open the chip's menu through its trigger button. */
function openMenu(): void {
  fireEvent.click(screen.getByRole('button', { name: '运行模式' }))
}

describe('AgentPresetChip', () => {
  it('hides while the roster is loading, failed, or empty', () => {
    for (const roster of [
      { status: 'idle', presets: [] } as const,
      { status: 'failed', presets: [] } as const,
      { status: 'ready', presets: [] } as const,
    ]) {
      mount(WORKBENCH, roster)
      expect(screen.queryByRole('button', { name: '运行模式' })).toBeNull()
      cleanup()
    }
  })

  it('hides when the tag offers fewer than two choices', () => {
    // A coding tag with only the coding preset on the roster: nothing to pick.
    mount(
      { active: 'coding', presets: { general: 'standard', coding: 'ptc' } },
      { status: 'ready', presets: [{ id: 'ptc', name: '编码模式' }] },
    )
    expect(screen.queryByRole('button', { name: '运行模式' })).toBeNull()
  })

  it('labels itself with the tag’s remembered preset and lists the tag’s choices in tag order', () => {
    mount()
    const chip = screen.getByRole('button', { name: '运行模式' })
    expect(chip.textContent).toContain('标准模式')
    openMenu()
    const names = screen.getAllByRole('menuitem').map(item => item.textContent ?? '')
    // The general tag shows its shipped pair; the coding preset and the
    // custom copy stay out of this tag's menu.
    const shipped = names.find(name => name.includes('标准模式')) ?? ''
    const custom = names.find(name => name.includes('我的预设')) ?? ''
    expect(names.some(name => name.includes('标准模式'))).toBe(true)
    expect(names.some(name => name.includes('创造模式'))).toBe(true)
    expect(names.some(name => name.includes('编码模式'))).toBe(false)
    expect(names.some(name => name.includes('我的预设'))).toBe(true)
    expect(names.indexOf(shipped)).toBeLessThan(names.indexOf(custom))
  })

  it('follows the active tag: the coding tag opens on its own preset with its own choices', () => {
    mount(
      { active: 'coding', presets: { general: 'standard', coding: 'ptc' } },
    )
    expect(screen.getByRole('button', { name: '运行模式' }).textContent).toContain('编码模式')
    openMenu()
    const names = screen.getAllByRole('menuitem').map(item => item.textContent ?? '')
    expect(names.some(name => name.includes('编码模式'))).toBe(true)
    expect(names.some(name => name.includes('标准模式'))).toBe(false)
  })

  it('records a pick and closes the menu', () => {
    const b = mount()
    openMenu()
    const creator = screen.getAllByRole('menuitem').find(item => (item.textContent ?? '').includes('创造模式'))
    expect(creator).toBeDefined()
    fireEvent.click(creator!)
    expect(b.pick).toHaveBeenCalledExactlyOnceWith('cordis')
    expect(screen.queryByRole('menuitem')).toBeNull()
  })

  it('falls back to the preset id when the roster carries no display name', () => {
    mount(
      WORKBENCH,
      { status: 'ready', presets: [{ id: 'standard' }, { id: 'cordis' }] },
    )
    expect(screen.getByRole('button', { name: '运行模式' }).textContent).toContain('standard')
    openMenu()
    expect(screen.getAllByRole('menuitem').map(item => item.textContent)).toEqual(['standard', 'cordis'])
  })

  it('re-renders when the workbench store flips under a live subscription', () => {
    // A real HostObservable bound like the renderer would: the tag switch
    // flows through the subscription, not a remount.
    let state: WorkbenchState = WORKBENCH
    const listeners = new Set<() => void>()
    const useWorkbench = bindSnapshotSelector({
      getSnapshot: () => state,
      subscribe: (listener: () => void) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    })
    render(
      <AgentPresetChip
        {...STANDARD}
        useWorkbench={useWorkbench} useRoster={hook(ROSTER)} tagChoices={TAG_CHOICES} pick={vi.fn()} t={t}
      />,
    )
    expect(screen.getByRole('button', { name: '运行模式' }).textContent).toContain('标准模式')
    state = { active: 'coding', presets: { general: 'standard', coding: 'ptc' } }
    act(() => { for (const listener of [...listeners]) listener() })
    expect(screen.getByRole('button', { name: '运行模式' }).textContent).toContain('编码模式')
  })
})
