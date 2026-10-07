/**
 * The `sidebarRight.openResource` takeover's claim matrix: plain file opens
 * and the delivery card's document-preview open (`kind: 'text'`) are claimed
 * into the sidebar editor under takeover, a review address reaches the wired
 * review hook, and any other demanded page type — or a takeover that is off —
 * falls through to the original method untouched.
 */

import { describe, expect, it, vi } from 'vitest'
import {
  wrapSidebarRight, type OpenPathInterceptDeps, type SidebarRightOpenOptions,
} from '../src/client/openpath-intercept.ts'

const FILE_ADDRESS = 'qilin-resource://file/session/s-1/notes/readme.md'
const REVIEW_ADDRESS = 'qilin-resource://changes-review/session/s-1/7'

interface Harness {
  readonly right: { openResource: (address: string, options?: SidebarRightOpenOptions) => void }
  readonly openInSidebar: ReturnType<typeof vi.fn>
  readonly openReview: ReturnType<typeof vi.fn>
  readonly original: ReturnType<typeof vi.fn>
  readonly dispose: () => void
}

function mounted(takeover = true): Harness {
  const original = vi.fn()
  const right = { openResource: original }
  const openInSidebar = vi.fn()
  const openReview = vi.fn(() => true)
  const deps = {
    takeoverEnabled: () => takeover,
    currentSessionId: () => 's-current',
    openInSidebar,
    revealInExplorer: vi.fn(),
    openReview,
  } satisfies OpenPathInterceptDeps
  const dispose = wrapSidebarRight(right, deps)
  return { right, openInSidebar, openReview, original, dispose }
}

describe('wrapSidebarRight', () => {
  it('claims plain file opens into the sidebar editor', () => {
    const h = mounted()
    h.right.openResource(FILE_ADDRESS)
    expect(h.openInSidebar).toHaveBeenCalledWith('notes/readme.md', 's-1')
    expect(h.original).not.toHaveBeenCalled()
  })

  it('claims the document-preview open (kind text) like a plain file open', () => {
    const h = mounted()
    h.right.openResource(FILE_ADDRESS, { kind: 'text' })
    expect(h.openInSidebar).toHaveBeenCalledWith('notes/readme.md', 's-1')
    expect(h.original).not.toHaveBeenCalled()
  })

  it('hands a review address to the wired review hook', () => {
    const h = mounted()
    h.right.openResource(REVIEW_ADDRESS)
    expect(h.openReview).toHaveBeenCalled()
    expect(h.original).not.toHaveBeenCalled()
  })

  it('passes through a demanded page type other than the text preview', () => {
    const h = mounted()
    h.right.openResource(FILE_ADDRESS, { kind: 'browser' })
    expect(h.openInSidebar).not.toHaveBeenCalled()
    expect(h.original).toHaveBeenCalledWith(FILE_ADDRESS, { kind: 'browser' })
  })

  it('passes everything through when the takeover is off', () => {
    const h = mounted(false)
    h.right.openResource(FILE_ADDRESS)
    h.right.openResource(FILE_ADDRESS, { kind: 'text' })
    h.right.openResource(REVIEW_ADDRESS)
    expect(h.openInSidebar).not.toHaveBeenCalled()
    expect(h.openReview).not.toHaveBeenCalled()
    expect(h.original).toHaveBeenCalledTimes(3)
    expect(h.original).toHaveBeenNthCalledWith(1, FILE_ADDRESS, undefined)
    expect(h.original).toHaveBeenNthCalledWith(2, FILE_ADDRESS, { kind: 'text' })
    expect(h.original).toHaveBeenNthCalledWith(3, REVIEW_ADDRESS, undefined)
  })

  it('restores the original method on dispose', () => {
    const h = mounted()
    h.dispose()
    h.right.openResource(FILE_ADDRESS)
    expect(h.openInSidebar).not.toHaveBeenCalled()
    expect(h.original).toHaveBeenCalledWith(FILE_ADDRESS)
  })
})
