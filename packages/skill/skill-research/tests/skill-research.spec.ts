import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@qilin-agent/kylin'
import Loader from '@qilin-agent/kylin-plugin-loader'
import Include from '@qilin-agent/kylin-plugin-include'
import SkillRegistry from '@qilin-agent/skill'
import { describe, expect, it } from 'vitest'
import * as SkillResearch from '../src/index.ts'
import { SKILL_NAMES } from '../src/index.ts'

const assets = fileURLToPath(new URL('../assets/', import.meta.url))

/** Strip YAML frontmatter and the separating newline, matching the provider body. */
function bodyOf(raw: string): string {
  return raw.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/u, '').trim()
}

describe('bundled scientific research skills', () => {
  it('registers every skill in catalog order with bounded descriptions', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SkillRegistry)
      await ctx.plugin(SkillResearch)
      const catalog = await ctx.skills.list()
      expect(catalog.map(skill => skill.name)).toEqual([...SKILL_NAMES].sort())
      for (const skill of catalog) {
        expect(skill.description.length).toBeLessThanOrEqual(500)
        expect(skill).toMatchObject({
          source: 'bundled',
          provider: 'qilin-research',
          invocation: { modelInvocable: true, userInvocable: true },
          resourceBase: { kind: 'opaque' },
        })
        const loaded = await ctx.skills.get(skill.name)
        expect(loaded?.content.length).toBeLessThanOrEqual(8_000)
      }
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('loads each packaged body without its frontmatter and removes candidates on disposal', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SkillRegistry)
      const fiber = await ctx.plugin(SkillResearch)
      for (const name of SKILL_NAMES) {
        const loaded = await ctx.skills.get(name)
        const raw = await readFile(join(assets, name, 'SKILL.md'), 'utf8')
        expect(loaded?.content).toBe(bodyOf(raw))
        expect(loaded?.content).not.toContain('---\nname:')
      }
      await fiber.dispose()
      expect(await ctx.skills.list()).toEqual([])
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('waits for a skill registry that arrives after the provider', async () => {
    const ctx = new Context()
    try {
      await ctx.plugin(SkillResearch)
      await ctx.plugin(SkillRegistry)
      expect((await ctx.skills.list()).map(skill => skill.name)).toEqual([...SKILL_NAMES].sort())
    } finally {
      await ctx.fiber.dispose()
    }
  })

  it('loads relocated assets through a real cordis.yml composition', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qilin-research-skills-'))
    const ctx = new Context()
    try {
      const external = join(root, 'research assets')
      await cp(assets, external, { recursive: true })
      const configPath = join(root, 'cordis.yml')
      await writeFile(configPath, [
        "- name: '@qilin-agent/skill'",
        "- name: '@qilin-agent/skill-research'",
        '  config:',
        `    assetRoot: ${JSON.stringify(external)}`,
        '',
      ].join('\n'))
      ctx.baseUrl = pathToFileURL(root).href + '/'
      await ctx.plugin(Loader)
      ctx.loader.builtins.include = Include
      const modules = new Map<string, unknown>([
        ['@qilin-agent/skill', SkillRegistry],
        ['@qilin-agent/skill-research', SkillResearch],
      ])
      ctx.loader.internal = {
        version: 'v2',
        loadCache: new Map(),
        register() { throw new Error('unexpected register') },
        getOrCreateModuleJob() { throw new Error('unexpected module job') },
        resolveSync() { throw new Error('unexpected resolution') },
        load() { throw new Error('unexpected load') },
        async import(specifier: string) {
          if (!modules.has(specifier)) throw new Error(`Unexpected Loader import: ${specifier}`)
          return modules.get(specifier)
        },
      }
      await ctx.loader.create({ name: 'cordis:include', config: { path: pathToFileURL(configPath).href } })
      await ctx.loader.await()
      expect((await ctx.skills.list()).map(skill => skill.name)).toEqual([...SKILL_NAMES].sort())
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })

  it('rejects relative roots, missing assets, and malformed metadata before registration', async () => {
    const root = await mkdtemp(join(tmpdir(), 'qilin-research-invalid-'))
    const ctx = new Context()
    try {
      await ctx.plugin(SkillRegistry)
      expect(() => { SkillResearch.apply(ctx, { assetRoot: 'assets' }) }).toThrow('absolute directory')
      expect(() => { SkillResearch.apply(ctx, { assetRoot: join(root, 'missing') }) }).toThrow('must be a directory')
      await writeFile(join(root, 'not-a-directory'), 'x')
      expect(() => { SkillResearch.apply(ctx, { assetRoot: join(root, 'not-a-directory') }) }).toThrow('must be a directory')
      await cp(assets, root, { recursive: true })
      await rm(join(root, 'deep-research', 'SKILL.md'))
      expect(() => { SkillResearch.apply(ctx, { assetRoot: root }) }).toThrow('missing')
      await mkdir(join(root, 'deep-research', 'SKILL.md'))
      expect(() => { SkillResearch.apply(ctx, { assetRoot: root }) }).toThrow('missing')
      await rm(join(root, 'deep-research', 'SKILL.md'), { recursive: true })
      await cp(join(assets, 'deep-research', 'SKILL.md'), join(root, 'deep-research', 'SKILL.md'))
      await rm(join(root, 'grant-writing', 'SKILL.md'))
      await writeFile(join(root, 'grant-writing', 'SKILL.md'), '# no frontmatter\n')
      expect(() => { SkillResearch.apply(ctx, { assetRoot: root }) }).toThrow('no YAML frontmatter')
      await writeFile(join(root, 'grant-writing', 'SKILL.md'), '---\nname: grant-writing\n---\n# body\n')
      expect(() => { SkillResearch.apply(ctx, { assetRoot: root }) }).toThrow('no description')
      await writeFile(join(root, 'grant-writing', 'SKILL.md'), '---\nname: grant-writing\ndescription: 3\n---\n# body\n')
      expect(() => { SkillResearch.apply(ctx, { assetRoot: root }) }).toThrow('no description')
      await writeFile(join(root, 'grant-writing', 'SKILL.md'), '---\nscalar\n---\n# body\n')
      expect(() => { SkillResearch.apply(ctx, { assetRoot: root }) }).toThrow('no description')
      expect(await ctx.skills.list()).toEqual([])
    } finally {
      await ctx.fiber.dispose()
      await rm(root, { recursive: true, force: true })
    }
  })
})
