// @vitest-environment jsdom
/** The connection WebSocket carrier resolves logical channels against explicit and document bases. */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { openConnectionWebSocket } from '../src/client/socket.ts'

afterEach(() => { vi.unstubAllGlobals() })

describe('connection WebSocket carrier', () => {
  it('upgrades an https base to wss and resolves the channel beneath it', () => {
    const factory = vi.fn(() => ({}) as never)
    openConnectionWebSocket('/api/gateway/stream', factory, 'https://host.example/app/')
    expect(factory).toHaveBeenCalledWith('wss://host.example/app/api/gateway/stream')
  })

  it('keeps ws for an http base', () => {
    const factory = vi.fn(() => ({}) as never)
    openConnectionWebSocket('/api/remote-stream', factory, 'http://127.0.0.1:3080/')
    expect(factory).toHaveBeenCalledWith('ws://127.0.0.1:3080/api/remote-stream')
  })

  it('falls back to the document base when no base URL is given', () => {
    const factory = vi.fn(() => ({}) as never)
    openConnectionWebSocket('/api/gateway/stream', factory)
    const expected = new URL('/api/gateway/stream', document.baseURI)
    expected.protocol = expected.protocol === 'https:' ? 'wss:' : 'ws:'
    expect(factory).toHaveBeenCalledWith(expected.href)
  })

  it('creates a browser socket through the default factory', () => {
    const socket = openConnectionWebSocket('/api/gateway/stream', undefined, 'ws://127.0.0.1:1/')
    expect(socket).toBeInstanceOf(WebSocket)
    socket.close()
  })

  it('refuses to resolve a channel outside a document without an explicit base', () => {
    vi.stubGlobal('document', undefined)
    expect(() => openConnectionWebSocket('/api/gateway/stream', () => ({}) as never))
      .toThrow('connection: WebSocket carrier requires streamBaseUrl outside a document')
  })
})
