/** Fetch-once cache of the Session-wide changed-file list the Host serves while its recorder lives. */
import type { SessionId } from '@qilin/session/types'
import { changesSessionUrl, isChangesSession, type ChangesSession } from '../changes.ts'
import { HostReadStore } from './host-read-store.ts'

/** The folded list, `'missing'` once the Host no longer holds the Session's recorder, or `'loading'` while the request runs. */
export type SessionChangesState = ChangesSession | 'missing' | 'loading'

/** One browser plugin's reads of one Session's folded changes; a list or a missing answer stands until the connection is replaced. */
export class SessionChangesStore extends HostReadStore<SessionChangesState> {
  constructor() {
    super({
      loading: 'loading',
      failed: 'missing',
      retryable: () => false,
      decode: async (response) => {
        if (!response.ok) return 'missing'
        const value: unknown = await response.json()
        return isChangesSession(value) ? value : 'missing'
      },
    })
  }

  /**
   * Read the Session's folded changes once; a later read of the same Session returns the cached state.
   * @param sessionId - the viewed Session.
   * @returns after the state is published.
   */
  load(sessionId: SessionId): Promise<void> {
    return this.loadUrl(changesSessionUrl(sessionId))
  }
}
