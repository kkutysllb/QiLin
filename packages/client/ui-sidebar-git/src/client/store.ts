/**
 * The source-control panel's view state, one bucket per tab.
 *
 * The bucket carries what the panel keeps across a body's unmounts: the last
 * settled status, the commit draft, the branches the section has loaded, the
 * inline diff the reader opened, the history it paged, and the commit patch it
 * expanded. A bucket is born at `start` and dies with the tab record's abort,
 * which is also the only thing that ends its life.
 */
import { defineStore, type EngineStoreHandle } from '@qilin-agent/client-store'
import type { RemoteFailure } from '@qilin-agent/api-remotes/client'
import type { GhPr, GitBranch, GitLogEntry, GitStatus } from '@qilin-agent/api-workspace-git/types'
import type { TabId } from '@qilin-agent/client-ui-dockkit'
import { HISTORY_PAGE_SIZE } from './git-model.ts'

/** What the repository probe and the status reads settled on. */
export type GitRepoPhase =
  | { readonly kind: 'probing' }
  | { readonly kind: 'empty' }
  | { readonly kind: 'ready'; readonly status: GitStatus }
  | { readonly kind: 'failed'; readonly failure: RemoteFailure }

/** What the branches section holds; absent until the section is first expanded. */
export type GitBranchesPhase =
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly branches: readonly GitBranch[]; readonly truncated: boolean }
  | { readonly kind: 'failed'; readonly failure: RemoteFailure }

/** One read of the inline diff, at one staged side of one path. */
export interface GitDiffView {
  /** The repo-relative path being diffed. */
  readonly path: string
  /** Whether the read compares `HEAD` against the index, not the index against the worktree. */
  readonly staged: boolean
  /** The read's state. */
  readonly phase:
    | { readonly kind: 'loading' }
    | { readonly kind: 'ready'; readonly text: string }
    | { readonly kind: 'failed'; readonly failure: RemoteFailure }
}

/**
 * What the history section holds; absent until the section is first expanded.
 *
 * A first page that cannot answer takes the section over; a later page that
 * cannot leaves the entries already read in place beside its failure.
 */
export type GitHistoryPhase =
  | { readonly kind: 'loading' }
  | {
    readonly kind: 'ready'
    /** Every commit read so far, newest page first. */
    readonly entries: readonly GitLogEntry[]
    /** Whether the last page came back short: the log has no more commits. */
    readonly complete: boolean
    /** Whether a later page is still in flight. */
    readonly appending: boolean
    /** Why the last later page failed; absent with nothing to report. */
    readonly failure: RemoteFailure | undefined
  }
  | { readonly kind: 'failed'; readonly failure: RemoteFailure }

/** One read of a commit patch. */
export interface GitPatchView {
  /** The commit the patch belongs to. */
  readonly revision: string
  /** The read's state. */
  readonly phase:
    | { readonly kind: 'loading' }
    | { readonly kind: 'ready'; readonly text: string }
    | { readonly kind: 'failed'; readonly failure: RemoteFailure }
}

/** One tab's bucket. */
export interface GitTabState {
  /** The repository probe's outcome; a `ready` repo carries its last settled status. */
  repo: GitRepoPhase
  /** Whether one mutation is in flight. */
  busy: boolean
  /** Why the last status read or mutation failed; absent with nothing to report. */
  failure: RemoteFailure | undefined
  /** The commit box's text, exactly as typed. */
  commitDraft: string
  /** The branches section's data, in the state the section left it. */
  branches: GitBranchesPhase | undefined
  /** The history section's data, in the state the section left it. */
  history: GitHistoryPhase | undefined
  /** The commit patch, while one is expanded. */
  patch: GitPatchView | undefined
  /** The inline diff, while one is open. */
  diff: GitDiffView | undefined
  /** The GitHub section's probe and auth state. */
  gh: GhPhase
  /** The pull-request list the GitHub section shows. */
  prs: GhPrsPhase
  /** The last created pull request, while its notice stands. */
  created: GhCreatedNotice | undefined
}

/** What the GitHub section knows about `gh` itself. */
export type GhPhase =
  | { readonly kind: 'probing' }
  | { readonly kind: 'off' }
  | { readonly kind: 'on' }
  | { readonly kind: 'authLoading' }
  | { readonly kind: 'signedOut'; readonly message: string }
  | { readonly kind: 'ready' }

/** One filter setting of the pull-request list. */
export type GhPrState = 'open' | 'closed' | 'all'

/** What the pull-request list holds, carrying the filter it was read with. */
export type GhPrsPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading'; readonly state: GhPrState }
  | {
    readonly kind: 'ready'
    readonly state: GhPrState
    readonly prs: readonly GhPr[]
  }
  | { readonly kind: 'failed'; readonly state: GhPrState; readonly failure: RemoteFailure }

/** The notice one created pull request leaves: its number and its URL. */
export interface GhCreatedNotice {
  /** The pull request's number. */
  readonly number: number
  /** The pull request's URL, offered to copy. */
  readonly url: string
}

/** Every tab's panel, keyed by tab id. */
export interface GitState {
  byTab: Record<TabId, GitTabState>
}

/**
 * One tab's bucket, which every writer after `start` relies on: the face only
 * dispatches while the record's signal is live, and `forget` runs on its abort.
 * @param state - the draft.
 * @param tabId - the tab being written.
 * @returns the tab's bucket.
 */
function bucket(state: GitState, tabId: TabId): GitTabState {
  const held = state.byTab[tabId]
  if (held === undefined) throw new Error(`ui-sidebar-git: no panel for tab "${tabId}"`)
  return held
}

/** The store's write set; every action names the tab it writes. */
type GitActions = {
  start: (draft: GitState, tabId: TabId) => void
  repoEmpty: (draft: GitState, tabId: TabId) => void
  repoFailed: (draft: GitState, tabId: TabId, failure: RemoteFailure) => void
  statusSettled: (draft: GitState, tabId: TabId, status: GitStatus) => void
  statusFailed: (draft: GitState, tabId: TabId, failure: RemoteFailure) => void
  busy: (draft: GitState, tabId: TabId) => void
  settled: (draft: GitState, tabId: TabId) => void
  failed: (draft: GitState, tabId: TabId, failure: RemoteFailure) => void
  commitDraft: (draft: GitState, tabId: TabId, text: string) => void
  committed: (draft: GitState, tabId: TabId) => void
  branchesLoading: (draft: GitState, tabId: TabId) => void
  branchesSettled: (draft: GitState, tabId: TabId, branches: readonly GitBranch[], truncated: boolean) => void
  branchesFailed: (draft: GitState, tabId: TabId, failure: RemoteFailure) => void
  historyLoading: (draft: GitState, tabId: TabId) => void
  historySettled: (draft: GitState, tabId: TabId, entries: readonly GitLogEntry[]) => void
  historyFailed: (draft: GitState, tabId: TabId, failure: RemoteFailure) => void
  historyAppending: (draft: GitState, tabId: TabId) => void
  historyAppended: (draft: GitState, tabId: TabId, entries: readonly GitLogEntry[]) => void
  historyAppendFailed: (draft: GitState, tabId: TabId, failure: RemoteFailure) => void
  patchOpen: (draft: GitState, tabId: TabId, revision: string) => void
  patchSettled: (draft: GitState, tabId: TabId, text: string) => void
  patchFailed: (draft: GitState, tabId: TabId, failure: RemoteFailure) => void
  patchClosed: (draft: GitState, tabId: TabId) => void
  diffOpen: (draft: GitState, tabId: TabId, path: string, staged: boolean) => void
  diffSettled: (draft: GitState, tabId: TabId, text: string) => void
  diffFailed: (draft: GitState, tabId: TabId, failure: RemoteFailure) => void
  diffClosed: (draft: GitState, tabId: TabId) => void
  ghOff: (draft: GitState, tabId: TabId) => void
  ghOn: (draft: GitState, tabId: TabId) => void
  ghAuthLoading: (draft: GitState, tabId: TabId) => void
  ghSignedOut: (draft: GitState, tabId: TabId, message: string) => void
  ghReady: (draft: GitState, tabId: TabId) => void
  prsLoading: (draft: GitState, tabId: TabId, state: GhPrState) => void
  prsSettled: (draft: GitState, tabId: TabId, state: GhPrState, prs: readonly GhPr[]) => void
  prsFailed: (draft: GitState, tabId: TabId, state: GhPrState, failure: RemoteFailure) => void
  ghCreated: (draft: GitState, tabId: TabId, number: number, url: string) => void
  ghNoticeClosed: (draft: GitState, tabId: TabId) => void
  forget: (draft: GitState, tabId: TabId) => void
}

/**
 * Declare the panel's store.
 *
 * A factory rather than a shared handle: the registration declares it as an
 * exclusive store, so the framework mints one instance per session.
 * @returns the store handle to declare on the registration.
 */
export function createGitStore(): EngineStoreHandle<GitState, GitActions> {
  return defineStore({
    init: (): GitState => ({ byTab: {} }),
    actions: {
      /**
       * Seed one tab's bucket at the repository probe.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      start: (d, tabId: TabId) => {
        d.byTab[tabId] = {
          repo: { kind: 'probing' },
          busy: false,
          failure: undefined,
          commitDraft: '',
          branches: undefined,
          history: undefined,
          patch: undefined,
          diff: undefined,
          gh: { kind: 'probing' },
          prs: { kind: 'idle' },
          created: undefined,
        }
      },
      /**
       * Record that the workspace holds no repository.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      repoEmpty: (d, tabId: TabId) => {
        bucket(d, tabId).repo = { kind: 'empty' }
      },
      /**
       * Record why the probe could not answer.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param failure - the settled Remote failure.
       */
      repoFailed: (d, tabId: TabId, failure: RemoteFailure) => {
        bucket(d, tabId).repo = { kind: 'failed', failure }
      },
      /**
       * Record one settled status, which is also what makes the repo ready.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param status - the status the panel now shows.
       */
      statusSettled: (d, tabId: TabId, status: GitStatus) => {
        const held = bucket(d, tabId)
        held.repo = { kind: 'ready', status }
        held.failure = undefined
      },
      /**
       * Record why a status read could not answer. A probe that never settled
       * takes the panel over; a later refresh failure only reports, beside
       * the status the panel already holds.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param failure - the settled Remote failure.
       */
      statusFailed: (d, tabId: TabId, failure: RemoteFailure) => {
        const held = bucket(d, tabId)
        if (held.repo.kind === 'probing') held.repo = { kind: 'failed', failure }
        held.failure = failure
      },
      /**
       * Mark one mutation in flight, retiring the previous failure line: it
       * described a state this mutation is about to replace.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      busy: (d, tabId: TabId) => {
        const held = bucket(d, tabId)
        held.busy = true
        held.failure = undefined
      },
      /**
       * Record one mutation's success.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      settled: (d, tabId: TabId) => {
        bucket(d, tabId).busy = false
      },
      /**
       * Record why one mutation failed.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param failure - the settled Remote failure.
       */
      failed: (d, tabId: TabId, failure: RemoteFailure) => {
        const held = bucket(d, tabId)
        held.busy = false
        held.failure = failure
      },
      /**
       * Record what the commit box holds.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param text - the box's text, exactly as typed.
       */
      commitDraft: (d, tabId: TabId, text: string) => {
        bucket(d, tabId).commitDraft = text
      },
      /**
       * Record one finished commit: the box empties, and the status refresh
       * that follows reports the new state.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      committed: (d, tabId: TabId) => {
        const held = bucket(d, tabId)
        held.busy = false
        held.commitDraft = ''
      },
      /**
       * Mark the branches read in flight, keeping what it already holds.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      branchesLoading: (d, tabId: TabId) => {
        bucket(d, tabId).branches = { kind: 'loading' }
      },
      /**
       * Record the branch list.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param branches - local branches in the endpoint's order.
       * @param truncated - whether the list cap dropped branches.
       */
      branchesSettled: (d, tabId: TabId, branches: readonly GitBranch[], truncated: boolean) => {
        bucket(d, tabId).branches = { kind: 'ready', branches, truncated }
      },
      /**
       * Record why the branch list could not be read.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param failure - the settled Remote failure.
       */
      branchesFailed: (d, tabId: TabId, failure: RemoteFailure) => {
        bucket(d, tabId).branches = { kind: 'failed', failure }
      },
      /**
       * Mark the first history page in flight.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      historyLoading: (d, tabId: TabId) => {
        bucket(d, tabId).history = { kind: 'loading' }
      },
      /**
       * Record the first history page. A page short of the read's own size is
       * the whole log, so the section offers no further page.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param entries - the commits the page returned, newest first.
       */
      historySettled: (d, tabId: TabId, entries: readonly GitLogEntry[]) => {
        bucket(d, tabId).history = {
          kind: 'ready', entries, complete: entries.length < HISTORY_PAGE_SIZE, appending: false, failure: undefined,
        }
      },
      /**
       * Record why the first history page could not answer.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param failure - the settled Remote failure.
       */
      historyFailed: (d, tabId: TabId, failure: RemoteFailure) => {
        bucket(d, tabId).history = { kind: 'failed', failure }
      },
      /**
       * Mark the next history page in flight, keeping the entries already
       * read and retiring the previous page's failure line.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      historyAppending: (d, tabId: TabId) => {
        const held = bucket(d, tabId).history
        if (held?.kind !== 'ready') return
        bucket(d, tabId).history = { ...held, appending: true, failure: undefined }
      },
      /**
       * Append one settled history page to the entries already read.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param entries - the commits the page returned, newest first.
       */
      historyAppended: (d, tabId: TabId, entries: readonly GitLogEntry[]) => {
        const held = bucket(d, tabId).history
        // A settlement with nothing to append to belongs to a read the section
        // has already replaced; the entries it holds stay as they are.
        if (held?.kind !== 'ready') return
        bucket(d, tabId).history = {
          kind: 'ready',
          entries: [...held.entries, ...entries],
          complete: entries.length < HISTORY_PAGE_SIZE,
          appending: false,
          failure: undefined,
        }
      },
      /**
       * Record why one later history page could not answer, keeping the
       * entries already read.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param failure - the settled Remote failure.
       */
      historyAppendFailed: (d, tabId: TabId, failure: RemoteFailure) => {
        const held = bucket(d, tabId).history
        if (held?.kind !== 'ready') return
        bucket(d, tabId).history = { ...held, appending: false, failure }
      },
      /**
       * Open (or re-point) the commit patch at one revision.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param revision - the commit the patch belongs to.
       */
      patchOpen: (d, tabId: TabId, revision: string) => {
        bucket(d, tabId).patch = { revision, phase: { kind: 'loading' } }
      },
      /**
       * Record the patch text of the commit still open.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param text - the unified diff text.
       */
      patchSettled: (d, tabId: TabId, text: string) => {
        const patch = bucket(d, tabId).patch
        if (patch === undefined || patch.phase.kind !== 'loading') return
        bucket(d, tabId).patch = { ...patch, phase: { kind: 'ready', text } }
      },
      /**
       * Record why the commit still open could not answer.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param failure - the settled Remote failure.
       */
      patchFailed: (d, tabId: TabId, failure: RemoteFailure) => {
        const patch = bucket(d, tabId).patch
        if (patch === undefined || patch.phase.kind !== 'loading') return
        bucket(d, tabId).patch = { ...patch, phase: { kind: 'failed', failure } }
      },
      /**
       * Close the commit patch.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      patchClosed: (d, tabId: TabId) => {
        bucket(d, tabId).patch = undefined
      },
      /**
       * Open (or re-side) the inline diff at one read.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param path - the repo-relative path being diffed.
       * @param staged - whether the read compares `HEAD` against the index.
       */
      diffOpen: (d, tabId: TabId, path: string, staged: boolean) => {
        bucket(d, tabId).diff = { path, staged, phase: { kind: 'loading' } }
      },
      /**
       * Record the diff text of the read still open.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param text - the unified diff text.
       */
      diffSettled: (d, tabId: TabId, text: string) => {
        const diff = bucket(d, tabId).diff
        if (diff === undefined || diff.phase.kind !== 'loading') return
        bucket(d, tabId).diff = { ...diff, phase: { kind: 'ready', text } }
      },
      /**
       * Record why the read still open could not answer.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param failure - the settled Remote failure.
       */
      diffFailed: (d, tabId: TabId, failure: RemoteFailure) => {
        const diff = bucket(d, tabId).diff
        if (diff === undefined || diff.phase.kind !== 'loading') return
        bucket(d, tabId).diff = { ...diff, phase: { kind: 'failed', failure } }
      },
      /**
       * Close the inline diff.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      diffClosed: (d, tabId: TabId) => {
        bucket(d, tabId).diff = undefined
      },
      /**
       * Record that `gh` is not installed: the GitHub section stays hidden.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      ghOff: (d, tabId: TabId) => {
        bucket(d, tabId).gh = { kind: 'off' }
      },
      /**
       * Record that `gh` is installed, before the section asks about a login.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      ghOn: (d, tabId: TabId) => {
        bucket(d, tabId).gh = { kind: 'on' }
      },
      /**
       * Mark the login probe in flight.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      ghAuthLoading: (d, tabId: TabId) => {
        bucket(d, tabId).gh = { kind: 'authLoading' }
      },
      /**
       * Record that `gh` holds no usable login, carrying gh's own message.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param message - the status message the hint shows.
       */
      ghSignedOut: (d, tabId: TabId, message: string) => {
        bucket(d, tabId).gh = { kind: 'signedOut', message }
      },
      /**
       * Record a usable login; the pull-request list becomes reachable.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      ghReady: (d, tabId: TabId) => {
        bucket(d, tabId).gh = { kind: 'ready' }
      },
      /**
       * Mark one pull-request read in flight under its filter.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param state - the filter the read uses.
       */
      prsLoading: (d, tabId: TabId, state: GhPrState) => {
        bucket(d, tabId).prs = { kind: 'loading', state }
      },
      /**
       * Record the pull-request list one filter settled on.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param state - the filter the read used.
       * @param prs - the rows the filter produced.
       */
      prsSettled: (d, tabId: TabId, state: GhPrState, prs: readonly GhPr[]) => {
        bucket(d, tabId).prs = { kind: 'ready', state, prs }
      },
      /**
       * Record why one pull-request read failed, keeping its filter.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param state - the filter the read used.
       * @param failure - the settled Remote failure.
       */
      prsFailed: (d, tabId: TabId, state: GhPrState, failure: RemoteFailure) => {
        bucket(d, tabId).prs = { kind: 'failed', state, failure }
      },
      /**
       * Record one created pull request: the notice stands until it is closed.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       * @param number - the pull request's number.
       * @param url - the pull request's URL.
       */
      ghCreated: (d, tabId: TabId, number: number, url: string) => {
        const held = bucket(d, tabId)
        held.busy = false
        held.created = { number, url }
      },
      /**
       * Take the created-pull-request notice down.
       * @param d - draft state.
       * @param tabId - the tab being drawn.
       */
      ghNoticeClosed: (d, tabId: TabId) => {
        bucket(d, tabId).created = undefined
      },
      /**
       * Forget one tab's panel, for a tab record that is gone.
       * @param d - draft state.
       * @param tabId - the tab that went away.
       */
      forget: (d, tabId: TabId) => {
        d.byTab = Object.fromEntries(Object.entries(d.byTab).filter(([id]) => id !== tabId))
      },
    },
  })
}
