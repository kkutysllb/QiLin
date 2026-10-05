/**
 * The routes to the preview viewer: the editor toolbar's targeted open of the
 * tab's own address, and the open options the workspace trees hand their rows.
 *
 * The toolbar cannot use the tab's own `openResource` action for this: that
 * action opens through the registry's ranking, and this type outranks the
 * viewer, so the ranking would land back here. Naming the kind is the one way
 * past it; the Sidebar controller places the open on the session on screen.
 * @module
 */
import type { ISidebarRight, SidebarRightTabActions } from '@qilin/client-ui-sidebar-right/client'
import type { SessionId } from '@qilin/session/types'
import { previewedPath } from '@qilin/util-workspace-path'

/** The preview navigation the body receives. */
export interface FilePreviewInjected {
  /**
   * Open this address in the preview viewer.
   * @param sessionId - the session whose preview toolbar asked; reserved by the
   *   controller's session-scoped open, which this face does not need.
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
    openPreview(_sessionId, address) {
      sidebarRight.openResource(address, { kind: 'text' })
    },
  })
}

/**
 * Open one tree row's file: a renderable document names the `text` viewer so
 * the first open is the rendered document rather than this package's code
 * view; the viewer's edit affordance opens the editor in return. Everything
 * else takes the ranked claim unchanged.
 * @param actions - the acting tab's action face, carrying `openResource`.
 * @param address - the row's session file address.
 * @param path - the row's workspace-relative path, for the renderable check.
 */
export function openFileRow(
  actions: Pick<SidebarRightTabActions, 'openResource'>,
  address: string,
  path: string,
): void {
  if (previewedPath(path)) actions.openResource(address, { kind: 'text' })
  else actions.openResource(address)
}
