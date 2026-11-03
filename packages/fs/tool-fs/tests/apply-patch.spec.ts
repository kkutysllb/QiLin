/**
 * apply_patch tool over the real local backend: registration gating, the
 * preflight-then-commit contract (a refused patch changes nothing, a commit
 * stops at its first failure), disk effects, model-visible reporting, Review
 * metadata, and the pure call/result presentation.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@qilin-agent/kylin'
import { ToolCallId } from '@qilin-agent/llm'
import { FsError } from '@qilin-agent/fs'
import { LocalFileSystem } from '@qilin-agent/fs-local'
import SystemPrompt, { renderPrompt } from '@qilin-agent/system-prompt'
import ToolRuntime from '@qilin-agent/tools'
import * as FsPolicy from '@qilin-agent/fs-observation-policy'
import * as ToolFs from '@qilin-agent/tool-fs'

const testToolSignal = new AbortController().signal
const session = { header: {} }

let dir: string
let ctx: Context
let fiber: Awaited<ReturnType<Context['plugin']>>

let callCounter = 0
function call(name: string, args: unknown) {
  return ctx.tools.execute({
    signal: testToolSignal,
    callId: ToolCallId(`call-${++callCounter}`),
    name,
    arguments: args,
    agent: { session } as never,
  })
}

function text(result: { content: { type: string; text?: string }[] }): string {
  return result.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

function patch(...operations: string[]): string {
  return ['*** Begin Patch', ...operations, '*** End Patch'].join('\n')
}
const addFile = (path: string, content = 'created') => `*** Add File: ${path}\n+${content}`
const updateFile = (path: string, before = 'old', after = 'new') => `*** Update File: ${path}\n@@\n-${before}\n+${after}`
const deleteFile = (path: string) => `*** Delete File: ${path}`
const moveFile = (path: string, destination: string, before = 'old', after = 'moved') =>
  `*** Update File: ${path}\n*** Move to: ${destination}\n@@\n-${before}\n+${after}`

async function boot(options: ToolFs.Config = { applyPatch: true }, policy = true): Promise<void> {
  dir = await mkdtemp(join(tmpdir(), 'qilin-apply-patch-'))
  ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  if (policy) await ctx.plugin(FsPolicy)
  fiber = await ctx.plugin(ToolFs, options)
}

const seed = (path: string, content = 'old\n') => writeFile(join(dir, path), content)
const bytes = (path: string) => readFile(join(dir, path), 'utf8')
const read = (path: string) => call('read', { file_path: path })
const apply = (text: string) => call('apply_patch', { input: text })

afterEach(async () => {
  await fiber.dispose()
  await rm(dir, { recursive: true, force: true })
})

describe('registration', () => {
  it('is absent by default and registers with its guidance when enabled', async () => {
    await boot({})
    expect(ctx.tools.get('apply_patch')).toBeUndefined()
    expect(renderPrompt(await ctx.systemPrompt.assemble())).not.toContain('Prefer apply_patch')
    expect((await apply(patch(addFile('a')))).isError).toBe(true)
    await fiber.dispose()
    await boot({ applyPatch: true })
    expect(ctx.tools.get('apply_patch')).toBeDefined()
    expect(renderPrompt(await ctx.systemPrompt.assemble())).toContain('Prefer apply_patch over separate edit calls')
  })
})

describe('commit', () => {
  it('applies add, update, delete, and move in one patch and reports the completed paths', async () => {
    await boot()
    await seed('source')
    await seed('gone', 'gone\n')
    await read('source')
    await read('gone')
    const result = await apply(patch(addFile('new'), updateFile('source'), deleteFile('gone'), moveFile('source', 'nested/target', 'new', 'moved')))
    expect(result.isError).toBe(false)
    expect(text(result)).toBe([
      'Success. Updated the following files:',
      `A ${join(dir, 'new')}`,
      `M ${join(dir, 'source')}`,
      `M ${join(dir, 'nested/target')}`,
      `D ${join(dir, 'gone')}`,
    ].join('\n'))
    expect(await bytes('new')).toBe('created\n')
    expect(await bytes('nested/target')).toBe('moved\n')
    await expect(bytes('source')).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(bytes('gone')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('moves a file with hunks and keeps no source', async () => {
    await boot(undefined, false)
    await seed('source')
    const result = await apply(patch(moveFile('source', 'target')))
    expect(result.isError).toBe(false)
    expect(await bytes('target')).toBe('moved\n')
    await expect(bytes('source')).rejects.toMatchObject({ code: 'ENOENT' })
  })
})

describe('preflight refusal', () => {
  it('rejects invalid syntax before any change', async () => {
    await boot()
    const result = await apply('invalid')
    expect(result).toMatchObject({ isError: true, error: { info: { code: 'PATCH_SYNTAX' } } })
    expect(await readdir(dir)).toEqual([])
  })

  it('refuses the whole patch when one hunk does not match and reports its patch line', async () => {
    await boot(undefined, false)
    await seed('a', 'original\n')
    const result = await apply(patch(addFile('first'), '*** Update File: a\n@@\n-missing\n+patched'))
    expect(result).toMatchObject({ isError: true, error: { info: { code: 'FS_PATCH_MISMATCH' } } })
    expect(text(result)).toContain('Patch rejected before any change (1 problems)')
    expect(text(result)).toContain('patch line 4')
    expect(await bytes('a')).toBe('original\n')
    await expect(bytes('first')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('refuses an unread update under the observation policy without writing', async () => {
    await boot()
    await seed('a')
    const result = await apply(patch(updateFile('a')))
    expect(result).toMatchObject({ isError: true, error: { info: { code: 'FS_NOT_OBSERVED' } } })
    expect(text(result)).toContain('file has not been read — read the file, then retry')
    expect(await bytes('a')).toBe('old\n')
  })
})

describe('partial commit', () => {
  it('keeps every earlier effect when a later operation fails at commit time', async () => {
    await boot(undefined, false)
    let writes = 0
    ;(ctx.fs as LocalFileSystem).internals.inspectTemp = () => {
      writes += 1
      if (writes > 1) throw new FsError('staging failure', 'FS_IO_ERROR')
    }
    const result = await apply(patch(addFile('first'), addFile('second')))
    expect(result.isError).toBe(false)
    const lines = text(result)
    expect(lines).toContain('Patch stopped after 1 of 2 operations.')
    expect(lines).toContain('Failed:')
    expect(lines).toContain('staging failure')
    expect(await bytes('first')).toBe('created\n')
    await expect(bytes('second')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('reports a move whose source removal failed after the destination was written', async () => {
    await boot(undefined, false)
    await seed('source')
    ;(ctx.fs as LocalFileSystem).internals.removeFile = async () => { throw new FsError('source removal denied', 'FS_PERMISSION_DENIED') }
    const result = await apply(patch(addFile('first'), moveFile('source', 'target'), addFile('skipped')))
    expect(result.isError).toBe(false)
    expect(result.value).toMatchObject({
      phase: 'commit',
      operations: [{ status: 'completed' }, { status: 'failed' }, { status: 'skipped' }],
    })
    const lines = text(result)
    expect(lines).toContain('Patch stopped after 1 of 3 operations.')
    expect(lines).toContain(`destination ${join(dir, 'target')} was written; source ${join(dir, 'source')} remains`)
    expect(await bytes('first')).toBe('created\n')
    expect(await bytes('target')).toBe('moved\n')
    expect(await bytes('source')).toBe('old\n')
    await expect(bytes('skipped')).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('serializes concurrent patches on the same file instead of losing an update', async () => {
    await boot(undefined, false)
    await seed('a', 'old\n')
    const [first, second] = await Promise.all([apply(patch(updateFile('a'))), apply(patch(updateFile('a')))])
    // The provider lock decides one winner; the loser's hunk no longer matches the committed text.
    const outcomes = [first, second]
    expect(outcomes.filter(result => !result.isError)).toHaveLength(1)
    const loser = outcomes.find(result => result.isError)
    expect((loser?.error as { info?: { code?: string } } | undefined)?.info?.code).toBe('FS_PATCH_MISMATCH')
    expect(await bytes('a')).toBe('new\n')
  })
})

describe('presentation', () => {
  it('previews the requested operations without touching the filesystem', async () => {
    await boot()
    const tool = ctx.tools.get('apply_patch')
    expect(tool?.presentCall?.({ input: patch(addFile('a'), updateFile('b'), deleteFile('c'), moveFile('d', 'e')) }))
      .toMatchObject({
        card: 'diff',
        title: 'Apply patch (5 files)',
        locations: [{ path: 'a' }, { path: 'b' }, { path: 'c' }, { path: 'd' }, { path: 'e' }],
      })
    expect(tool?.presentCall?.({ input: 'invalid' })).toBeUndefined()
  })

  it('turns applied metadata into a diff card and flags a stopped patch', async () => {
    await boot(undefined, false)
    await seed('a', 'old\n')
    const tool = ctx.tools.get('apply_patch')
    const result = await apply(patch(updateFile('a')))
    expect(result.meta).toMatchObject({ stopped: false })
    expect(tool?.presentResult?.({ input: '' }, result)).toMatchObject({
      card: 'diff',
      title: 'Apply patch',
      diffs: [{ path: await realpath(join(dir, 'a')), oldText: 'old', newText: 'new' }],
    })
  })
})
