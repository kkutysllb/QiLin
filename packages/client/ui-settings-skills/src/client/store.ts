/**
 * Skills page store: the skill catalog one Session's composition resolves,
 * read through the `skills` Remote. The Host stays the single fact source —
 * every read answers with the complete catalog this page renders.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import { createSnapshotStore } from '@qilin/client-store'
import type { SnapshotStore } from '@qilin/client-store'
import type { SkillEntry } from '@qilin/api-remotes/client'
import type { SessionId } from '@qilin/session/types'
import type { RemoteResult } from '@qilin/typert-protocol'

/** What the skills page renders at any moment. */
export interface SkillsPageState {
  /** `loading` only before the first answer; later refreshes keep the last rows. */
  status: 'idle' | 'loading' | 'ready'
  /** The failed call's message; null once a call succeeds. */
  error: string | null
  /** Session whose composition the listed catalog came from; null when none is open. */
  sessionId: SessionId | null
  skills: readonly SkillEntry[]
}

/** The skills page controller (one per settings surface). */
export class SkillsStore {
  /** The snapshot the page renders from (uSES-safe store). */
  readonly store: SnapshotStore<SkillsPageState> = createSnapshotStore<SkillsPageState>({
    status: 'idle',
    error: null,
    sessionId: null,
    skills: [],
  })

  /** Latest read wins; an older answer never overwrites a newer one. */
  private generation = 0

  /**
   * @param ctx - the page plugin's context, whose `remote.skills` namespace
   * carries the catalog read this page performs.
   */
  constructor(private readonly ctx: ClientContext) {}

  /**
   * Read the catalog one Session's composition resolves.
   * @param sessionId - Session to address; an absent one clears the page
   * without a call, because the catalog is the Session's own composition.
   * @returns whether the answer landed.
   */
  async load(sessionId: SessionId | undefined): Promise<boolean> {
    if (sessionId === undefined) {
      // An absent Session owns no catalog: supersede any in-flight read and
      // publish the empty state without a wire call.
      this.generation += 1
      this.publish(null, [])
      return true
    }
    this.store.update((state) => { state.status = 'loading' })
    return await this.call(sessionId)
  }

  /** Run one catalog read and publish its rows or its failure. */
  private async call(sessionId: SessionId): Promise<boolean> {
    const generation = ++this.generation
    const controller = new AbortController()
    try {
      const result: RemoteResult<{ readonly skills: readonly SkillEntry[] }> =
        await this.ctx.remote.skills.list({ sessionId }, controller.signal)
      if (generation !== this.generation) return false
      if (!result.ok) {
        this.fail(result.error.message)
        return false
      }
      this.publish(sessionId, result.value.skills)
      return true
    } catch (error) {
      if (generation !== this.generation) return false
      this.fail(error instanceof Error ? error.message : String(error))
      return false
    }
  }

  /** Publish one catalog: the page is ready and no call failed. */
  private publish(sessionId: SessionId | null, skills: readonly SkillEntry[]): void {
    this.store.update((state) => {
      state.status = 'ready'
      state.error = null
      state.sessionId = sessionId
      state.skills = skills
    })
  }

  /** Publish a failed read, keeping the last rows the answered catalog described. */
  private fail(message: string): void {
    this.store.update((state) => {
      state.status = 'ready'
      state.error = message
    })
  }
}
