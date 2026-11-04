/**
 * Preflight simulation of `apply_patch` over the real local backend: every
 * guard (regular-file source, prior observation, freshness, binary content,
 * symlink source, self-move, hunk mismatch) refuses the whole patch before any
 * write, an earlier operation's simulated effect hides a later guard, and a
 * provider defect that is not a filesystem error still rejects the call.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@qilin-agent/kylin'
import { ToolCallId } from '@qilin-agent/llm'
import { FsVersion } from '@qilin-agent/fs'
import type { FsTarget } from '@qilin-agent/fs'
import { LocalFileSystem } from '@qilin-agent/fs-local'
import * as FsPolicy from '@qilin-agent/fs-observation-policy'
import type { ToolExecution, ToolExecutionToken } from '@qilin-agent/tools'
import { planPatch } from '../src/patch/plan.ts'
import { preflightPatch } from '../src/patch/preflight.ts'
import type { PatchRefusal } from '../src/patch/types.ts'
import { FsSandboxController } from '../src/sandbox.ts'

const session = { header: {} }

let dir: string
let ctx: Context

const patch = (...operations: string[]): string => ['*** Begin Patch', ...operations, '*** End Patch'].join('\n')
const add = (path: string, content = 'created') => `*** Add File: ${path}\n+${content}`
const update = (path: string, before = 'old', after = 'new') => `*** Update File: ${path}\n@@\n-${before}\n+${after}`
const remove = (path: string) => `*** Delete File: ${path}`
const move = (source: string, destination: string, before = 'old', after = 'moved') =>
  `*** Update File: ${source}\n*** Move to: ${destination}\n@@\n-${before}\n+${after}`

/** Mount the real provider, plus the observation policy when the case needs prior-observation guards. */
async function boot(policy = false): Promise<void> {
  dir = await mkdtemp(join(tmpdir(), 'qilin-patch-preflight-'))
  ctx = new Context()
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  if (policy) await ctx.plugin(FsPolicy)
}

const seed = (path: string, content = 'old\n') => writeFile(join(dir, path), content)

/** One tool execution owned by the fixture session, as the tool path builds it. */
function execution(): ToolExecution {
  return {
    signal: new AbortController().signal,
    callId: ToolCallId('preflight'),
    rootCallId: ToolCallId('preflight'),
    token: Symbol('preflight') as ToolExecutionToken,
    name: 'apply_patch',
    arguments: {},
    agent: { session } as never,
  }
}

/** Plan a patch and preflight its operations, recording the resolved operation targets. */
async function run(text: string): Promise<{ refusals: PatchRefusal[]; operations: Awaited<ReturnType<typeof planPatch>>['operations']; exec: ToolExecution }> {
  const sandbox = new FsSandboxController(ctx)
  const exec = execution()
  const planned = await planPatch(ctx, sandbox, exec, { patch: text, sandboxPolicy: undefined })
  expect(planned.refusals).toEqual([])
  const refusals = await preflightPatch(ctx, sandbox, exec, undefined, planned.operations)
  return { refusals, operations: planned.operations, exec }
}

/** Record the observation a real `read` would have recorded for this target. */
function observe(target: FsTarget, exec: ToolExecution, version?: FsVersion): void {
  ctx.emit('fs/observed', target, version === undefined ? { kind: 'absent' } : { kind: 'present', version }, exec)
}

afterEach(async () => {
  await ctx.fiber.dispose()
  await rm(dir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('destination guards', () => {
  it('refuses an add over an existing file the model has not read', async () => {
    await boot(true)
    await seed('taken', 'kept\n')
    const { refusals } = await run(patch(add('taken')))
    expect(refusals).toHaveLength(1)
    expect(refusals[0]?.failure).toMatchObject({ code: 'FS_NOT_OBSERVED' })
    expect(refusals[0]?.failure.message).toContain('file has not been read')
    expect(refusals[0]?.operation).toMatchObject({ kind: 'add', path: join(dir, 'taken') })
  })

  it('refuses an add whose observed version no longer describes the file', async () => {
    await boot(true)
    await seed('taken', 'kept\n')
    const planned = await planPatch(ctx, new FsSandboxController(ctx), execution(), { patch: patch(add('taken')), sandboxPolicy: undefined })
    const target = planned.operations[0]!.target
    const exec = execution()
    observe(target, exec, FsVersion('stale'))
    const refusals = await preflightPatch(ctx, new FsSandboxController(ctx), exec, undefined, planned.operations)
    expect(refusals[0]?.failure).toMatchObject({ code: 'FS_STALE_VERSION' })
    expect(refusals[0]?.failure.message).toContain('file changed since it was read')
  })

  it('lets a later operation read the path an earlier operation simulated', async () => {
    await boot(true)
    const { refusals } = await run(patch(add('twin', 'first'), add('twin', 'second')))
    expect(refusals).toEqual([])
  })
})

describe('source guards', () => {
  it('refuses an update whose source changed since it was read', async () => {
    await boot(true)
    await seed('a')
    const planned = await planPatch(ctx, new FsSandboxController(ctx), execution(), { patch: patch(update('a')), sandboxPolicy: undefined })
    const exec = execution()
    observe(planned.operations[0]!.target, exec, FsVersion('stale'))
    const refusals = await preflightPatch(ctx, new FsSandboxController(ctx), exec, undefined, planned.operations)
    expect(refusals[0]?.failure).toMatchObject({ code: 'FS_STALE_VERSION' })
    expect(refusals[0]?.failure.message).toContain('cannot edit')
  })

  it('refuses a delete of a path that does not exist', async () => {
    await boot()
    const { refusals } = await run(patch(remove('missing')))
    expect(refusals[0]?.failure).toMatchObject({ code: 'FS_NOT_FOUND' })
    expect(refusals[0]?.failure.message).toContain('cannot delete')
  })

  it('refuses a non-regular source', async () => {
    await boot()
    await mkdir(join(dir, 'folder'))
    const { refusals } = await run(patch(update('folder')))
    expect(refusals[0]?.failure).toMatchObject({ code: 'FS_NOT_REGULAR_FILE' })
    expect(refusals[0]?.failure.message).toContain('not a regular file')
  })

  it('refuses a source whose NUL byte lies past the provider binary sample', async () => {
    await boot()
    await seed('blob', `${'a'.repeat(8192)}\0tail`)
    const { refusals } = await run(patch(update('blob')))
    expect(refusals[0]?.failure).toMatchObject({ code: 'FS_NOT_TEXT' })
    expect(refusals[0]?.failure.message).toContain('binary file')
  })

  it('refuses a delete whose source is a symbolic link', async () => {
    await boot()
    await seed('real')
    await symlink(join(dir, 'real'), join(dir, 'link'))
    const { refusals } = await run(patch(remove('link')))
    expect(refusals[0]?.failure).toMatchObject({ code: 'PATCH_SYMLINK_SOURCE' })
    expect(refusals[0]?.failure.message).toContain('path is a symbolic link')
  })
})

describe('moves', () => {
  it('refuses a move onto its own path', async () => {
    await boot()
    await seed('a')
    const { refusals } = await run(patch(move('a', 'a')))
    expect(refusals[0]?.failure).toMatchObject({ code: 'FS_SAME_TARGET' })
    expect(refusals[0]?.failure.message).toContain('to itself')
  })

  it('names the destination when a move is refused there', async () => {
    await boot(true)
    await seed('source')
    await seed('taken', 'kept\n')
    const planned = await planPatch(ctx, new FsSandboxController(ctx), execution(), { patch: patch(move('source', 'taken')), sandboxPolicy: undefined })
    const exec = execution()
    const info = await ctx.fs.stat(planned.operations[0]!.target)
    observe(planned.operations[0]!.target, exec, info?.version)
    const refusals = await preflightPatch(ctx, new FsSandboxController(ctx), exec, undefined, planned.operations)
    expect(refusals[0]?.failure).toMatchObject({ code: 'FS_NOT_OBSERVED' })
    expect(refusals[0]?.failure.message).toContain(join(dir, 'taken'))
    expect(refusals[0]?.operation).toMatchObject({ kind: 'move', path: join(dir, 'source'), destination: join(dir, 'taken') })
  })

  it('admits a move whose hunk matches the source', async () => {
    await boot()
    await seed('source')
    const { refusals } = await run(patch(move('source', 'nested/target')))
    expect(refusals).toEqual([])
  })
})

describe('hunk matching', () => {
  it('reports an unmatched hunk with a truncated preview of its expected text', async () => {
    await boot()
    await seed('a', 'old\n')
    const missing = 'x'.repeat(100)
    const { refusals } = await run(patch(update('a', missing)))
    expect(refusals[0]?.failure).toMatchObject({ code: 'FS_PATCH_MISMATCH' })
    expect(refusals[0]?.failure.hunkLine).toBe(3)
    expect(refusals[0]?.failure.message).toContain('does not match')
    expect(refusals[0]?.failure.message).toContain(`${'x'.repeat(80)}…`)
    expect(refusals[0]?.failure.message).not.toContain(missing)
  })
})

describe('provider defects', () => {
  it('rejects the call when the provider fails with a non-filesystem error', async () => {
    await boot()
    await seed('a')
    const planned = await planPatch(ctx, new FsSandboxController(ctx), execution(), { patch: patch(update('a')), sandboxPolicy: undefined })
    vi.spyOn(ctx.fs as LocalFileSystem, 'stat').mockRejectedValueOnce(new Error('provider defect'))
    await expect(preflightPatch(ctx, new FsSandboxController(ctx), execution(), undefined, planned.operations))
      .rejects.toThrow('provider defect')
  })
})
