/**
 * Pure status, diff, history, and failure arithmetic for the source-control tab.
 *
 * The decisions worth testing stay free of React and the wire: which of the
 * three change sections a row belongs to, how one unified-diff line is
 * colored, which line a Remote failure reports, and what label one commit's
 * author time carries.
 */
import type { RemoteFailure } from '@qilin-agent/api-remotes/client'
import type { GitStatusEntry } from '@qilin-agent/api-workspace-git/types'
import type { TranslateNS } from '@qilin-agent/client-ui-slots'
import type {} from './locales.ts'

/**
 * Commits one history read asks for: the section loads lazily in pages, so a
 * long history never floods the panel. The Host accepts `1..100`.
 */
export const HISTORY_PAGE_SIZE = 30

/** The three change sections, in the order the panel lists them. */
export interface GitChangeGroups {
  /** Entries whose worktree differs from the index. */
  readonly unstaged: readonly GitStatusEntry[]
  /** Entries whose index differs from `HEAD`. */
  readonly staged: readonly GitStatusEntry[]
  /** Entries neither `HEAD` nor the index knows. */
  readonly untracked: readonly GitStatusEntry[]
}

/**
 * Split one status's entries into the three change sections.
 *
 * The wire flags are disjoint by construction (`??` carries only
 * `untracked`), and an entry staged and modified again (`MM`) belongs to the
 * staged and the unstaged section together.
 * @param entries - the status's entries, in its order.
 * @returns the three groups, each keeping the given order.
 */
export function groupChanges(entries: readonly GitStatusEntry[]): GitChangeGroups {
  const unstaged: GitStatusEntry[] = []
  const staged: GitStatusEntry[] = []
  const untracked: GitStatusEntry[] = []
  for (const entry of entries) {
    if (entry.staged) staged.push(entry)
    if (entry.unstaged) unstaged.push(entry)
    if (entry.untracked) untracked.push(entry)
  }
  return { unstaged, staged, untracked }
}

/**
 * Whether the row menu offers discard for one entry: a file git can restore.
 * An untracked path has no tracked content to restore, so it never gets one.
 * @param entry - the row's status entry.
 * @returns whether discard is offered.
 */
export function canDiscardEntry(entry: GitStatusEntry): boolean {
  return entry.staged || entry.unstaged
}

/**
 * The status letter one row's badge shows: the column the row's section is
 * about, falling back to the other column, then `?` for untracked rows.
 * @param entry - the row's status entry.
 * @returns one-character badge text.
 */
export function badgeOf(entry: GitStatusEntry): string {
  if (entry.index !== ' ' && entry.index !== '?') return entry.index
  if (entry.worktree !== ' ' && entry.worktree !== '?') return entry.worktree
  return '?'
}

/** How one unified-diff line is colored in the diff pane. */
export type DiffLineKind = 'meta' | 'hunk' | 'add' | 'del' | 'context'

/**
 * Classify one line of a unified diff.
 *
 * `diff`, `index`, `---`, and `+++` headers are chrome around the hunks; a
 * line starting `@@` opens a hunk; the rest is the content the letters lead.
 * @param line - one line of the diff text, without its terminator.
 * @returns the line's rendering class.
 */
export function diffLineKind(line: string): DiffLineKind {
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) {
    return 'meta'
  }
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  return 'context'
}

/** Two-digit zero padding for the clock half of a commit's time. */
function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

/**
 * The time one history row shows, in the panel's clock convention: a commit
 * from today carries its clock alone, one from this year its date and clock,
 * an older one its full date and clock. The Host reports the author date in
 * strict ISO 8601 with its offset, so the two dates are compared in the
 * reader's own zone.
 * @param iso - the commit's author date, as `log` reported it.
 * @param t - namespace-bound translate.
 * @param now - the clock the date is compared against; defaults to this moment.
 * @returns the label the row carries.
 */
export function formatCommitTime(
  iso: string,
  t: TranslateNS<'sidebarGit'>,
  now: number = Date.now(),
): string {
  const date = new Date(iso)
  const today = new Date(now)
  const clock = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  if (
    date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate()
  ) {
    return clock
  }
  const params = { y: date.getFullYear(), m: date.getMonth() + 1, d: date.getDate() }
  const day = date.getFullYear() === today.getFullYear() ? t('history.date.md', params) : t('history.date.ymd', params)
  return `${day} ${clock}`
}

/** One localized failure line for the shared status strip, with its tooltip. */
export interface GitFailureLine {
  /** The line to show. */
  readonly line: string
  /** Extra text for the line's tooltip; absent when the line says it all. */
  readonly title: string | undefined
}

/**
 * The line one Remote failure reports, naming its own code.
 *
 * The Remote error vocabulary is merge-extensible, so codes this panel does
 * not know fall through to the transport's own message.
 * @param t - namespace-bound translate.
 * @param failure - the settled Remote failure.
 * @returns the line to show and the tooltip to carry.
 */
export function gitFailureLine(t: TranslateNS<'sidebarGit'>, failure: RemoteFailure): GitFailureLine {
  switch (failure.code) {
    case 'workspace-git/not-a-repo':
      return { line: t('error.notRepo'), title: undefined }
    case 'workspace-git/bad-branch':
      return { line: t('error.badBranch', { branch: failure.details.branch }), title: undefined }
    case 'workspace-git/bad-message':
      return { line: t('error.badMessage'), title: undefined }
    case 'workspace-git/bad-path':
      return { line: t('error.badPath', { path: failure.details.path }), title: undefined }
    case 'workspace-git/bad-pr-title':
      return { line: t('error.badPrTitle', { field: failure.details.field, length: failure.details.length }), title: undefined }
    case 'workspace-git/too-large':
      return { line: t('error.tooLarge', { bytes: failure.details.bytes, maxBytes: failure.details.maxBytes }), title: undefined }
    case 'workspace-git/command-failed':
      return { line: t('error.commandFailed'), title: `${failure.details.command}\n${failure.details.stderr}`.trim() }
    default:
      return { line: t('error.other', { message: failure.message }), title: undefined }
  }
}
