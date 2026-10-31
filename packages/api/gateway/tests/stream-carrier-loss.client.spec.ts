/** Remote stream mux client carrier loss: reconnect-waiting callers and waiter rejection. */
import { describe, expect, it } from 'vitest'
import { RemoteStreamMuxClient } from '../src/client/stream-client.ts'

/** Minimal ConnectionWebSocket carrier the mux client drives. */
class FakeSocket extends EventTarget {
  readyState = 0
  readonly sent: string[] = []
  open(): void { this.readyState = 1; this.dispatchEvent(new Event('open')) }
  drop(): void { this.readyState = 3; this.dispatchEvent(new Event('close')) }
  send(text: string): void { this.sent.push(text) }
  close(): void { this.drop() }
  terminate(): void {}
}

function uplink(value: string): AsyncIterable<string> {
  return { [Symbol.asyncIterator]: () => ({ next: async () => ({ done: false, value }) }) }
}

describe('Remote stream mux client carrier loss', () => {
  it('keeps callers for the replacement socket when the client waits for reconnect', async () => {
    const sockets: FakeSocket[] = []
    const client = new RemoteStreamMuxClient(() => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket as never
    }, true)
    client.start()
    const first = sockets[0]!
    first.open()
    const pending = client.open('probe/attach', {}, new AbortController().signal, uplink('item'))
      [Symbol.asyncIterator]().next()
    first.drop()
    // A lost socket no longer fails the carrier: the answering Client keeps the caller waiting
    // for the replacement socket instead of rejecting it.
    const next = client.open('probe/attach', {}, new AbortController().signal, uplink('item'))
      [Symbol.asyncIterator]().next()
    const settled = await Promise.race([
      next.then(() => 'resolved', () => 'rejected'),
      new Promise((resolve) => { setTimeout(() => { resolve('pending') }, 50) }),
    ])
    expect(settled).toBe('pending')
    await client.close()
    await pending.catch(() => undefined)
    await next.catch(() => undefined)
  })

  it('fails callers still waiting for a socket when the carrier cannot reconnect', async () => {
    const sockets: FakeSocket[] = []
    const client = new RemoteStreamMuxClient(() => {
      const socket = new FakeSocket()
      sockets.push(socket)
      return socket as never
    })
    client.start()
    const socket = sockets[0]!
    socket.open()
    // A closing carrier makes the next call wait for its replacement.
    socket.readyState = 2
    const pending = client.open('probe/attach', {}, new AbortController().signal, uplink('item'))
      [Symbol.asyncIterator]().next()
    socket.drop()
    await expect(pending).rejects.toThrow('Remote stream')
    await client.close()
  })
})
