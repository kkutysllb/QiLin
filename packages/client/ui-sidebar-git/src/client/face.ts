/**
 * The panel's asynchronous half: every `workspaceGit` Remote call, bound to
 * the store's actions.
 *
 * The component never awaits anything. It calls one of the face's entries and
 * this face performs the read or the mutation and writes the outcome through
 * the store's own actions — the Slot-standard `inject` shape, so the session
 * id is resolved by the framework and the write set stays the store's.
 *
 * Four reads have a generation each — status, branches, diff, pull requests —
 * so the latest request of a tab wins whichever settles first. One mutation
 * flies at a time (`busy`), its failure is recorded beside its code, and
 * every success is followed by a status read that reports what the mutation
 * did. Cleanup rides the owner's `signal`: nothing starts for a record that
 * already ended, and when the record goes away its bucket and its generations
 * are forgotten together, so no later settlement writes to it.
 */
import type { ClientRemote, RemoteResult } from '@qilin/api-remotes/client'
import type { BoundActions } from '@qilin/client-store'
import type { TabId } from '@qilin/client-ui-dockkit'
import type { SessionId } from '@qilin/session/types'
import type { createGitStore, GhPrState } from './store.ts'

/**
 * The slice of the Client Remote face this package calls: the `workspaceGit`
 * namespace's seventeen panel methods, exactly as the Host's generated client
 * declares them.
 */
export type WorkspaceGitRemote = {
  readonly workspaceGit: Pick<ClientRemote['workspaceGit'],
    | 'isRepo' | 'status' | 'diff' | 'stage' | 'unstage' | 'discard' | 'commit'
    | 'branches' | 'checkout' | 'createBranch' | 'push' | 'pull'
    | 'ghAvailable' | 'ghAuthStatus' | 'ghListPrs' | 'ghCreatePr' | 'ghMergePr'>
}

/** The Remote calls the panel performs, already carrying the session. */
export type GitReader = WorkspaceGitRemote['workspaceGit']

/**
 * Bind the calls to one Remote face, keeping their signatures.
 * @param remote - the Client Remote face carrying the `workspaceGit` namespace.
 * @returns the reader the panel's face performs.
 */
export function createGitReader(remote: WorkspaceGitRemote): GitReader {
  return remote.workspaceGit
}

/** The panel's injected business face, as the body receives it. */
export interface GitInjected {
  /**
   * Seed this tab's panel: probe for a repository and read the first status.
   * @param tabId - the tab being drawn.
   * @param signal - the tab record's lifetime.
   */
  readonly start: (tabId: TabId, signal: AbortSignal) => void
  /**
   * Read the status again, keeping whatever the panel already shows.
   * @param tabId - the tab being drawn.
   * @param signal - the tab record's lifetime.
   */
  readonly refresh: (tabId: TabId, signal: AbortSignal) => void
  /**
   * Stage one path, or the whole tree for an empty path.
   * @param tabId - the tab being drawn.
   * @param path - repo-relative path; empty stages every change.
   * @param signal - the tab record's lifetime.
   */
  readonly stage: (tabId: TabId, path: string, signal: AbortSignal) => void
  /**
   * Unstage one path, or the whole tree for an empty path.
   * @param tabId - the tab being drawn.
   * @param path - repo-relative path; empty unstages every change.
   * @param signal - the tab record's lifetime.
   */
  readonly unstage: (tabId: TabId, path: string, signal: AbortSignal) => void
  /**
   * Restore one path from the index, dropping its worktree changes.
   * @param tabId - the tab being drawn.
   * @param path - repo-relative path.
   * @param signal - the tab record's lifetime.
   */
  readonly discard: (tabId: TabId, path: string, signal: AbortSignal) => void
  /**
   * Commit the index, staging everything first when asked, and empty the box
   * on success.
   * @param tabId - the tab being drawn.
   * @param message - the box's text; trimmed here, an empty trim asks nothing.
   * @param stageAll - whether to stage every change before committing.
   * @param signal - the tab record's lifetime.
   */
  readonly commit: (tabId: TabId, message: string, stageAll: boolean, signal: AbortSignal) => void
  /**
   * Push the current branch, setting its upstream when asked.
   * @param tabId - the tab being drawn.
   * @param setUpstream - whether to configure `origin` as the upstream.
   * @param signal - the tab record's lifetime.
   */
  readonly push: (tabId: TabId, setUpstream: boolean, signal: AbortSignal) => void
  /**
   * Pull the current branch's upstream.
   * @param tabId - the tab being drawn.
   * @param signal - the tab record's lifetime.
   */
  readonly pull: (tabId: TabId, signal: AbortSignal) => void
  /**
   * Check out one branch, then re-read the status and the branch list.
   * @param tabId - the tab being drawn.
   * @param branch - the branch to check out.
   * @param signal - the tab record's lifetime.
   */
  readonly checkout: (tabId: TabId, branch: string, signal: AbortSignal) => void
  /**
   * Create one branch and re-read the branch list.
   * @param tabId - the tab being drawn.
   * @param name - the new branch's name.
   * @param from - the start point; empty starts at `HEAD`.
   * @param signal - the tab record's lifetime.
   */
  readonly createBranch: (tabId: TabId, name: string, from: string, signal: AbortSignal) => void
  /**
   * Read the branch list for the branches section.
   * @param tabId - the tab being drawn.
   * @param signal - the tab record's lifetime.
   */
  readonly loadBranches: (tabId: TabId, signal: AbortSignal) => void
  /**
   * Open (or re-side) the inline diff at one path.
   * @param tabId - the tab being drawn.
   * @param path - repo-relative path being diffed.
   * @param staged - whether the read compares `HEAD` against the index.
   * @param signal - the tab record's lifetime.
   */
  readonly openDiff: (tabId: TabId, path: string, staged: boolean, signal: AbortSignal) => void
  /**
   * Probe the `gh` login for the GitHub section, then read the pull-request
   * list under one filter once the login answers.
   * @param tabId - the tab being drawn.
   * @param state - the filter the follow-up read uses.
   * @param signal - the tab record's lifetime.
   */
  readonly ghAuth: (tabId: TabId, state: GhPrState, signal: AbortSignal) => void
  /**
   * Read the pull-request list under one filter.
   * @param tabId - the tab being drawn.
   * @param state - the filter the read uses.
   * @param signal - the tab record's lifetime.
   */
  readonly ghList: (tabId: TabId, state: GhPrState, signal: AbortSignal) => void
  /**
   * Create one pull request, leave its notice, and re-read the list.
   * @param tabId - the tab being drawn.
   * @param title - the pull request's title.
   * @param body - the pull request's body.
   * @param base - the branch the pull request targets; empty lets gh decide.
   * @param state - the filter the follow-up read uses.
   * @param signal - the tab record's lifetime.
   */
  readonly ghCreatePr: (
    tabId: TabId,
    title: string,
    body: string,
    base: string,
    state: GhPrState,
    signal: AbortSignal,
  ) => void
  /**
   * Merge one pull request one way, then re-read the list under its filter.
   * @param tabId - the tab being drawn.
   * @param number - the pull request's number.
   * @param method - the merge strategy; empty takes the repository default.
   * @param state - the filter the follow-up read uses.
   * @param signal - the tab record's lifetime.
   */
  readonly ghMergePr: (
    tabId: TabId,
    number: number,
    method: '' | 'merge' | 'squash' | 'rebase',
    state: GhPrState,
    signal: AbortSignal,
  ) => void
}

/**
 * Bind the panel's face to one reader.
 * @param reader - the reader the calls perform.
 * @returns the Slot `inject` factory: session and bound actions in, face out.
 */
export function gitFace(
  reader: GitReader,
): (sessionId: SessionId, actions: BoundActions<ReturnType<typeof createGitStore>>) => GitInjected {
  return (sessionId, actions): GitInjected => {
    /** Per tab, per read kind: the generation a settlement must match; the latest request wins. */
    const statusGenerations = new Map<TabId, number>()
    const branchesGenerations = new Map<TabId, number>()
    const diffGenerations = new Map<TabId, number>()
    const prsGenerations = new Map<TabId, number>()
    /** Tabs whose abort listener is already armed. */
    const armed = new Set<TabId>()
    const arm = (tabId: TabId, signal: AbortSignal): void => {
      if (armed.has(tabId)) return
      armed.add(tabId)
      signal.addEventListener('abort', () => {
        armed.delete(tabId)
        statusGenerations.delete(tabId)
        branchesGenerations.delete(tabId)
        diffGenerations.delete(tabId)
        prsGenerations.delete(tabId)
        actions.forget(tabId)
      }, { once: true })
    }
    const readStatus = (tabId: TabId, signal: AbortSignal): void => {
      const generation = (statusGenerations.get(tabId) ?? 0) + 1
      statusGenerations.set(tabId, generation)
      void reader.status(sessionId, signal).then((result) => {
        if (signal.aborted || statusGenerations.get(tabId) !== generation) return
        if (result.ok) actions.statusSettled(tabId, result.value)
        else actions.statusFailed(tabId, result.error)
      })
    }
    const readBranches = (tabId: TabId, signal: AbortSignal): void => {
      const generation = (branchesGenerations.get(tabId) ?? 0) + 1
      branchesGenerations.set(tabId, generation)
      actions.branchesLoading(tabId)
      void reader.branches(sessionId, signal).then((result) => {
        if (signal.aborted || branchesGenerations.get(tabId) !== generation) return
        if (result.ok) actions.branchesSettled(tabId, result.value.branches, result.value.truncated)
        else actions.branchesFailed(tabId, result.error)
      })
    }
    const readPrs = (tabId: TabId, state: GhPrState, signal: AbortSignal): void => {
      const generation = (prsGenerations.get(tabId) ?? 0) + 1
      prsGenerations.set(tabId, generation)
      actions.prsLoading(tabId, state)
      void reader.ghListPrs(sessionId, state, signal).then((result) => {
        if (signal.aborted || prsGenerations.get(tabId) !== generation) return
        if (result.ok) actions.prsSettled(tabId, state, result.value)
        else actions.prsFailed(tabId, state, result.error)
      })
    }
    /** One mutation: busy while it flies, its failure recorded, its success followed by a status read. */
    const mutate = (tabId: TabId, op: () => Promise<RemoteResult<void>>, signal: AbortSignal, after?: () => void): void => {
      actions.busy(tabId)
      void op().then((result) => {
        if (signal.aborted) return
        if (!result.ok) {
          actions.failed(tabId, result.error)
          return
        }
        actions.settled(tabId)
        after?.()
        readStatus(tabId, signal)
      })
    }
    const guarded = (tabId: TabId, run: () => void, signal: AbortSignal): void => {
      if (signal.aborted) return
      arm(tabId, signal)
      run()
    }
    return {
      start(tabId, signal) {
        guarded(tabId, () => {
          actions.start(tabId)
          void reader.isRepo(sessionId, signal).then((result) => {
            if (signal.aborted) return
            if (!result.ok) {
              actions.repoFailed(tabId, result.error)
              return
            }
            if (!result.value) {
              actions.repoEmpty(tabId)
              return
            }
            readStatus(tabId, signal)
            // The GitHub section's availability is its own soft probe: an
            // answer that is not a plain yes hides the section, never the
            // panel.
            void reader.ghAvailable(sessionId, signal).then((probe) => {
              if (signal.aborted) return
              if (probe.ok && probe.value) actions.ghOn(tabId)
              else actions.ghOff(tabId)
            })
          })
        }, signal)
      },
      refresh(tabId, signal) {
        guarded(tabId, () => { readStatus(tabId, signal) }, signal)
      },
      stage(tabId, path, signal) {
        guarded(tabId, () => { mutate(tabId, () => reader.stage(sessionId, path, signal), signal) }, signal)
      },
      unstage(tabId, path, signal) {
        guarded(tabId, () => { mutate(tabId, () => reader.unstage(sessionId, path, signal), signal) }, signal)
      },
      discard(tabId, path, signal) {
        guarded(tabId, () => { mutate(tabId, () => reader.discard(sessionId, path, signal), signal) }, signal)
      },
      commit(tabId, message, stageAll, signal) {
        const trimmed = message.trim()
        // An empty trim asks nothing: the box's own guard, kept at the face
        // for every other caller.
        if (trimmed === '') return
        guarded(tabId, () => {
          actions.busy(tabId)
          void (async () => {
            if (stageAll) {
              const staged = await reader.stage(sessionId, '', signal)
              if (!staged.ok) {
                if (!signal.aborted) actions.failed(tabId, staged.error)
                return
              }
            }
            const result = await reader.commit(sessionId, trimmed, signal)
            if (signal.aborted) return
            if (!result.ok) {
              actions.failed(tabId, result.error)
              return
            }
            actions.committed(tabId)
            readStatus(tabId, signal)
          })()
        }, signal)
      },
      push(tabId, setUpstream, signal) {
        guarded(tabId, () => { mutate(tabId, () => reader.push(sessionId, setUpstream, signal), signal) }, signal)
      },
      pull(tabId, signal) {
        guarded(tabId, () => { mutate(tabId, () => reader.pull(sessionId, signal), signal) }, signal)
      },
      checkout(tabId, branch, signal) {
        guarded(tabId, () => { mutate(tabId, () => reader.checkout(sessionId, branch, signal), signal, () => {
          readBranches(tabId, signal)
        }) }, signal)
      },
      createBranch(tabId, name, from, signal) {
        guarded(tabId, () => { mutate(tabId, () => reader.createBranch(sessionId, name, from, signal), signal, () => {
          readBranches(tabId, signal)
        }) }, signal)
      },
      loadBranches(tabId, signal) {
        guarded(tabId, () => { readBranches(tabId, signal) }, signal)
      },
      openDiff(tabId, path, staged, signal) {
        guarded(tabId, () => {
          const generation = (diffGenerations.get(tabId) ?? 0) + 1
          diffGenerations.set(tabId, generation)
          actions.diffOpen(tabId, path, staged)
          void reader.diff(sessionId, path, staged, signal).then((result) => {
            if (signal.aborted || diffGenerations.get(tabId) !== generation) return
            if (result.ok) actions.diffSettled(tabId, result.value)
            else actions.diffFailed(tabId, result.error)
          })
        }, signal)
      },
      ghAuth(tabId, state, signal) {
        guarded(tabId, () => {
          actions.ghAuthLoading(tabId)
          void reader.ghAuthStatus(sessionId, signal).then((result) => {
            if (signal.aborted) return
            if (!result.ok) {
              actions.ghSignedOut(tabId, result.error.message)
              return
            }
            if (!result.value.authenticated) {
              actions.ghSignedOut(tabId, result.value.message)
              return
            }
            actions.ghReady(tabId)
            readPrs(tabId, state, signal)
          })
        }, signal)
      },
      ghList(tabId, state, signal) {
        guarded(tabId, () => { readPrs(tabId, state, signal) }, signal)
      },
      ghCreatePr(tabId, title, body, base, state, signal) {
        guarded(tabId, () => {
          actions.busy(tabId)
          void reader.ghCreatePr(sessionId, title, body, base, signal).then((result) => {
            if (signal.aborted) return
            if (!result.ok) {
              actions.failed(tabId, result.error)
              return
            }
            actions.ghCreated(tabId, result.value.number, result.value.url)
            readPrs(tabId, state, signal)
          })
        }, signal)
      },
      ghMergePr(tabId, number, method, state, signal) {
        guarded(tabId, () => {
          mutate(tabId, () => reader.ghMergePr(sessionId, number, method, signal), signal, () => {
            readPrs(tabId, state, signal)
          })
        }, signal)
      },
    }
  }
}
