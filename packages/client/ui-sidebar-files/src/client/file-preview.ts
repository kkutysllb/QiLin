/**
 * The editor's route to the preview viewer: one targeted open of the tab's own
 * address on the `text` type, whose fallback claim takes every address this
 * type takes.
 *
 * The toolbar cannot use the tab's own `openResource` action for this: that
 * action opens through the registry's ranking, and this type outranks the
 * viewer, so the ranking would land back here. Naming the kind is the one way
 * past it, and the named kind travels through the Sidebar controller's
 * `scope` so the open lands in the tab's session even if the user has since
 * switched conversations.
 * @module
 */
import type { ISidebarRight } from '@qilin/client-ui-sidebar-right/client'
import type { SessionId } from '@qilin/session/types'

/** The preview navigation the body receives. */
export interface FilePreviewInjected {
  /**
   * Open this address in the preview viewer, in this session.
   * @param sessionId - the session the open lands in.
   * @param address - the tab's own `qilin-resource://file/` address.
   */
  readonly openPreview: (sessionId: SessionId, address: string) => void
}

/**
 * Bind the preview navigation to the Sidebar controller.
 * @param sidebarRight - the right-Sidebar navigation controller.
 * @returns the Slot `inject` factory carrying the callback.
 */
export function filePreviewFace(sidebarRight: ISidebarRight): () => FilePreviewInjected {
  return (): FilePreviewInjected => ({
    openPreview(sessionId, address) {
      sidebarRight.openResource(address, { kind: 'text', scope: sessionId })
    },
  })
}
