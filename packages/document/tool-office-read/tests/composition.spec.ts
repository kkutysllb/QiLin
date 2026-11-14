/**
 * Real composition: the plugin boots through the Loader from a `cordis.yml`,
 * together with the real tool registry and local filesystem, and the model-facing
 * tool reads a document from the mount.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { onTestFinished, describe, expect, it } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import Loader from '@qilin-agent/kylin-plugin-loader'
import Include from '@qilin-agent/kylin-plugin-include'
import { ToolCallId } from '@qilin-agent/llm'
import ToolRuntime from '@qilin-agent/tools'
import SystemPrompt from '@qilin-agent/system-prompt'
import LocalFileSystem from '@qilin-agent/fs-local'
import * as ToolOfficeRead from '../src/index.ts'
import { docxFixture } from './fixtures.ts'

/** Boot one tree: registry, prompt, filesystem, and the Office tool from a real config file. */
async function boot(): Promise<Context> {
  const directory = await mkdtemp(join(tmpdir(), 'office-composition-'))
  const ctx = new Context()
  onTestFinished(async () => {
    try { await ctx.fiber.dispose() } finally { await rm(directory, { recursive: true, force: true }) }
  })
  await writeFile(join(directory, 'plan.docx'), docxFixture())
  const configPath = join(directory, 'cordis.yml')
  await writeFile(configPath, JSON.stringify([
    { name: '@qilin-agent/system-prompt' },
    { name: '@qilin-agent/tools', config: { mode: 'native' } },
    { name: '@qilin-agent/fs-local', config: { cwd: directory } },
    { name: '@qilin-agent/tool-office-read', config: { maxBytes: 1_048_576 } },
  ]))
  ctx.baseUrl = pathToFileURL(directory).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  // Loader imports must resolve to the same source-plane classes this test mounts.
  const modules = new Map<string, unknown>([
    ['@qilin-agent/system-prompt', SystemPrompt],
    ['@qilin-agent/tools', ToolRuntime],
    ['@qilin-agent/fs-local', LocalFileSystem],
    ['@qilin-agent/tool-office-read', ToolOfficeRead],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`Unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
  await ctx.loader.await()
  for (const entry of ctx.loader.entries()) await entry.fiber?.await()
  return ctx
}

describe('office_read through the Loader', () => {
  it('registers the tool from its config row and reads a mounted document', async () => {
    const ctx = await boot()
    const registry = ctx.get('tools')
    expect(registry?.schemas().map(schema => schema.name)).toContain('office_read')

    const result = await registry!.execute({
      name: 'office_read',
      callId: ToolCallId('composition-call'),
      arguments: { file_path: 'plan.docx' },
      signal: new AbortController().signal,
    } as never)
    expect(result.isError).toBe(false)
    expect(JSON.stringify(result)).toContain('## Plan')
  })
})
