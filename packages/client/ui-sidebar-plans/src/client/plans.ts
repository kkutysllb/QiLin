/**
 * Task-plan discovery: which workspace documents count as a plan, in what
 * order, and what each row is titled.
 *
 * The convention is the one agents already write against, so the same files
 * keep showing up: `plans/`, `docs/plans/`, and `.plans/` contribute their
 * top-level `*.md` entries, and the root `plan.md`, `PLAN.md`, and the same
 * name in the workspace's docs directory are well-known documents whether or
 * not any such directory exists. Deeper nesting is deliberately ignored — a plan tree is a
 * convention, not a filesystem walk.
 *
 * Two facts of the `workspaceFiles` wire shape these rules:
 *
 * - Identity comes from the path, case-folded. The endpoint's `stat` reports no
 *   device or inode — {@link WorkspaceFileStat} carries an absolute path, an
 *   opaque `version`, and a byte size — so the file a case-insensitive volume
 *   holds under two spellings (`plan.md` and `PLAN.md` on macOS) is deduped
 *   by its folded path rather than by `dev:ino`.
 * - There is no modification time to order by: `version` is an opaque
 *   freshness token the Client never parses. Rows therefore keep the order the
 *   convention declares — `plans/`, then `docs/plans/`, then `.plans/`, then
 *   the well-known documents — which is stable across polls.
 *
 * Everything here is pure over an injected {@link PlanReader}, so discovery,
 * dedupe, cap, title, and filter rules are unit-tested without a filesystem.
 */
import type { RemoteFailure, RemoteResult } from '@qilin/api-remotes/client'
import type {
  WorkspaceDirectoryListing, WorkspaceFileRange, WorkspaceFileStat, WorkspaceFileText,
} from '@qilin/api-workspace-files/types'
import type { SessionId } from '@qilin/session/types'

/** Directories whose top level is scanned for `*.md` plan documents. */
export const PLAN_DIRS = ['plans', 'docs/plans', '.plans'] as const

/** The workspace directory whose root-level plan document is well known. */
const DOCS_DIR = 'docs'

/**
 * Well-known plan document paths, relative to the workspace root.
 *
 * The docs-directory member is built from its directory's name because a
 * literal `docs/…​.md` reads to `verify-doc-refs` as a path into this
 * repository's own documentation; this one names a file in the user's
 * workspace.
 */
export const PLAN_FILES = ['plan.md', 'PLAN.md', `${DOCS_DIR}/plan.md`] as const

/** How many plans one scan lists; a runaway `plans/` directory stays bounded. */
export const PLAN_LIMIT = 20

/** Characters of a document's head the title search reads, never the whole file. */
const TITLE_HEAD_LIMIT = 512

/** Lines one title read asks the endpoint for. */
const TITLE_HEAD_LINES = 20

/**
 * Failures that mean "this part of the convention is not here": a directory
 * that was never created, a name that is not a directory, a well-known file
 * that is absent or is not a regular file, and a path the Host will not read
 * because it lies outside the workspace. Every other failure is the scan's own.
 */
const ABSENT_CODES: ReadonlySet<string> = new Set([
  'workspace-file/not-found',
  'workspace-file/not-directory',
  'workspace-file/not-regular-file',
  'workspace-file/outside-workspace',
])

/** One plan document as the panel consumes it. */
export interface PlanRow {
  /** Absolute path inside the session's workspace; the resource address's target. */
  readonly path: string
  /** File name, the title fallback. */
  readonly base: string
  /** Display path relative to the workspace root (`plans/plan.md`). */
  readonly rel: string
  /** The document's first heading, or its extension-less file name. */
  readonly title: string
}

/** One discovered document before dedupe and title resolution. */
export interface PlanCandidate {
  /** Absolute path inside the session's workspace. */
  readonly path: string
  /** File name. */
  readonly base: string
  /** Display path relative to the workspace root. */
  readonly rel: string
}

/** What one scan produced. */
export interface PlanScan {
  /** The documents found, in the convention's order. */
  readonly rows: readonly PlanRow[]
  /**
   * The first failure that is not a convention entry's absence, when the scan
   * could not be trusted. A failed title read is not one: the file name is
   * still a truthful row title.
   */
  readonly failure?: RemoteFailure
}

/**
 * The reads one scan performs, injected so the rules above stay pure.
 *
 * A call does not reject: the endpoint's result carries the failure.
 */
export interface PlanReader {
  /**
   * List one directory's direct children.
   * @param sessionId - the session whose workspace resolves the path.
   * @param path - absolute directory path.
   * @param signal - cancels the call.
   * @returns the listing, or the failure the Host declares.
   */
  list(sessionId: SessionId, path: string, signal: AbortSignal): Promise<RemoteResult<WorkspaceDirectoryListing>>
  /**
   * Read one page of a document's lines.
   * @param sessionId - the session whose workspace resolves the path.
   * @param path - absolute document path.
   * @param range - 1-based first line and the page's line count.
   * @param signal - cancels the call.
   * @returns the page, or the failure the Host declares.
   */
  read(
    sessionId: SessionId,
    path: string,
    range: WorkspaceFileRange,
    signal: AbortSignal,
  ): Promise<RemoteResult<WorkspaceFileText>>
  /**
   * Report one document's identity without its content.
   * @param sessionId - the session whose workspace resolves the path.
   * @param path - absolute document path.
   * @param signal - cancels the call.
   * @returns the file's identity, or the failure the Host declares.
   */
  stat(sessionId: SessionId, path: string, signal: AbortSignal): Promise<RemoteResult<WorkspaceFileStat>>
}

/**
 * Join the workspace root and a root-relative path with `/`.
 *
 * Whatever separators the root already uses: the Host resolves mixed
 * separators, and the scan only needs one stable string.
 * @param root - absolute workspace root.
 * @param rel - path relative to the root.
 * @returns the absolute path the endpoint receives.
 */
function joinWorkspacePath(root: string, rel: string): string {
  return `${root.replace(/[/\\]+$/, '')}/${rel}`
}

/**
 * The row title for one document: its first `#`/`##`/`###` heading from the
 * head, else the file name without its `.md`. A blank heading falls through to
 * the fallback.
 * @param head - the document's opening text, already bounded.
 * @param base - the document's file name.
 * @returns the title to show.
 */
export function planTitleFromHead(head: string, base: string): string {
  const fallback = base.replace(/\.md$/i, '')
  const heading = /^#{1,3}\s+(.+)$/m.exec(head)?.[1]?.trim() ?? ''
  return heading === '' ? fallback : heading
}

/**
 * Dedupe by case-folded absolute path and cap.
 *
 * Never by document identity: this endpoint reports none, and a path-keyed set
 * is what keeps one file listed twice under two spellings on a
 * case-insensitive volume.
 * @param found - the documents in discovery order.
 * @param limit - how many to keep.
 * @returns the unique documents, capped.
 */
export function selectPlans(found: readonly PlanCandidate[], limit: number = PLAN_LIMIT): PlanCandidate[] {
  const seen = new Set<string>()
  const unique: PlanCandidate[] = []
  for (const item of found) {
    const id = item.path.toLowerCase()
    if (seen.has(id)) continue
    seen.add(id)
    unique.push(item)
  }
  return unique.slice(0, limit)
}

/**
 * The rows a search keeps: a case-insensitive substring of the title or the
 * display path. A blank query keeps every row.
 * @param rows - the scanned rows.
 * @param query - what the search box holds.
 * @returns the rows to draw, in their scanned order.
 */
export function filterPlans(rows: readonly PlanRow[], query: string): readonly PlanRow[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return rows
  return rows.filter(row => row.title.toLowerCase().includes(needle)
    || row.rel.toLowerCase().includes(needle))
}

/**
 * Read one document's title from a bounded head.
 * @param sessionId - the session whose workspace resolves the path.
 * @param candidate - the document to title.
 * @param reader - the reads the scan performs.
 * @param signal - the tab record's lifetime.
 * @returns the heading, or the file name when the head is unreadable.
 */
async function titleOf(
  sessionId: SessionId,
  candidate: PlanCandidate,
  reader: PlanReader,
  signal: AbortSignal,
): Promise<string> {
  const result = await reader.read(
    sessionId, candidate.path, { offset: 1, limit: TITLE_HEAD_LINES }, signal,
  )
  // A document that is gone, not text, or past the endpoint's page cap is
  // still a truthful row: its file name says what it is.
  const head = result.ok ? result.value.text.slice(0, TITLE_HEAD_LIMIT) : ''
  return planTitleFromHead(head, candidate.base)
}

/**
 * Scan one workspace for plan documents: the convention directories' top
 * level, then the well-known paths, each surviving document's title resolved.
 *
 * A missing directory or file is the normal case — any subset of the
 * convention may exist — and is skipped. A failure that is not an absence is
 * carried out so the panel can say the workspace was not read, rather than
 * report that it holds no plans.
 * @param sessionId - the session whose workspace is scanned.
 * @param root - absolute path of the workspace root.
 * @param reader - the reads the scan performs.
 * @param signal - the tab record's lifetime.
 * @returns the rows found and the first failure worth reporting.
 */
export async function scanPlans(
  sessionId: SessionId,
  root: string,
  reader: PlanReader,
  signal: AbortSignal,
): Promise<PlanScan> {
  const found: PlanCandidate[] = []
  let failure: RemoteFailure | undefined
  for (const rel of PLAN_DIRS) {
    const result = await reader.list(sessionId, joinWorkspacePath(root, rel), signal)
    if (!result.ok) {
      if (!ABSENT_CODES.has(result.error.code) && failure === undefined) failure = result.error
      continue
    }
    for (const entry of result.value.entries) {
      if (entry.type !== 'file' || !entry.name.toLowerCase().endsWith('.md')) continue
      found.push({
        path: joinWorkspacePath(root, `${rel}/${entry.name}`),
        base: entry.name,
        rel: `${rel}/${entry.name}`,
      })
    }
  }
  for (const rel of PLAN_FILES) {
    const result = await reader.stat(sessionId, joinWorkspacePath(root, rel), signal)
    if (!result.ok) {
      if (!ABSENT_CODES.has(result.error.code) && failure === undefined) failure = result.error
      continue
    }
    const base = rel.slice(rel.lastIndexOf('/') + 1)
    found.push({ path: joinWorkspacePath(root, rel), base, rel })
  }
  const rows: PlanRow[] = []
  for (const candidate of selectPlans(found)) {
    rows.push({ ...candidate, title: await titleOf(sessionId, candidate, reader, signal) })
  }
  return failure === undefined ? { rows } : { rows, failure }
}
