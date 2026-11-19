/**
 * Regression: the KToon preset compaction group must mount ACTIVE, and the
 * host-plane `disabled: true` rows for the same ids must not reach it.
 *
 * Background: web-app's bundle patch disables the host `compaction-basic` /
 * `command-compact` / `tool-result-pruner` rows (ownership moved to presets).
 * Patch application (`applyPatches`) builds its id map only from the composed
 * entry list of its own Include tree, so those rows cannot disable a preset
 * row that shares the id. These tests pin both halves: the patch-scope
 * semantics, and the compaction rows reaching usable state in a real mount.
 * @module compaction-preset-mount
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Context } from '@qilin-agent/kylin'
import Loader from '@qilin-agent/kylin-plugin-loader'
import Include, { applyEntryPatches, entryListSchema } from '@qilin-agent/kylin-plugin-include'
import Group from '@qilin-agent/kylin-plugin-group'
import { dump, load } from 'js-yaml'
import { PluginPackages } from '@qilin-agent/app-boot'
import LlmRuntime from '@qilin-agent/llm'
import SessionStore, { SessionId } from '@qilin-agent/session'
import SessionProjectionRegistry from '@qilin-agent/session-projection'
import CommandRuntime from '@qilin-agent/commands'
import SystemPrompt from '@qilin-agent/system-prompt'
import ToolRuntime from '@qilin-agent/tools'
import TokenMeter from '@qilin-agent/token-meter'
import AgentRegistry from '@qilin-agent/agent'
import AgentLoop from '@qilin-agent/agent-loop'
import type { Agent } from '@qilin-agent/agent'
import { afterEach, describe, expect, it } from 'vitest'
import AgentPresets, {
  COMPOSITION_FILE, livePresetMounts, serviceForAgent,
} from '@qilin-agent/agent-presets'
import type { PresetRoot } from '@qilin-agent/agent-presets'

/** The KToon product preset template, six levels above this package. */
const KTOON_TEMPLATE = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../../presets/_template/agent.cordis.yml',
)

type RosterInput = {
  default?: string
  roots?: PresetRoot[]
}

/** The compaction group exactly as the KToon template ships it. */
const COMPACTION_GROUP_YAML = `- id: compaction
  name: cordis:group
  group: true
  isolate:
    compaction: true
    toolResultPruner: true
  config:
    - id: compaction-basic
      name: '@qilin-agent/compaction-basic'
      config:
        compactionRetries: 3
        maxOverflowRetries: 3
    - id: command-compact
      name: '@qilin-agent/command-compact'
    - id: tool-result-pruner
      name: '@qilin-agent/compaction-tool-result-pruner'
      config:
        thresholdChars: 8192
        headChars: 4096
        tailChars: 1024
`

async function harness(roster: RosterInput): Promise<Context> {
  const ctx = new Context()
  ctx.baseUrl = pathToFileURL(dirname(fileURLToPath(import.meta.url))).href + '/'
  await ctx.plugin(Loader)
  await ctx.plugin(PluginPackages)
  ctx.loader.builtins.include = Include
  ctx.loader.builtins.group = Group
  await ctx.plugin(LlmRuntime)
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjectionRegistry)
  await ctx.plugin(TokenMeter)
  await ctx.plugin(SystemPrompt, { personaPrefix: '' })
  await ctx.plugin(CommandRuntime)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(AgentRegistry)
  await ctx.plugin(AgentLoop, { agents: [] })
  await ctx.plugin(AgentPresets, { includeShippedRoot: false, includeUserRoot: false, ...roster })
  return ctx
}

async function agentOn(ctx: Context, id: string, presetId?: string): Promise<Agent> {
  const handle = await ctx.agents.create({
    sessionId: SessionId(id),
    setup: async (agentCtx: Context) => void await ctx.agentPresets.mount(agentCtx, presetId),
  })
  return handle.agent
}

/** Read the temp roots created per test. */
const roots: string[] = []
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true })
})

/** Slice the compaction group's raw text out of the template (it carries `{{PERSONA}}` placeholders that plain YAML cannot parse). */
function compactionGroupText(source: string): string | undefined {
  const start = source.search(/^- id: compaction\s*$/m)
  if (start < 0) return undefined
  const rest = source.slice(start)
  const next = rest.slice(1).search(/^- id:/m)
  return next < 0 ? rest : rest.slice(0, next + 1)
}

/** Write one preset directory holding the given rows; returns the root. */
async function presetRootWith(body: string): Promise<{ root: string; id: string }> {
  const root = await mkdtemp(join(tmpdir(), 'qilin-compaction-regression-'))
  roots.push(root)
  const id = 'compaction-check'
  mkdirSync(join(root, id))
  await writeFile(join(root, id, COMPOSITION_FILE), body)
  return { root, id }
}

describe('host-plane disabled rows do not reach preset rows', () => {
  it('a patch only matches ids inside its own composed entry list', () => {
    const warnings: string[] = []
    const data = [{ id: 'unrelated', name: 'fixture' }]
    const out = applyEntryPatches(
      data,
      [
        { id: 'compaction-basic', disabled: true },
        { id: 'command-compact', disabled: true },
        { id: 'tool-result-pruner', disabled: true },
      ],
      (format, ...args) => warnings.push(format.replace(/%C/g, () => JSON.stringify(args.shift()))),
    )
    // Every patch missed: the tree it patched never declared those ids.
    expect(out).toEqual([{ id: 'unrelated', name: 'fixture' }])
    expect(warnings).toHaveLength(3)
    expect(warnings.every(w => w.includes('not found'))).toBe(true)
  })

  it('a preset compaction group mounts ACTIVE beside host rows disabled by id', async () => {
    const { root, id } = await presetRootWith(COMPACTION_GROUP_YAML)
    const ctx = await harness({ default: id, roots: [{ path: root, trust: 'system' }] })
    const agent = await agentOn(ctx, 'compaction-active', id)
    const mount = livePresetMounts().find(entry => entry.presetId === id)
    expect(mount).toBeDefined()
    const rows = [...mount!.tree.entries()]
    for (const rowId of ['compaction-basic', 'command-compact', 'tool-result-pruner']) {
      const entry = rows.find(candidate => candidate.options.id === rowId)
      expect(entry, rowId).toBeDefined()
      expect(entry!.disabled, rowId).toBe(false)
      expect(entry!.fiber, rowId).toBeDefined()
    }
    // The engine instance is live behind the group's isolate realm, per session.
    expect(serviceForAgent(ctx, agent, 'compaction')).toBeDefined()
  })
})

/** The two fields this spec reads out of a schema-validated entry row. */
interface CompactionGroupRow {
  group?: boolean
  config?: Array<{ id?: string }>
}

/** Parse the template's compaction group into the row shape above. */
function templateCompactionGroup(): CompactionGroupRow {
  const text = compactionGroupText(readFileSync(KTOON_TEMPLATE, 'utf8')) ?? ''
  const [first] = load(text, { schema: entryListSchema }) as CompactionGroupRow[]
  return first ?? {}
}

const templatePresent = existsSync(KTOON_TEMPLATE)

describe.skipIf(!templatePresent)('KToon preset template drift guard', () => {
  it('the template still declares the compaction group with all three rows', () => {
    const group = templateCompactionGroup()
    expect(group.group).toBe(true)
    const ids = (group.config ?? []).map(row => row.id)
    expect(ids).toEqual(expect.arrayContaining(['compaction-basic', 'command-compact', 'tool-result-pruner']))
  })

  it('the template compaction group mounts ACTIVE unmodified', async () => {
    const group = templateCompactionGroup()
    expect(group.group).toBe(true)
    // Mount exactly the template's group, re-serialized verbatim.
    const { root, id } = await presetRootWith(dump([group], { schema: entryListSchema }))
    const ctx = await harness({ default: id, roots: [{ path: root, trust: 'system' }] })
    await agentOn(ctx, 'ktoon-template-compaction', id)
    const mount = livePresetMounts().find(entry => entry.presetId === id)
    expect(mount).toBeDefined()
    const rows = [...mount!.tree.entries()]
    for (const rowId of ['compaction-basic', 'command-compact', 'tool-result-pruner']) {
      const entry = rows.find(candidate => candidate.options.id === rowId)
      expect(entry, rowId).toBeDefined()
      expect(entry!.disabled, rowId).toBe(false)
    }
  })
})
