/**
 * Permission preset behavior over the real Session projection registry:
 * catalog contribution, the /permission write path, durable knob writes,
 * shared-bundle tie resolution, the live Auto preset, initial-session
 * pinning, and the load-time misconfiguration refusals.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context, type Volatile } from '@qilin-agent/kylin'
import type { Agent } from '@qilin-agent/agent'
import SessionStore, { Session, SessionId, SessionSeq, SESSION_FORMAT_VERSION } from '@qilin-agent/session'
import SessionProjectionRegistry from '@qilin-agent/session-projection'
import CommandRuntime from '@qilin-agent/commands'
import ApprovalService from '@qilin-agent/user-approval'
import PermissionPresetService, {
  AUTO_PRESET,
  CUSTOM_PRESET,
  PERMISSION_SETTINGS_NAMESPACE,
  type PresetSpec,
} from '@qilin-agent/permission-presets'

const PRESETS = {
  'workspace-write': {
    sandbox: 'workspace-write',
    approval: 'ask',
    name: 'Workspace write',
    description: 'Write inside the workspace.',
  },
  'danger-full-access': { sandbox: 'danger-full-access', approval: 'never' },
} satisfies Record<string, PresetSpec>

const contexts: Context[] = []

afterEach(async () => {
  vi.restoreAllMocks()
  while (contexts.length > 0) await contexts.pop()!.fiber.dispose()
})

interface MountOptions {
  readonly presets?: Record<string, PresetSpec>
  readonly defaultPreset?: string
  readonly sandboxMode?: string
  /** Mount without a confining shell mode. */
  readonly unconfined?: boolean
  readonly approvalPolicy?: 'ask' | 'never' | 'unset'
  readonly settings?: boolean
  readonly commands?: boolean
  /** Sessions created before the preset service mounts (restored logs). */
  readonly seedSessions?: Array<{ id: string; events: Array<'end-seed' | 'auto' | 'danger' | 'never' | 'read-only' | 'sandbox-only' | 'approval-only'> }>
}

/** Mount the session, projection, shell, approval, and preset rows over one real Context. */
async function mounted(options: MountOptions = {}): Promise<Context> {
  const ctx = new Context()
  contexts.push(ctx)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  ctx.provide('shell', (options.unconfined === true ? {} : { sandboxMode: options.sandboxMode ?? 'workspace-write' }) as never)
  if (options.approvalPolicy === 'unset') ctx.provide('approval', { config: {}, setPolicy: () => {} } as never)
  else await ctx.plugin(ApprovalService, { policy: options.approvalPolicy ?? 'ask' })
  if (options.settings === true) {
    ctx.provide('settings', { configure: () => () => {} } as never)
  }
  if (options.commands === true) await ctx.plugin(CommandRuntime)
  for (const seeded of options.seedSessions ?? []) {
    const session = ctx.sessions.create(SessionId(seeded.id))
    for (const event of seeded.events) {
      if (event === 'end-seed') session.append('session/end-seed', {})
      if (event === 'auto') session.append('permission/preset', { preset: AUTO_PRESET })
      if (event === 'danger') session.append('sandbox/mode', { mode: 'danger-full-access' })
      if (event === 'never') session.append('approval/policy', { policy: 'never' })
      if (event === 'approval-only') session.append('approval/policy', { policy: 'ask' })
      if (event === 'read-only') session.append('sandbox/mode', { mode: 'read-only' })
      if (event === 'sandbox-only') session.append('sandbox/mode', { mode: 'workspace-write' })
    }
  }
  const config: Record<string, unknown> = { presets: options.presets ?? PRESETS }
  if (options.defaultPreset !== undefined) config['defaultPreset'] = options.defaultPreset
  await ctx.plugin(PermissionPresetService, config as never)
  return ctx
}

/** An agent stand-in reaching only the session and the inject queue. */
function agentOf(session: Session): Agent {
  return { id: session.id, session, inject: () => {} } as unknown as Agent
}

/** A session that was never entered into the store, so no initial pinning ran. */
function detachedSession(id: string): Session {
  const sessionId = SessionId(id)
  return Session.create(sessionId, undefined, {
    version: SESSION_FORMAT_VERSION,
    id: sessionId,
    createdAt: 0,
    isSeeded: false,
  })
}

/** A non-Promise thenable that rejects with `reason`, as an observer may return. */
function rejecting(reason: unknown) {
  return { then: (_resolve: unknown, reject: (value: unknown) => void) => { reject(reason) } }
}

/** The durable knob events of one session, in log order. */
function knobs(session: Session): string[] {
  return session.snapshotEvents()
    .filter(event => event.type === 'permission/preset' || event.type === 'sandbox/mode' || event.type === 'approval/policy')
    .map(event => event.type === 'permission/preset' ? `preset:${event.data.preset}`
      : event.type === 'sandbox/mode' ? `sandbox:${event.data.mode}`
        : `approval:${event.data.policy}`)
}

describe('catalog', () => {
  it('advertises configured presets with their labels and keeps custom out of the defaults', async () => {
    const ctx = await mounted()
    expect(ctx.permissionPresets.catalog()).toEqual({
      options: [
        { value: 'workspace-write', name: 'Workspace write', description: 'Write inside the workspace.' },
        { value: 'danger-full-access', name: 'danger-full-access' },
      ],
      defaultOptions: [
        { value: 'workspace-write', name: 'Workspace write', description: 'Write inside the workspace.' },
        { value: 'danger-full-access', name: 'danger-full-access' },
      ],
      defaultPreset: 'workspace-write',
    })
    expect(ctx.permissionPresets.defaultPreset).toBe('workspace-write')
    expect(ctx.permissionPresets.optionOf(CUSTOM_PRESET)).toEqual({
      value: 'custom',
      name: 'Custom',
      description: 'Current sandbox and approval settings do not match a preset.',
    })
    expect(ctx.permissionPresets.names).toEqual(['workspace-write', 'danger-full-access'])
  })

  it('falls back to the composed sandbox and approval when defaultPreset is omitted', async () => {
    const ctx = await mounted()
    expect(ctx.permissionPresets.defaultPreset).toBe('workspace-write')
    expect(PERMISSION_SETTINGS_NAMESPACE).toBe('permission')
  })

  it('refuses unknown preset names and mentions the known set', async () => {
    const ctx = await mounted()
    expect(() => ctx.permissionPresets.resolve('nope')).toThrow('permission: unknown preset "nope" (known: workspace-write, danger-full-access)')
    expect(() => ctx.permissionPresets.optionOf('nope')).toThrow('unknown preset')
  })
})

describe('projection', () => {
  it('pins a fresh session to the default preset and exposes the current value', async () => {
    const ctx = await mounted()
    const session = ctx.sessions.create(SessionId('fresh'))
    expect(knobs(session)).toEqual(['preset:workspace-write', 'sandbox:workspace-write', 'approval:ask'])
    expect(ctx.permissionPresets.current(session)).toBe('workspace-write')
    expect(ctx.sessionProjections.snapshot(session, ['permissions']).values.permissions).toEqual({ currentValue: 'workspace-write' })
  })

  it('folds every knob event and ignores unrelated events', async () => {
    const ctx = await mounted()
    const session = ctx.sessions.create(SessionId('fold'))
    session.append('turn/start', { turn: 1 })
    session.append('session/end-seed', {})
    session.append('sandbox/mode', { mode: 'danger-full-access' })
    const state = ctx.sessionProjections.stateOf(session, 'permissions')
    expect(state).toMatchObject({ preset: 'workspace-write', sandbox: 'danger-full-access', seeded: true })
  })

  it('derives custom when the effective knobs match no configured preset', async () => {
    const ctx = await mounted()
    const session = ctx.sessions.create(SessionId('custom'))
    session.append('sandbox/mode', { mode: 'read-only' })
    expect(ctx.permissionPresets.current(session)).toBe(CUSTOM_PRESET)
    expect(ctx.sessionProjections.snapshot(session, ['permissions']).values.permissions).toEqual({ currentValue: CUSTOM_PRESET })
  })

  it('throws when the permissions projection unit is not registered', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SessionStore)
    ctx.provide('sessionProjections', { register: () => () => {}, stateOf: () => undefined } as never)
    ctx.provide('shell', { sandboxMode: 'workspace-write' } as never)
    await ctx.plugin(ApprovalService, { policy: 'ask' })
    const service = new PermissionPresetService(ctx, {
      presets: PRESETS,
      defaultPreset: { get: () => undefined },
    })
    expect(() => ctx.sessions.create(SessionId('no-projection')))
      .toThrow('permission: permissions session projection is not registered')
    expect(service.names).toEqual(['workspace-write', 'danger-full-access'])
  })
})

describe('switching presets', () => {
  it('writes the durable identity and each changed knob exactly once', async () => {
    const ctx = await mounted()
    const session = ctx.sessions.create(SessionId('switch'))
    ctx.permissionPresets.set(session, 'danger-full-access')
    expect(knobs(session)).toEqual([
      'preset:workspace-write', 'sandbox:workspace-write', 'approval:ask',
      'preset:danger-full-access', 'sandbox:danger-full-access', 'approval:never',
    ])
    expect(ctx.permissionPresets.current(session)).toBe('danger-full-access')
    const before = session.seq
    ctx.permissionPresets.set(session, 'danger-full-access')
    expect(session.seq).toBe(before)
  })

  it('writes only the knob a preset actually changes', async () => {
    const presets = {
      ...PRESETS,
      'sandbox-only': { sandbox: 'read-only', approval: 'ask' },
      'approval-only': { sandbox: 'workspace-write', approval: 'never' },
    } satisfies Record<string, PresetSpec>
    const ctx = await mounted({ presets })
    const sandboxSession = ctx.sessions.create(SessionId('sandbox-only'))
    ctx.permissionPresets.set(sandboxSession, 'sandbox-only')
    expect(knobs(sandboxSession).slice(3)).toEqual(['preset:sandbox-only', 'sandbox:read-only'])
    const approvalSession = ctx.sessions.create(SessionId('approval-only'))
    ctx.permissionPresets.set(approvalSession, 'approval-only')
    expect(knobs(approvalSession).slice(3)).toEqual(['preset:approval-only', 'approval:never'])
  })

  it('keeps a still-matching last selection when presets share one bundle', async () => {
    const presets = {
      first: { sandbox: 'workspace-write', approval: 'ask' },
      second: { sandbox: 'workspace-write', approval: 'ask' },
    } satisfies Record<string, PresetSpec>
    const ctx = await mounted({ presets })
    const session = ctx.sessions.create(SessionId('tie'))
    expect(ctx.permissionPresets.current(session)).toBe('first')
    ctx.permissionPresets.set(session, 'second')
    expect(ctx.permissionPresets.current(session)).toBe('second')
    // Moving the knobs away from the shared bundle no longer matches either.
    ctx.permissionPresets.set(session, 'second')
    session.append('sandbox/mode', { mode: 'read-only' })
    expect(ctx.permissionPresets.current(session)).toBe(CUSTOM_PRESET)
  })
})

describe('detached sessions', () => {
  it('writes both knobs through the composed defaults when the log has no override yet', async () => {
    const ctx = await mounted()
    const session = detachedSession('detached')
    ctx.permissionPresets.set(session, 'danger-full-access')
    expect(knobs(session)).toEqual(['preset:danger-full-access', 'sandbox:danger-full-access', 'approval:never'])
  })

  it('falls back to the ask policy when the approval provider states none', async () => {
    const ctx = await mounted({ approvalPolicy: 'unset' })
    const session = detachedSession('detached-unset')
    expect(ctx.permissionPresets.current(session)).toBe('workspace-write')
    ctx.permissionPresets.set(session, 'danger-full-access')
    expect(knobs(session)).toEqual(['preset:danger-full-access', 'sandbox:danger-full-access', 'approval:never'])
  })
})

describe('Auto preset', () => {
  it('appears in the catalog only while an integration is registered', async () => {
    const ctx = await mounted()
    const changes = vi.fn()
    ctx.on('permission-presets/catalog-changed', changes)
    expect(ctx.permissionPresets.names).not.toContain(AUTO_PRESET)
    expect(() => ctx.permissionPresets.optionOf(AUTO_PRESET)).toThrow('unknown preset')
    let admit = 0
    const dispose = ctx.permissionPresets.registerAuto(() => { admit += 1 })
    expect(changes).toHaveBeenCalledTimes(1)
    expect(ctx.permissionPresets.names).toEqual(['workspace-write', 'danger-full-access', AUTO_PRESET])
    expect(ctx.permissionPresets.catalog().options.at(-1)).toEqual({ value: AUTO_PRESET, name: AUTO_PRESET })
    expect(ctx.permissionPresets.optionOf(AUTO_PRESET)).toEqual({ value: AUTO_PRESET, name: AUTO_PRESET })
    expect(() => ctx.permissionPresets.registerAuto(() => {})).toThrow('permission: preset "auto" is already registered')
    const session = ctx.sessions.create(SessionId('auto'))
    ctx.permissionPresets.set(session, AUTO_PRESET)
    expect(admit).toBe(1)
    expect(knobs(session).slice(3)).toEqual(['preset:auto', 'sandbox:danger-full-access'])
    expect(ctx.permissionPresets.current(session)).toBe(AUTO_PRESET)
    await dispose()
    expect(changes).toHaveBeenCalledTimes(2)
    expect(ctx.permissionPresets.names).not.toContain(AUTO_PRESET)
    // The stored Auto identity now falls through to the knob match (approval never).
    expect(ctx.permissionPresets.current(session)).toBe(CUSTOM_PRESET)
  })

  it('reports catalog-changed listener failures without letting them escape', async () => {
    const ctx = await mounted()
    const warn = vi.spyOn(ctx.logger, 'warn').mockImplementation(() => {})
    ctx.on('permission-presets/catalog-changed', () => { throw 'sync listener broke' })
    ctx.on('permission-presets/catalog-changed', () => { throw new Error('sync error listener broke') })
    ctx.on('permission-presets/catalog-changed', () => rejecting(42))
    ctx.on('permission-presets/catalog-changed', () => rejecting(new Error('async error listener broke')))
    ctx.on('permission-presets/catalog-changed', () => 1)
    const dispose = ctx.permissionPresets.registerAuto(() => {})
    // Two microtask turns: the thenable settles, then its rejection is handled.
    await Promise.resolve()
    await Promise.resolve()
    expect(warn).toHaveBeenCalledWith('permission: catalog-changed listener failed: sync listener broke')
    expect(warn).toHaveBeenCalledWith('permission: catalog-changed listener failed: 42')
    expect(warn).toHaveBeenCalledWith('permission: catalog-changed listener failed: sync error listener broke')
    expect(warn).toHaveBeenCalledWith('permission: catalog-changed listener failed: async error listener broke')
    await dispose()
  })
})

describe('/permission command', () => {
  it('reports the current preset, refuses unknown names, and switches through the canonical setters', async () => {
    const ctx = await mounted({ commands: true })
    const session = ctx.sessions.create(SessionId('command'))
    const agent = agentOf(session)
    const signal = new AbortController().signal
    const current = await ctx.commands.execute(agent, '/permission', [], signal)
    expect(current?.result).toEqual({
      kind: 'success',
      text: 'current preset workspace-write (available: workspace-write, danger-full-access)',
    })
    const unknown = await ctx.commands.execute(agent, '/permission nope', [], signal)
    expect(unknown?.result).toEqual({
      kind: 'error',
      text: 'unknown preset "nope" (available: workspace-write, danger-full-access)',
    })
    const switched = await ctx.commands.execute(agent, '/permission danger-full-access', [], signal)
    expect(switched?.result).toEqual({ kind: 'success', text: 'preset danger-full-access' })
    expect(knobs(session).slice(3)).toEqual(['preset:danger-full-access', 'sandbox:danger-full-access', 'approval:never'])
    expect(ctx.approval.config.policy).toBe('ask')
  })

  it('switches to a live Auto preset through the command path', async () => {
    const ctx = await mounted({ commands: true })
    let admit = 0
    ctx.permissionPresets.registerAuto(() => { admit += 1 })
    const session = ctx.sessions.create(SessionId('command-auto'))
    const execution = await ctx.commands.execute(agentOf(session), '/permission auto', [], new AbortController().signal)
    expect(execution?.result).toEqual({ kind: 'success', text: 'preset auto' })
    expect(admit).toBe(1)
    expect(ctx.permissionPresets.current(session)).toBe(AUTO_PRESET)
  })
})

describe('initial permission pinning', () => {
  it('fills a seeded session with the effective preset and the missing knob facts', async () => {
    const ctx = await mounted({ seedSessions: [{ id: 'seeded', events: ['end-seed'] }] })
    const session = ctx.sessions.get(SessionId('seeded'))!
    expect(knobs(session)).toEqual(['preset:workspace-write', 'sandbox:workspace-write', 'approval:ask'])
  })

  it('adds only the missing knob facts when the effective knobs match no preset', async () => {
    const ctx = await mounted({ seedSessions: [{ id: 'custom-seeded', events: ['end-seed', 'read-only'] }] })
    const session = ctx.sessions.get(SessionId('custom-seeded'))!
    expect(knobs(session)).toEqual(['sandbox:read-only', 'approval:ask'])
    expect(ctx.permissionPresets.current(session)).toBe(CUSTOM_PRESET)
  })

  it('preserves an existing sandbox fact and adds only the missing approval policy', async () => {
    const ctx = await mounted({ seedSessions: [{ id: 'partial', events: ['sandbox-only'] }] })
    const session = ctx.sessions.get(SessionId('partial'))!
    expect(knobs(session)).toEqual(['sandbox:workspace-write', 'preset:workspace-write', 'approval:ask'])
  })

  it('refuses to restore a stored Auto identity without its integration', async () => {
    await expect(mounted({ seedSessions: [{ id: 'stored-auto', events: ['auto'] }] }))
      .rejects.toThrow('permission: cannot restore preset "auto" without its active integration')
  })

  it('writes the ask policy when the approval provider states none', async () => {
    const ctx = await mounted({ approvalPolicy: 'unset', seedSessions: [{ id: 'unset-pin', events: ['end-seed'] }] })
    const session = ctx.sessions.get(SessionId('unset-pin'))!
    expect(knobs(session)).toEqual(['preset:workspace-write', 'sandbox:workspace-write', 'approval:ask'])
  })

  it('skips the approval write when the log already carries the policy', async () => {
    const ctx = await mounted({ seedSessions: [{ id: 'approval-seeded', events: ['end-seed', 'approval-only'] }] })
    const session = ctx.sessions.get(SessionId('approval-seeded'))!
    expect(knobs(session)).toEqual(['approval:ask', 'preset:workspace-write', 'sandbox:workspace-write'])
  })

  it('runs the Auto admission check when a restored log carries the identity', async () => {
    const ctx = await mounted()
    let admit = 0
    ctx.permissionPresets.registerAuto(() => { admit += 1 })
    const session = ctx.sessions.create(SessionId('restored-auto'), {
      seed: [
        { type: 'permission/preset', seq: SessionSeq(0), time: 0, data: { preset: AUTO_PRESET } },
        { type: 'sandbox/mode', seq: SessionSeq(1), time: 1, data: { mode: 'danger-full-access' } },
        { type: 'approval/policy', seq: SessionSeq(2), time: 2, data: { policy: 'never' } },
      ],
    })
    expect(admit).toBe(1)
    expect(ctx.permissionPresets.current(session)).toBe(AUTO_PRESET)
  })
})

describe('load-time refusals', () => {
  it('refuses reserved preset names and an unconfined shell', async () => {
    await expect(mounted({ presets: { [CUSTOM_PRESET]: { sandbox: 'read-only', approval: 'ask' } } }))
      .rejects.toThrow('"custom" is reserved')
    await expect(mounted({ presets: { [AUTO_PRESET]: { sandbox: 'read-only', approval: 'ask' } } }))
      .rejects.toThrow('"auto" is reserved')
    await expect(mounted({ unconfined: true }))
      .rejects.toThrow('permission: the mounted bash executor does not confine (no sandboxMode)')
  })

  it('refuses defaults that match no preset and an unknown explicit default', async () => {
    await expect(mounted({ presets: { 'workspace-write': PRESETS['workspace-write'] }, sandboxMode: 'read-only', approvalPolicy: 'never' }))
      .rejects.toThrow('permission: composed sandbox and approval defaults match no preset; configure defaultPreset explicitly')
    await expect(mounted({ defaultPreset: 'nope' })).rejects.toThrow('permission: unknown preset "nope"')
  })

  it('configures settings to stop creating Auto sessions by default', async () => {
    const configured: unknown[] = []
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    ctx.provide('shell', { sandboxMode: 'workspace-write' } as never)
    await ctx.plugin(ApprovalService, { policy: 'ask' })
    ctx.provide('settings', { configure: (value: unknown) => { configured.push(value); return () => {} } } as never)
    await ctx.plugin(PermissionPresetService, { presets: PRESETS })
    expect(configured).toEqual([{ auto: false }])
  })

  it('revalidates a volatile default on every read and rejects an unknown later value', async () => {
    const ctx = new Context()
    contexts.push(ctx)
    await ctx.plugin(SessionStore)
    await ctx.plugin(SessionProjectionRegistry)
    ctx.provide('shell', { sandboxMode: 'workspace-write' } as never)
    await ctx.plugin(ApprovalService, { policy: 'ask' })
    let value: string | undefined = 'workspace-write'
    const defaultPreset = { get: () => value } as Volatile<string | undefined>
    const service = new PermissionPresetService(ctx, { presets: PRESETS, defaultPreset })
    expect(service.defaultPreset).toBe('workspace-write')
    value = 'nope'
    expect(() => service.defaultPreset).toThrow('permission: unknown default preset "nope"')
    expect(() => service.catalog()).toThrow('permission: unknown default preset "nope"')
  })
})
