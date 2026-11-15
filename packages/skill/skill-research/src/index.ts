/**
 * Bundled scientific research workflows.
 *
 * The provider contributes self-contained instruction bodies for the research
 * lifecycle: scoping, literature review, experiment and statistical planning,
 * evidence-driven writing, publication figures, citation audit, peer review,
 * and grant writing. It ships no executable helpers; the instructions use the
 * deployment's existing file, shell, web, and Python tools.
 *
 * @module @qilin-agent/skill-research
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Context } from '@qilin-agent/kylin'
import z from '@qilin-agent/schemastery'
import { BUNDLED_SKILL_RANK, type SkillCandidate, type SkillProvider } from '@qilin-agent/skill'
import { parse as parseYaml } from 'yaml'

/** The bundled skill names, in catalog order. */
export const SKILL_NAMES = [
  'scientific-research',
  'research-writing',
  'literature-review',
  'academic-paper-review',
  'experiment-design',
  'statistical-analysis',
  'scientific-figures',
  'citation-audit',
  'deep-research',
  'grant-writing',
] as const

/** Skill provider identity, distinct from any project or user provider. */
const PROVIDER = 'qilin-research'

/** Resource description used when a bundled body needs no external files. */
const RESOURCE_DESCRIPTION = 'Bundled instructions only; this skill requires no external resource files.'

/** Skill resource configuration. */
export interface Config {
  /** Absolute assets directory containing skill folders; defaults to packaged assets. */
  assetRoot?: string
}

/** Validated resource configuration. */
export const Config: z<Config> = z.object({
  assetRoot: z.string().min(1),
})

/** Cordis plugin identity. */
export const name = 'skill-research'

/**
 * Read one packaged skill file into its routing description and body.
 * @param raw - the complete SKILL.md contents.
 * @param path - source path, named in malformed-metadata errors.
 * @returns the frontmatter description and the body after frontmatter.
 */
function parseSkill(raw: string, path: string): { description: string; content: string } {
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u.exec(raw)
  if (frontmatter?.[1] === undefined) throw new Error(`skill-research: ${path} has no YAML frontmatter`)
  const metadata: unknown = parseYaml(frontmatter[1])
  const description = typeof metadata === 'object' && metadata !== null && 'description' in metadata
    ? metadata.description : undefined
  if (typeof description !== 'string' || description.length === 0) throw new Error(`skill-research: ${path} has no description`)
  return { description, content: raw.slice(frontmatter[0].length).trim() }
}

/**
 * Register the bundled scientific research skills.
 *
 * Activation reads every frontmatter description so a malformed packaged asset
 * fails immediately; bodies are read on demand by the skill tool.
 * @param ctx - Context carrying the skill registry.
 * @param config - Optional external assets directory for packaged carriers.
 */
export function apply(ctx: Context, config: Config = {}): void {
  const assetRoot = config.assetRoot ?? fileURLToPath(new URL('../assets/', import.meta.url))
  if (!isAbsolute(assetRoot)) throw new Error('skill-research: assetRoot must be an absolute directory')
  if (!existsSync(assetRoot) || !statSync(assetRoot).isDirectory()) throw new Error('skill-research: assetRoot must be a directory')
  const candidates: SkillCandidate[] = SKILL_NAMES.map((skillName) => {
    const path = join(assetRoot, skillName, 'SKILL.md')
    if (!existsSync(path) || !statSync(path).isFile()) throw new Error(`skill-research: missing ${path}`)
    const { description } = parseSkill(readFileSync(path, 'utf8'), path)
    return {
      name: skillName,
      description,
      invocation: { modelInvocable: true, userInvocable: true },
      provider: PROVIDER,
      source: 'bundled',
      rank: BUNDLED_SKILL_RANK,
      resourceBase: { kind: 'opaque', description: RESOURCE_DESCRIPTION },
      locator: path,
    }
  })
  const provider: SkillProvider = {
    name: PROVIDER,
    list: () => Promise.resolve(candidates),
    async get(candidate, options) {
      const { rank: _rank, locator, ...summary } = candidate
      const raw = await readFile(locator as string, { encoding: 'utf8', signal: options.signal })
      return { ...summary, content: parseSkill(raw, locator as string).content }
    },
  }
  // The base bundle loads this provider even in a composition that omits the
  // skill registry; waiting for the service keeps such a deployment quiet while
  // still contributing the catalog wherever the registry exists.
  ctx.inject(['skills'], (scope) => {
    scope.skills.registerProvider(() => provider)
  })
}
