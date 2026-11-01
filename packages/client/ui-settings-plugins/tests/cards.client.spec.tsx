// @vitest-environment jsdom
/** Real configuration cards, rendered outside the page that used to host them. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { bindSnapshotSelector } from '@qilin-agent/client-test-runtime'
import { createSnapshotStore } from '@qilin-agent/client-store'
import type { SettingsFieldState, SettingsFormShell } from '@qilin-agent/client-ui-primitives'
import { AgentLoopCard } from '../src/client/AgentLoopCard.tsx'
import type { AgentLoopCardProps } from '../src/client/AgentLoopCard.tsx'
import type { AgentLoopCardState } from '../src/client/agent-loop-card-controller.ts'
import { BashCard } from '../src/client/BashCard.tsx'
import type { BashCardProps } from '../src/client/BashCard.tsx'
import type { BashCardState } from '../src/client/bash-card-controller.ts'
import { GitCard } from '../src/client/GitCard.tsx'
import type { GitCardProps } from '../src/client/GitCard.tsx'
import type { GitCardState } from '../src/client/git-card-controller.ts'
import { PluginConfigForm } from '../src/client/PluginConfigForm.tsx'
import { SubagentCard } from '../src/client/SubagentCard.tsx'
import type { SubagentCardProps } from '../src/client/SubagentCard.tsx'
import type { SubagentLimitsCardState } from '../src/client/subagent-limits-card-controller.ts'
import type { SubagentModelCandidate, SubagentModelSelectionCardState } from '../src/client/subagent-model-selection-card-controller.ts'
import { SubagentLimitsFields } from '../src/client/SubagentLimitsFields.tsx'
import { SubagentModelSelectionFields } from '../src/client/SubagentModelSelectionFields.tsx'
import { WebSearchCard } from '../src/client/WebSearchCard.tsx'
import type { WebSearchCardProps } from '../src/client/WebSearchCard.tsx'
import type { WebSearchCardState } from '../src/client/web-search-card-controller.ts'
import { en, zh } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

/** The package dictionary answers the card seats; unknown keys stand in as themselves. */
const t = ((key: string) => (en as Record<string, string>)[key] ?? key) as never

/** One staged field as the form state publishes it. */
function field(text: string, overrides: Partial<SettingsFieldState> = {}): SettingsFieldState {
  return { text, overridden: false, invalid: false, ...overrides }
}

/** The shared form shell with every control settled unless a case overrides it. */
function shell(overrides: Partial<SettingsFormShell> = {}): SettingsFormShell {
  return { available: true, writable: true, dirty: false, invalid: false, saving: false, failed: false, ...overrides }
}

/** Seats a plugins.item card may read but these components never touch. */
const unusedHook = (() => { throw new Error('unused by configuration cards') }) as never
const seats = {
  useSessions: unusedHook, useSessionStatus: unusedHook, usePanelInfo: unusedHook,
  useSessionRetainInfo: unusedHook, useResource: unusedHook, useRemoteAccess: unusedHook, useWorkspaces: unusedHook,
}

/** The write actions every card face carries. */
function actions() {
  return { edit: vi.fn(), resetField: vi.fn(), save: vi.fn(), discard: vi.fn() }
}

/** Type a value into one labeled control and read back the staged edit. */
function type(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } })
}

describe('PluginConfigForm', () => {
  const onSave = vi.fn(), onDiscard = vi.fn()
  afterEach(() => { vi.clearAllMocks() })

  it('reports an unavailable namespace instead of a form', () => {
    render(<PluginConfigForm t={t} state={shell({ available: false })} onSave={onSave} onDiscard={onDiscard}>
      <span>fields</span>
    </PluginConfigForm>)
    expect(screen.getByRole('status').textContent).toBe(en.unavailable)
    expect(screen.queryByRole('button', { name: en.save })).toBeNull()
  })

  it('marks a served namespace read-only', () => {
    render(<PluginConfigForm t={t} state={shell({ writable: false })} onSave={onSave} onDiscard={onDiscard}>
      <span>fields</span>
    </PluginConfigForm>)
    expect(screen.getByRole('status').textContent).toBe(en.readOnly)
    expect(screen.getByRole('button', { name: en.save }).hasAttribute('disabled')).toBe(true)
  })

  it('blocks save without a draft or with an invalid one, and reports a failed save', () => {
    const { rerender } = render(
      <PluginConfigForm t={t} state={shell()} onSave={onSave} onDiscard={onDiscard}><span>fields</span></PluginConfigForm>,
    )
    expect(screen.getByRole('button', { name: en.save }).hasAttribute('disabled')).toBe(true)
    rerender(<PluginConfigForm t={t} state={shell({ dirty: true, invalid: true })} onSave={onSave}
      onDiscard={onDiscard}><span>fields</span></PluginConfigForm>)
    expect(screen.getByRole('button', { name: en.save }).hasAttribute('disabled')).toBe(true)
    rerender(<PluginConfigForm t={t} state={shell({ dirty: true, failed: true })} onSave={onSave}
      onDiscard={onDiscard}><span>fields</span></PluginConfigForm>)
    expect(screen.getByRole('status').textContent).toBe(en.saveFailed)
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(onSave).toHaveBeenCalledOnce()
  })

  it('saves a staged draft, shows saving, and discards on unmount', () => {
    const save = vi.fn(), discard = vi.fn()
    const { unmount, rerender } = render(
      <PluginConfigForm t={t} state={shell({ dirty: true })} onSave={save} onDiscard={discard}><span>fields</span></PluginConfigForm>,
    )
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(save).toHaveBeenCalledOnce()
    rerender(
      <PluginConfigForm t={t} state={shell({ dirty: true, saving: true })} onSave={save}
        onDiscard={discard}><span>fields</span></PluginConfigForm>,
    )
    expect(screen.getByRole('button', { name: en.saving }).hasAttribute('disabled')).toBe(true)
    unmount()
    expect(discard).toHaveBeenCalledOnce()
  })
})

describe('BashCard', () => {
  function state(overrides: Partial<BashCardState> = {}): BashCardState {
    return {
      ...shell({ dirty: true }),
      timeoutMs: field('12000', { overridden: true }),
      maxOutputBytes: field('64000', { overridden: true }),
      ...overrides,
    }
  }

  function mount(overrides: Partial<BashCardState> = {}, view: 'summary' | 'page' = 'page') {
    const face = actions()
    const store = createSnapshotStore(state(overrides))
    const props = { view, t, ...face, useBashCard: bindSnapshotSelector(store), ...seats } as unknown as BashCardProps
    return { ...render(<BashCard {...props} />), face, props, store }
  }

  it('summarises the page', () => {
    mount({}, 'summary')
    expect(screen.getByText(en.bashDescription)).toBeTruthy()
  })

  it('renders both limits and stages their edits and resets', () => {
    const { face } = mount()
    type(en.bashTimeoutMs, '9000')
    expect(face.edit).toHaveBeenCalledWith('timeoutMs', '9000')
    type(en.bashMaxOutputBytes, '1024')
    expect(face.edit).toHaveBeenCalledWith('maxOutputBytes', '1024')
    for (const button of screen.getAllByRole('button', { name: en.reset })) fireEvent.click(button)
    expect(face.resetField).toHaveBeenCalledWith('timeoutMs')
    expect(face.resetField).toHaveBeenCalledWith('maxOutputBytes')
  })
})

describe('GitCard', () => {
  function state(overrides: Partial<GitCardState> = {}): GitCardState {
    return {
      ...shell({ dirty: true }),
      gitBin: field('/usr/bin/git', { overridden: true }), ghBin: field('', { overridden: true }),
      timeoutMs: field('60000', { overridden: true }), discoveryTimeoutMs: field('12000', { overridden: true }),
      ghTimeoutMs: field('30000', { overridden: true }), maxDiffBytes: field('1000000', { overridden: true }),
      maxStderrChars: field('4000', { overridden: true }), maxListEntries: field('1000', { overridden: true }), ...overrides,
    }
  }

  function mount(overrides: Partial<GitCardState> = {}, view: 'summary' | 'page' = 'page') {
    const face = actions()
    const store = createSnapshotStore(state(overrides))
    const props = { view, t, ...face, useGitCard: bindSnapshotSelector(store), ...seats } as unknown as GitCardProps
    return { ...render(<GitCard {...props} />), face }
  }

  it('summarises the page', () => {
    mount({}, 'summary')
    expect(screen.getByText(en.gitDescription)).toBeTruthy()
  })

  it('renders every binary and limit field and stages theirs edits', () => {
    const { face } = mount()
    for (const [label, name] of [
      [en.gitBin, 'gitBin'], [en.ghBin, 'ghBin'], [en.gitTimeoutMs, 'timeoutMs'],
      [en.gitDiscoveryTimeoutMs, 'discoveryTimeoutMs'], [en.ghTimeoutMs, 'ghTimeoutMs'],
      [en.gitMaxDiffBytes, 'maxDiffBytes'], [en.gitMaxStderrChars, 'maxStderrChars'],
      [en.gitMaxListEntries, 'maxListEntries'],
    ] as const) {
      type(label, '1')
      expect(face.edit).toHaveBeenCalledWith(name, '1')
    }
    for (const button of screen.getAllByRole('button', { name: en.reset })) fireEvent.click(button)
    expect(face.resetField).toHaveBeenCalled()
  })
})

describe('AgentLoopCard', () => {
  function mount(view: 'summary' | 'page', overrides: Partial<AgentLoopCardState> = {}) {
    const face = actions()
    const store = createSnapshotStore({ ...shell({ dirty: true }), maxParallelToolCalls: field('4', { overridden: true }), ...overrides })
    const props = { view, t, ...face, useAgentLoopCard: bindSnapshotSelector(store), ...seats } as unknown as AgentLoopCardProps
    return { ...render(<AgentLoopCard {...props} />), face }
  }

  it('summarises the page', () => {
    mount('summary')
    expect(screen.getByText(en.agentLoopDescription)).toBeTruthy()
  })

  it('stages the parallelism cap', () => {
    const { face } = mount('page')
    type(en.agentLoopMaxParallel, '8')
    expect(face.edit).toHaveBeenCalledWith('maxParallelToolCalls', '8')
    fireEvent.click(screen.getByRole('button', { name: en.reset }))
    expect(face.resetField).toHaveBeenCalledWith('maxParallelToolCalls')
  })
})

describe('WebSearchCard', () => {
  function state(overrides: Partial<WebSearchCardState> = {}): WebSearchCardState {
    return {
      ...shell({ dirty: true }),
      apiSwitchAvailable: true, apiSwitchBlocked: false, useSearchApi: false,
      baseURL: field('https://example.test', { overridden: true }), maxUses: field('5', { overridden: true }),
      count: field('10', { overridden: true }),
      apiKey: field(''), apiKeyConfigured: false, apiKeyWritable: true, ...overrides,
    }
  }

  function mount(overrides: Partial<WebSearchCardState> = {}, view: 'summary' | 'page' = 'page') {
    const face = { ...actions(), setSearchApi: vi.fn() }
    const store = createSnapshotStore(state(overrides))
    const props = { view, t, ...face, useWebSearchCard: bindSnapshotSelector(store), ...seats } as unknown as WebSearchCardProps
    return { ...render(<WebSearchCard {...props} />), face }
  }

  it('summarises the page', () => {
    mount({}, 'summary')
    expect(screen.getByText(en.webSearchDescription)).toBeTruthy()
  })

  it('stages the key, endpoint, and Messages uses while the API switch is off', () => {
    const { face } = mount()
    fireEvent.click(screen.getByRole('switch', { name: en.webSearchUseApi }))
    expect(face.setSearchApi).toHaveBeenCalledWith(true)
    type(en.webSearchApiKey, 'sk-test')
    expect(face.edit).toHaveBeenCalledWith('apiKey', 'sk-test')
    type(en.webSearchBaseUrl, 'https://cfg.test')
    expect(face.edit).toHaveBeenCalledWith('baseURL', 'https://cfg.test')
    type(en.webSearchMaxUses, '3')
    expect(face.edit).toHaveBeenCalledWith('maxUses', '3')
    for (const button of screen.getAllByRole('button', { name: en.reset })) fireEvent.click(button)
    expect(face.resetField).toHaveBeenCalledWith('baseURL')
    expect(face.resetField).toHaveBeenCalledWith('maxUses')
  })

  it('edits the Search API endpoint and result count when the switch is on', () => {
    const { face } = mount({ useSearchApi: true, apiKeyConfigured: true, apiKeyWritable: false })
    type(en.webSearchSearchApiBaseUrl, 'https://api.test')
    expect(face.edit).toHaveBeenCalledWith('baseURL', 'https://api.test')
    type(en.webSearchCount, '20')
    expect(face.edit).toHaveBeenCalledWith('count', '20')
    for (const button of screen.getAllByRole('button', { name: en.reset })) fireEvent.click(button)
    expect(face.resetField).toHaveBeenCalledWith('baseURL')
    expect(face.resetField).toHaveBeenCalledWith('count')
  })

  it('keeps the endpoint and count fields off a deployment without the API selection', () => {
    mount({ apiSwitchAvailable: false })
    expect(screen.queryByRole('switch', { name: en.webSearchUseApi })).toBeNull()
    expect(screen.getByLabelText(en.webSearchBaseUrl)).toBeTruthy()
  })
})

describe('SubagentCard', () => {
  function limits(overrides: Partial<SubagentLimitsCardState> = {}): SubagentLimitsCardState {
    return { ...shell(), maxDepth: field('1'), maxActiveSubagents: field('8'), ...overrides }
  }

  function models(overrides: Partial<SubagentModelSelectionCardState> = {}): SubagentModelSelectionCardState {
    return {
      ...shell(), enabled: false, candidates: [], catalogStatus: 'ready', catalogPartial: false, conflicted: false, ...overrides,
    }
  }

  function mount(limitState = limits(), modelState = models(), view: 'summary' | 'page' = 'page') {
    const face = {
      ...actions(), editLimit: vi.fn(), resetLimit: vi.fn(), toggleEnabled: vi.fn(), toggleModel: vi.fn(),
      selectDefaultRoute: vi.fn(), retryCatalog: vi.fn(),
    }
    const props = {
      view, t, ...face, ...seats,
      useSubagentLimitsCard: bindSnapshotSelector(createSnapshotStore(limitState)),
      useSubagentModelSelectionCard: bindSnapshotSelector(createSnapshotStore(modelState)),
    } as unknown as SubagentCardProps
    return { ...render(<SubagentCard {...props} />), face }
  }

  it('summarises the page', () => {
    mount(limits(), models(), 'summary')
    expect(screen.getByText(en.subagentDescription)).toBeTruthy()
  })

  it('renders both sections and their own actions', () => {
    const { face } = mount(limits({ dirty: true }), models({ dirty: true }))
    expect(screen.getByText(en.subagentLimitsTitle)).toBeTruthy()
    expect(screen.getByText(en.subagentModelSelectionTitle)).toBeTruthy()
    type(en.subagentMaxDepth, '2')
    expect(face.editLimit).toHaveBeenCalledWith('maxDepth', '2')
    fireEvent.click(screen.getByRole('switch', { name: en.subagentModelSelectionToggle }))
    expect(face.toggleEnabled).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: en.save }))
    expect(face.save).toHaveBeenCalledOnce()
  })

  it('drops a section the Host does not serve', () => {
    mount(limits({ available: false }), models({ available: false }))
    expect(screen.queryByText(en.subagentLimitsTitle)).toBeNull()
    expect(screen.queryByText(en.subagentModelSelectionTitle)).toBeNull()
  })

  it('stages the default model from the authorized routes', () => {
    const authorized: SubagentModelCandidate = {
      key: 'alpha:fast', provider: 'alpha', model: 'fast', providerName: 'Alpha', modelName: 'Fast',
      available: true, selected: true,
    }
    const { face } = mount(limits(), models({ enabled: true, dirty: true, candidates: [authorized] }))

    fireEvent.change(screen.getByLabelText(en.subagentModelSelectionDefaultLabel), {
      target: { value: authorized.key },
    })

    expect(face.selectDefaultRoute).toHaveBeenCalledWith(authorized.key)
  })
})

describe('SubagentLimitsFields', () => {
  it('stages both limits and their resets, and explains the depth rule', () => {
    const edit = vi.fn(), resetField = vi.fn()
    render(<SubagentLimitsFields t={t} state={{ ...shell(), maxDepth: field('1', { overridden: true }), maxActiveSubagents: field('8', { overridden: true }) }} edit={edit} resetField={resetField} />)
    type(en.subagentMaxDepth, '2')
    expect(edit).toHaveBeenCalledWith('maxDepth', '2')
    type(en.subagentMaxActive, '12')
    expect(edit).toHaveBeenCalledWith('maxActiveSubagents', '12')
    fireEvent.click(screen.getByRole('button', { name: en.subagentDepthHelpLabel }))
    expect(screen.getByText(en.subagentDepthOverride)).toBeTruthy()
    for (const button of screen.getAllByRole('button', { name: en.reset })) fireEvent.click(button)
    expect(resetField).toHaveBeenCalledWith('maxDepth')
    expect(resetField).toHaveBeenCalledWith('maxActiveSubagents')
  })
})

describe('SubagentModelSelectionFields', () => {
  const candidate: SubagentModelCandidate = {
    key: 'deepseek-official\0deepseek-v4-flash', provider: 'deepseek-official', model: 'deepseek-v4-flash',
    providerName: 'DeepSeek', modelName: 'DeepSeek-V4-Flash', available: true, selected: false,
  }
  const unavailable: SubagentModelCandidate = {
    ...candidate, key: 'gone\0route', provider: 'gone', providerName: 'Gone', modelName: 'Retired', available: false,
  }

  function state(overrides: Partial<SubagentModelSelectionCardState> = {}): SubagentModelSelectionCardState {
    return { ...shell(), enabled: true, candidates: [candidate], catalogStatus: 'ready', catalogPartial: false, conflicted: false, ...overrides }
  }

  function mount(overrides: Partial<SubagentModelSelectionCardState> = {}) {
    const toggleEnabled = vi.fn(), toggleModel = vi.fn(), retryCatalog = vi.fn(), selectDefaultRoute = vi.fn()
    render(<SubagentModelSelectionFields t={t} state={state(overrides)}
      toggleEnabled={toggleEnabled} toggleModel={toggleModel} selectDefaultRoute={selectDefaultRoute}
      retryCatalog={retryCatalog} />)
    return { toggleEnabled, toggleModel, retryCatalog, selectDefaultRoute }
  }

  it('stages the permission switch and each candidate row', () => {
    const second: SubagentModelCandidate = { ...candidate, key: 'deepseek-official\\0deepseek-v4-pro', modelName: 'DeepSeek-V4-Pro' }
    const { toggleEnabled, toggleModel } = mount({ candidates: [candidate, second, unavailable] })
    fireEvent.click(screen.getByRole('switch', { name: en.subagentModelSelectionToggle }))
    expect(toggleEnabled).toHaveBeenCalledOnce()
    const group = screen.getByRole('group', { name: en.subagentModelSelectionAllowed })
    fireEvent.click(within(group).getAllByRole('checkbox')[0] as HTMLElement)
    expect(toggleModel).toHaveBeenCalledWith(candidate.key)
    expect(screen.getByText(en.subagentModelSelectionUnavailable)).toBeTruthy()
    expect(screen.getByText(en.subagentModelSelectionUnavailableGroup)).toBeTruthy()
  })

  it('explains an off permission, an empty ready catalog, and a conflicted draft', () => {
    mount({ enabled: false })
    expect(screen.getByText(en.subagentModelSelectionOff)).toBeTruthy()
    mount({ candidates: [] })
    expect(screen.getByText(en.subagentModelSelectionEmpty)).toBeTruthy()
    mount({ conflicted: true })
    expect(screen.getByRole('status').textContent).toBe(en.subagentModelSelectionConflict)
  })

  it('reports loading, partial, retryable, and invalid states', () => {
    mount({ candidates: [], catalogStatus: 'loading' })
    expect(screen.getByRole('status').textContent).toBe(en.subagentModelSelectionLoading)
    mount({ catalogStatus: 'ready', catalogPartial: true, invalid: true })
    expect(screen.getByText(en.subagentModelSelectionPartial)).toBeTruthy()
    expect(screen.getByText(en.subagentModelSelectionRequired)).toBeTruthy()
    const { retryCatalog } = mount({ candidates: [], catalogStatus: 'error' })
    fireEvent.click(screen.getByRole('button', { name: en.subagentModelSelectionRetry }))
    expect(retryCatalog).toHaveBeenCalledOnce()
    expect(screen.getByRole('alert').textContent).toContain(en.subagentModelSelectionLoadFailed)
  })

  it('offers the authorized routes as the default model and stages its clearing', () => {
    const authorized: SubagentModelCandidate = { ...candidate, key: 'alpha:fast', selected: true }
    const other: SubagentModelCandidate = { ...authorized, key: 'beta:pro', provider: 'beta', modelName: 'Pro' }
    const retired: SubagentModelCandidate = { ...authorized, key: 'gone:route', available: false }
    const { selectDefaultRoute } = mount({ candidates: [authorized, other, retired], defaultRouteKey: authorized.key })
    const select = screen.getByLabelText(en.subagentModelSelectionDefaultLabel) as HTMLSelectElement

    expect(select.value).toBe(authorized.key)
    expect(within(select).getAllByRole('option').map(option => option.textContent)).toEqual([
      en.subagentModelSelectionDefaultNone,
      `${authorized.modelName} · ${authorized.providerName}`,
      `${other.modelName} · ${other.providerName}`,
      `${retired.modelName} · ${retired.providerName}`,
    ])
    expect(screen.getByText(en.subagentModelSelectionDefaultHint)).toBeTruthy()

    fireEvent.change(select, { target: { value: '' } })
    expect(selectDefaultRoute).toHaveBeenCalledWith(undefined)
    fireEvent.change(select, { target: { value: other.key } })
    expect(selectDefaultRoute).toHaveBeenCalledWith(other.key)
  })

  it('disables the default control until a route is authorized', () => {
    mount({ candidates: [{ ...candidate, selected: false }] })

    const select = screen.getByLabelText(en.subagentModelSelectionDefaultLabel) as HTMLSelectElement
    expect(select.disabled).toBe(true)
    expect(within(select).getAllByRole('option')).toHaveLength(1)
  })

  it('disables the default control while a save is running', () => {
    mount({ candidates: [candidate], saving: true })

    expect((screen.getByLabelText(en.subagentModelSelectionDefaultLabel) as HTMLSelectElement).disabled).toBe(true)
  })
})

describe('plugins settings locale', () => {
  it('carries every key in both languages', () => {
    expect(Object.keys(zh).sort()).toEqual(Object.keys(en).sort())
    for (const [key, copy] of Object.entries(en)) expect(copy, key).not.toBe('')
    for (const [key, copy] of Object.entries(zh)) expect(copy, key).not.toBe('')
  })
})
