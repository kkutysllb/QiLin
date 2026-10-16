/** The welcome read must not stop startup when the Host Web RPC is unavailable. */

import { describe, expect, it, vi } from 'vitest'
import { connectDesktopWelcome } from '../src/welcome-backend.ts'

const authenticatedUrl = 'http://127.0.0.1:12345/workspace?token=test'
const localState = { loggedIn: false, hasApiKey: false, writable: false, localePreference: null }

describe('desktop welcome read', () => {
  it('refuses to connect when the Host rejects the launch URL', async () => {
    await expect(connectDesktopWelcome(authenticatedUrl, async () => new Response('{}', { status: 401 })))
      .rejects.toThrow('Web authentication failed')
  })

  it('continues with local state when the Host answers without settings namespaces', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const send = async (input: string): Promise<Response> => {
      if (!input.includes('/api/')) return new Response('{}', { status: 200 })
      return new Response(JSON.stringify({ type: 'server-response', rpcId: 'x', result: { ok: true, value: {} } }), { status: 200 })
    }
    const backend = await connectDesktopWelcome(authenticatedUrl, send)
    await expect(backend.read()).resolves.toEqual(localState)
    warn.mockRestore()
  })
})
