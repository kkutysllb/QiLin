/** Remote form operations over real Cordis profile configuration. */
import { describe, expect, it, onTestFinished, vi } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import { remoteErrorOf, remoteMethods } from '@qilin-agent/typert-protocol'
import SettingsController from '../src/index.ts'
import { configurationFixture } from '../../../settings/settings/tests/configuration-fixture.ts'

async function boot() {
  const fixture = await configurationFixture()
  await fixture.ctx.plugin(SettingsController)
  return { ...fixture, controller: fixture.ctx.settingsController }
}

describe('settings Remote', () => {
  it('publishes form operations and the credentials namespace', async () => {
    const { ctx, controller } = await boot()
    expect(controller.typertRemote.namespace).toBe('settings')
    expect(remoteMethods(controller).map(method => method.method)).toEqual([
      'describe', 'canOpenAgentPresetDirectory', 'update', 'replace', 'mutate', 'openSettingsDocument', 'openAgentPresetDirectory',
    ])
    expect(ctx.get('credentialsController')).toBeDefined()
  })

  it('redacts every described layer and applies mutations through the consumer', async () => {
    const { controller, ctx } = await boot()
    const describe = controller.describe()
    expect(describe).toMatchObject({ writable: true, hasDocument: true })
    expect(JSON.stringify(describe)).not.toContain('private')
    const model = describe.namespaces.find(row => row.ns === 'default-model')!
    const saved = await controller.mutate(model.ns, [{ op: 'set', path: ['model'], value: 'next' }], model.revision)
    expect(saved.value).toEqual({ provider: 'test', model: 'next' })
    expect(ctx.agentDefaultModel.currentSelection().model).toBe('next')
    await expect(controller.update(model.ns, { model: 'stale' }, model.revision)).rejects.toMatchObject({ code: 'settings/conflict' })
    await expect(controller.update('first', { count: 0 }, undefined)).rejects.toMatchObject({ code: 'settings/rejected' })
    await expect(controller.update('', {}, undefined)).rejects.toMatchObject({ code: 'gateway/bad-request' })
    await expect(controller.update('missing', {}, undefined)).rejects.toMatchObject({ code: 'settings/rejected' })
    expect((await controller.replace('default-model', {}, undefined)).value).toEqual({ provider: 'test', model: 'original' })
  })

  it('reports an absent Config form service', async () => {
    const ctx = new Context()
    onTestFinished(() => ctx.fiber.dispose())
    const controller = new SettingsController(ctx)
    expect(() => controller.describe()).toThrow('settings service is absent')
    const failure = await controller.update('missing', {}, undefined).catch((error: unknown) => error)
    expect(remoteErrorOf(failure)?.code).toBe('gateway/internal')
  })

  it('opens the profile patch and contains opener failure and cancellation', async () => {
    const { ctx, profile } = await configurationFixture()
    const openTextFile = vi.fn(async (_path: string, _signal: AbortSignal) => {})
    const controller = new SettingsController(ctx, {}, { openTextFile })
    const abort = new AbortController()
    await controller.openSettingsDocument(abort.signal)
    expect(openTextFile).toHaveBeenCalledWith(profile.patchPath, abort.signal)
    openTextFile.mockRejectedValueOnce(new Error('no editor'))
    await expect(controller.openSettingsDocument(abort.signal)).rejects.toMatchObject({ code: 'gateway/internal' })
    abort.abort()
    await expect(controller.openSettingsDocument(abort.signal)).rejects.toMatchObject({ code: 'gateway/cancelled' })
  })

  it('does not open a patch cancelled while preparation is pending', async () => {
    const { ctx } = await configurationFixture()
    const prepared = Promise.withResolvers<string>()
    vi.spyOn(ctx.settings, 'prepareDocument').mockReturnValue(prepared.promise)
    const openTextFile = vi.fn(async (_path: string, _signal: AbortSignal) => {})
    const controller = new SettingsController(ctx, {}, { openTextFile })
    const abort = new AbortController()
    const opening = controller.openSettingsDocument(abort.signal)
    abort.abort()
    prepared.resolve('/tmp/cordis.patch.yml')
    await expect(opening).rejects.toMatchObject({ code: 'gateway/cancelled' })
    expect(openTextFile).not.toHaveBeenCalled()
  })

})

it('omits absent optional descriptor fields and contains primitive write failures', async () => {
  const { ctx, controller } = await boot()
  vi.spyOn(ctx.settings, 'describe').mockReturnValue([{ ns: 'first' as never, schema: {}, value: {}, autoGenerate: true, applies: 'live', revision: 0 }])
  expect(controller.describe().namespaces[0]).toEqual({ ns: 'first', schema: {}, value: {}, autoGenerate: true, applies: 'live', revision: 0, secrets: [] })
  vi.spyOn(ctx.settings, 'update').mockRejectedValueOnce('storage unavailable')
  await expect(controller.update('first', {}, undefined)).rejects.toMatchObject({ code: 'settings/rejected' })
})

it('reports a form removed after its write committed', async () => {
  const { ctx, controller } = await boot()
  const entry = ctx.configEditor.entries().find(row => row.options.id === 'first')!
  vi.spyOn(ctx.settings, 'update').mockImplementation(async () => { entry.parent.remove(entry.options.id) })
  await expect(controller.update('first', {}, undefined)).rejects.toMatchObject({ code: 'gateway/internal' })
})

it('classifies document preparation failures and cancellation during opening', async () => {
  const { ctx } = await configurationFixture({ hmr: false })
  let abort = new AbortController()
  const controller = new SettingsController(ctx, {}, { openTextFile: async () => {
    abort.abort(); throw new Error('opening cancelled')
  } })
  const prepare = vi.spyOn(ctx.settings, 'prepareDocument')
  prepare.mockRejectedValueOnce(new Error('unreadable profile'))
  await expect(controller.openSettingsDocument(abort.signal)).rejects.toMatchObject({ code: 'gateway/internal' })
  prepare.mockImplementationOnce(async () => { abort.abort(); throw new Error('preparation cancelled') })
  await expect(controller.openSettingsDocument(abort.signal)).rejects.toMatchObject({ code: 'gateway/cancelled' })
  abort = new AbortController()
  await expect(controller.openSettingsDocument(abort.signal)).rejects.toMatchObject({ code: 'gateway/cancelled' })
})

describe('agent preset directory opening', () => {
  it('opens a user Agent preset directory or returns its path without a native opener', async () => {
    const ctx = new Context()
    ctx.provide('agentPresets', {
      resolve: (id: string) => Promise.resolve({
        id, trust: 'user', path: `/presets/${id}/agent.cordis.yml`,
      }),
    } as never)
    const openPath = vi.fn((_path: string, _signal: AbortSignal) => Promise.resolve())
    const openable = new SettingsController(ctx, { nativeOpen: true }, { openPath })
    expect(openable.canOpenAgentPresetDirectory()).toBe(true)
    const signal = new AbortController().signal
    await expect(openable.openAgentPresetDirectory('mine', signal))
      .resolves.toEqual({ opened: true })
    expect(openPath).toHaveBeenCalledWith('/presets/mine', signal)

    const headless = new Context()
    headless.provide('agentPresets', {
      resolve: (id: string) => Promise.resolve({
        id, trust: 'user', path: `/presets/${id}/agent.cordis.yml`,
      }),
    } as never)
    const reveal = new SettingsController(headless, { nativeOpen: false })
    expect(reveal.canOpenAgentPresetDirectory()).toBe(false)
    await expect(reveal.openAgentPresetDirectory('mine', new AbortController().signal))
      .resolves.toEqual({ opened: false, path: '/presets/mine' })
  })

  it('covers native-open detection defaults and explicit overrides', () => {
    const fromInjectedOpener = new SettingsController(new Context(), {}, {
      openPath: () => Promise.resolve(),
    })
    expect((fromInjectedOpener as unknown as { canOpenPath: () => boolean }).canOpenPath()).toBe(true)

    const detected = new SettingsController(new Context())
    expect(typeof (detected as unknown as { canOpenPath: () => boolean }).canOpenPath()).toBe('boolean')

    const override = vi.fn(() => false)
    const overridden = new SettingsController(new Context(), {}, { canOpenPath: override })
    expect((overridden as unknown as { canOpenPath: () => boolean }).canOpenPath()).toBe(false)
    expect(override).toHaveBeenCalledOnce()
  })

  it('refuses a shipped Agent preset and a missing preset provider', async () => {
    const ctx = new Context()
    ctx.provide('agentPresets', {
      resolve: (id: string) => Promise.resolve({
        id, trust: 'system', path: `/presets/${id}/agent.cordis.yml`,
      }),
    } as never)
    const controller = new SettingsController(ctx)
    await expect(controller.openAgentPresetDirectory('standard', new AbortController().signal))
      .rejects.toMatchObject({ code: 'agent-preset/read-only' })

    const missing = new SettingsController(new Context())
    await expect(missing.openAgentPresetDirectory('mine', new AbortController().signal))
      .rejects.toMatchObject({ code: 'agent-preset/not-found' })
  })

  it('rejects an empty Agent preset id before resolving a provider', async () => {
    const resolve = vi.fn()
    const ctx = new Context()
    ctx.provide('agentPresets', { resolve } as never)
    const controller = new SettingsController(ctx)

    await expect(controller.openAgentPresetDirectory('', new AbortController().signal))
      .rejects.toMatchObject({ code: 'gateway/bad-request' })
    expect(resolve).not.toHaveBeenCalled()
  })

  it('raises an Agent preset resolution failure as the roster reported it', async () => {
    const ctx = new Context()
    const reported = new (await import('@qilin-agent/typert-protocol')).RemoteError('agent-preset/not-found', 'no such preset', {
      agentPreset: 'mine', available: ['standard'],
    })
    ctx.provide('agentPresets', { resolve: async () => { throw reported } } as never)
    const controller = new SettingsController(ctx)

    await expect(controller.openAgentPresetDirectory('mine', new AbortController().signal))
      .rejects.toBe(reported)
  })

  it('classifies cancellation and non-Error failures from the preset opener', async () => {
    const ctx = new Context()
    ctx.provide('agentPresets', {
      resolve: (id: string) => Promise.resolve({
        id, trust: 'user', path: `/presets/${id}/agent.cordis.yml`,
      }),
    } as never)
    const abort = new AbortController()
    const openPath = vi.fn()
      .mockImplementationOnce(async () => {
        abort.abort(new Error('cancelled'))
        throw new Error('opening stopped')
      })
      .mockRejectedValueOnce('desktop unavailable')
    const controller = new SettingsController(ctx, { nativeOpen: true }, { openPath })

    await expect(controller.openAgentPresetDirectory('first', abort.signal))
      .rejects.toMatchObject({ code: 'gateway/cancelled' })
    await expect(controller.openAgentPresetDirectory('second', new AbortController().signal))
      .rejects.toMatchObject({ code: 'gateway/internal', message: 'path open failed: desktop unavailable' })
  })
})
