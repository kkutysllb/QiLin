// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VideoBody, type VideoBodyProps } from '../src/client/video/VideoBody.tsx'
import { makeTranslate } from '@qilin/client-test-runtime'
import { zh } from '../src/client/video/locales.ts'
import type { DocumentContent } from '../src/client/document/contract.ts'

const t = makeTranslate(zh, zh)

const FILE = 'qilin-resource://file/session/s-1/demo.mp4'
const SEAT = {
  useTabInfo: vi.fn(), sessionId: 's-1', useSessions: vi.fn(), useStore: vi.fn(), actions: {}, renderSlot: (): null => null,
  addResource: vi.fn(), setResources: vi.fn(), wrap: false, scrollportRef: { current: null },
} as unknown as object

const RENDERER: Extract<DocumentContent, { kind: 'renderer' }> = {
  kind: 'renderer',
  revision: 1,
  loaded: vi.fn(),
  failed: vi.fn(),
  reload: vi.fn(),
}

afterEach(cleanup)

describe('VideoBody', () => {
  it('streams the media route URL in a video element with the download affordance', () => {
    const view = render(<VideoBody
      {...({ content: RENDERER, resourceAddress: FILE, t, ...SEAT } as unknown as VideoBodyProps)}
    />)
    const video = view.container.querySelector('video')!
    expect(video.getAttribute('src')).toBe('/sidebar/media?sessionId=s-1&path=demo.mp4')
    expect(video.getAttribute('controls')).not.toBeNull()
    const download = screen.getByRole('link', { name: t('downloadToView') })
    expect(download.getAttribute('href')).toBe('/sidebar/media?sessionId=s-1&path=demo.mp4&download=1')
    expect(download.getAttribute('download')).not.toBeNull()
  })

  it('reports readiness on mount and failure through the element error event', () => {
    const loaded = vi.fn()
    const failed = vi.fn()
    const view = render(<VideoBody
      {...({ content: { ...RENDERER, loaded, failed }, resourceAddress: FILE, t, ...SEAT } as unknown as VideoBodyProps)}
    />)
    expect(loaded).toHaveBeenCalledExactlyOnceWith('')
    fireEvent.error(view.container.querySelector('video')!)
    expect(failed).toHaveBeenCalledTimes(1)
    expect(screen.getByText(t('videoUnsupported'))).toBeTruthy()
  })
})
