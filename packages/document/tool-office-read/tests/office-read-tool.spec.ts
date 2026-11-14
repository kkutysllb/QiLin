import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import { ToolCallId } from '@qilin-agent/llm'
import ToolRuntime from '@qilin-agent/tools'
import SystemPrompt from '@qilin-agent/system-prompt'
import LocalFileSystem from '@qilin-agent/fs-local'
import { applyOfficeReadTool, renderOfficeContent } from '../src/office-read.ts'
import { docxFixture, xlsxFixture } from './fixtures.ts'

/** Working directory for one spec, outside the repository tree. */
let dir = ''
/** Counter making each tool call id unique. */
let calls = 0
/** Context with the tool registry and the real local filesystem mounted. */
async function harness(): Promise<Context> {
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime, { mode: 'native' })
  await ctx.plugin(LocalFileSystem, { cwd: dir })
  ctx.inject(['tools', 'fs'], (toolCtx) => { applyOfficeReadTool(toolCtx, { maxBytes: 1_024 * 1_024 }) })
  return ctx
}

/** Rendered document text of one execution result. */
function contentOf(result: { value?: unknown }): string {
  const value = result.value as { content: string } | undefined
  return value === undefined ? '' : value.content
}

/** Tool registry of one harness, failing loud when the service is not mounted. */
function registry(ctx: Context) {
  const tools = ctx.get('tools')
  if (tools === undefined) throw new Error('tools service is not mounted')
  return tools
}

/** Execute one tool call against the harness. */
async function call(ctx: Context, args: Record<string, unknown>) {
  return registry(ctx).execute({
    name: 'office_read',
    callId: ToolCallId(`office-call-${String(++calls)}`),
    arguments: args,
    signal: new AbortController().signal,
    agent: { session: { header: { cwd: dir } } },
  } as never)
}

beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'office-tool-')) })
afterEach(async () => { await rm(dir, { recursive: true, force: true }) })

describe('office_read registration', () => {
  it('publishes the tool schema and its presentation', async () => {
    const ctx = await harness()
    const names = registry(ctx).schemas().map(candidate => candidate.name)
    expect(names).toContain('office_read')
    expect(registry(ctx).get('office_read')?.presentCall?.({ file_path: 'plan.docx' })).toMatchObject({ kind: 'read' })
  })
})

describe('office_read execution', () => {
  it('renders a DOCX with heading level and table cells', async () => {
    const ctx = await harness()
    await writeFile(join(dir, 'plan.docx'), docxFixture())
    const value = await call(ctx, { file_path: 'plan.docx' })
    expect(value.value).toMatchObject({ format: 'docx', truncated: false })
    expect(contentOf(value)).toContain('## Plan')

    expect(contentOf(value)).toContain('Body')
    expect(contentOf(value)).toContain('X\tY')
  })

  it('renders an XLSX sheet with its cells', async () => {
    const ctx = await harness()
    await writeFile(join(dir, 'data.xlsx'), xlsxFixture())
    const value = await call(ctx, { file_path: 'data.xlsx' })
    expect(contentOf(value)).toContain('Sheet "Data"')
    expect(contentOf(value)).toContain('Q1\t7')
  })

  it('honours the limit argument', async () => {
    const ctx = await harness()
    await writeFile(join(dir, 'plan.docx'), docxFixture())
    const value = await call(ctx, { file_path: 'plan.docx', limit: 1 })
    expect(JSON.stringify(value)).toContain('truncated')
  })

  it('refuses a missing file', async () => {
    const ctx = await harness()
    const result = await call(ctx, { file_path: 'absent.docx' })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).toContain('not found')
  })

  it('refuses bytes that are not an Office package', async () => {
    const ctx = await harness()
    await writeFile(join(dir, 'notes.docx'), 'plain text')
    const result = await call(ctx, { file_path: 'notes.docx' })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).toContain('cannot read')
  })

  it('refuses a document over the size cap', async () => {
    const ctx = new Context()
    await ctx.plugin(SystemPrompt)
    await ctx.plugin(ToolRuntime, { mode: 'native' })
    await ctx.plugin(LocalFileSystem, { cwd: dir })
    ctx.inject(['tools', 'fs'], (toolCtx) => { applyOfficeReadTool(toolCtx, { maxBytes: 16 }) })
    await writeFile(join(dir, 'plan.docx'), docxFixture())
    const result = await call(ctx, { file_path: 'plan.docx' })
    expect(result.isError).toBe(true)
    expect(JSON.stringify(result)).toContain('16-byte read limit')
  })
})

describe('rendering', () => {
  it('renders an empty deck without content lines', () => {
    expect(renderOfficeContent({ format: 'pptx', width: 0, height: 0, slides: [], truncated: false })).toBe('Slide size: 0 x 0 EMU')
  })
})
