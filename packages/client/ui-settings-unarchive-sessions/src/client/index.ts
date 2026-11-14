/** Archived-session Settings page, browser half. */

import type { Context as ClientContext } from '@qilin-agent/kylin'
import type {} from '@qilin-agent/client-locale/client'
import type {} from '@qilin-agent/client-ui-renderer/client'
import type {} from '@qilin-agent/client-ui-settings/client'
// Type-only: pulls the `uiWorkspace` Context merge and the `useWorkspaces`
// global standard prop this page reads.
import type {} from '@qilin-agent/client-ui-workspace/client'
// Type-only: pulls the `useSessions` global standard prop.
import type {} from '@qilin-agent/client-ui-session/client'
import { ArchivedSessionsSection } from './ArchivedSessionsSection.tsx'
import type {
  ArchivedSessionDeleteFailure,
  ArchivedSessionDeleteResult,
  ArchivedSessionsSectionInjected,
} from './ArchivedSessionsSection.tsx'
import { en, zh, type ArchivedSessionsLocaleKey } from './locales.ts'

export type {
  ArchivedSessionDeleteFailure,
  ArchivedSessionDeleteResult,
  ArchivedSessionsSectionInjected,
  ArchivedSessionsSectionProps,
} from './ArchivedSessionsSection.tsx'
export type { ArchivedSessionsLocaleKey } from './locales.ts'

declare module '@qilin-agent/client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Archived-session page copy. */
    'settings.archivedSessions': ArchivedSessionsLocaleKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'settings.archivedSessions'

/**
 * Stable Remote failure codes a deletion can report. The workspace command
 * wraps its failure in an Error whose message carries the code, so this page
 * maps the code back to a reason the copy can explain.
 */
const DELETE_FAILURE_CODES: readonly [string, ArchivedSessionDeleteFailure][] = [
  ['session/not-archived', 'not-archived'],
  ['session/live', 'live'],
  ['session/active', 'active'],
  ['session/delete-busy', 'busy'],
  ['session/delete-unsupported', 'unsupported'],
]

/**
 * Which refusal one rejected deletion names.
 * @param error - the value `deleteArchivedSession` rejected with.
 * @returns the mapped reason, or `unknown` for a fault the page cannot explain.
 */
function deleteFailureOf(error: unknown): ArchivedSessionDeleteFailure {
  const message = error instanceof Error ? error.message : String(error)
  return DELETE_FAILURE_CODES.find(([code]) => message.includes(code))?.[1] ?? 'unknown'
}

/** Services required by the Settings registration and the archive writes. */
export const inject = ['slots', 'locale', 'uiWorkspace']

/** Contribute the archived-session page to Settings. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-settings-unarchive-sessions: dictionaries')

  const t = ctx.locale.bind(NS)
  const injected = (): ArchivedSessionsSectionInjected => ({
    unarchive: sessionId => ctx.uiWorkspace.unarchiveSession(sessionId),
    deleteArchivedSession: async (sessionId): Promise<ArchivedSessionDeleteResult> => {
      try {
        await ctx.uiWorkspace.deleteArchivedSession(sessionId)
        return { ok: true }
      } catch (error: unknown) {
        const reason = deleteFailureOf(error)
        // A refusal is the page's to explain; a transport fault is not, so it
        // keeps its cause in the console while the row stays on screen.
        if (reason === 'unknown') ctx.logger.warn(`archived session delete rejected: ${String(error)}`)
        return { ok: false, reason }
      }
    },
  })

  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'archived-sessions',
    order: 25,
    label: () => t('nav'),
    locale: NS,
    inject: injected,
  }, ArchivedSessionsSection))
}
