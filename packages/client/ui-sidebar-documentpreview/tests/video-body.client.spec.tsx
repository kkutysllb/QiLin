// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { VideoBody, type VideoBodyProps } from '../src/client/video/VideoBody.tsx'
import { makeTranslate } from '@qilin-agent/client-test-runtime'
import { zh } from '../src/client/video/locales.ts'
import type { DocumentBodyOwner, DocumentContent } from '../src/client/document/contract.ts'
import type { SidebarRightTabInfo } from '@qilin-agent/client-ui-sidebar-right/client'
import type { PaneId, TabId } from '@qilin-agent/client-ui-dockkit'

const t = makeTranslate(zh, zh)

const FILE = 'qilin-resource://file/session/s-1/demo.mp4'

const RENDERER: Extract<DocumentContent, { kind: 'renderer' }> = {
  kind: 'renderer',
  revision: 1,
  loaded: vi.fn(),
  failed: vi.fn(),
  reload: vi.fn(),
}

const OWNER: DocumentBodyOwner = {
  resourceAddress: FILE,
  content: RENDERER,
  addResource: vi.fn(),
  setResources: vi.fn(),
  wrap: false,
  scrollportRef: () => {},
}

/** The framework's tab reader; the video body never reads it. */
const TAB_INFO: SidebarRightTabInfo = {
  sidebar: { expanded: true, fullscreen: false },
  panel: { id: 'pane-video' as PaneId },
  tab: {
    id: 'tab-video' as TabId, kind: 'document', contentId: 'document', title: 'demo.mp4', visible: true,
    navigation: { address: FILE, params: undefined, revision: 0 },
    signal: new AbortController().signal,
    actions: { bindCommands: () => () => {}, openResource: () => {}, openTab: () => {}, close: () => {} },
  },
}

afterEach(cleanup)

describe('VideoBody', () => {
  it('streams the media route URL in a video element with the download affordance', () => {
    const props: Partial<VideoBodyProps> = { ...OWNER, useTabInfo: () => TAB_INFO, content: RENDERER, resourceAddress: FILE, t }
    const view = render(<VideoBody {...(props as VideoBodyProps)} />)
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
    const props: Partial<VideoBodyProps> = {
      ...OWNER, useTabInfo: () => TAB_INFO, content: { ...RENDERER, loaded, failed }, resourceAddress: FILE, t,
    }
    const view = render(<VideoBody {...(props as VideoBodyProps)} />)
    expect(loaded).toHaveBeenCalledExactlyOnceWith('')
    fireEvent.error(view.container.querySelector('video')!)
    expect(failed).toHaveBeenCalledTimes(1)
    expect(screen.getByText(t('videoUnsupported'))).toBeTruthy()
  })
})
