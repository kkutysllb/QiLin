/**
 * Scripted `workspaceGit` remotes for the specs.
 *
 * Two builders share this file. `staticGit` answers every method at once from
 * one fixture record — the body and apply specs mount a whole panel over it.
 * `gatedGit` answers nothing until the spec resolves the promise one call
 * returned — the face spec pins reads and mutations mid-flight to watch the
 * generation, abort, and busy paths settle.
 */
import { vi } from 'vitest'
import type { Mock } from 'vitest'
import type { RemoteResult } from '@qilin/api-remotes/client'
import type { SessionId } from '@qilin/session/types'
import type {
  GhAuthStatus, GhCreatedPr, GhPr, GitBranches, GitLogEntry, GitStatus,
} from '@qilin/api-workspace-git/types'
import type { WorkspaceGitRemote } from '../src/client/face.ts'

/** The void-result answers every mutation method returns on success. */
const VOID: RemoteResult<void> = { ok: true, value: undefined }

/** One answer the spec holds until it chooses to resolve it. */
export interface Held<T> {
  /** The promise the scripted call returned. */
  readonly promise: Promise<T>
  /** Resolve that promise. */
  readonly resolve: (value: T) => void
}

/**
 * Make one held answer.
 * @returns the promise and its resolver.
 */
function held<T>(): Held<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

/** A clean `main` with one tracked upstream, the shared default fixture. */
export const CLEAN_STATUS: GitStatus = {
  branch: 'main',
  upstream: { ahead: 0, behind: 0 },
  entries: [],
}

/** A signed-in, message-less `gh` answer, the shared default fixture. */
export const SIGNED_IN: GhAuthStatus = { authenticated: true, message: '' }

/** Two commits, the first with a ref decoration, newest first. */
export const LOG: readonly GitLogEntry[] = [
  {
    hash: 'a'.repeat(40), short: 'aaaaaaa', subject: 'Add the history section', author: 'Ada',
    date: '2026-10-02T19:03:23+08:00', refs: ['main'],
  },
  {
    hash: 'b'.repeat(40), short: 'bbbbbbb', subject: 'Drop the old panel', author: 'Bo',
    date: '2026-09-30T08:00:00+08:00', refs: [],
  },
]

/**
 * One history page of `count` distinct commits.
 * @param count - how many commits the page holds.
 * @returns the commits, newest first.
 */
export function logPage(count: number): readonly GitLogEntry[] {
  return Array.from({ length: count }, (_unused, index) => ({
    ...LOG[0]!,
    hash: `hash-${String(index)}`,
    short: `short-${String(index)}`,
  }))
}

/** One staged-and-unstaged-more row plus one untracked row, the busy fixture. */
export const DIRTY_STATUS: GitStatus = {
  branch: 'feature',
  upstream: { ahead: 2, behind: 1 },
  entries: [
    { path: 'src/a.ts', index: 'M', worktree: 'M', staged: true, unstaged: true, untracked: false },
    { path: 'src/b.ts', index: ' ', worktree: 'M', staged: false, unstaged: true, untracked: false },
    { path: 'notes/c.txt', index: '?', worktree: '?', staged: false, unstaged: false, untracked: true },
  ],
}

/** The static answers one fixture record may override; every default is a success. */
export interface StaticAnswers {
  readonly isRepo?: RemoteResult<boolean>
  readonly status?: RemoteResult<GitStatus>
  readonly diff?: RemoteResult<string>
  readonly stage?: RemoteResult<void>
  readonly unstage?: RemoteResult<void>
  readonly discard?: RemoteResult<void>
  readonly commit?: RemoteResult<void>
  readonly branches?: RemoteResult<GitBranches>
  readonly checkout?: RemoteResult<void>
  readonly createBranch?: RemoteResult<void>
  readonly push?: RemoteResult<void>
  readonly pull?: RemoteResult<void>
  readonly log?: RemoteResult<readonly GitLogEntry[]>
  readonly commitDiff?: RemoteResult<string>
  readonly ghAvailable?: RemoteResult<boolean>
  readonly ghAuthStatus?: RemoteResult<GhAuthStatus>
  readonly ghListPrs?: RemoteResult<readonly GhPr[]>
  readonly ghCreatePr?: RemoteResult<GhCreatedPr>
  readonly ghMergePr?: RemoteResult<void>
}

/** The static remote plus the mocks a spec counts calls on. */
export interface StaticGit {
  /** The remote to hand the face. */
  readonly remote: WorkspaceGitRemote
  /** One mock per method, in the namespace's declaration order. */
  readonly mocks: {
    readonly isRepo: Mock<(sessionId: SessionId, signal?: AbortSignal) => Promise<RemoteResult<boolean>>>
    readonly status: Mock<(sessionId: SessionId, signal?: AbortSignal) => Promise<RemoteResult<GitStatus>>>
    readonly diff: Mock<(sessionId: SessionId, path: string, staged: boolean, signal?: AbortSignal) => Promise<RemoteResult<string>>>
    readonly stage: Mock<(sessionId: SessionId, path: string, signal?: AbortSignal) => Promise<RemoteResult<void>>>
    readonly unstage: Mock<(sessionId: SessionId, path: string, signal?: AbortSignal) => Promise<RemoteResult<void>>>
    readonly discard: Mock<(sessionId: SessionId, path: string, signal?: AbortSignal) => Promise<RemoteResult<void>>>
    readonly commit: Mock<(sessionId: SessionId, message: string, signal?: AbortSignal) => Promise<RemoteResult<void>>>
    readonly branches: Mock<(sessionId: SessionId, signal?: AbortSignal) => Promise<RemoteResult<GitBranches>>>
    readonly checkout: Mock<(sessionId: SessionId, branch: string, signal?: AbortSignal) => Promise<RemoteResult<void>>>
    readonly createBranch: Mock<(sessionId: SessionId, name: string, from: string, signal?: AbortSignal) => Promise<RemoteResult<void>>>
    readonly push: Mock<(sessionId: SessionId, setUpstream: boolean, signal?: AbortSignal) => Promise<RemoteResult<void>>>
    readonly pull: Mock<(sessionId: SessionId, signal?: AbortSignal) => Promise<RemoteResult<void>>>
    readonly log: Mock<(
      sessionId: SessionId, count: number | undefined, skip: number | undefined, signal?: AbortSignal,
    ) => Promise<RemoteResult<readonly GitLogEntry[]>>>
    readonly commitDiff: Mock<(sessionId: SessionId, revision: string | undefined, signal?: AbortSignal) => Promise<RemoteResult<string>>>
    readonly ghAvailable: Mock<(sessionId: SessionId, signal?: AbortSignal) => Promise<RemoteResult<boolean>>>
    readonly ghAuthStatus: Mock<(sessionId: SessionId, signal?: AbortSignal) => Promise<RemoteResult<GhAuthStatus>>>
    readonly ghListPrs: Mock<(sessionId: SessionId, state: 'open' | 'closed' | 'all', signal?: AbortSignal) => Promise<RemoteResult<readonly GhPr[]>>>
    readonly ghCreatePr: Mock<(
      sessionId: SessionId, title: string, body: string, base: string, signal?: AbortSignal,
    ) => Promise<RemoteResult<GhCreatedPr>>>
    readonly ghMergePr: Mock<(sessionId: SessionId, number: number, method: '' | 'merge' | 'squash' | 'rebase', signal?: AbortSignal) => Promise<RemoteResult<void>>>
  }
}

/**
 * Build a remote that answers at once from one fixture record.
 * @param answers - the per-method answers; every omitted one is a plain success.
 * @returns the remote and its mocks.
 */
export function staticGit(answers: StaticAnswers = {}): StaticGit {
  const mocks = {
    isRepo: vi.fn(async () => answers.isRepo ?? { ok: true as const, value: true }),
    status: vi.fn(async () => answers.status ?? { ok: true as const, value: CLEAN_STATUS }),
    diff: vi.fn(async () => answers.diff ?? { ok: true as const, value: '' }),
    stage: vi.fn(async () => answers.stage ?? VOID),
    unstage: vi.fn(async () => answers.unstage ?? VOID),
    discard: vi.fn(async () => answers.discard ?? VOID),
    commit: vi.fn(async () => answers.commit ?? VOID),
    branches: vi.fn(async () => answers.branches ?? { ok: true as const, value: { branches: [], truncated: false } }),
    checkout: vi.fn(async () => answers.checkout ?? VOID),
    createBranch: vi.fn(async () => answers.createBranch ?? VOID),
    push: vi.fn(async () => answers.push ?? VOID),
    pull: vi.fn(async () => answers.pull ?? VOID),
    log: vi.fn(async () => answers.log ?? { ok: true as const, value: [] as readonly GitLogEntry[] }),
    commitDiff: vi.fn(async () => answers.commitDiff ?? { ok: true as const, value: '' }),
    ghAvailable: vi.fn(async () => answers.ghAvailable ?? { ok: true as const, value: true }),
    ghAuthStatus: vi.fn(async () => answers.ghAuthStatus ?? { ok: true as const, value: SIGNED_IN }),
    ghListPrs: vi.fn(async () => answers.ghListPrs ?? { ok: true as const, value: [] as readonly GhPr[] }),
    ghCreatePr: vi.fn(async () => answers.ghCreatePr ?? { ok: true as const, value: { number: 7, url: 'https://example.com/pull/7' } }),
    ghMergePr: vi.fn(async () => answers.ghMergePr ?? VOID),
  }
  return { remote: { workspaceGit: mocks }, mocks }
}

/**
 * The gated remote's per-method queues: call one, read its held answer at the
 * tail, resolve it when the spec chooses.
 */
export interface GatedQueues {
  readonly isRepo: Held<RemoteResult<boolean>>[]
  readonly status: Held<RemoteResult<GitStatus>>[]
  readonly diff: Held<RemoteResult<string>>[]
  readonly stage: Held<RemoteResult<void>>[]
  readonly unstage: Held<RemoteResult<void>>[]
  readonly discard: Held<RemoteResult<void>>[]
  readonly commit: Held<RemoteResult<void>>[]
  readonly branches: Held<RemoteResult<GitBranches>>[]
  readonly checkout: Held<RemoteResult<void>>[]
  readonly createBranch: Held<RemoteResult<void>>[]
  readonly push: Held<RemoteResult<void>>[]
  readonly pull: Held<RemoteResult<void>>[]
  readonly log: Held<RemoteResult<readonly GitLogEntry[]>>[]
  readonly commitDiff: Held<RemoteResult<string>>[]
  readonly ghAvailable: Held<RemoteResult<boolean>>[]
  readonly ghAuthStatus: Held<RemoteResult<GhAuthStatus>>[]
  readonly ghListPrs: Held<RemoteResult<readonly GhPr[]>>[]
  readonly ghCreatePr: Held<RemoteResult<GhCreatedPr>>[]
  readonly ghMergePr: Held<RemoteResult<void>>[]
}

/** The gated remote and the queues its calls land in. */
export interface GatedGit {
  /** The remote to hand the face. */
  readonly remote: WorkspaceGitRemote
  /** One held answer per call, per method, in call order. */
  readonly q: GatedQueues
}

/**
 * Build a remote whose every answer waits for the spec.
 * @returns the remote and its per-method queues.
 */
export function gatedGit(): GatedGit {
  const q: GatedQueues = {
    isRepo: [], status: [], diff: [], stage: [], unstage: [], discard: [], commit: [],
    branches: [], checkout: [], createBranch: [], push: [], pull: [], ghAvailable: [],
    ghAuthStatus: [], ghListPrs: [], ghCreatePr: [], ghMergePr: [],
    log: [], commitDiff: [],
  }
  const gate = <T>(queue: Held<T>[]): (() => Promise<T>) => () => {
    const answer = held<T>()
    queue.push(answer)
    return answer.promise
  }
  return {
    remote: {
      workspaceGit: {
        isRepo: gate(q.isRepo),
        status: gate(q.status),
        diff: gate(q.diff),
        stage: gate(q.stage),
        unstage: gate(q.unstage),
        discard: gate(q.discard),
        commit: gate(q.commit),
        branches: gate(q.branches),
        checkout: gate(q.checkout),
        createBranch: gate(q.createBranch),
        push: gate(q.push),
        pull: gate(q.pull),
        log: gate(q.log),
        commitDiff: gate(q.commitDiff),
        ghAvailable: gate(q.ghAvailable),
        ghAuthStatus: gate(q.ghAuthStatus),
        ghListPrs: gate(q.ghListPrs),
        ghCreatePr: gate(q.ghCreatePr),
        ghMergePr: gate(q.ghMergePr),
      },
    },
    q,
  }
}

/**
 * Drain the microtask queue enough for every chained read to land.
 * @returns when the scripted answers' continuations have run.
 */
export async function flush(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve()
}
