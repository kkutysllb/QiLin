/** The workbench-audience presentation gate: what it admits, and when it republishes. */
import { describe, expect, it, vi } from 'vitest'
import { createSnapshotStore, type SnapshotStore } from '@qilin/client-store'
import { audienceAdmits, installAudienceGate } from '../src/client/admission.ts'
import type { SlotAdmissionGate } from '@qilin/client-ui-renderer/client'
import type { PackageView, PluginManagerState } from '../src/client/manager-store.ts'

const pkg = (overrides: Partial<PackageView> = {}): PackageView => ({
  name: 'qilin-coded', installed: true, optional: false, audience: 'both', enabled: true, updatable: false, rows: [],
  ...overrides,
})

const state = (packages: readonly PackageView[]): PluginManagerState => ({
  status: 'ready', refreshStatus: 'idle', packages, busy: [], notice: null,
  install: {
    open: false, spec: '', phase: 'idle', registries: null, registry: { kind: 'offered', registry: null }, registryOpen: false,
    registryError: false, audience: 'both', attempts: null, inputError: null, subject: null, runs: [], detailsOpen: false,
    installed: null, installedVersion: null, restartRequired: false, failure: null, approvedBuilds: [], enabling: false,
  },
  confirm: null, highlight: null,
  updates: { status: 'idle', entries: [], reason: '' },
  catalog: { status: 'idle', query: '', page: 1, entries: [], hasMore: false, reason: '' },
})

interface GateBench {
  gate: SlotAdmissionGate
  workbench: SnapshotStore<{ active: 'general' | 'coding'; presets: { general: string; coding: string } }>
  manager: SnapshotStore<PluginManagerState>
  dispose: () => void
}

function bench(): GateBench {
  const workbench = createSnapshotStore<{ active: 'general' | 'coding'; presets: { general: string; coding: string } }>({
    active: 'general', presets: { general: 'standard', coding: 'ptc' },
  })
  const manager = createSnapshotStore<PluginManagerState>(state([]))
  let gate: SlotAdmissionGate | undefined
  let disposeSubscriptions = (): void => {}
  const ctx = {
    slots: { installAdmission: (candidate: SlotAdmissionGate) => { gate = candidate } },
    effect: (setup: () => () => void) => {
      disposeSubscriptions = setup()
      return async () => { disposeSubscriptions() }
    },
  } as never
  installAudienceGate(ctx, { state: workbench } as never, manager)
  if (gate === undefined) throw new Error('the registry never received the gate')
  return { gate, workbench, manager, dispose: disposeSubscriptions }
}

describe('audienceAdmits', () => {
  it('admits both everywhere, and a tagged audience only on its own workbench', () => {
    expect(audienceAdmits('both', 'general')).toBe(true)
    expect(audienceAdmits('both', 'coding')).toBe(true)
    expect(audienceAdmits('general', 'general')).toBe(true)
    expect(audienceAdmits('general', 'coding')).toBe(false)
    expect(audienceAdmits('coding', 'coding')).toBe(true)
    expect(audienceAdmits('coding', 'general')).toBe(false)
  })
})

describe('installAudienceGate', () => {
  it('admits the unread and the unrecorded, and filters by the record times the active tag', () => {
    const { gate, manager, workbench } = bench()
    expect(gate.admit(undefined)).toBe(true)
    expect(gate.admit('qilin-shell-internal')).toBe(true)
    manager.set(state([pkg({ name: 'qilin-coded', audience: 'coding' }), pkg({ name: 'qilin-wide', audience: 'both' })]))
    expect(gate.admit('qilin-coded')).toBe(false)
    expect(gate.admit('qilin-wide')).toBe(true)
    workbench.set({ ...workbench.getSnapshot(), active: 'coding' })
    expect(gate.admit('qilin-coded')).toBe(true)
  })

  it('bumps the revision when the admitted set moves, and not on an equal publish', () => {
    const { gate, manager, dispose } = bench()
    const changed = vi.fn()
    const unsubscribe = gate.revision.subscribe(changed)
    expect(gate.revision.getSnapshot()).toBe(1)
    manager.set(state([pkg({ audience: 'coding' })]))
    expect(gate.revision.getSnapshot()).toBe(2)
    expect(changed).toHaveBeenCalledTimes(1)
    // The same hidden set under another state: no admitted-set move, no publish.
    manager.set({ ...state([pkg({ audience: 'coding' })]), highlight: 'x' })
    expect(gate.revision.getSnapshot()).toBe(2)
    // Unsubscribed listeners stop hearing, and the counter keeps its purpose.
    unsubscribe()
    manager.set(state([pkg({ audience: 'coding', name: 'qilin-other' })]))
    expect(gate.revision.getSnapshot()).toBe(3)
    expect(changed).toHaveBeenCalledTimes(1)
    dispose()
  })
})
