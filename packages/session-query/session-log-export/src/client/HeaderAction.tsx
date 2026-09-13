import type { ReactNode } from 'react'
import { SessionLogDownloadDialog, type SessionLogDownloadDialogProps } from './Dialog.tsx'

/**
 * Render the Session Header's download feedback surface: the shared result
 * dialog, and nothing else. The header carries no download button; the
 * `/export` command is the trigger, and the dialog reports its progress and
 * outcome.
 * @param props - Session runtime, download controller state, and localized copy.
 * @returns the Session-scoped dialog contribution.
 */
export function SessionLogDownloadHeaderAction(props: SessionLogDownloadDialogProps): ReactNode {
  return <SessionLogDownloadDialog {...props} />
}
