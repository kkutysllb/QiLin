import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@qilin-agent/kylin'
import Loader from '@qilin-agent/kylin-plugin-loader'
import Include from '@qilin-agent/kylin-plugin-include'
import AgentRegistry from '@qilin-agent/agent'
import SystemPrompt from '@qilin-agent/system-prompt'
import SkillRegistry from '@qilin-agent/skill'
import ToolRuntime from '@qilin-agent/tools'
import { expect, it, vi } from 'vitest'
import * as desktopOffice from '../src/office.ts'

/**
 * This suite exercises the upstream Office composition. This repository's bundled skill-office
 * package carries the three document workflows, so the suite runs once its asset tree grows to
 * the full upstream set and skips until then.
 */
const officeSkills = new URL('../../../packages/skill/skill-office/assets/', import.meta.url)
const hasFullOfficeSkillSet = ['office', 'office-render', 'office-recalculate', 'office-export-pdf']
  .every(name => existsSync(fileURLToPath(new URL(name + '/SKILL.md', officeSkills))))


it.skipIf(!hasFullOfficeSkillSet)('loads Desktop Office CLI paths and removes them on disposal', async () => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-office-'))
  vi.stubEnv('QILIN_HOME', root)
  const ctx = new Context()

  try {
    const assets = join(root, 'runtime', 'office-skills')
    await cp(new URL('../../../packages/skill/skill-office/assets/', import.meta.url), assets, { recursive: true })
    const nodeDirectory = join(root, 'runtime', 'primary-runtime', 'dependencies', 'node', 'bin')
    await mkdir(nodeDirectory, { recursive: true })
    await cp(process.execPath, join(nodeDirectory, process.platform === 'win32' ? 'node.exe' : 'node'))
    ctx.baseUrl = pathToFileURL(root).href + '/'
    await ctx.plugin(Loader)
    ctx.loader.builtins.include = Include
    expect('default' in desktopOffice).toBe(false)
    expect(ctx.loader.unwrapExports(desktopOffice)).toBe(desktopOffice)
    const modules = new Map<string, unknown>([
      ['agents', AgentRegistry], ['systemPrompt', SystemPrompt], ['tools', ToolRuntime],
      ['skills', SkillRegistry], ['office', desktopOffice],
    ])
    ctx.loader.internal = {
      version: 'v2',
      async import(specifier: string) {
        if (!modules.has(specifier)) throw new Error(`unexpected plugin ${specifier}`)
        return modules.get(specifier)
      },
    } as unknown as NonNullable<typeof ctx.loader.internal>
    const config = join(root, 'cordis.yml')
    await writeFile(config, [
      '- name: agents', '- name: systemPrompt', '- name: tools', '- name: skills', '- name: office',
      '  config:', `    source: ${JSON.stringify(join(root, 'runtime', 'primary-runtime'))}`,
      `    root: ${JSON.stringify(join(root, 'installed'))}`,
      `    runtimeDir: ${JSON.stringify(join(root, 'qilin'))}`, '',
    ].join('\n'))
    await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(config).href } })
    await ctx.loader.await()
    for (const entry of ctx.loader.entries()) await entry.fiber?.await()
    expect((await ctx.skills.list()).map(skill => skill.name)).toEqual(['office', 'office-docx', 'office-export-pdf', 'office-pptx', 'office-recalculate', 'office-render', 'office-xlsx'])
    expect((await ctx.skills.get('office-pptx'))?.resourceBase).toEqual({ kind: 'directory', path: join(assets, 'office-pptx').split(sep).join('/') })
    expect((await ctx.skills.get('office-pptx'))?.content).toContain('office-render')
    expect((await ctx.skills.get('office-pptx'))?.content).not.toContain(nodeDirectory)
    expect(ctx.tools.schemas().map(tool => tool.name)).toEqual(['load_workspace_dependencies'])
    const entry = [...ctx.loader.entries()].find(entry => entry.options.name === 'office')
    expect(entry).toBeDefined()
    await entry?.fiber?.dispose()
    expect(await ctx.skills.list()).toEqual([])
    expect(ctx.tools.schemas()).toEqual([])
  } finally {
    try { await ctx.fiber.dispose() }
    finally {
      vi.unstubAllEnvs()
      await rm(root, { recursive: true, force: true })
    }
  }
})
