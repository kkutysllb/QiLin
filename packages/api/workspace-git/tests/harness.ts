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
import { mkdir, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { Context } from '@qilin/kylin'
import { SessionId } from '@qilin/session/types'
import type { WorkspaceFileScope } from '@qilin/api-workspace-files'
import { remoteErrorOf } from '@qilin/typert-protocol'
import { WorkspaceGit, type Config } from '../src/index.ts'

const run = promisify(execFile)

/** Build the header-derived scope that direct service calls receive after Typert lookup. */
function fileScope(workspaceRoot: string): WorkspaceFileScope {
  return { sessionId: SessionId('s-test'), workspaceRoot }
}

export const signal = (): AbortSignal => new AbortController().signal

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
        timeoutMs: knobs?.timeoutMs ?? 30_000,
        discoveryTimeoutMs: knobs?.discoveryTimeoutMs ?? 5_000,
        maxDiffBytes: knobs?.maxDiffBytes ?? 1024 * 1024,
        maxStderrChars: knobs?.maxStderrChars ?? 2000,
        maxListEntries: knobs?.maxListEntries ?? 200,
      })
      return service
    },
    git,
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
