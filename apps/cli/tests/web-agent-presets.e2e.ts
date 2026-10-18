import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Context } from '@qilin-agent/kylin'
import {
  boot,
  initProfile,
  createRuntimeResolution,
  loadOverlayPatches,
  loadProfile,
  PluginPackages,
  type Profile,
} from '@qilin-agent/app-boot'
import { provideCmdline } from '@qilin-agent/cmdline'
import { SessionId, SessionLogOffset } from '@qilin-agent/session'
import type { Agent } from '@qilin-agent/agent'
import type { PatchOptions } from '@qilin-agent/kylin-plugin-include'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { name as SUBAGENT_MODEL_SELECTION_SETTINGS_NAMESPACE } from '@qilin-agent/tool-subagent/model-selection-settings'
import { SETTINGS_NAMESPACE, SHIPPED_PRESET_ROOT } from '@qilin-agent/agent-presets'
import { applyChildComposition, childSessionMeta } from '@qilin-agent/subagent'
import { ToolCallId } from '@qilin-agent/llm'
import type {} from '@qilin-agent/compaction-basic'
import type {} from '@qilin-agent/skill'
import type {} from '@qilin-agent/tools'
// Type-only: resolves `ctx.get('sessionProjections')` and `ctx.get('tokenMeter')`.
import type {} from '@qilin-agent/session-projection'
import type {} from '@qilin-agent/token-meter'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
/** The shipped Web surface: the qilin-base and qilin-web-app bundle patches over an empty preset root. */
const BASE_PATCH = join(REPO_ROOT, 'packages/bundle/base/cordis.patch.yml')
const WEB_PATCH = join(REPO_ROOT, 'packages/bundle/web-app/cordis.patch.yml')
/** The installation anchor whose dependency surface the preset module fallback mirrors. */
const INSTALL_ANCHOR = join(REPO_ROOT, 'apps/cli/package.json')
const LEAN_ID = 'lane-lean'
/**
 * What a Session composed from {@link LEAN_COMPOSITION} sees: its own shell
 * tool, plus the deployment's agent-independent layer — the sidebar control and
 * the working-directory tool reach every Session regardless of composition.
 */
const LEAN_TOOLS = ['bash', 'sidebar_open', 'working_directory']
/**
 * The lane's second composition: one shell tool, no skills loader, no goal
 * command, no compaction. Tests that need a composition OTHER than the shipped
 * pair author this, because what those tests assert is the mechanism
 * (per-session isolation, copy and delete, the stored default), never one of
 * the shipped modes.
 */
const LEAN_COMPOSITION = [
  '- id: tool-bash',
  "  name: '@qilin-agent/tool-bash'",
  "  disabled: !!js process.platform === 'win32'",
  '',
  '- id: tool-pwsh',
  "  name: '@qilin-agent/tool-pwsh'",
  "  disabled: !!js process.platform !== 'win32'",
  '',
].join('\n')

/**
 * Boot the shipped Web composition, minus the rows that would bind a port,
 * touch the network, or write outside the test. Everything that decides an
 * agent's capabilities is the real thing, including the shipped preset.
 */
async function bootWeb(
  settingsFile: string,
  extra: PatchOptions[] = [],
  profilePackages: readonly string[] = [],
  profileBundles?: readonly string[],
): Promise<Context> {
  const storageRoot = join(dirname(settingsFile), 'storages')
  const overrides: PatchOptions[] = [
    // The settings row defaults to `$QILIN_HOME/settings.yaml`. Left alone it
    // reads the developer's own document — and since the default preset is a
    // setting, a stored `agent-presets.default` would decide this file's
    // outcome. Point it at a temp file for the same reason the roster row
    // below pins `includeUserRoot` off.
    { id: 'settings', config: { path: settingsFile, watch: false } },
    // storage-json's root is anchored to the real $QILIN_HOME. Unpinned, this
    // file writes the developer's own `~/.qilin/storages/` — and then reads it
    // back on the next run, so a stored document from any other build decides
    // this test's boot. Same reason the settings row above is pinned.
    { id: 'storage-json', config: { root: storageRoot } },
    // Fixed Session IDs must stay inside this boot's temporary profile root.
    { id: 'session-persistence-jsonl', config: { root: join(dirname(settingsFile), 'sessions') } },
    // Host rows with side effects outside this process: a bound port, a served
    // asset tree, a telemetry exporter. `api-gateway` and `directory-picker`
    // stay ENABLED on purpose — the api-proxy is the host row that injects
    // `subagents`, `workspace`, and the rest of the agent plane, so disabling
    // it would hide exactly the breakage this file exists to catch: a service
    // moved into the presets that a host row still waits for. The boot audit
    // is that assertion.
    { id: 'webserver', disabled: true },
    // This composition has no application readiness or file-watching lifecycle.
    { id: 'hmr', disabled: true },
    // The web bundle's runtime row injects `webServer`, so it cannot
    // activate without the bound port disabled above. It owns dist serving
    // and the URL prompt line — surface glue, not anything that decides an
    // agent's capabilities, which is all this file asserts.
    { id: 'web-runtime', disabled: true },
    { id: 'session-telemetry-otel', disabled: true },
    // A deployment-level skill on the host registry's GLOBAL layer — the same
    // registration shape a repository plugin's skill root uses. The layered
    // skills test below proves it reaches preset-composed agents. No shipped
    // bundle carries this row any more: the badge skill travels in the opt-in
    // `experimental-badge-skill-bundle`, so the lane composes it here.
    { insert: [{ id: 'skill-badge', name: '@qilin-agent/experimental-skill-badge' }] },
    { id: 'modules', disabled: true },
    // The physical Connection row owns the disabled HTTP server. bootWeb
    // supplies only its in-process registries so Host services still prove
    // their shipped dependency graph without binding a port.
    { id: 'connection', disabled: true },
    // Export owns a Connection Fetch route, so this Host-only composition
    // disables it with the transport service above.
    { id: 'session-log-download', disabled: true },
    // The open-in-app host routes wait for the webserver and connection
    // rows disabled above (connection's trust fence guards every route).
    { id: 'open-in-app', disabled: true },
    // The always-on reload chain waits for the browser roster and bound port
    // disabled above.
    { id: 'client-hmr', disabled: true },
    // The shipped `-auto` chooser resolves its interaction from a running
    // host and so waits for the webserver disabled above; the browse variant
    // supplies `directoryPicker` without one.
    { id: 'directory-picker', disabled: true },
    { insert: [
      { id: 'directory-picker-browse', name: '@qilin-agent/host-directory-picker-browse' },
      { id: 'ui-directory-picker-browse', name: '@qilin-agent/client-ui-directory-picker-browse' },
    ] },
    // Pin the roster away from the developer's machine: `includeUserRoot`
    // false keeps `~/.qilin/.agent-presets` from changing a test's outcome.
    // `default` here is the COMPOSITION default — the base layer the settings
    // document overrides. No `roots` entry: the plugin bundles the shipped
    // presets itself and prepends their root.
    { id: 'agent-presets', config: { default: 'ptc', includeUserRoot: false } },
    ...extra,
  ]
  const home = dirname(settingsFile)
  const profileDir = join(home, 'profiles', 'spec')
  await mkdir(profileDir, { recursive: true })
  if (profileBundles === undefined) initProfile(profileDir, ['@qilin-agent/base', '@qilin-agent/web-app'])
  // Product Bundles are installed into the Profile, not the qilin app. Model
  // pnpm's package link for only the selected products; their own production
  // dependencies resolve from the linked workspace packages, while shared
  // peers still resolve through the installation fallback above.
  for (const packageDir of profilePackages) {
    const manifest = JSON.parse(await readFile(join(packageDir, 'package.json'), 'utf8')) as { name: string }
    const link = join(profileDir, 'node_modules', manifest.name)
    await mkdir(dirname(link), { recursive: true })
    await symlink(packageDir, link, 'junction')
  }
  let profile: Profile = {
    name: 'spec',
    dir: profileDir,
    layers: [],
    patchPath: join(profileDir, 'cordis.patch.yml'),
    patches: [],
    skippedBundles: [],
  }
  let bundlePatches: PatchOptions[] = [
    ...loadOverlayPatches('qilin-test', BASE_PATCH),
    ...loadOverlayPatches('qilin-test', WEB_PATCH),
  ]
  if (profileBundles !== undefined) {
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      private: true,
      dependencies: Object.fromEntries(profileBundles.map(name => [name, 'workspace:*'])),
      qilin: { profile: { bundles: profileBundles } },
    }, null, 2) + '\n')
    profile = loadProfile('qilin-test', 'spec', INSTALL_ANCHOR, home, { userLayer: false })
    bundlePatches = profile.layers.flatMap(layer => layer.patches)
  }
  const resolution = await createRuntimeResolution({ installAnchor: INSTALL_ANCHOR, home, profile })
  const rootConfig = join(profileDir, 'cordis.yml')
  await writeFile(rootConfig, '[]\n')
  return await boot('qilin-test', rootConfig, [...bundlePatches, ...overrides], async (bootCtx) => {
    bootCtx.provide('profileContext', { name: 'spec', dir: profileDir, patchPath: profile.patchPath,
      installAnchor: INSTALL_ANCHOR, home, cwd: home,
      startedBundles: profileBundles ?? ['@qilin-agent/base', '@qilin-agent/web-app'],
      overlays: overrides, telemetryDisabledEnv: '1' })
    await bootCtx.plugin(PluginPackages, { generation: resolution })
    bootCtx.provide('connection', {
      fetch: { register: () => () => {} },
      rpc: { intercept: () => () => {} },
    } as never)
    provideCmdline(bootCtx, { args: [], exit: () => {} })
  })
}

const toolNames = (ctx: Context, agent?: Agent): string[] =>
  ctx.tools.schemas(agent).map(schema => schema.name).sort()

function toolParameterNames(ctx: Context, agent: Agent, toolName: string): string[] {
  const schema = ctx.tools.schemas(agent).find(tool => tool.name === toolName)
  if (schema === undefined) throw new Error(`missing tool schema ${toolName}`)
  const properties = schema.parameters.properties
  if (typeof properties !== 'object' || properties === null || Array.isArray(properties)) {
    throw new Error(`${toolName} has invalid parameter properties`)
  }
  return Object.keys(properties).sort()
}


let ctx: Context
let laneRoot: string
beforeAll(async () => {
  laneRoot = join(await mkdtemp(join(tmpdir(), 'qilin-web-presets-lane-')), 'presets')
  await mkdir(join(laneRoot, LEAN_ID), { recursive: true })
  await writeFile(join(laneRoot, LEAN_ID, 'agent.cordis.yml'), LEAN_COMPOSITION)
  const settingsFile = join(await mkdtemp(join(tmpdir(), 'qilin-web-presets-')), 'settings.yaml')
  await writeFile(settingsFile, '{}\n')
  ctx = await bootWeb(settingsFile, [{
    id: 'agent-presets',
    config: {
      default: 'ptc',
      // The shipped root is the plugin's own, prepended before this one.
      roots: [{ path: laneRoot, trust: 'user' }],
      includeUserRoot: false,
    },
  }])
}, 120_000)

describe('the shipped Web composition', () => {
  it('keeps the global tool layer to the two agent-independent controls', () => {
    // Capability belongs to a preset, `ask_user_question` included: a tool in
    // the global layer reaches EVERY agent regardless of which preset composed
    // it, expanding that preset's tool list. The two rows registered here are
    // the deployment's chrome — opening the sidebar and reading the working
    // directory — which a Session carries before any preset mounts, so the
    // assertion is the exact pair rather than emptiness.
    expect(toolNames(ctx)).toEqual(['sidebar_open', 'working_directory'])
  })

  it('keeps the token meter and its context-meter projections on the host plane', async () => {
    // Read before any preset in this file mounts, which is what makes this an
    // ownership assertion rather than a mount-order coincidence: a preset-side
    // meter sits behind an `isolate` realm and is invisible to `ctx.get`.
    //
    // The projection registry is process-wide rather than scope-layered, so a
    // preset-side meter would also make the browser's context meter appear for
    // a session composed from the lane's lean preset the moment some OTHER
    // session mounted a preset that carries one, and vanish entirely in a
    // process that only ever composed that one. Host ownership is what makes
    // the meter a per-session fact.
    expect(ctx.get('tokenMeter')).toBeDefined()
    const projections = ctx.get('sessionProjections')
    if (projections === undefined) throw new Error('the Web composition must compose a projection registry')
    const handle = await ctx.agents.create({
      sessionId: SessionId('preset-lean-meter'),
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, LEAN_ID).then(() => undefined),
    })
    try {
      // A subset assertion: `tasks`, `goal`, and the rest register into the
      // same process-wide table, and this is about the meter's three units.
      expect(Object.keys(projections.snapshot(handle.agent.session).values))
        .toEqual(expect.arrayContaining(['contextBreakdown', 'contextPressure', 'tokenUsage']))
    } finally {
      await handle.dispose()
    }
  })

  it('supplies both shipped presets from the system root', async () => {
    const listed = await ctx.agentPresets.list()

    // The lane's own root contributes `lane-lean`, so the shipped roster is
    // the system-trust subset rather than the whole list. The roster orders by
    // the presets' declared `order`: standard (1) before ptc (2).
    expect(listed.filter(preset => preset.trust === 'system').map(preset => preset.id))
      .toEqual(['standard', 'ptc'])
    expect(ctx.agentPresets.defaultId).toBe('ptc')
  })

  it('composes the full agent from `ptc`', async () => {
    const handle = await ctx.agents.create({
      sessionId: SessionId('preset-ptc-catalog'),
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, 'ptc').then(() => undefined),
    })
    try {
      // The EXACT catalog, not a spot-check: an omission is this design's
      // quietest failure mode, because a row that registers into the wrong
      // layer mounts cleanly and simply contributes nothing. `glob`/`grep` are
      // excluded for the reason the TUI composition e2e excludes them — they
      // depend on ripgrep being present on the machine.
      expect(toolNames(ctx, handle.agent).filter(name => name !== 'glob' && name !== 'grep')).toEqual([
        'ask_user_question', 'bash', 'cordis_inspect_list', 'cordis_inspect_query', 'create_goal',
        'edit', 'exit_plan_mode', 'get_goal', 'interrupt_agent', 'job_kill', 'job_list', 'job_output',
        'list_agents', 'plugin_manager', 'present', 'read', 'read_image', 'run_code', 'send_message',
        'sidebar_open', 'skill', 'subagent', 'subagent_fork', 'todo_write', 'update_goal', 'web_fetch',
        'web_search', 'working_directory', 'write',
      ])
      expect(ctx.commands.find(handle.agent, 'goal')).toBeDefined()
    } finally {
      await handle.dispose()
    }
  })

  it('applies the default-off subagent model allowlist only to new sessions', async () => {
    await ctx.settings.update(SUBAGENT_MODEL_SELECTION_SETTINGS_NAMESPACE, {
      enabled: false,
      allowedModels: [],
    })
    const disabled = await ctx.agents.create({
      sessionId: SessionId('preset-model-selection-disabled'),
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, 'ptc').then(() => undefined),
    })
    await ctx.settings.update(SUBAGENT_MODEL_SELECTION_SETTINGS_NAMESPACE, {
      enabled: true,
      allowedModels: [{ provider: 'deepseek-official', model: 'deepseek-v4-flash' }],
    })
    const enabled = await ctx.agents.create({
      sessionId: SessionId('preset-model-selection-enabled'),
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, 'ptc').then(() => undefined),
    })
    try {
      expect(toolNames(ctx, disabled.agent)).not.toContain('list_subagent_models')
      expect(toolParameterNames(ctx, disabled.agent, 'subagent')).not.toEqual(expect.arrayContaining([
        'model', 'provider', 'reasoning_effort',
      ]))
      expect(toolNames(ctx, enabled.agent)).toContain('list_subagent_models')
      expect(toolParameterNames(ctx, enabled.agent, 'subagent')).toEqual(expect.arrayContaining([
        'model', 'provider', 'reasoning_effort',
      ]))
      expect(toolNames(ctx, disabled.agent)).not.toContain('list_subagent_models')
    } finally {
      await ctx.settings.update(SUBAGENT_MODEL_SELECTION_SETTINGS_NAMESPACE, { enabled: false })
      await enabled.dispose()
      await disabled.dispose()
    }
  })

  it('owns what it composes without owning the host services it reads', async () => {
    const handle = await ctx.agents.create({
      sessionId: SessionId('preset-lean-services'),
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, LEAN_ID).then(() => undefined),
    })
    try {
      // One shell tool, no goal command: both absences are this composition's
      // own bound rather than anything the host withholds.
      expect(toolNames(ctx, handle.agent)).toEqual(LEAN_TOOLS)
      expect(ctx.commands.find(handle.agent, 'goal')).toBeUndefined()
      // serviceFor reports preset-owned providers; unisolated consumers inherit the host fs.
      expect(ctx.agentPresets.serviceFor(handle.agent, 'fs')).toBeUndefined()
      expect(ctx.get('fs')?.sandboxMode).toBeDefined()
      expect(handle.agent.ctx.get('fs')?.sandboxMode).toBe(ctx.get('fs')?.sandboxMode)
      expect(ctx.agentPresets.serviceFor(handle.agent, 'compaction')).toBeUndefined()
      expect(handle.agent.ctx.get('compaction')).toBeUndefined()
    } finally {
      await handle.dispose()
    }
  })

  it('keeps two differently composed sessions independent', async () => {
    const full = await ctx.agents.create({
      sessionId: SessionId('preset-both-full'),
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, 'ptc').then(() => undefined),
    })
    const minimal = await ctx.agents.create({
      sessionId: SessionId('preset-both-lean'),
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, LEAN_ID).then(() => undefined),
    })
    try {
      expect(toolNames(ctx, minimal.agent)).toEqual(LEAN_TOOLS)
      expect(toolNames(ctx, full.agent).length).toBeGreaterThan(10)

      await minimal.dispose()

      // Tearing the lean session down leaves the full one whole.
      expect(toolNames(ctx, full.agent).length).toBeGreaterThan(10)
      expect(toolNames(ctx)).toEqual(['sidebar_open', 'working_directory'])
    } finally {
      await full.dispose()
    }
  })

  it('composes the shipped preset with the runtime-authoring toolset', async () => {
    const handle = await ctx.agents.create({
      sessionId: SessionId('preset-authoring-tools'),
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, 'ptc').then(() => undefined),
    })
    try {
      const tools = toolNames(ctx, handle.agent)
      expect(tools).toEqual(expect.arrayContaining([
        'cordis_inspect_list', 'cordis_inspect_query', 'plugin_manager',
      ]))
      for (const removed of ['cordis_define', 'cordis_run', 'cordis_stop', 'cordis_undefine', 'cordis_inspect_self']) {
        expect(tools).not.toContain(removed)
      }
      expect(tools).toEqual(expect.arrayContaining(['bash', 'read', 'edit', 'skill']))
      expect(tools).not.toContain('str_replace_editor')
      expect(ctx.commands.find(handle.agent, 'goal')).toBeDefined()

      // The preset's own authoring skill registers into ITS layer of the host
      // registry: this agent's view carries it, the global view does not.
      const scoped = (await ctx.skills.list({ scope: handle.agent })).map(skill => skill.name)
      expect(scoped).toContain('editing-cordis-compositions')
      expect((await ctx.skills.list()).map(skill => skill.name)).not.toContain('editing-cordis-compositions')
    } finally {
      await handle.dispose()
    }
  })

  it('presents the shipped preset as PTC mode without disturbing a session composed elsewhere', async () => {
    const coded = await ctx.agents.create({
      sessionId: SessionId('preset-ptc'),
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, 'ptc').then(() => undefined),
    })
    const native = await ctx.agents.create({
      sessionId: SessionId('preset-ptc-native'),
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, LEAN_ID).then(() => undefined),
    })
    try {
      // One tool reaches the MODEL: the transport. The registry's catalog for
      // this agent is unchanged — PTC mode collapses the presentation, not
      // the capabilities — so the assembly is what carries the claim.
      const assembly = await ctx.systemPrompt.assemble({ scope: coded.agent })
      expect(assembly.tools.map(tool => tool.name)).toEqual(['run_code'])
      expect(toolNames(ctx, coded.agent)).not.toContain('str_replace_editor')
      expect(ctx.commands.find(coded.agent, 'goal')).toBeDefined()
      const sdk = assembly.sections.find(section => section.name === 'tools:sdk')?.text ?? ''
      expect(sdk).not.toContain('str_replace_editor')
      expect(sdk).toContain('web_search')

      // The presentation is this agent's alone: the lane's lean composition
      // mounts no presentation row, and its session still sees the host's.
      const nativeAssembly = await ctx.systemPrompt.assemble({ scope: native.agent })
      expect(nativeAssembly.tools.map(tool => tool.name)).toContain('bash')
      expect(nativeAssembly.tools.map(tool => tool.name)).not.toContain('run_code')
      expect(nativeAssembly.sections.some(section => section.name === 'tools:sdk')).toBe(false)
    } finally {
      await native.dispose()
      await coded.dispose()
    }
  })

  it('keeps the self-referential toolset out of a composition that does not ask for it', async () => {
    const handle = await ctx.agents.create({
      sessionId: SessionId('preset-no-authoring-tools'),
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, LEAN_ID).then(() => undefined),
    })
    try {
      // Editing the live runtime is opt-in per session, not ambient.
      expect(toolNames(ctx, handle.agent)).not.toContain('cordis_define')
    } finally {
      await handle.dispose()
    }
  })

  it('ships the composition-authoring skill inside the preset directory', async () => {
    // The preset's skill root is derived from its own `baseUrl`, so the skill
    // travels with the directory wherever the preset is installed.
    const skill = join(
      SHIPPED_PRESET_ROOT, 'ptc', 'skills', 'editing-cordis-compositions', 'SKILL.md',
    )

    expect((await readFile(skill, 'utf8')).startsWith('---\nname: editing-cordis-compositions')).toBe(true)
  })

  it('merges the global skill layer into a preset agent\'s catalog, keeping local discovery preset-side', async () => {
    const proj = await mkdtemp(join(tmpdir(), 'qilin-preset-skill-proj-'))
    await mkdir(join(proj, '.qilin', 'skills', 'project-proof'), { recursive: true })
    await writeFile(join(proj, '.qilin', 'skills', 'project-proof', 'SKILL.md'), [
      '---',
      'name: project-proof',
      'description: Proves the preset layer discovers project skills beside global ones.',
      '---',
      '',
      'Project proof body.',
      '',
    ].join('\n'))

    const handle = await ctx.agents.create({
      // Unique per run: the composition persists into the ambient QILIN home,
      // and a fixed id would collide with a log an earlier run left there.
      sessionId: SessionId(`preset-skills-shipped-${randomUUID()}`),
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, 'ptc').then(() => undefined),
    })
    try {
      // The host (global) view carries the deployment-level provider alone:
      // local discovery moved behind the presets with `skill-filesystem`.
      expect((await ctx.skills.list({ cwd: proj })).map(skill => skill.name)).toEqual(['qilin-badge'])

      // The composed agent's view merges the global layer with its preset's
      // own local discovery over the session cwd.
      const scoped = (await ctx.skills.list({ cwd: proj, scope: handle.agent })).map(skill => skill.name)
      expect(scoped).toContain('qilin-badge')
      expect(scoped).toContain('project-proof')

      // The preset owns the loader tool, and its PTC presentation makes
      // `run_code` the one directly callable tool: a direct execute is refused
      // with that guidance rather than the loader going missing from the table.
      expect(toolNames(ctx, handle.agent)).toContain('skill')
      const loaded = await ctx.tools.execute({
        callId: ToolCallId('preset-skills-load'),
        name: 'skill',
        arguments: { name: 'qilin-badge' },
        signal: new AbortController().signal,
        agent: handle.agent,
      })
      expect(loaded.isError).toBe(true)
      expect(JSON.stringify(loaded.content)).toContain('run_code')
    } finally {
      await handle.dispose()
    }
  })

  it('shows a lean agent the global layer but no loader tool', async () => {
    const handle = await ctx.agents.create({
      sessionId: SessionId(`preset-skills-lean-${randomUUID()}`),
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, LEAN_ID).then(() => undefined),
    })
    try {
      // Layer visibility is the registry's; whether an agent can USE skills
      // stays the preset's choice — this composition mounts no `tool-skill`, so
      // its tool table has no loader even though the global layer is readable.
      expect((await ctx.skills.list({ scope: handle.agent })).map(skill => skill.name)).toContain('qilin-badge')
      expect(toolNames(ctx, handle.agent)).toEqual(LEAN_TOOLS)
    } finally {
      await handle.dispose()
    }
  })

  it('never rewrites the preset file it composed from', async () => {
    // The Loader persists a tree whose plugin self-disposed, and tearing an
    // agent down disposes its whole subtree. Inherited, that rewrote the
    // shipped composition — truncating it to `[]` the first time a session
    // ended — so `PresetTree` refuses to write at all.
    const path = join(SHIPPED_PRESET_ROOT, 'ptc', 'agent.cordis.yml')
    const before = await readFile(path, 'utf8')

    const handle = await ctx.agents.create({
      sessionId: SessionId('preset-readonly'),
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, 'ptc').then(() => undefined),
    })
    await handle.dispose()
    // Slack, not a race the number has to win. The write is driven by the
    // Loader's fiber-unload listener, which fires as the subtree's fibers
    // settle rather than when `dispose()` resolves, and the Loader exposes no
    // flush to await. A regression writes synchronously inside that listener,
    // so any wait past settlement fails; a longer one only slows the test.
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(await readFile(path, 'utf8')).toBe(before)
  })
})

describe('a switch survives the session', () => {
  it('records the choice so the log states what the agent runs', async () => {
    const handle = await ctx.agents.create({
      sessionId: SessionId('preset-switch-logged'),
      meta: { agentPreset: 'ptc' },
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, 'ptc').then(() => undefined),
    })
    try {
      // The api-proxy's select does exactly this pair while the session is blank.
      expect(ctx.commands.find(handle.agent, 'goal')).toBeDefined()
      await ctx.agentPresets.recompose(handle.agent.ctx, LEAN_ID)
      handle.agent.session.append('agent-preset/selected', { agentPreset: LEAN_ID })
      expect(ctx.commands.find(handle.agent, 'goal')).toBeUndefined()

      // The header keeps the creation fact; the log carries what it runs.
      expect(handle.agent.session.header.agentPreset).toBe('ptc')
      expect(ctx.sessionProjections.stateOf(handle.agent.session, 'agentPreset')).toBe(LEAN_ID)
    } finally {
      await handle.dispose()
    }
  })

})

describe('a forked session', () => {
  it('inherits the composition its seeded history was produced under', async () => {
    const parent = await ctx.agents.create({
      sessionId: SessionId('preset-fork-parent'),
      meta: { agentPreset: LEAN_ID },
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, LEAN_ID).then(() => undefined),
    })
    const inherited = ctx.sessionProjections.stateOf(parent.agent.session, 'agentPreset') ?? undefined
    const child = await ctx.agents.create({
      sessionId: SessionId('preset-fork-child'),
      seed: [],
      inheritedEventCount: SessionLogOffset(0),
      meta: {
        parentSession: SessionId('preset-fork-parent'),
        isSeeded: true,
        ...inherited === undefined ? {} : { agentPreset: inherited },
      },
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, inherited).then(() => undefined),
    })
    try {
      // Composing nothing would leave the child empty: this layer moved every
      // model-facing row out of the host plane, so there is nothing to inherit
      // for free any more.
      expect(toolNames(ctx, child.agent)).toEqual(toolNames(ctx, parent.agent))
      expect(toolNames(ctx, child.agent).length).toBeGreaterThan(0)
    } finally {
      await child.dispose()
      await parent.dispose()
    }
  })
})

describe('a delegated child', () => {
  it('runs on the composition its parent runs on', async () => {
    const parent = await ctx.agents.create({
      sessionId: SessionId('preset-child-parent'),
      meta: { agentPreset: 'ptc' },
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, 'ptc').then(() => undefined),
    })
    // Exactly what an in-process subagent driver's creation window does.
    const child = await parent.agent.ctx.agents.create({
      sessionId: SessionId('preset-child'),
      meta: childSessionMeta(parent.agent, 1, false),
      setup: (agentCtx) => {
        applyChildComposition(agentCtx, parent.agent, {})
      },
    })
    try {
      expect(toolNames(ctx, child.agent)).toEqual(toolNames(ctx, parent.agent))
      // The shipped preset is the whole coding agent; an empty child here is
      // the defect, and equality alone would not catch it.
      expect(toolNames(ctx, child.agent)).toContain('bash')
      expect(child.agent.session.header.agentPreset).toBe('ptc')
    } finally {
      await child.dispose()
      await parent.dispose()
    }
  })

  it('follows a parent that switched preset while blank', async () => {
    const parent = await ctx.agents.create({
      sessionId: SessionId('preset-child-switch-parent'),
      meta: { agentPreset: 'ptc' },
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, 'ptc').then(() => undefined),
    })
    await ctx.agentPresets.recompose(parent.agent.ctx, LEAN_ID)
    const child = await parent.agent.ctx.agents.create({
      sessionId: SessionId('preset-child-switch'),
      meta: childSessionMeta(parent.agent, 1, false),
      setup: (agentCtx) => {
        applyChildComposition(agentCtx, parent.agent, {})
      },
    })
    try {
      // The live scope chain is the authority, not the parent's creation
      // header — which still names `ptc`.
      expect(toolNames(ctx, child.agent)).toEqual(toolNames(ctx, parent.agent))
      expect(child.agent.session.header.agentPreset).toBe(LEAN_ID)
    } finally {
      await child.dispose()
      await parent.dispose()
    }
  })
})

describe('a launcher that configures no writable root', () => {
  // The claim this default exists for, asserted through the real shipped
  // bundles rather than a hand-built context: `apps/cli` patches in only the
  // system root, and a person's own presets are found anyway because the
  // roster derives `<qilinHome>/.agent-presets` itself. `$QILIN_HOME` is pointed
  // at a temp home BEFORE boot — the derived root is resolved when the plugin
  // is constructed, and an unpinned run would read the developer's own.
  let derivedCtx: Context
  let previousHome: string | undefined

  beforeAll(async () => {
    const home = await mkdtemp(join(tmpdir(), 'qilin-preset-derived-'))
    previousHome = process.env.QILIN_HOME
    process.env.QILIN_HOME = home
    await mkdir(join(home, '.agent-presets', 'derived-mine'), { recursive: true })
    await writeFile(
      join(home, '.agent-presets', 'derived-mine', 'agent.cordis.yml'),
      '- id: tool-todo\n  name: \'@qilin-agent/tool-todo\'\n  config:\n    allowParallelInProgress: true\n',
    )
    const settingsFile = join(await mkdtemp(join(tmpdir(), 'qilin-preset-derived-settings-')), 'settings.yaml')
    await writeFile(settingsFile, '{}\n')
    // No configured roots: the shipped one is the plugin's own, and the
    // writable one is the roster's own default rather than this patch's job.
    derivedCtx = await bootWeb(settingsFile, [{
      id: 'agent-presets',
      config: { default: 'ptc', includeUserRoot: true },
    }])
  }, 120_000)

  afterAll(async () => {
    if (previousHome === undefined) delete process.env.QILIN_HOME
    else process.env.QILIN_HOME = previousHome
    await derivedCtx.fiber.dispose()
  })

  it('discovers and mounts a preset the person authored under the harness home', async () => {
    const listed = await derivedCtx.agentPresets.list()

    const mine = listed.find(preset => preset.id === 'derived-mine')
    expect(mine).toMatchObject({ trust: 'user' })
    // Omitted rather than undefined: a healthy row carries no `broken` key.
    expect(mine?.broken).toBeUndefined()
    expect(derivedCtx.agentPresets.authorable).toBe(true)

    const handle = await derivedCtx.agents.create({
      sessionId: SessionId('preset-derived-root'),
      setup: agentCtx => derivedCtx.agentPresets.mount(agentCtx, 'derived-mine').then(() => undefined),
    })
    try {
      expect(toolNames(derivedCtx, handle.agent)).toContain('todo_write')
    } finally {
      await handle.dispose()
    }
  })
})

describe('authoring a preset on the shipped composition', () => {
  let authorCtx: Context
  let userRoot: string

  beforeAll(async () => {
    userRoot = join(await mkdtemp(join(tmpdir(), 'qilin-preset-authoring-')), 'profiles')
    const settingsFile = join(await mkdtemp(join(tmpdir(), 'qilin-preset-authoring-settings-')), 'settings.yaml')
    await writeFile(settingsFile, '{}\n')
    authorCtx = await bootWeb(settingsFile, [{
      id: 'agent-presets',
      config: {
        default: 'ptc',
        // The root does not exist yet: a deployment whose user has authored
        // nothing is the normal first-run state. The shipped root is the
        // plugin's own, prepended before this.
        roots: [{ path: userRoot, trust: 'user' }],
        includeUserRoot: false,
      },
    }])
  })

  it('refuses to copy over or delete a shipped preset', async () => {
    await expect(authorCtx.agentPresets.copy('ptc', 'ptc')).rejects.toThrow(/already exists/)
    await expect(authorCtx.agentPresets.remove('ptc')).rejects.toThrow(/ships with the deployment/)
  })

  it.each(['../escape', 'a/b', '/abs', 'Upper'])('refuses the uncontainable id %j', async (id) => {
    // The id becomes a directory name under the user root, so containment is
    // checked on the id rather than on the joined path afterwards.
    await expect(authorCtx.agentPresets.copy('ptc', id)).rejects.toThrow()
  })

  it('copies a shipped preset a session then really composes from', async () => {
    await authorCtx.agentPresets.copy('ptc', 'my-agent', '我的模式')

    // Round-trips through the roster as a `user` row carrying the given name
    // and the source's description, over the source's own composition text.
    const preset = await authorCtx.agentPresets.resolve('my-agent')
    const source = await authorCtx.agentPresets.resolve('ptc')
    expect(preset.trust).toBe('user')
    expect(preset.name).toBe('我的模式')
    expect(preset.description).toBe(source.description)
    expect(await authorCtx.agentPresets.read('my-agent')).toBe(await authorCtx.agentPresets.read('ptc'))
    // Owner-only, in an owner-only directory: a composition is executable
    // configuration on a machine that may have other users.
    expect((await stat(preset.path)).mode & 0o777).toBe(0o600)
    const handle = await authorCtx.agents.create({
      sessionId: SessionId('preset-authored'),
      setup: agentCtx => authorCtx.agentPresets.mount(agentCtx, 'my-agent').then(() => undefined),
    })
    try {
      // The shipped composition's own toolset, from a directory copied through
      // the service into a root outside the installed harness.
      expect(toolNames(authorCtx, handle.agent)).toContain('bash')
      expect(toolNames(authorCtx, handle.agent)).toContain('plugin_manager')
    } finally {
      await handle.dispose()
    }
  })

  it('deletes what it copied', async () => {
    await authorCtx.agentPresets.copy('ptc', 'doomed')

    await authorCtx.agentPresets.remove('doomed')

    expect((await authorCtx.agentPresets.list()).map(preset => preset.id)).not.toContain('doomed')
  })
})

/**
 * Which preset an unnamed session gets is a user setting layered over the
 * composition's own default. The package suite proves the layering against a
 * hand-built context; this proves it through the shipped `cordis.yml` — that
 * the roster and the settings provider are actually wired to each other, and
 * that the id the setting names is the one a session composes from.
 */
describe('the default preset as a user setting', () => {
  it('composes an unnamed session from the stored default, not the composed one', async () => {
    expect((await ctx.agentPresets.remoteExportList()).modeSelectionEnabled).toBe(true)
    expect(ctx.agentPresets.defaultId).toBe('ptc')

    await ctx.settings.update(SETTINGS_NAMESPACE, { default: LEAN_ID })
    try {
      expect(ctx.agentPresets.defaultId).toBe(LEAN_ID)

      const handle = await ctx.agents.create({
        sessionId: SessionId('preset-user-default'),
        setup: agentCtx => ctx.agentPresets.mount(agentCtx).then(() => undefined),
      })
      try {
        // `mount()` with no id resolves the effective default. One tool, not
        // the shipped catalog: the setting decided the composition.
        expect(toolNames(ctx, handle.agent)).toEqual(LEAN_TOOLS)
      } finally {
        await handle.dispose()
      }
    } finally {
      // The context is shared with the rest of the file. `replace({})` drops
      // the user section wholesale so the field re-inherits the composition
      // base; `update` merges, and would leave the override standing.
      await ctx.settings.replace(SETTINGS_NAMESPACE, {})
    }

    expect(ctx.agentPresets.defaultId).toBe('ptc')
  })
})

describe('a session keeps the preset it was created with', () => {
  it('refuses to adopt a live session under a different preset', async () => {
    const handle = await ctx.agents.create({
      sessionId: SessionId('preset-locked'),
      meta: { agentPreset: LEAN_ID },
      setup: agentCtx => ctx.agentPresets.mount(agentCtx, LEAN_ID).then(() => undefined),
    })
    try {
      // The api-proxy guard reads exactly this: the header records what the
      // session runs, so naming anything else is a caller error rather than a
      // switch. Its history was produced under this composition's single tool.
      expect(handle.agent.session.header.agentPreset).toBe(LEAN_ID)
    } finally {
      await handle.dispose()
    }
  })
})

describe('a composition that configures its own preset roots', () => {
  let rootsCtx: Context
  let teamRoot: string

  beforeAll(async () => {
    const home = await mkdtemp(join(tmpdir(), 'qilin-preset-roots-'))
    const settingsFile = join(home, 'settings.yaml')
    await writeFile(settingsFile, '{}\n')
    // A workspace-shared root beside the deployment: one preset of its own,
    // plus a directory that claims a shipped id.
    teamRoot = join(home, 'team-presets')
    for (const id of ['team-spec', 'ptc']) {
      await mkdir(join(teamRoot, id), { recursive: true })
      await writeFile(join(teamRoot, id, 'agent.cordis.yml'), LEAN_COMPOSITION)
    }
    // The user layer of the reported regression: a profile's cordis.patch.yml
    // configuring a shared preset root. The plugin must EXTEND it with its
    // own shipped root, never lose it.
    rootsCtx = await bootWeb(settingsFile, [{
      id: 'agent-presets',
      config: {
        default: 'ptc',
        roots: [{ path: teamRoot, trust: 'user' }],
        includeUserRoot: false,
      },
    }])
  }, 120_000)

  afterAll(async () => {
    await rootsCtx.fiber.dispose()
  })

  it('keeps configured roots alongside the always-prepended shipped root', async () => {
    expect(rootsCtx.agentPresets.roots.map(root => root.path)).toEqual([
      SHIPPED_PRESET_ROOT,
      teamRoot,
    ])

    const listed = await rootsCtx.agentPresets.list()
    expect(listed.map(preset => preset.id).sort()).toEqual(['ptc', 'standard', 'team-spec'])
    expect(listed.every(preset => preset.broken === undefined)).toBe(true)
    // The shipped root comes first: a configured directory claiming the
    // shipped id is shadowed, never the other way around.
    expect(listed.find(preset => preset.id === 'ptc')?.trust).toBe('system')
    expect(listed.find(preset => preset.id === 'team-spec')?.trust).toBe('user')
  })

  it('composes an agent from a configured-root preset', async () => {
    const handle = await rootsCtx.agents.create({
      sessionId: SessionId('preset-team-spec'),
      setup: agentCtx => rootsCtx.agentPresets.mount(agentCtx, 'team-spec').then(() => undefined),
    })
    try {
      expect(toolNames(rootsCtx, handle.agent)).toEqual(LEAN_TOOLS)
    } finally {
      await handle.dispose()
    }
  })
})
