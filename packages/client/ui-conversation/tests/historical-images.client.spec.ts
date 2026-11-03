// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { AttachmentId } from '@qilin-agent/attachment'
import type { SessionFace } from '@qilin-agent/api-session-controller/client'
import { RemoteError, SlotTestRuntime } from '@qilin-agent/client-test-runtime'
import { HistoricalImageCache } from '../src/client/conversation/historical-images.ts'

describe('HistoricalImageCache', () => {
  /** One 6-byte image reference; the eviction tests budget in these bytes. */
  const attachmentOf = (id: string): Parameters<HistoricalImageCache['resolve']>[1] => ({
    attachmentId: AttachmentId(id), mediaType: 'image/png', bytes: 6, width: 1, height: 1,
  }) as const

  it('invalidates a pending image load when its Session binding is released', async () => {
    const read = Promise.withResolvers<Awaited<ReturnType<SessionFace['readAttachment']>>>()
    const runtime = await SlotTestRuntime.create()
    const sessionId = await runtime.sessions.add({
      id: 's1',
      session: { readAttachment: () => read.promise },
    })
    const reference = runtime.sessions.retain(sessionId)
    await reference.ready
    const cache = new HistoricalImageCache(runtime.ctx, runtime.ctx.sessions, 3)
    const attachment = {
      attachmentId: AttachmentId('image-1'), mediaType: 'image/png', bytes: 1, width: 1, height: 1,
    } as const

    const pending = cache.resolve(sessionId, attachment)
    reference.release()
    await runtime.flush()
    read.resolve({ ok: true, value: { attachment, data: Uint8Array.of(1) } })

    await expect(pending).rejects.toThrow('ui-conversation image scope was released before loading completed')
    await runtime.dispose()
  })

  it('shows a seeded URL synchronously, replaces it with canonical bytes, and revokes both', async () => {
    const revoked: string[] = []
    const created = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:canonical')
    const originalRevoke = URL.revokeObjectURL.bind(URL)
    URL.revokeObjectURL = (url: string) => { revoked.push(url) }
    try {
      const read = Promise.withResolvers<Awaited<ReturnType<SessionFace['readAttachment']>>>()
      const runtime = await SlotTestRuntime.create()
      const sessionId = await runtime.sessions.add({ id: 's1', session: { readAttachment: () => read.promise } })
      const reference = runtime.sessions.retain(sessionId)
      await reference.ready
      const cache = new HistoricalImageCache(runtime.ctx, runtime.ctx.sessions, 3)
      const attachment = {
        attachmentId: AttachmentId('image-seeded'), mediaType: 'image/png', bytes: 1, width: 1, height: 1,
      } as const

      expect(cache.seed(sessionId, attachment, 'blob:seeded')).toBe(true)
      expect(cache.peek(sessionId, attachment)).toBe('blob:seeded')
      expect(cache.seed(sessionId, attachment, 'blob:duplicate')).toBe(false)
      const canonical = cache.resolve(sessionId, attachment)
      read.resolve({ ok: true, value: { attachment, data: Uint8Array.of(1) } })
      await expect(canonical).resolves.toBe('blob:canonical')
      expect(cache.peek(sessionId, attachment)).toBe('blob:canonical')
      expect(revoked).toContain('blob:seeded')

      reference.release()
      await runtime.flush()
      expect(revoked).toContain('blob:canonical')
      await runtime.dispose()
    } finally {
      created.mockRestore()
      URL.revokeObjectURL = originalRevoke
    }
  })

  it('revokes a seeded preview when canonical bytes cannot be read', async () => {
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)
    try {
      const runtime = await SlotTestRuntime.create()
      const sessionId = await runtime.sessions.add({
        id: 's1',
        session: {
          readAttachment: () => Promise.resolve({
            ok: false,
            error: new RemoteError('session/attachment-invalid', 'missing', { reason: 'missing' }),
          } as never),
        },
      })
      const reference = runtime.sessions.retain(sessionId)
      await reference.ready
      const cache = new HistoricalImageCache(runtime.ctx, runtime.ctx.sessions, 3)
      const attachment = {
        attachmentId: AttachmentId('image-missing'), mediaType: 'image/png', bytes: 1, width: 1, height: 1,
      } as const

      expect(cache.seed(sessionId, attachment, 'blob:seeded')).toBe(true)
      await expect(cache.resolve(sessionId, attachment)).rejects.toThrow('attachment-invalid: missing')
      expect(cache.peek(sessionId, attachment)).toBeUndefined()
      expect(revoked).toHaveBeenCalledWith('blob:seeded')
      reference.release()
      await runtime.dispose()
    } finally {
      revoked.mockRestore()
    }
  })

  it('queues attachment reads beyond the configured concurrency', async () => {
    const pendingReads: Array<() => void> = []
    let started = 0
    const read = (): Promise<never> => new Promise<never>((_resolve, reject) => {
      started += 1
      pendingReads.push(() => { reject(new Error('read finished')) })
    })
    const runtime = await SlotTestRuntime.create()
    const sessionId = await runtime.sessions.add({ id: 's1', session: { readAttachment: () => read() } })
    const reference = runtime.sessions.retain(sessionId)
    await reference.ready
    const cache = new HistoricalImageCache(runtime.ctx, runtime.ctx.sessions, 1)
    const first = cache.resolve(sessionId, attachmentOf('image-a'))
    const second = cache.resolve(sessionId, attachmentOf('image-b'))
    // A started read enters the microtask queue; flush it before counting.
    await runtime.flush()
    // The second read waits for the only slot instead of starting alongside it.
    expect(started).toBe(1)
    pendingReads.shift()!()
    await expect(first).rejects.toThrow('read finished')
    await runtime.flush()
    expect(started).toBe(2)
    pendingReads.shift()!()
    await expect(second).rejects.toThrow('read finished')

    reference.release()
    await runtime.dispose()
  })

  it('refuses to seed for an unknown session', async () => {
    const runtime = await SlotTestRuntime.create()
    const cache = new HistoricalImageCache(runtime.ctx, runtime.ctx.sessions, 3)
    const attachment = {
      attachmentId: AttachmentId('image-unknown'), mediaType: 'image/png', bytes: 1, width: 1, height: 1,
    } as const
    expect(cache.seed('missing' as never, attachment, 'blob:orphan')).toBe(false)
    await runtime.dispose()
  })

  it('evicts the least-recently used image over the byte budget and re-reads it on demand', async () => {
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)
    let blobCount = 0
    const created = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      blobCount += 1
      return `blob:img-${String(blobCount)}`
    })
    try {
      const reads: string[] = []
      const runtime = await SlotTestRuntime.create()
      const sessionId = await runtime.sessions.add({
        id: 's1',
        session: {
          readAttachment: (attachmentId: string) => {
            reads.push(attachmentId)
            return Promise.resolve({
              ok: true,
              value: {
                attachment: { attachmentId: AttachmentId(attachmentId), mediaType: 'image/png', bytes: 6, width: 1, height: 1 },
                data: Uint8Array.of(1, 2, 3, 4, 5, 6),
              },
            } as never)
          },
        },
      })
      const reference = runtime.sessions.retain(sessionId)
      await reference.ready
      const cache = new HistoricalImageCache(runtime.ctx, runtime.ctx.sessions, 3, 10)

      await cache.resolve(sessionId, attachmentOf('image-a'))
      await cache.resolve(sessionId, attachmentOf('image-b'))
      // image-a (6B) + image-b (6B) exceed the 10B budget; the oldest evicts.
      expect(cache.peek(sessionId, attachmentOf('image-a'))).toBeUndefined()
      expect(cache.peek(sessionId, attachmentOf('image-b'))).toBe('blob:img-2')
      expect(revoked).toHaveBeenCalledWith('blob:img-1')

      // Re-rendering an evicted image reads fresh bytes under a new URL, and
      // that insert evicts image-b as the new oldest.
      await cache.resolve(sessionId, attachmentOf('image-a'))
      expect(reads).toEqual(['image-a', 'image-b', 'image-a'])
      expect(cache.peek(sessionId, attachmentOf('image-a'))).toBe('blob:img-3')
      expect(cache.peek(sessionId, attachmentOf('image-b'))).toBeUndefined()
      expect(revoked).toHaveBeenCalledWith('blob:img-2')

      reference.release()
      await runtime.dispose()
    } finally {
      created.mockRestore()
      revoked.mockRestore()
    }
  })

  it('keeps a recently used image over an older untouched one', async () => {
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)
    let blobCount = 0
    const created = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      blobCount += 1
      return `blob:img-${String(blobCount)}`
    })
    try {
      const runtime = await SlotTestRuntime.create()
      const sessionId = await runtime.sessions.add({
        id: 's1',
        session: {
          readAttachment: () => Promise.resolve({
            ok: true,
            value: {
              attachment: { attachmentId: AttachmentId('image'), mediaType: 'image/png', bytes: 6, width: 1, height: 1 },
              data: Uint8Array.of(1, 2, 3, 4, 5, 6),
            },
          } as never),
        },
      })
      const reference = runtime.sessions.retain(sessionId)
      await reference.ready
      const cache = new HistoricalImageCache(runtime.ctx, runtime.ctx.sessions, 3, 12)

      await cache.resolve(sessionId, attachmentOf('image-a'))
      await cache.resolve(sessionId, attachmentOf('image-b'))
      expect(cache.peek(sessionId, attachmentOf('image-a'))).toBeDefined()
      // image-a is used again, so the next overflow evicts image-b instead.
      await cache.resolve(sessionId, attachmentOf('image-a'))
      await cache.resolve(sessionId, attachmentOf('image-c'))
      expect(cache.peek(sessionId, attachmentOf('image-a'))).toBeDefined()
      expect(cache.peek(sessionId, attachmentOf('image-b'))).toBeUndefined()
      expect(cache.peek(sessionId, attachmentOf('image-c'))).toBeDefined()

      reference.release()
      await runtime.dispose()
    } finally {
      created.mockRestore()
      revoked.mockRestore()
    }
  })

  it('never evicts a read that is still in flight', async () => {
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)
    let blobCount = 0
    const created = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      blobCount += 1
      return `blob:img-${String(blobCount)}`
    })
    try {
      const pending = Promise.withResolvers<Awaited<ReturnType<SessionFace['readAttachment']>>>()
      const settled = Promise.resolve({
        ok: true,
        value: {
          attachment: { attachmentId: AttachmentId('image'), mediaType: 'image/png', bytes: 6, width: 1, height: 1 },
          data: Uint8Array.of(1, 2, 3, 4, 5, 6),
        },
      } as never)
      const runtime = await SlotTestRuntime.create()
      const sessionId = await runtime.sessions.add({
        id: 's1',
        session: {
          readAttachment: (attachmentId: string) =>
            attachmentId === 'image-a' ? pending.promise : settled,
        },
      })
      const reference = runtime.sessions.retain(sessionId)
      await reference.ready
      const cache = new HistoricalImageCache(runtime.ctx, runtime.ctx.sessions, 3, 10)

      const inFlight = cache.resolve(sessionId, attachmentOf('image-a'))
      await cache.resolve(sessionId, attachmentOf('image-b'))
      await cache.resolve(sessionId, attachmentOf('image-c'))
      // image-a is still loading (unknown bytes), so image-b evicts instead.
      expect(cache.peek(sessionId, attachmentOf('image-b'))).toBeUndefined()
      expect(cache.peek(sessionId, attachmentOf('image-c'))).toBeDefined()

      pending.resolve({
        ok: true,
        value: {
          attachment: { attachmentId: AttachmentId('image-a'), mediaType: 'image/png', bytes: 6, width: 1, height: 1 },
          data: Uint8Array.of(1, 2, 3, 4, 5, 6),
        },
      } as never)
      // image-a's deferred read settled last, so its blob was created last;
      // bytes landing counts as a use, and image-c pays the budget instead.
      await expect(inFlight).resolves.toBe('blob:img-3')
      expect(cache.peek(sessionId, attachmentOf('image-a'))).toBe('blob:img-3')
      expect(cache.peek(sessionId, attachmentOf('image-c'))).toBeUndefined()
      expect(revoked).toHaveBeenCalledWith('blob:img-2')

      reference.release()
      await runtime.dispose()
    } finally {
      created.mockRestore()
      revoked.mockRestore()
    }
  })

  it('keeps a lone image that alone exceeds the byte budget', async () => {
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined)
    const created = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:huge')
    try {
      const runtime = await SlotTestRuntime.create()
      const sessionId = await runtime.sessions.add({
        id: 's1',
        session: {
          readAttachment: () => Promise.resolve({
            ok: true,
            value: {
              attachment: { attachmentId: AttachmentId('image-huge'), mediaType: 'image/png', bytes: 20, width: 1, height: 1 },
              data: Uint8Array.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20),
            },
          } as never),
        },
      })
      const reference = runtime.sessions.retain(sessionId)
      await reference.ready
      const cache = new HistoricalImageCache(runtime.ctx, runtime.ctx.sessions, 3, 10)
      const attachment = {
        attachmentId: AttachmentId('image-huge'), mediaType: 'image/png', bytes: 20, width: 1, height: 1,
      } as const

      await cache.resolve(sessionId, attachment)
      // Evicting its own mounted <img> would only re-read the same bytes.
      expect(cache.peek(sessionId, attachment)).toBe('blob:huge')
      expect(revoked).not.toHaveBeenCalledWith('blob:huge')

      reference.release()
      await runtime.dispose()
    } finally {
      created.mockRestore()
      revoked.mockRestore()
    }
  })
})
