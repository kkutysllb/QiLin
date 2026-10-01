/**
 * Wire types of the `workspaceGit` Remote namespace. Types only: generated
 * Remote clients consume this module without Host runtime code.
 * @module @qilin/api-workspace-git/types
 */

// Import the protocol module so the declaration at the end of this file
// augments its error map rather than defining an unrelated ambient module.
import type {} from '@qilin/typert-protocol'

/**
 * Ahead/behind position of the current branch against its upstream, as
 * `rev-list --left-right --count` reports it.
 */
export interface GitUpstream {
  /** Commits reachable from `HEAD` but not from the upstream. */
  readonly ahead: number
  /** Commits reachable from the upstream but not from `HEAD`. */
  readonly behind: number
}

/**
 * One path from `git status --porcelain=v1 -z`, as this service reports it.
 * The path is repo-relative, `/`-joined; for a rename or copy it is the path
 * the entry now lives at, not the origin.
 */
export interface GitStatusEntry {
  /** Repo-relative path of the entry, `/`-joined. */
  readonly path: string
  /** Index column of the porcelain `XY` pair; one character, `' '` when the index is clean. */
  readonly index: string
  /** Worktree column of the porcelain `XY` pair; one character, `' '` when the worktree matches the index. */
  readonly worktree: string
  /** Whether the entry differs between `HEAD` and the index, or is new in the index. */
  readonly staged: boolean
  /** Whether the entry differs between the index and the worktree, including unresolved conflicts. */
  readonly unstaged: boolean
  /** Whether the path is untracked: neither in `HEAD` nor in the index. */
  readonly untracked: boolean
}

/**
 * One `git status` answer: the current branch, its upstream position when an
 * upstream exists, and every changed, conflicted, or untracked path.
 */
export interface GitStatus {
  /** Abbreviated ref of `HEAD`, absent on an unborn or detached-with-no-ref `HEAD`. */
  readonly branch?: string
  /** Position against the branch's upstream, absent when no upstream is configured or it is gone. */
  readonly upstream?: GitUpstream
  /** Entries in the order `git status --porcelain=v1` prints them. */
  readonly entries: readonly GitStatusEntry[]
}

/** One local branch as `branches` reports it. */
export interface GitBranch {
  /** Short branch name, without the `refs/heads/` prefix. */
  readonly name: string
  /** Whether `HEAD` points at this branch. */
  readonly current: boolean
  /** Short upstream ref name, absent when the branch tracks none. */
  readonly upstream?: string
  /** Commits this branch has that its upstream lacks; `0` with no upstream. */
  readonly ahead: number
  /** Commits its upstream has that this branch lacks; `0` with no upstream. */
  readonly behind: number
}

/** The local branches of one repository, bounded by the configured list cap. */
export interface GitBranches {
  /** Local branches in `for-each-ref` order, cut to the configured `maxListEntries`. */
  readonly branches: readonly GitBranch[]
  /** Whether the list cap dropped branches from {@link branches}. */
  readonly truncated: boolean
}

declare module '@qilin/typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The workspace root is not inside a Git work tree, or discovery could not answer. */
    'workspace-git/not-a-repo': {}
    /** A branch name failed the accepted-name check; nothing ran. */
    'workspace-git/bad-branch': { readonly branch: string }
    /** The commit message is not 1..2000 characters after trimming; nothing ran. */
    'workspace-git/bad-message': { readonly length: number }
    /** A required path is absent or empty; nothing ran. */
    'workspace-git/bad-path': { readonly path: string }
    /** The diff exceeds the configured byte cap; the complete diff is refused, never shortened. */
    'workspace-git/too-large': { readonly bytes: number; readonly maxBytes: number }
    /**
     * Git exited nonzero, was killed by the configured timeout, or could not
     * be spawned; `command` names the invocation and `stderr` is trimmed to
     * `maxStderrChars`.
     */
    'workspace-git/command-failed': {
      readonly command: string
      readonly code?: number
      readonly stderr: string
    }
  }
}
