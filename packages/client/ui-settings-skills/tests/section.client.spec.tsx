// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SkillEntry } from '@qilin/api-remotes/client'
import type { SessionId } from '@qilin/session/types'
import { SkillsSection } from '../src/client/SkillsSection.tsx'
import type { SkillsSectionInjected, SkillsSectionProps } from '../src/client/SkillsSection.tsx'
import type { SkillsPageState } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'

afterEach(cleanup)

const t: SkillsSectionInjected['t'] = key => zh[key]

/** One catalog row the page renders. */
function skill(overrides: Partial<SkillEntry> = {}): SkillEntry {
  return {
    name: 'qilin-fixture',
    description: '一个 fixture 技能',
    modelInvocable: true,
    source: 'project-agents',
    provider: 'filesystem',
    ...overrides,
  }
}

function pageState(overrides: Partial<SkillsPageState> = {}): SkillsPageState {
  return { status: 'ready', error: null, sessionId: 'session-1' as SessionId, skills: [], ...overrides }
}

function bench(
  current: SkillsPageState,
  // null (not undefined) selects the no-Session case: an explicit undefined
  // would take the default parameter instead.
  session: SessionId | null = 'session-1' as SessionId,
) {
  const controller = { load: vi.fn(async () => true) }
  const props = {
    close: () => {},
    controller,
    useSnapshot: <Selected,>(select: (snapshot: SkillsPageState) => Selected): Selected => select(current),
    useSelection: <Selected,>(select: (selection: { sessionId?: SessionId }) => Selected): Selected =>
      select(session === null ? {} : { sessionId: session }),
    t,
  } as unknown as SkillsSectionProps
  render(<SkillsSection {...props} />)
  return { controller }
}

describe('SkillsSection', () => {
  it('groups the catalog by discovery source', () => {
    bench(pageState({
      skills: [
        skill({ name: 'plugin-skill', source: 'runtime' }),
        skill({ name: 'project-skill', source: 'project-qilin' }),
        skill({ name: 'user-skill', source: 'user-qilin' }),
        skill({ name: 'elsewhere-skill', source: 'somewhere-else' }),
      ],
    }))
    expect(screen.getByRole('heading', { name: '插件提供' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '工作区' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '用户目录' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '自定义根目录' })).toBeTruthy()
    for (const name of ['plugin-skill', 'project-skill', 'user-skill', 'elsewhere-skill']) {
      expect(screen.getByText(name)).toBeTruthy()
    }
  })

  it('shows the discovery source and the owning provider of each skill', () => {
    bench(pageState({
      skills: [skill({ name: 'located', source: 'user-qilin', provider: 'filesystem' })],
    }))
    expect(screen.getByText('user-qilin · filesystem')).toBeTruthy()
  })

  it('states how each skill may be invoked', () => {
    bench(pageState({
      skills: [
        skill({ name: 'both', modelInvocable: true }),
        skill({ name: 'user-only', modelInvocable: false, source: 'runtime' }),
      ],
    }))
    expect(screen.getByText('模型与用户')).toBeTruthy()
    expect(screen.getByText('仅用户可调用')).toBeTruthy()
  })

  it('reads the catalog of the current Session on mount', async () => {
    const { controller } = bench(pageState({ skills: [skill()] }))
    await waitFor(() => { expect(controller.load).toHaveBeenCalledWith('session-1') })
  })

  it('asks for no catalog while no Session is open, and says so', async () => {
    bench(pageState({ sessionId: null }), null)
    await waitFor(() => { expect(screen.getByText(zh.noSession)).toBeTruthy() })
    expect(screen.getByRole('button', { name: zh.refresh }).hasAttribute('disabled')).toBe(true)
  })

  it('shows the optional routing guidance of a skill', () => {
    bench(pageState({ skills: [skill({ whenToUse: '当你需要检索时' })] }))
    expect(screen.getByText('当你需要检索时')).toBeTruthy()
  })

  it('reports a composition that resolves no skill', () => {
    bench(pageState({ skills: [] }))
    expect(screen.getByText(zh.empty)).toBeTruthy()
  })

  it('surfaces a failed read with its Host message', () => {
    bench(pageState({ error: 'gateway/internal: the catalog is unreadable' }))
    expect(screen.getByRole('alert').textContent).toContain(zh.errorTitle)
    expect(screen.getByRole('alert').textContent).toContain('the catalog is unreadable')
  })

  it('refreshes through the store', () => {
    const { controller } = bench(pageState({ skills: [skill()] }))
    controller.load.mockClear()
    fireEvent.click(screen.getByRole('button', { name: zh.refresh }))
    expect(controller.load).toHaveBeenCalledWith('session-1')
  })

  it('labels an in-flight refresh', () => {
    bench(pageState({ status: 'loading', skills: [skill()] }))
    expect(screen.getByRole('button', { name: zh.refreshing })).toBeTruthy()
  })
})
