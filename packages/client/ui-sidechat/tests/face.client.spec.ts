/**
 * The panel's business face over a fake Session Remote slice: roster reads,
 * thread start, prompt delivery, cancel, release, and the transcript follow
 * lifecycle.
 */
import { describe, expect, it, vi } from 'vitest'
import { streamHandle } from '@qilin/remote-mock'
import { RemoteError } from '@qilin/typert-protocol'
import { PARENT, fakeRemote, messageEvent, ok, row, scriptedFollow, sid, snapshotFrame } from './fixtures.client.ts'
import { sidechatFace } from '../src/client/face.ts'
import { createSidechatSource } from '../src/client/sidechat-source.ts'

describe('sidechat face', () => {
  it('reads the roster and reports read failures through the phase', async () => {
    const source = createSidechatSource()
    const remote = fakeRemote()
    const face = sidechatFace(source, remote)
    await face.refresh(PARENT)
    expect(source.getSnapshot().threads).toEqual([row()])
    expect(source.getSnapshot().phase).toBe('ready')

    const failing = sidechatFace(source, fakeRemote({
      sidechatThreads: async () => ({ ok: false as const, error: new RemoteError('gateway/internal', 'boom', {}) }),
    }))
    await failing.refresh(PARENT)
    expect(source.getSnapshot().phase).toBe('failed')
  })

  it('starts a thread, refreshes the roster, and opens its transcript', async () => {
    const source = createSidechatSource()
    const remote = fakeRemote()
    const face = sidechatFace(source, remote)
    await face.start(PARENT, 'hello there')
    expect(remote.started).toBe(1)
    expect(source.getSnapshot().threads).toEqual([row()])
    expect(source.getSnapshot().selectedId).toBe(sid('session-sidechat-new'))
    await vi.waitFor(() => {
      expect(source.getSnapshot().entries[sid('session-sidechat-new')]).toEqual([
        { seq: 1, kind: 'boundary', text: 'What is a sidechat thread?' },
        { seq: 2, kind: 'assistant', text: 'A fork of this session.' },
      ])
    })
  })

  it('delivers prompts and reports rejected sends', async () => {
    const source = createSidechatSource()
    const remote = fakeRemote()
    const face = sidechatFace(source, remote)
    await expect(face.send(PARENT, sid('session-t'), 'question')).resolves.toBe(true)
    expect(remote.prompted).toBe(1)
    const rejecting = sidechatFace(source, fakeRemote({
      sidechatPrompt: async () => ({ ok: false as const, error: new RemoteError('gateway/bad-request', 'denied', {}) }),
    }))
    await expect(rejecting.send(PARENT, sid('session-t'), 'question')).resolves.toBe(false)
  })

  it('cancels and releases through the remotes, refreshing after a release', async () => {
    const source = createSidechatSource()
    const remote = fakeRemote()
    const face = sidechatFace(source, remote)
    await expect(face.cancel(sid('session-t'))).resolves.toBe(true)
    expect(remote.cancelled).toBe(1)
    await face.release(PARENT, sid('session-t'))
    expect(remote.released).toBe(1)
    expect(source.getSnapshot().threads).toEqual([row()])
  })

  it('replays the snapshot on open, appends committed frames, and stops on dispose', async () => {
    const source = createSidechatSource()
    let released = false
    const remote = fakeRemote({
      follow: (request, signal) => scriptedFollow([
        snapshotFrame([messageEvent('user/message', 1, 'q', true)]),
        messageEvent('assistant/message', 2, 'a'),
      ])(request, signal),
    })
    // Keep the generator parked until the spec aborts, then let it settle.
    const originalFollow = remote.follow
    remote.follow = (request, signal) => {
      const stream = originalFollow(request, signal)
      return streamHandle((async function* () {
        for await (const frame of stream) yield frame
        await new Promise<void>((resolve) => {
          if (signal?.aborted === true) { released = true; resolve() }
          else signal?.addEventListener('abort', () => { released = true; resolve() })
        })
      })())
    }
    const face = sidechatFace(source, remote)
    const stop = face.openTranscript(PARENT, sid('session-t'))
    await vi.waitFor(() => {
      expect(source.getSnapshot().entries[sid('session-t')]).toEqual([
        { seq: 1, kind: 'boundary', text: 'q' },
        { seq: 2, kind: 'assistant', text: 'a' },
      ])
    })
    stop()
    await vi.waitFor(() => { expect(released).toBe(true) })
    // Opening a second thread closes the first subscription.
    face.openTranscript(PARENT, sid('session-t2'))
  })

  it('survives a follow carrier failure with the transcript at its last cut', async () => {
    const source = createSidechatSource()
    const remote = fakeRemote({
      follow: () => streamHandle((async function* () {
        yield snapshotFrame([messageEvent('user/message', 1, 'q', true)])
        throw new Error('carrier dropped')
      })()),
    })
    const face = sidechatFace(source, remote)
    face.openTranscript(PARENT, sid('session-t'))
    await vi.waitFor(() => {
      expect(source.getSnapshot().entries[sid('session-t')]).toEqual([{ seq: 1, kind: 'boundary', text: 'q' }])
    })
  })

  it('sends the first prompt without a question through the plain start shape', async () => {
    const source = createSidechatSource()
    const started: unknown[] = []
    const remote = fakeRemote({
      sidechatStart: async (request) => {
        started.push(request)
        return ok({ threadId: sid('session-sidechat-new') })
      },
    })
    const face = sidechatFace(source, remote)
    await face.start(PARENT)
    expect(started).toEqual([{ sessionId: PARENT }])
    await face.start(PARENT, 'with a question')
    expect(started[1]).toEqual({ sessionId: PARENT, question: 'with a question' })
  })
})
