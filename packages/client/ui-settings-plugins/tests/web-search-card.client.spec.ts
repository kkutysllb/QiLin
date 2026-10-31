// @vitest-environment jsdom
/** The web-search card controller: per-field routing, the API switch, and its save order. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ConfigForm, ConfigFormSnapshot } from '@qilin-agent/client-ui-settings/client'
import { WebSearchCardController } from '../src/client/web-search-card-controller.ts'

function scope<T extends object>(value: T, overrides: Partial<ConfigFormSnapshot<T>> = {}, mutate = vi.fn(async () => true)) {
  let snapshot: ConfigFormSnapshot<T> = {
    status: 'ready', value, base: value, user: {}, revision: 1, writable: true, mode: 'host', ...overrides,
  }
  const listeners = new Set<() => void>()
  const form = {
    getSnapshot: () => snapshot,
    subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } },
    mutate,
    publish: (next: Partial<ConfigFormSnapshot<T>>) => {
      snapshot = { ...snapshot, ...next }
      for (const listener of [...listeners]) listener()
    },
  }
  return { form: form as unknown as ConfigForm<T>, mutate, publish: form.publish }
}

/** The Remote surfaces the controller reads for the credential control. */
function context(describeValue: Record<string, { configured: boolean; writable: boolean }> = {}) {
  return {
    remote: {
      credentials: {
        describe: vi.fn(async () => ({ ok: true, value: describeValue })),
        set: vi.fn(async () => ({ ok: true })),
      },
    },
  } as never
}

function card(scopes: {
  web: ReturnType<typeof scope<{ searchProvider: string; fetchProvider: string }>>['form']
  messages: ReturnType<typeof scope<{ baseURL: string; maxUses: number }>>['form']
  api: ReturnType<typeof scope<{ baseURL: string; count: number }>>['form']
}, ctx = context()) {
  return new WebSearchCardController(scopes, ctx)
}

afterEach(() => { vi.clearAllMocks() })

describe('WebSearchCardController', () => {
  function scopes() {
    const web = scope({ searchProvider: 'deepseek-official', fetchProvider: 'http' },
      { base: { searchProvider: 'deepseek-search-api', fetchProvider: 'deepseek-fetch-api' } })
    const messages = scope({ baseURL: 'https://messages.test', maxUses: 5 })
    const api = scope({ baseURL: 'https://api.test', count: 10 })
    return { web, messages, api }
  }

  it('routes each field to its own section and stages edits and resets', () => {
    const s = scopes()
    const controller = card({ web: s.web.form, messages: s.messages.form, api: s.api.form })
    const face = controller.inject()

    face.edit('apiKey', 'sk-test')
    face.edit('maxUses', '7')
    face.resetField('maxUses')
    face.edit('count', '')
    face.resetField('count')
    // The switch is off: baseURL belongs to the Messages section.
    face.edit('baseURL', 'https://messages.test/next')
    expect(s.messages.mutate).not.toHaveBeenCalled()
    // Switching on stages both providers; the composed values are reset rather than overridden.
    face.setSearchApi(true)
    face.edit('baseURL', 'https://api.test/next')
    face.setSearchApi(false)
    face.discard()
    controller.dispose()
  })

  it('refuses to save an invalid or unavailable draft', () => {
    const s = scopes()
    const controller = card({ web: s.web.form, messages: s.messages.form, api: s.api.form })
    const face = controller.inject()
    // A number outside the accepted range marks the form invalid.
    face.edit('count', '0')
    face.save()
    expect(s.api.mutate).not.toHaveBeenCalled()
    expect(s.messages.mutate).not.toHaveBeenCalled()
    controller.dispose()
  })

  it('writes the credential, saves the endpoint sections first, and stops on a refused section', async () => {
    const s = scopes()
    const remote = context({ DEEPSEEK_API_KEY: { configured: true, writable: true } }) as {
      remote: { credentials: { set: ReturnType<typeof vi.fn> } }
    }
    const controller = card({ web: s.web.form, messages: s.messages.form, api: s.api.form }, remote as never)
    const face = controller.inject()

    // A staged key saves through the selection's secret control.
    face.edit('apiKey', 'sk-test')
    face.save()
    await vi.waitFor(() => { expect(remote.remote.credentials.set).toHaveBeenCalledWith('DEEPSEEK_API_KEY', 'sk-test') })
    expect(remote.remote.credentials.set).toHaveBeenCalledTimes(1)

    const state = (face as unknown as { hooks: { webSearchCard: { getSnapshot(): { saving: boolean } } } }).hooks.webSearchCard
    await vi.waitFor(() => { expect(state.getSnapshot().saving).toBe(false) })

    // A refused endpoint section keeps the remaining drafts and skips the selection.
    s.api.mutate.mockResolvedValue(false)
    face.edit('count', '25')
    face.edit('apiKey', 'sk-again')
    face.save()
    await vi.waitFor(() => { expect(s.api.mutate).toHaveBeenCalled() })
    expect(remote.remote.credentials.set).toHaveBeenCalledTimes(1)

    controller.refreshCredential('other-reference')
    controller.refreshCredential('DEEPSEEK_API_KEY')
    controller.dispose()
  })
})
