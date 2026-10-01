/**
 * Workspace Git service: repository discovery, porcelain status, staging,
 * discard, commits, branch switching, and push/pull inside the Session
 * workspace root, exposed as `workspaceGit`.
 *
 * Every call spawns the configured git binary with a fixed argv inside the
 * Session's workspace root — no shell ever interprets it. Caller strings
 * enter argv only as a pathspec after `--`, as the one `-m` commit message,
 * or as a branch name that passed the accepted-name check. The `@qilin/shell`
 * seam takes a single command-line string, so a fixed-argv spawn is not
 * expressible there; this service uses `node:child_process` directly.
 *
 * The workspace root arrives through the `workspaceFileScope` Typert lookup
 * that `@qilin/api-workspace-files` registers; this package declares no
 * lookup of its own.
 */

import { spawn } from 'node:child_process'
import type { Context } from '@qilin/kylin'
import type { WorkspaceFileScope } from '@qilin/api-workspace-files'
import z from '@qilin/schemastery'
import { Remote, RemoteError, TypertRemoteService } from '@qilin/typert-protocol'
import { parseAheadBehind, parseBranches, parseStatusPorcelain } from './parse.ts'
import type { GitBranches, GitStatus, GitUpstream } from './types.ts'

export type * from './types.ts'

declare module '@qilin/kylin' {
  interface Context {
    /** Host owner of the `workspaceGit` Remote namespace. */
    workspaceGit: WorkspaceGit
  }
}

/** Deployment knobs on the git binary, the spawn timeouts, and the answer caps. */
export interface Config {
  /** Git executable spawned for every call. */
  readonly gitBin: string
  /** Timeout on one content or mutation command; a command past it is killed and reported as command-failed. */
  readonly timeoutMs: number
  /** Timeout on one repository-discovery command (`rev-parse` and upstream resolution). */
  readonly discoveryTimeoutMs: number
  /** Inclusive byte cap on one diff; a larger diff fails with too-large, never shortened. */
  readonly maxDiffBytes: number
  /** Character cap on the stderr one command failure carries. */
  readonly maxStderrChars: number
  /** Cap on returned branch entries; the rest is dropped and reported cut. */
  readonly maxListEntries: number
}

/**
 * Branch names accepted into argv: one letter or digit, then letters, digits,
 * dots, underscores, slashes, or hyphens, at most 128 characters in all. The
 * first-character class keeps every accepted name from spelling a git option.
 */
const BRANCH_NAME = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/u

/** The tab-joined for-each-ref format whose output {@link parseBranches} reads. */
const BRANCH_FORMAT = '%(refname:short)%09%(HEAD)%09%(upstream:short)%09%(upstream:track,nobracket)'

/** One completed git invocation: exit facts plus everything it printed. */
interface GitRun {
  /** Exit status, `null` when the process died from a signal or never spawned. */
  readonly code: number | null
  /** Decoded stdout. */
  readonly stdout: string
  /** Decoded stderr, untrimmed. */
  readonly stderr: string
  /** Bytes of stdout observed; with {@link oversized} a lower bound of the complete output. */
  readonly stdoutBytes: number
  /** Whether the configured byte cap killed the command mid-output. */
  readonly timedOut: boolean
  /** Whether the optional byte cap tripped and the command was killed mid-stdout. */
  readonly oversized: boolean
  /** Why the binary could not be spawned, when it could not. */
  readonly spawnError: Error | undefined
}

/** Host Remote git operations for the Session workspace root. */
export class WorkspaceGit extends TypertRemoteService {
  static Config: z<Config> = z.object({
    gitBin: z.string().default('git'),
    timeoutMs: z.number().step(1).min(1).default(30_000),
    discoveryTimeoutMs: z.number().step(1).min(1).default(5_000),
    maxDiffBytes: z.number().step(1).min(1).default(1_048_576),
    maxStderrChars: z.number().step(1).min(1).default(2000),
    maxListEntries: z.number().step(1).min(1).default(200),
  })

  /**
   * @param ctx - Host context owning this service registration.
   * @param config - deployment knobs on the binary, timeouts, and caps.
   */
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'workspaceGit')
  }

  /**
   * Report whether the Session workspace root lies inside a Git work tree.
   * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
   * @param signal - caller cancellation.
   * @returns the discovery answer; `false` on every failure, including a missing binary or timeout.
   */
  @Remote
  async isRepo(workspaceFileScope: WorkspaceFileScope, signal: AbortSignal): Promise<boolean> {
    const probe = await this.run(workspaceFileScope, ['rev-parse', '--is-inside-work-tree'], this.config.discoveryTimeoutMs, signal)
    return probe.code === 0 && !probe.timedOut && probe.spawnError === undefined && probe.stdout.trim() === 'true'
  }

  /**
   * Name the work tree's top-level directory.
   * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
   * @param signal - caller cancellation.
   * @returns the absolute path `git rev-parse --show-toplevel` prints.
   * @throws {RemoteError} `workspace-git/not-a-repo` when discovery cannot place the root inside a work tree.
   */
  @Remote
  async repoRoot(workspaceFileScope: WorkspaceFileScope, signal: AbortSignal): Promise<string> {
    const probe = await this.run(workspaceFileScope, ['rev-parse', '--show-toplevel'], this.config.discoveryTimeoutMs, signal)
    const root = probe.stdout.trim()
    if (this.failed(probe) || root.length === 0) {
      throw new RemoteError('workspace-git/not-a-repo', 'the workspace root is not inside a Git work tree', {})
    }
    return root
  }

  /**
   * Read one porcelain status of the work tree, its current branch, and that
   * branch's position against its upstream. Untracked files are included;
   * ignored files are not.
   * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
   * @param signal - caller cancellation.
   * @returns porcelain entries in order, the `HEAD` abbreviated ref (`undefined` when unborn), and `upstream` when one is configured.
   * @throws {RemoteError} `workspace-git/not-a-repo` outside a work tree.
   */
  @Remote
  async status(workspaceFileScope: WorkspaceFileScope, signal: AbortSignal): Promise<GitStatus> {
    await this.requireRepo(workspaceFileScope, signal)
    const porcelain = await this.run(
      workspaceFileScope,
      ['status', '--porcelain=v1', '-z', '--untracked-files=all'],
      this.config.timeoutMs,
      signal,
    )
    if (this.failed(porcelain)) throw this.commandFailure(['status', '--porcelain=v1', '-z', '--untracked-files=all'], porcelain)
    const head = await this.run(workspaceFileScope, ['rev-parse', '--abbrev-ref', 'HEAD'], this.config.discoveryTimeoutMs, signal)
    const branch = this.failed(head) ? undefined : head.stdout.trim()
    const upstream = await this.upstreamOf(workspaceFileScope, signal)
    return {
      ...(branch === undefined ? {} : { branch }),
      ...(upstream === undefined ? {} : { upstream }),
      entries: parseStatusPorcelain(porcelain.stdout),
    }
  }

  /**
   * Read one unified diff as text. `staged` selects the index-versus-`HEAD`
   * diff; otherwise the diff is worktree-versus-index.
   * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
   * @param path - repo-relative pathspec limiting the diff; empty diffs the whole work tree.
   * @param staged - whether to diff the index against `HEAD` instead of the worktree against the index.
   * @param signal - caller cancellation.
   * @returns the complete diff text, bounded by the configured `maxDiffBytes`.
   * @throws {RemoteError} `workspace-git/too-large` when the diff exceeds `maxDiffBytes`; `bytes` is then a lower bound of the whole.
   * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero.
   */
  @Remote
  async diff(
    workspaceFileScope: WorkspaceFileScope,
    path: string,
    staged: boolean,
    signal: AbortSignal,
  ): Promise<string> {
    const args = [...(staged ? ['diff', '--cached'] : ['diff']), ...this.pathspec(path)]
    const run = await this.run(workspaceFileScope, args, this.config.timeoutMs, signal, this.config.maxDiffBytes)
    if (this.failed(run)) throw this.commandFailure(args, run)
    if (run.oversized) {
      throw new RemoteError(
        'workspace-git/too-large',
        `the diff exceeds the ${this.config.maxDiffBytes} byte cap`,
        { bytes: run.stdoutBytes, maxBytes: this.config.maxDiffBytes },
      )
    }
    return run.stdout
  }

  /**
   * Stage changes into the index.
   * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
   * @param path - repo-relative pathspec limiting the stage; empty stages the whole work tree.
   * @param signal - caller cancellation.
   * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero, including a pathspec git refuses.
   */
  @Remote
  async stage(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<void> {
    await this.mutate(workspaceFileScope, ['add', '-A', ...this.pathspec(path)], signal)
  }

  /**
   * Unstage changes: reset index entries to their `HEAD` state.
   * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
   * @param path - repo-relative pathspec limiting the unstage; empty unstages the whole index.
   * @param signal - caller cancellation.
   * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero.
   */
  @Remote
  async unstage(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<void> {
    await this.mutate(workspaceFileScope, ['reset', '-q', ...this.pathspec(path)], signal)
  }

  /**
   * Discard worktree changes of one path: restore it from the index. The
   * whole-repo discard does not exist here; a missing or empty path is
   * refused before anything runs.
   * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
   * @param path - repo-relative pathspec; required, never `undefined`.
   * @param signal - caller cancellation.
   * @throws {RemoteError} `workspace-git/bad-path` when `path` is absent or empty.
   * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero.
   */
  @Remote
  async discard(workspaceFileScope: WorkspaceFileScope, path: string, signal: AbortSignal): Promise<void> {
    await this.mutate(workspaceFileScope, ['checkout', '--', this.requiredPath(path)], signal)
  }

  /**
   * Commit the staged index with one message.
   * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
   * @param message - commit message; trimmed, then required to be 1..2000 characters.
   * @param signal - caller cancellation.
   * @throws {RemoteError} `workspace-git/bad-message` when the trimmed message is empty or longer than 2000 characters.
   * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero, including an empty index.
   */
  @Remote
  async commit(workspaceFileScope: WorkspaceFileScope, message: string, signal: AbortSignal): Promise<void> {
    const trimmed = message.trim()
    if (trimmed.length < 1 || trimmed.length > 2000) {
      throw new RemoteError(
        'workspace-git/bad-message',
        'the commit message must be 1..2000 characters after trimming',
        { length: trimmed.length },
      )
    }
    await this.mutate(workspaceFileScope, ['commit', '-m', trimmed], signal)
  }

  /**
   * List local branches with the current marker, each branch's upstream, and
   * each branch's ahead/behind counts, from one `for-each-ref` invocation.
   * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
   * @param signal - caller cancellation.
   * @returns branches in ref order, cut to the configured `maxListEntries` with `truncated` reporting the cut.
   * @throws {RemoteError} `workspace-git/not-a-repo` outside a work tree.
   * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero.
   */
  @Remote
  async branches(workspaceFileScope: WorkspaceFileScope, signal: AbortSignal): Promise<GitBranches> {
    await this.requireRepo(workspaceFileScope, signal)
    const args = ['for-each-ref', `--format=${BRANCH_FORMAT}`, 'refs/heads/']
    const run = await this.run(workspaceFileScope, args, this.config.timeoutMs, signal)
    if (this.failed(run)) throw this.commandFailure(args, run)
    const all = parseBranches(run.stdout)
    return {
      branches: all.slice(0, this.config.maxListEntries),
      truncated: all.length > this.config.maxListEntries,
    }
  }

  /**
   * Switch the work tree to an existing local branch.
   * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
   * @param branch - branch to check out; must pass the accepted-name check.
   * @param signal - caller cancellation.
   * @throws {RemoteError} `workspace-git/bad-branch` when the name fails the accepted-name check.
   * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero, including a missing branch or dirty conflict.
   */
  @Remote
  async checkout(workspaceFileScope: WorkspaceFileScope, branch: string, signal: AbortSignal): Promise<void> {
    await this.mutate(workspaceFileScope, ['checkout', this.branchName(branch)], signal)
  }

  /**
   * Create a local branch, optionally starting from a revision.
   * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
   * @param name - branch to create; must pass the accepted-name check.
   * @param from - starting branch or revision; validated by the same check, empty starts from `HEAD`.
   * @param signal - caller cancellation.
   * @throws {RemoteError} `workspace-git/bad-branch` when either name fails the accepted-name check.
   * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero.
   */
  @Remote
  async createBranch(
    workspaceFileScope: WorkspaceFileScope,
    name: string,
    from: string,
    signal: AbortSignal,
  ): Promise<void> {
    const start = from === '' ? [] : [this.branchName(from)]
    await this.mutate(workspaceFileScope, ['branch', this.branchName(name), ...start], signal)
  }

  /**
   * Push the current branch. With `setUpstream`, the push targets `origin`
   * by that fixed name and names the branch there after itself.
   * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
   * @param setUpstream - whether to pass `--set-upstream origin HEAD`.
   * @param signal - caller cancellation.
   * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero, including a missing remote and authentication failures.
   */
  @Remote
  async push(workspaceFileScope: WorkspaceFileScope, setUpstream: boolean, signal: AbortSignal): Promise<void> {
    await this.mutate(
      workspaceFileScope,
      setUpstream ? ['push', '--set-upstream', 'origin', 'HEAD'] : ['push'],
      signal,
    )
  }

  /**
   * Pull into the current branch from its upstream.
   * @param workspaceFileScope - header-derived workspace root for the Session identity on the wire.
   * @param signal - caller cancellation.
   * @throws {RemoteError} `workspace-git/command-failed` when git exits nonzero, including no configured upstream and merge conflicts.
   */
  @Remote
  async pull(workspaceFileScope: WorkspaceFileScope, signal: AbortSignal): Promise<void> {
    await this.mutate(workspaceFileScope, ['pull'], signal)
  }

  /** Run one mutation and map every failure to `command-failed`. */
  private async mutate(workspaceFileScope: WorkspaceFileScope, args: readonly string[], signal: AbortSignal): Promise<void> {
    const run = await this.run(workspaceFileScope, args, this.config.timeoutMs, signal)
    if (this.failed(run)) throw this.commandFailure(args, run)
  }

  /** Fail fast unless the workspace root sits inside a Git work tree. */
  private async requireRepo(workspaceFileScope: WorkspaceFileScope, signal: AbortSignal): Promise<void> {
    const probe = await this.run(workspaceFileScope, ['rev-parse', '--is-inside-work-tree'], this.config.discoveryTimeoutMs, signal)
    this.requireInsideWorkTree(probe)
  }

  /** Throw `not-a-repo` unless one discovery probe answered inside a work tree. */
  private requireInsideWorkTree(probe: GitRun): void {
    if (this.failed(probe) || probe.stdout.trim() !== 'true') {
      throw new RemoteError('workspace-git/not-a-repo', 'the workspace root is not inside a Git work tree', {})
    }
  }

  /** Resolve the current branch's upstream name and its ahead/behind counts, or `undefined`. */
  private async upstreamOf(workspaceFileScope: WorkspaceFileScope, signal: AbortSignal): Promise<GitUpstream | undefined> {
    const name = await this.run(
      workspaceFileScope,
      ['rev-parse', '--abbrev-ref', '@{upstream}'],
      this.config.discoveryTimeoutMs,
      signal,
    )
    if (this.failed(name) || name.stdout.trim().length === 0) return undefined
    const counts = await this.run(
      workspaceFileScope,
      ['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'],
      this.config.discoveryTimeoutMs,
      signal,
    )
    if (this.failed(counts)) return undefined
    return parseAheadBehind(counts.stdout)
  }

  /** Whether the invocation did not complete with exit status zero. */
  private failed(run: GitRun): boolean {
    return run.code !== 0 || run.timedOut || run.spawnError !== undefined
  }

  /**
   * The argv tail for one pathspec argument: nothing when the path is the
   * empty string — the whole tree or index — or `--` plus the path so git
   * reads it as a pathspec whatever it starts with.
   */
  private pathspec(path: string): string[] {
    return path === '' ? [] : ['--', this.requiredPath(path)]
  }

  /**
   * Require a non-empty path from the wire and return it for use after `--`.
   * The declared parameter widens to `undefined` because a Remote call may
   * deliver an absent field the method signature does not admit.
   */
  private requiredPath(path: string | undefined): string {
    if (path === undefined || path.length === 0) {
      throw new RemoteError('workspace-git/bad-path', 'a non-empty path is required', { path: path ?? '' })
    }
    return path
  }

  /**
   * Require an accepted branch name, refusing anything that could spell a git
   * option. Widened to `undefined` for the same wire reason as
   * {@link requiredPath}.
   */
  private branchName(branch: string | undefined): string {
    if (typeof branch !== 'string' || !BRANCH_NAME.test(branch)) {
      throw new RemoteError('workspace-git/bad-branch', 'the branch name is not accepted', { branch: branch ?? '' })
    }
    return branch
  }

  /** The Remote failure for one nonzero, timed-out, or unspawnable invocation. */
  private commandFailure(args: readonly string[], run: GitRun): RemoteError<'workspace-git/command-failed'> {
    const command = `${this.config.gitBin} ${args.join(' ')}`
    const raw = run.timedOut ? `the command exceeded its timeout. ${run.stderr}` : run.stderr
    const stderr = (raw.length > 0 ? raw : run.spawnError?.message ?? '').trim().slice(0, this.config.maxStderrChars)
    return new RemoteError(
      'workspace-git/command-failed',
      `${command} failed`,
      { command, ...(run.code === null ? {} : { code: run.code }), stderr },
    )
  }

  /**
   * Spawn git with a fixed argv in the workspace root and collect its output.
   * No shell is involved; every argument is one argv element. The call is
   * killed by its timeout, by caller cancellation, or — with `byteCap` — by
   * stdout passing the cap; the first two leave the result to the caller's
   * failure mapping, the cap marks `oversized`.
   * @param workspaceFileScope - workspace root the command runs in.
   * @param args - fixed git arguments, including validated caller strings.
   * @param timeoutMs - kill deadline from Config.
   * @param signal - caller cancellation; kills the child and rejects with its reason.
   * @param byteCap - optional stdout byte cap whose breach kills the child and marks `oversized`.
   * @returns the exit facts and decoded output.
   */
  private run(
    workspaceFileScope: WorkspaceFileScope,
    args: readonly string[],
    timeoutMs: number,
    signal: AbortSignal,
    byteCap?: number,
  ): Promise<GitRun> {
    signal.throwIfAborted()
    return new Promise((resolve, reject) => {
      const child = spawn(this.config.gitBin, args, { cwd: workspaceFileScope.workspaceRoot, stdio: ['ignore', 'pipe', 'pipe'] })
      const out: Buffer[] = []
      const err: Buffer[] = []
      let bytes = 0
      let oversized = false
      let timedOut = false
      let spawnError: Error | undefined
      let settled = false
      const timer = setTimeout(() => {
        timedOut = true
        child.kill('SIGTERM')
      }, timeoutMs)
      const onAbort = (): void => {
        child.kill('SIGTERM')
      }
      signal.addEventListener('abort', onAbort, { once: true })
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length
        if (byteCap !== undefined && bytes > byteCap) {
          oversized = true
          child.kill('SIGTERM')
          return
        }
        out.push(chunk)
      })
      child.stderr.on('data', (chunk: Buffer) => {
        err.push(chunk)
      })
      const finish = (code: number | null): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        signal.removeEventListener('abort', onAbort)
        if (signal.aborted) {
          reject(signal.reason instanceof Error ? signal.reason : new Error('the git call was cancelled'))
          return
        }
        resolve({
          code,
          stdout: Buffer.concat(out).toString('utf8'),
          stderr: Buffer.concat(err).toString('utf8'),
          stdoutBytes: bytes,
          timedOut,
          oversized,
          spawnError,
        })
      }
      child.on('error', (error: Error) => {
        spawnError = error
        finish(null)
      })
      child.on('close', (code) => {
        finish(code)
      })
    })
  }
}

export default WorkspaceGit
