import { describe, expect, it, vi } from 'vitest'
import type { SettingsNamespaceView } from '@qilin-agent/api-remotes/client'
import { SettingsDescribeMirror } from '@qilin-agent/client-ui-settings/src/client/settings-mirror.ts'
import { RemoteError } from '@qilin-agent/client-test-runtime'
import type { PermissionCatalog } from '@qilin-agent/permission-presets/client'
import {
  PermissionPresetSettingsController, permissionDefaultOf,
} from '../src/client/settings-store.ts'

const CATALOG: PermissionCatalog = {
  options: [
    { value: 'read-only', name: 'Read Only' },
    { value: 'workspace-write', name: 'Workspace' },
  ],
  defaultOptions: [
    { value: 'read-only', name: 'Read Only' },
    { value: 'workspace-write', name: 'Workspace' },
  ],
  defaultPreset: 'read-only',
}

const catalogFace = { snapshot: () => CATALOG, subscribe: () => () => {} }

function resolveDefault(view: SettingsNamespaceView) {
  return permissionDefaultOf(view, CATALOG)
}

function view(defaultPreset?: string, revision = 0): SettingsNamespaceView {
  return {
    ns: 'permission',
    autoGenerate: true,
    schema: { uid: 1, refs: {} },
    value: defaultPreset === undefined ? {} : { defaultPreset },
    base: { defaultPreset: 'read-only' },
    applies: 'live',
    secrets: [],
    revision,
  }
}

/** The settings namespace answers over the Remote carrier, which has no envelope. */
function ok<T>(value: T) {
  return { ok: true as const, value }
}

/** The permission controller over a real mirror and one scripted context. */
function permissionController(api: object, catalog = catalogFace) {
  const ctx = { remote: { settings: api } } as never
  const mirror = new SettingsDescribeMirror(ctx)
  return { mirror, controller: new PermissionPresetSettingsController(mirror, catalog, ctx) }
}

describe('permission settings store', () => {
  it('treats an absent defaultPreset as the fresh-deployment unset state', () => {
    const resolved = resolveDefault(view())
    expect(resolved.currentValue).toBe('')
    expect(resolved.options.map(option => option.id)).toEqual(['read-only', 'workspace-write'])
  })

  it('derives default options and labels from the permission catalog', () => {
    expect(resolveDefault(view('read-only'))).toEqual({
      currentValue: 'read-only',
      options: [
        { id: 'read-only', label: 'Read Only' },
        { id: 'workspace-write', label: 'Workspace' },
      ],
    })
    expect(resolveDefault(view('workspace-write')).currentValue).toBe('workspace-write')
  })

  it('rejects malformed values and catalogs at the wire boundary', () => {
    expect(() => resolveDefault({ ...view('read-only'), value: { defaultPreset: 3 } }))
      .toThrow(/non-string defaultPreset value/)
    expect(() => resolveDefault({ ...view('danger-full-access') }))
      .toThrow(/does not match any default preset/)
    expect(() => permissionDefaultOf(view('read-only'), { ...CATALOG, defaultOptions: [] }))
      .toThrow(/advertises no default presets/)
  })

  it('loads and writes defaultPreset with optimistic concurrency', async () => {
    const describe = vi.fn(() => Promise.resolve(ok({
      writable: true,
      hasDocument: false,
      namespaces: [view('read-only', 4)],
    })))
    const mutate = vi.fn(() => Promise.resolve(ok(view('workspace-write', 5))))
    const { controller } = permissionController({ describe, mutate })
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready',
      writable: true,
      currentValue: 'read-only',
      revision: 4,
    })
    await controller.select('workspace-write')
    expect(mutate).toHaveBeenCalledWith(
      'permission',
      [{ op: 'set', path: ['defaultPreset'], value: 'workspace-write' }],
      4,
    )
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'ready',
      currentValue: 'workspace-write',
      revision: 5,
    })
    // The write answer folded into the mirror; no re-read followed.
    expect(describe).toHaveBeenCalledTimes(1)
  })

  it('hides the row when the namespace is absent and contains write failures', async () => {
    const describe = vi.fn(() => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [] })))
    const { controller } = permissionController({ describe, mutate: vi.fn() })
    await controller.load()
    expect(controller.store.getSnapshot().status).toBe('unavailable')

    const failing = permissionController({
      describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view('read-only')] })),
      mutate: () => Promise.resolve({
        ok: false as const,
        error: new RemoteError('settings/conflict', 'stale', { ns: 'permission', expected: 1, actual: 2 }),
      }),
    }).controller
    await failing.load()
    await failing.select('workspace-write')
    expect(failing.store.getSnapshot()).toMatchObject({ status: 'error', error: 'stale' })
  })

  it('contains read failures and no-ops without a writable view', async () => {
    const mutate = vi.fn()
    const readOnly = permissionController({
      describe: () => Promise.resolve(ok({
        writable: false, hasDocument: false, namespaces: [view('read-only', 2)],
      })),
      mutate,
    }).controller
    await readOnly.load()
    expect(readOnly.store.getSnapshot()).toMatchObject({
      currentValue: 'read-only',
      writable: false,
      revision: 2,
    })
    await readOnly.select('workspace-write')
    expect(mutate).not.toHaveBeenCalled()

    const rejected = permissionController({
      describe: () => Promise.resolve({
        ok: false as const,
        error: new RemoteError('gateway/internal', 'offline', {}),
      }),
      mutate,
    }).controller
    await rejected.select('workspace-write')
    await rejected.load()
    expect(rejected.store.getSnapshot()).toMatchObject({ status: 'error', error: 'offline' })
    expect(mutate).not.toHaveBeenCalled()

    const thrown = permissionController({
      describe: async () => { throw 'disconnected' },
      mutate,
    }).controller
    await thrown.load()
    expect(thrown.store.getSnapshot()).toMatchObject({ status: 'error', error: 'disconnected' })
  })

  it('reports a failing catalog face as a row error', async () => {
    const failingCatalog = {
      snapshot: () => { throw new Error('catalog disconnected') },
      subscribe: () => () => {},
    }
    const { controller } = permissionController({
      describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view('read-only')] })),
      mutate: vi.fn(),
    }, failingCatalog)
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({
      status: 'error', error: 'catalog disconnected',
    })
  })

  it('hides the row in a remote browser instead of loading forever', async () => {
    const describeCall = vi.fn()
    const mutate = vi.fn()
    const ctx = { remote: { settings: { describe: describeCall, mutate } } } as never
    const mirror = new SettingsDescribeMirror(ctx, 'memory')
    const controller = new PermissionPresetSettingsController(mirror, catalogFace, ctx)
    await controller.load()
    expect(controller.store.getSnapshot().status).toBe('unavailable')
    await controller.select('workspace-write')
    expect(describeCall).not.toHaveBeenCalled()
    expect(mutate).not.toHaveBeenCalled()
  })

  it('follows a mirror refresh without an own read once loaded', async () => {
    const describe = vi.fn()
      .mockResolvedValueOnce(ok({ writable: true, hasDocument: false, namespaces: [view('read-only', 1)] }))
      .mockResolvedValueOnce(ok({ writable: true, hasDocument: false, namespaces: [view('workspace-write', 2)] }))
    const { mirror, controller } = permissionController({ describe, mutate: vi.fn() })
    await controller.load()
    expect(controller.store.getSnapshot()).toMatchObject({ currentValue: 'read-only' })

    await mirror.load()

    expect(controller.store.getSnapshot()).toMatchObject({ currentValue: 'workspace-write', revision: 2 })
  })

  it('disposal stops deriving and suppresses in-flight writes', async () => {
    const neverRead = vi.fn()
    const { controller: neverLoaded } = permissionController({ describe: neverRead, mutate: vi.fn() })
    neverLoaded.dispose()
    await neverLoaded.load()
    expect(neverLoaded.store.getSnapshot().status).toBe('idle')
    expect(neverRead).not.toHaveBeenCalled()

    const read = Promise.withResolvers<ReturnType<typeof ok<{
      writable: boolean
      namespaces: SettingsNamespaceView[]
    }>>>()
    const { mirror, controller: idle } = permissionController({ describe: () => read.promise, mutate: vi.fn() })
    const loading = idle.load()
    idle.dispose()
    read.resolve(ok({ writable: true, hasDocument: false, namespaces: [view('read-only')] }))
    await Promise.all([loading, mirror.load()])
    expect(idle.store.getSnapshot().status).toBe('loading')

    const mutation = Promise.withResolvers<ReturnType<typeof ok<SettingsNamespaceView>>>()
    const { controller: active } = permissionController({
      describe: () => Promise.resolve(ok({
        writable: true,
        hasDocument: false,
        namespaces: [view('read-only')],
      })),
      mutate: () => mutation.promise,
    })
    await active.load()
    const saving = active.select('workspace-write')
    active.dispose()
    mutation.resolve(ok(view('workspace-write', 1)))
    await saving
    expect(active.store.getSnapshot().status).toBe('saving')

    const refusedMutation = Promise.withResolvers<
      ReturnType<typeof ok<SettingsNamespaceView>> | { ok: false; error: RemoteError }
    >()
    const { controller: disposedWrite } = permissionController({
      describe: () => Promise.resolve(ok({ writable: true, hasDocument: false, namespaces: [view('read-only')] })),
      mutate: () => refusedMutation.promise,
    })
    await disposedWrite.load()
    const writing = disposedWrite.select('workspace-write')
    disposedWrite.dispose()
    refusedMutation.resolve({
      ok: false,
      error: new RemoteError('settings/conflict', 'late write', { ns: 'permission', expected: 1, actual: 2 }),
    })
    await writing
    expect(disposedWrite.store.getSnapshot().status).toBe('saving')
  })
})
