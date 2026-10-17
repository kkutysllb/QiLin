/**
 * The scripted `settings` Remote double: the describe answer a bench's plugins
 * read, the recorded write face, the refusal for an unscripted namespace, and
 * the publish control a spec uses to script a Host commit.
 */
import { describe, expect, it } from 'vitest'
import { scriptedSettingsRemote } from '../src/settings-remote.ts'

const GENERAL = { ns: 'general', value: 1 }
const MODELS = { ns: 'models', value: 2 }

describe('scriptedSettingsRemote', () => {
  it('serves the deployment facts and namespace views it was built with', async () => {
    const scripted = scriptedSettingsRemote([GENERAL], { writable: false, hasDocument: true })

    await expect(scripted.settings.describe()).resolves.toEqual({
      ok: true,
      value: { writable: false, hasDocument: true, namespaces: [GENERAL] },
    })
  })

  it('defaults to a writable, document-less deployment with no namespace', async () => {
    const scripted = scriptedSettingsRemote()

    await expect(scripted.settings.describe()).resolves.toEqual({
      ok: true,
      value: { writable: true, hasDocument: false, namespaces: [] },
    })
    await expect(scripted.settings.update('general', {}, undefined)).resolves.toEqual({
      ok: false,
      error: { code: 'settings/rejected', message: 'no scripted namespace "general"', details: { ns: 'general' } },
    })
  })

  it('echoes the addressed namespace for every write and records the arguments', async () => {
    const scripted = scriptedSettingsRemote([GENERAL, MODELS])

    await expect(scripted.settings.update('general', { value: 3 }, 7)).resolves.toEqual({ ok: true, value: GENERAL })
    await expect(scripted.settings.replace('models', { value: 4 }, undefined)).resolves.toEqual({ ok: true, value: MODELS })
    await expect(scripted.settings.mutate('models', [{ op: 'set' }], 1)).resolves.toEqual({ ok: true, value: MODELS })
    expect(scripted.update.mock.calls).toEqual([['general', { value: 3 }, 7]])
    expect(scripted.replace.mock.calls).toEqual([['models', { value: 4 }, undefined]])
    expect(scripted.mutate.mock.calls).toEqual([['models', [{ op: 'set' }], 1]])
  })

  it('reports an unscripted namespace as a rejected write', async () => {
    const scripted = scriptedSettingsRemote([GENERAL])

    for (const write of ['update', 'replace', 'mutate'] as const) {
      await expect(scripted.settings[write]('absent', {}, undefined)).resolves.toEqual({
        ok: false,
        error: { code: 'settings/rejected', message: 'no scripted namespace "absent"', details: { ns: 'absent' } },
      })
    }
  })

  it('serves the replaced views after publish, as a Host commit would', async () => {
    const scripted = scriptedSettingsRemote([GENERAL])

    scripted.publish([MODELS])

    await expect(scripted.settings.describe()).resolves.toMatchObject({ value: { namespaces: [MODELS] } })
    await expect(scripted.settings.update('general', {}, undefined)).resolves.toMatchObject({ ok: false })
    await expect(scripted.settings.update('models', {}, undefined)).resolves.toEqual({ ok: true, value: MODELS })
  })
})
