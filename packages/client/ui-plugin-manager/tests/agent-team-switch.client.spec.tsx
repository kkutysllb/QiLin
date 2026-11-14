// @vitest-environment jsdom
/** The Agent Teams header switch: the profile selection, its write, and what a refusal or restart says. */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import type { Context as ClientContext } from '@qilin-agent/kylin'
import { createSnapshotStore } from '@qilin-agent/client-store'
import { RemoteError, makeTranslate } from '@qilin-agent/client-test-runtime'
import { AgentTeamSwitch, type AgentTeamSwitchProps } from '../src/client/AgentTeamSwitch.tsx'
import {
  AGENT_TEAM_BUNDLE, AgentTeamSwitchController, type AgentTeamSwitchState,
} from '../src/client/agent-team-switch-store.ts'
import { en, zh } from '../src/client/locales.ts'

afterEach(() => { cleanup() })

/** One bundle row as `pluginManager.listBundles` reports it. */
function bundle(overrides: Partial<{ name: string; enabled: boolean }> = {}) {
  return { name: AGENT_TEAM_BUNDLE, version: '3.1.11', installed: true, enabled: true, official: true, optional: true, ...overrides }
}

/** A context whose bundle read and toggle outcome the test controls. */
function fakeCtx(options: {
  bundles?: () => Promise<unknown>
  toggle?: (enabled: boolean) => Promise<unknown>
} = {}): ClientContext {
  const ctx = new Context()
  Object.assign(ctx, {
    remote: {
      pluginManager: {
        listBundles: options.bundles ?? (() => Promise.resolve({ ok: true, value: [bundle()] })),
        setBundleEnabled: (name: string, enabled: boolean) => (options.toggle ?? (() => Promise.resolve({
          ok: true,
          value: { changed: true, application: 'applied', stage: 'enable', target: name, enabled },
        })))(enabled),
      },
    },
  })
  return ctx
}

const READY: AgentTeamSwitchState = { status: 'ready', enabled: true, busy: false, notice: null, detail: null }

function mount(state: AgentTeamSwitchState, dictionary: typeof en | typeof zh = en) {
  const toggle = vi.fn()
  const load = vi.fn(() => Promise.resolve())
  const store = createSnapshotStore<AgentTeamSwitchState>(state)
  const props = {
    useAgentTeamSwitch: <T,>(select: (value: AgentTeamSwitchState) => T): T => select(store.getSnapshot()),
    load,
    toggle,
    t: makeTranslate(dictionary),
  } as AgentTeamSwitchProps
  return { view: render(<AgentTeamSwitch {...props} />), toggle, load }
}

describe('the Agent Teams header switch', () => {
  it('reads the Host on mount and renders the current selection', () => {
    const { load } = mount(READY)
    expect(load).toHaveBeenCalledOnce()
    // The header shows what the switch turns on; the control carries the same name.
    expect(screen.getByText(en.agentTeamSwitch)).toBeTruthy()
    const toggle = screen.getByRole('switch', { name: en.agentTeamSwitch })
    expect(toggle.getAttribute('aria-checked')).toBe('true')
  })

  it('asks for the opposite selection and stays disabled while a write is in flight', () => {
    const { toggle } = mount(READY)
    fireEvent.click(screen.getByRole('switch', { name: en.agentTeamSwitch }))
    expect(toggle).toHaveBeenCalledWith(false)
    cleanup()
    mount({ ...READY, enabled: false, busy: true })
    expect(screen.getByRole('switch', { name: en.agentTeamSwitch })).toHaveProperty('disabled', true)
  })

  it('renders nothing before the first read and where the installation has no such bundle', () => {
    mount({ ...READY, status: 'idle' })
    expect(screen.queryByRole('switch')).toBeNull()
    cleanup()
    mount({ ...READY, status: 'unavailable' })
    expect(screen.queryByRole('switch')).toBeNull()
  })

  it('says why a restart is needed and what a refusal left in place', () => {
    mount({ ...READY, notice: 'restart-required' }, zh)
    expect(screen.getByRole('switch', { name: zh.agentTeamSwitch }).getAttribute('title')).toBe(zh.agentTeamSwitchRestart)
    cleanup()
    mount({ ...READY, notice: 'failed', detail: 'profile is read-only' })
    expect(screen.getByRole('switch', { name: en.agentTeamSwitch }).getAttribute('title')).toBe('profile is read-only')
    cleanup()
    mount({ ...READY, notice: 'failed', detail: null })
    expect(screen.getByRole('switch', { name: en.agentTeamSwitch }).getAttribute('title')).toBe(en.agentTeamSwitchFailed)
  })
})

describe('the Agent Teams switch controller', () => {
  it('reads the bundle selection and leaves the switch unavailable when it is absent', async () => {
    const controller = new AgentTeamSwitchController(fakeCtx())
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({ status: 'ready', enabled: true })

    const missing = new AgentTeamSwitchController(fakeCtx({ bundles: () => Promise.resolve({ ok: true, value: [bundle({ name: 'other' })] }) }))
    await missing.load()
    expect(missing.store.getSnapshot().status).toBe('unavailable')

    const refused = new AgentTeamSwitchController(fakeCtx({
      bundles: () => Promise.resolve({ ok: false, error: new RemoteError('gateway/internal', 'offline', {}) }),
    }))
    await refused.load()
    expect(refused.store.getSnapshot()).toMatchObject({ status: 'unavailable', detail: 'offline' })
  })

  it('writes the selection, then re-reads what the Host settled on', async () => {
    let enabled = true
    const ctx = fakeCtx({
      bundles: () => Promise.resolve({ ok: true, value: [bundle({ enabled })] }),
      toggle: (next) => {
        enabled = next
        return Promise.resolve({ ok: true, value: { changed: true, application: 'applied', stage: 'enable', target: AGENT_TEAM_BUNDLE, enabled: next } })
      },
    })
    const controller = new AgentTeamSwitchController(ctx)
    await controller.load()
    await controller.toggle(false)
    expect(controller.store.getSnapshot()).toMatchObject({ enabled: false, busy: false, notice: null })
  })

  it('records a restart-bound write and a refusal without losing the Host state', async () => {
    const restart = new AgentTeamSwitchController(fakeCtx({
      toggle: next => Promise.resolve({
        ok: true,
        value: { changed: true, application: 'restart-required', restartReason: 'no-hmr', stage: 'enable', target: AGENT_TEAM_BUNDLE, enabled: next },
      }),
    }))
    await restart.load()
    await restart.toggle(false)
    expect(restart.store.getSnapshot()).toMatchObject({ notice: 'restart-required', detail: 'no-hmr', enabled: true })

    const failed = new AgentTeamSwitchController(fakeCtx({
      bundles: () => Promise.resolve({ ok: true, value: [bundle({ enabled: true })] }),
      toggle: () => Promise.resolve({
        ok: true,
        value: { changed: false, application: 'failed', stage: 'enable', target: AGENT_TEAM_BUNDLE, error: { code: 'operation-error', diagnostic: 'profile is read-only' } },
      }),
    }))
    await failed.load()
    await failed.toggle(false)
    expect(failed.store.getSnapshot()).toMatchObject({ notice: 'failed', detail: 'profile is read-only', enabled: true })

    const refused = new AgentTeamSwitchController(fakeCtx({
      toggle: () => Promise.resolve({ ok: false, error: new RemoteError('gateway/internal', 'transport lost', {}) }),
    }))
    await refused.load()
    await refused.toggle(false)
    expect(refused.store.getSnapshot()).toMatchObject({ notice: 'failed', detail: 'transport lost', busy: false })
  })

  it('ignores a toggle before the first read and while another write is in flight', async () => {
    const gate = Promise.withResolvers<unknown>()
    const controller = new AgentTeamSwitchController(fakeCtx({ toggle: () => gate.promise }))
    await controller.toggle(true)
    expect(controller.store.getSnapshot().busy).toBe(false)

    await controller.load()
    const first = controller.toggle(false)
    expect(controller.store.getSnapshot().busy).toBe(true)
    await controller.toggle(true)
    gate.resolve({ ok: true, value: { changed: true, application: 'applied', stage: 'enable', target: AGENT_TEAM_BUNDLE } })
    await act(async () => { await first })
    expect(controller.store.getSnapshot().busy).toBe(false)
  })
})
