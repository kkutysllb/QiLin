/**
 * Shared fixture: a real Git repository in a temp workspace, initialized by
 * the test process with the real git binary, and a plain Context whose only
 * service is the one under test.
 *
 * A real repository, not a mocked git, because the surface under test is the
 * behavior of git itself: porcelain output, index round-trips, ref listings,
 * and the failure stderr this service maps onto Remote codes.
 */
import { execFile } from 'node:child_process'
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { Context } from '@qilin-agent/kylin'
import { SessionId } from '@qilin-agent/session/types'
import type { WorkspaceFileScope } from '@qilin-agent/api-workspace-files'
import { remoteErrorOf } from '@qilin-agent/typert-protocol'
import { WorkspaceGit, type Config } from '../src/index.ts'

const run = promisify(execFile)

/** Build the header-derived scope that direct service calls receive after Typert lookup. */
function fileScope(workspaceRoot: string): WorkspaceFileScope {
  return { sessionId: SessionId('s-test'), workspaceRoot }
}

export const signal = (): AbortSignal => new AbortController().signal

/** What one gh stub prints and how it exits; the argv it received is recorded either way. */
export interface GhStubBehavior {
  readonly stdout?: string
  readonly stderr?: string
  readonly code?: number
  /** Whole seconds the stub sleeps before answering, long enough for a configured timeout to kill it. */
  readonly sleepSeconds?: number
}

/** An executable gh stub answering one fixed behavior, living outside the repository. */
export interface GhStub {
  /** Path to hand to `ghBin`; it records every argv it receives. */
  readonly bin: string
  /** The argv elements of the last invocation, one per recorded line. */
  recorded(): Promise<readonly string[]>
}

/** What one git stub subcommand prints and how it exits; the argv it received is recorded either way. */
export interface GitStubBehavior {
  readonly stdout?: string
  readonly stderr?: string
  readonly code?: number
  /** Whole seconds the subcommand sleeps before answering, long enough for a configured timeout to kill it. */
  readonly sleepSeconds?: number
}

/** An executable git stub answering per subcommand, living outside the repository. */
export interface GitStub {
  /** Path to hand to `gitBin`; it records every argv it receives. */
  readonly bin: string
  /** The argv elements of the last invocation, one per recorded line. */
  recorded(): Promise<readonly string[]>
}

/** One temp Git repository and the context serving it. */
export interface Harness {
  /** Directory that is both the workspace root and the repository work tree. */
  readonly workspace: string
  readonly ctx: Context
  readonly scope: WorkspaceFileScope
  /** A scope naming another workspace root, for calls the repository does not contain. */
  scopeAt(workspaceRoot: string): WorkspaceFileScope
  /**
   * The service under test, at the given knobs. One per test: the service key
   * is global to the Context, so a second call with knobs is a defect in the test.
   */
  endpoint(knobs?: Partial<Config>): WorkspaceGit
  /** Run git in the workspace repository directly, for test setup. */
  git(args: readonly string[]): Promise<string>
  /**
   * Write one executable gh stub answering the given behavior, outside the
   * repository so no fixture file ever reaches a status listing.
   */
  stubGh(behavior: GhStubBehavior): Promise<GhStub>
  /**
   * Write one executable git stub answering the given behavior per subcommand
   * (the first argv element), outside the repository so no fixture file ever
   * reaches a status listing. Subcommands without an entry exit zero silently.
   */
  stubGit(behaviors: Readonly<Record<string, GitStubBehavior>>): Promise<GitStub>
  dispose(): Promise<void>
}

/**
 * Create the temp workspace, run `git init` in it, and pin a committer
 * identity so commits in tests need no global configuration.
 * @param prefix - temp directory prefix naming the suite.
 * @returns the harness; dispose it in `afterEach`.
 */
export async function openWorkspace(prefix: string): Promise<Harness> {
  const root = await mkdtemp(join(tmpdir(), prefix))
  const workspace = join(root, 'workspace')
  await mkdir(workspace, { recursive: true })
  const git = async (args: readonly string[]): Promise<string> => {
    const { stdout } = await run('git', [...args], { cwd: workspace })
    return stdout
  }
  await git(['init'])
  await git(['config', 'user.email', 'test@qilin.invalid'])
  await git(['config', 'user.name', 'QiLin Test'])
  const ctx = new Context()
  const stubDir = join(root, 'stubs')
  let stubCount = 0
  let service: WorkspaceGit | undefined
  return {
    workspace,
    ctx,
    scope: fileScope(workspace),
    scopeAt: fileScope,
    endpoint: (knobs) => {
      if (service !== undefined) {
        if (knobs !== undefined) throw new Error('the harness serves one WorkspaceGit per test; hoist the endpoint')
        return service
      }
      service = new WorkspaceGit(ctx, {
        gitBin: knobs?.gitBin ?? 'git',
        ghBin: knobs?.ghBin ?? 'gh',
        timeoutMs: knobs?.timeoutMs ?? 30_000,
        discoveryTimeoutMs: knobs?.discoveryTimeoutMs ?? 5_000,
        ghTimeoutMs: knobs?.ghTimeoutMs ?? 30_000,
        maxDiffBytes: knobs?.maxDiffBytes ?? 1024 * 1024,
        maxStderrChars: knobs?.maxStderrChars ?? 2000,
        maxListEntries: knobs?.maxListEntries ?? 200,
      })
      return service
    },
    git,
    stubGh: async (behavior) => {
      stubCount += 1
      await mkdir(stubDir, { recursive: true })
      const bin = join(stubDir, `gh-${String(stubCount)}.sh`)
      await writeFile(bin, [
        '#!/bin/sh',
        'printf \'%s\\n\' "$@" > "$0.argv"',
        'if [ -f "$0.sleep" ]; then sleep "$(cat "$0.sleep")" >/dev/null 2>&1; fi',
        '[ ! -f "$0.out" ] || cat "$0.out"',
        '[ ! -f "$0.err" ] || cat "$0.err" 1>&2',
        `exit ${String(behavior.code ?? 0)}`,
        '',
      ].join('\n'))
      if ((behavior.stdout ?? '') !== '') await writeFile(`${bin}.out`, behavior.stdout ?? '')
      if ((behavior.stderr ?? '') !== '') await writeFile(`${bin}.err`, behavior.stderr ?? '')
      if (behavior.sleepSeconds !== undefined) await writeFile(`${bin}.sleep`, String(behavior.sleepSeconds))
      await chmod(bin, 0o755)
      return {
        bin,
        recorded: async () => {
          const lines = (await readFile(`${bin}.argv`, 'utf8')).split('\n')
          return lines.slice(0, -1)
        },
      }
    },
    stubGit: async (behaviors) => {
      stubCount += 1
      await mkdir(stubDir, { recursive: true })
      const bin = join(stubDir, `git-${String(stubCount)}.sh`)
      await writeFile(bin, [
        '#!/bin/sh',
        'printf \'%s\\n\' "$@" > "$0.argv"',
        'sub="$1"',
        'if [ -f "$0.$sub.sleep" ]; then sleep "$(cat "$0.$sub.sleep")" >/dev/null 2>&1; fi',
        '[ ! -f "$0.$sub.out" ] || cat "$0.$sub.out"',
        '[ ! -f "$0.$sub.err" ] || cat "$0.$sub.err" 1>&2',
        'if [ -f "$0.$sub.code" ]; then exit "$(cat "$0.$sub.code")"; fi',
        'exit 0',
        '',
      ].join('\n'))
      await chmod(bin, 0o755)
      for (const [command, behavior] of Object.entries(behaviors)) {
        if ((behavior.stdout ?? '') !== '') await writeFile(`${bin}.${command}.out`, behavior.stdout ?? '')
        if ((behavior.stderr ?? '') !== '') await writeFile(`${bin}.${command}.err`, behavior.stderr ?? '')
        if (behavior.code !== undefined) await writeFile(`${bin}.${command}.code`, String(behavior.code))
        if (behavior.sleepSeconds !== undefined) await writeFile(`${bin}.${command}.sleep`, String(behavior.sleepSeconds))
      }
      return {
        bin,
        recorded: async () => {
          const lines = (await readFile(`${bin}.argv`, 'utf8')).split('\n')
          return lines.slice(0, -1)
        },
      }
    },
    // No plugin is loaded onto this Context, so teardown is the temp tree
    // alone; the workspace-files harness disposes a plugin fiber instead.
    dispose: async () => {
      await rm(root, { recursive: true, force: true })
    },
  }
}

/**
 * Await an operation expected to fail with a Remote error.
 * @param operation - the call under test.
 * @returns the Remote failure's code and details.
 */
export async function failureOf(operation: Promise<unknown>): Promise<{ code: string; details: unknown }> {
  try {
    await operation
  } catch (error: unknown) {
    const failure = remoteErrorOf(error)
    // A non-Remote throw is a defect in the service, not an expected outcome.
    if (failure === undefined) throw error
    return { code: failure.code, details: failure.details }
  }
  throw new Error('expected the operation to fail')
}
