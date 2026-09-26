/**
 * Host desktop availability, file associations, and open/reveal gestures over
 * the Session Remote for one previewed file. The desktop answer is read once
 * per page; a failed read renders no control. Every gesture goes through the
 * Remote, whose Host side re-verifies the path against the composed
 * filesystem before any native command runs.
 */

import { createSnapshotStore, type SnapshotStore } from '@qilin/client-store'
import type { RemoteResult } from '@qilin/api-remotes/client'
import type {
  SessionOpenWorkspacePathRequest, SessionOpenWorkspacePathValue, SessionWorkspacePathApplication,
} from '@qilin/api-session-controller/types'

/** What one path gesture asks of the Host: the default application, or the file manager showing the file. */
export type OpenInAppPathAction = 'open' | 'reveal'

/** Failure kind of one settled path gesture, for the initiating control to announce. */
export type OpenInAppPathFailure = 'openError' | 'revealError'

/** The slice of the Client Remote the file-opening controls call. */
export interface OpenInAppPathRemote {
  /** Whether the Host can hand a workspace path to a native desktop. */
  canOpenWorkspacePath(): Promise<RemoteResult<boolean>>
  /** Current registered file handlers and their default selection. */
  workspacePathApplications(
    request: { readonly path: string }, signal?: AbortSignal,
  ): Promise<RemoteResult<readonly SessionWorkspacePathApplication[]>>
  /** Open one Host path in its default application, or reveal it in the file manager. */
  openWorkspacePath(
    request: SessionOpenWorkspacePathRequest, signal?: AbortSignal,
  ): Promise<RemoteResult<SessionOpenWorkspacePathValue>>
}

/** Page-lifetime desktop availability and the open/reveal carrier shared by every file-opening control. */
export class OpenInAppPathController {
  /** Whether the Host can open paths; null until the Host answered, false also after a failed read. */
  readonly desktop: SnapshotStore<boolean | null> = createSnapshotStore<boolean | null>(null)
  private loading: Promise<void> | undefined

  /**
   * @param remote - the Session Remote namespace answering availability and running gestures.
   */
  constructor(private readonly remote: OpenInAppPathRemote) {}

  /**
   * Read desktop availability once per controller life; concurrent calls share the read.
   * @returns after availability is published.
   */
  load(): Promise<void> {
    this.loading ??= this.run()
    return this.loading
  }

  /**
   * Open one Host path in its default application, or reveal it in the file manager.
   * @param path - absolute path on the Host, as the file's metadata reports it.
   * @param action - default application open, or file-manager reveal.
   * @param application - registered application id for an explicit open.
   * @returns the failure kind to announce, or `null` once the Host acknowledged.
   */
  async openPath(path: string, action: OpenInAppPathAction, application?: string): Promise<OpenInAppPathFailure | null> {
    const request: SessionOpenWorkspacePathRequest = action === 'reveal'
      ? { path, action }
      : { path, ...(application === undefined ? {} : { application }) }
    let opened = false
    try {
      opened = (await this.remote.openWorkspacePath(request)).ok
    } catch {
      // Swallows carrier rejections: an unreachable Host failed the gesture
      // like a Host that refused it, and the control announces that.
    }
    return opened ? null : action === 'open' ? 'openError' : 'revealError'
  }

  /**
   * Read the file's registered handlers; a failure stays distinct from an empty list.
   * @param path - file path reported by the Host.
   * @param signal - lifetime of the requesting preview.
   * @returns application metadata, or null when the query fails.
   */
  async applications(path: string, signal: AbortSignal): Promise<readonly SessionWorkspacePathApplication[] | null> {
    let result: RemoteResult<readonly SessionWorkspacePathApplication[]>
    try {
      result = await this.remote.workspacePathApplications({ path }, signal)
    } catch {
      // Swallows carrier rejections: the control reports a failed query and
      // keeps the file manager's reveal available.
      return null
    }
    return result.ok ? result.value : null
  }

  private async run(): Promise<void> {
    let available = false
    try {
      const result = await this.remote.canOpenWorkspacePath()
      available = result.ok && result.value
    } catch {
      // Swallows carrier rejections: an unreachable Host reads as no desktop,
      // so the preview shows no file control rather than a broken one.
    }
    this.desktop.set(available)
  }
}
