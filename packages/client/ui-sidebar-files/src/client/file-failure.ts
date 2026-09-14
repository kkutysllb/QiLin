/**
 * The failure line one Remote code deserves, in terms of the file the editor
 * could not read or save. Kept apart from the component so the mapping is
 * testable on its own; codes this editor does not name fall to the generic
 * line carrying the carrier's message.
 * @module
 */
import type { RemoteFailure } from '@qilin/api-remotes/client'
import type { TranslateNS } from '@qilin/client-locale/client'

/** Render a byte count the way a person reads one. */
function humanBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${Math.round(bytes / (1024 * 1024))} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} B`
}

/**
 * Say what went wrong, in terms of the file rather than of the transport.
 * @param t - namespace-bound translate.
 * @param failure - the settled Remote failure.
 * @returns the line to show in the editor pane.
 */
export function fileFailureLine(t: TranslateNS<'sidebarFiles'>, failure: RemoteFailure): string {
  switch (failure.code) {
    case 'workspace-file/not-found': return t('file.error.notFound')
    case 'workspace-file/too-large':
      return t('file.error.tooLarge', { size: humanBytes(failure.details.limit) })
    case 'workspace-file/not-text': return t('file.error.notText')
    case 'workspace-file/not-regular-file': return t('file.error.notRegularFile')
    case 'workspace-file/outside-workspace': return t('file.error.outsideWorkspace')
    case 'workspace-file/stale': return t('file.conflict')
    // Carrier and unclassified host failures reach the reader as themselves:
    // this editor knows nothing useful to add to a transport-level message.
    default: return t('file.error.unavailable', { message: failure.message })
  }
}
