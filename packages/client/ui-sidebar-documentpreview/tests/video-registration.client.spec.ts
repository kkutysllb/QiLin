/** Video metadata, keyed slot, dictionary, and disposal registration. */
import { Context } from '@qilin-agent/kylin'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DocumentPreviewRegistry } from '../src/client/document/registry.ts'
import { VideoBody } from '../src/client/video/VideoBody.tsx'
import { apply, VIDEO_EXTENSIONS } from '../src/client/video/index.ts'
import { en, zh } from '../src/client/video/locales.ts'

const VIDEO_BODY_ID = '@qilin-agent/client-ui-sidebar-documentpreview/video'

let dispose: (() => Promise<void>) | undefined
afterEach(async () => { await dispose?.(); dispose = undefined })

describe('video registration', () => {
  it('claims the video suffixes as a builtin renderer preview without wrap, and leaves TypeScript to the code viewer', async () => {
    const ctx = new Context()
    const registry = new DocumentPreviewRegistry()
    const dictionaries = new Map<string, unknown>()
    const register = vi.fn((_options: unknown, _body: unknown) => () => {})
    ctx.provide('documentPreviews', registry)
    ctx.provide('slots', { inject: (_key: string, callback: () => () => void) => callback(), register } as never)
    ctx.provide('locale', {
      bind: () => (key: keyof typeof en) => en[key],
      register: (name: string, value: unknown) => {
        dictionaries.set(name, value)
        return () => { dictionaries.delete(name) }
      },
    } as never)
    const fiber = ctx.plugin({ apply })
    dispose = async () => { await fiber.dispose() }
    await fiber.await()

    for (const extension of VIDEO_EXTENSIONS) {
      expect(registry.candidates(`clip.${extension}`).map(entry => entry.id)).toEqual([VIDEO_BODY_ID])
    }
    // `ts` names TypeScript here, not MPEG-TS.
    expect(registry.candidates('clip.ts').map(entry => entry.id)).not.toContain(VIDEO_BODY_ID)

    const definition = registry.getSnapshot()[0]
    if (definition === undefined) throw new Error('the video preview was not registered')
    expect(definition).toMatchObject({ priority: 'builtin', loading: 'renderer', wrap: false })
    // The title is a locale-following thunk the surface resolves at read time.
    expect(definition.title()).toBe(en.title)
    expect(dictionaries.get('sidebarVideo')).toEqual({ zh, en })
    expect(register).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'sidebar.right.tab.document', key: VIDEO_BODY_ID, locale: 'sidebarVideo' }),
      VideoBody,
    )

    await dispose()
    expect(registry.getSnapshot()).toEqual([])
    expect(dictionaries.size).toBe(0)
  })
})
