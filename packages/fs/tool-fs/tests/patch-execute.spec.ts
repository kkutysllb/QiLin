/**
 * The patch executor's refusal, cancellation, and uncertain-outcome paths:
 * path-resolution refusals (ordered by patch position), a defect that is not a
 * filesystem refusal, cancellation between operations, and a mutation that
 * fails after changing the file.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@qilin-agent/kylin'
import { ToolCallId } from '@qilin-agent/llm'
import { FsError } from '@qilin-agent/fs'
import type { FsTarget, FsInfo } from '@qilin-agent/fs'
import { LocalFileSystem } from '@qilin-agent/fs-local'
import type { ToolExecution, ToolExecutionToken } from '@qilin-agent/tools'
import { executePatch } from '../src/patch/index.ts'
import type { PatchExecutionReport } from '../src/patch/types.ts'
import { FsSandboxController } from '../src/sandbox.ts'

const session = { header: {} }

let dir: string
let ctx: Context

const patch = (...operations: string[]): string => ['*** Begin Patch', ...operations, '*** End Patch'].join('\n')
const add = (path: string, content = 'created') => `*** Add File: ${path}\n+${content}`
const update = (path: string, before = 'old', after = 'new') => `*** Update File: ${path}\n@@\n-${before}\n+${after}`
const remove = (path: string) => `*** Delete File: ${path}`

async function boot(): Promise<void> {
  dir = await mkdtemp(join(tmpdir(), 'qilin-patch-commit-'))
  ctx = new Context()
  await ctx.plugin(LocalFileSystem, { cwd: dir })
}

const seed = (path: string, content = 'old\n') => writeFile(join(dir, path), content)

/** One tool execution plus the controller that can cancel it mid-patch. */
function execution(): { exec: ToolExecution; controller: AbortController } {
  const controller = new AbortController()
  return {
    controller,
    exec: {
      signal: controller.signal,
      callId: ToolCallId('commit'),
      rootCallId: ToolCallId('commit'),
      token: Symbol('commit') as ToolExecutionToken,
      name: 'apply_patch',
      arguments: {},
      agent: { session } as never,
    },
  }
}

/** Run one patch through the executor the tool registers. */
async function run(text: string): Promise<PatchExecutionReport> {
  const { exec } = execution()
  return executePatch(ctx, new FsSandboxController(ctx), exec, { patch: text, sandboxPolicy: undefined })
}

afterEach(async () => {
  vi.restoreAllMocks()
  await ctx.fiber.dispose()
  await rm(dir, { recursive: true, force: true })
})

describe('planning refusals', () => {
  it('collects every unresolvable path in patch order', async () => {
    await boot()
    vi.spyOn(ctx.fs as LocalFileSystem, 'resolve').mockRejectedValue(new FsError('no such path', 'FS_NOT_FOUND'))
    const report = await run(patch(remove('first'), remove('second')))
    if (report.phase !== 'preflight') throw new Error('expected preflight refusals')
    expect(report.refusals.map(refusal => [refusal.operation.index, refusal.operation.path])).toEqual([[0, 'first'], [1, 'second']])
  })

  it('rethrows a defect that is not a filesystem refusal', async () => {
    await boot()
    vi.spyOn(ctx.fs as LocalFileSystem, 'resolve').mockRejectedValue(new Error('resolver defect'))
    await expect(run(patch(remove('a')))).rejects.toThrow('resolver defect')
  })
})

describe('commit outcomes', () => {
  it('stops at the operation after the one that cancelled the patch', async () => {
    await boot()
    const { exec, controller } = execution()
    const write = ctx.fs.writeText.bind(ctx.fs)
    vi.spyOn(ctx.fs as LocalFileSystem, 'writeText').mockImplementation(async (...args: Parameters<typeof write>) => {
      const outcome = await write(...args)
      // The next operation must not start once the caller cancelled mid-patch.
      controller.abort()
      return outcome
    })
    const report = await executePatch(ctx, new FsSandboxController(ctx), exec,
      { patch: patch(add('one'), add('two')), sandboxPolicy: undefined })
    if (report.phase !== 'commit') throw new Error('expected a commit report')
    expect(report.cancelled).toBe(true)
    expect(report.outcomes.map(outcome => outcome.status)).toEqual(['completed', 'skipped'])
  })

  it('reports an unknown outcome when the mutation failed after changing the file', async () => {
    await boot()
    await seed('a', 'old\n')
    const patchText = ctx.fs.patchText.bind(ctx.fs)
    vi.spyOn(ctx.fs as LocalFileSystem, 'patchText').mockImplementation(async (...args: Parameters<typeof patchText>) => {
      await patchText(...args)
      // The provider patched and then failed: the change exists, so no rollback claim is safe.
      throw new FsError('staging failure', 'FS_IO_ERROR')
    })
    const report = await run(patch(update('a')))
    if (report.phase !== 'commit') throw new Error('expected a commit report')
    expect(report.outcomes[0]).toMatchObject({ status: 'unknown' })
    expect(report.outcomes[0]).toHaveProperty('failure.message', expect.stringContaining('re-read the affected files'))
  })

  it('reports an unknown outcome when the independent version check cannot read the file', async () => {
    await boot()
    await seed('a', 'old\n')
    vi.spyOn(ctx.fs as LocalFileSystem, 'patchText').mockRejectedValue(new FsError('io failure', 'FS_IO_ERROR'))
    const stat = ctx.fs.stat.bind(ctx.fs)
    // Commit's own before-snapshot passes the call's signal; the independent
    // outcome check omits it, and that read is the one that fails.
    vi.spyOn(ctx.fs as LocalFileSystem, 'stat').mockImplementation(async (target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined> => {
      if (signal === undefined) throw new FsError('gone', 'FS_NOT_FOUND')
      return stat(target, signal)
    })
    const report = await run(patch(update('a')))
    if (report.phase !== 'commit') throw new Error('expected a commit report')
    expect(report.outcomes[0]).toMatchObject({ status: 'unknown' })
  })

  it('rethrows a defect from the independent version check', async () => {
    await boot()
    await seed('a', 'old\n')
    vi.spyOn(ctx.fs as LocalFileSystem, 'patchText').mockRejectedValue(new FsError('io failure', 'FS_IO_ERROR'))
    const stat = ctx.fs.stat.bind(ctx.fs)
    vi.spyOn(ctx.fs as LocalFileSystem, 'stat').mockImplementation(async (target: FsTarget, signal?: AbortSignal): Promise<FsInfo | undefined> => {
      if (signal === undefined) throw new Error('stat defect')
      return stat(target, signal)
    })
    await expect(run(patch(update('a')))).rejects.toThrow('stat defect')
  })

  it('rethrows a defect that is not a filesystem failure', async () => {
    await boot()
    vi.spyOn(ctx.fs as LocalFileSystem, 'writeText').mockRejectedValue(new Error('writer defect'))
    await expect(run(patch(add('a')))).rejects.toThrow('writer defect')
  })
})
