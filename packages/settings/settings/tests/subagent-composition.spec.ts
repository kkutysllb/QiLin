/**
 * Acceptance composition: the Config-projection seam serves the built-in
 * plugin rows. Composing `subagent` and `subagent-model-selection-settings`
 * through a real Loader Include projects BOTH static Configs into
 * `settings/describe` — the fact the plugins page's subagent card waits on —
 * and a form edit lands in the profile patch without remounting either row.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { onTestFinished, expect, it } from 'vitest'
import { Context, Service } from '@qilin-agent/kylin'
import Loader from '@qilin-agent/kylin-plugin-loader'
import { initProfile, mountRootInclude, readProfilePatches, type ProfileContext } from '@qilin-agent/app-boot'
import { parse } from 'yaml'
import SubagentRuntime from '@qilin-agent/subagent'
import SubagentModelSelection from '@qilin-agent/tool-subagent/model-selection-settings'
import ConfigEditor from '../../config-editor/src/index.ts'
import Settings from '../src/index.ts'

it('serves the subagent and subagent-model-selection namespaces from composed rows', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'settings-subagent-')))
  const dir = join(home, 'profiles', 'test')
  onTestFinished(() => { rmSync(home, { recursive: true, force: true }) })
  initProfile(dir, ['test-bundle'])
  const bundle = join(dir, 'node_modules', 'test-bundle')
  mkdirSync(bundle, { recursive: true })
  writeFileSync(join(home, 'package.json'), '{"name":"test-installation"}\n')
  writeFileSync(join(bundle, 'package.json'), JSON.stringify({ name: 'test-bundle', version: '1.0.0', qilin: { bundle: { patch: 'cordis.patch.yml' } } }))
  writeFileSync(join(bundle, 'cordis.patch.yml'), JSON.stringify([{ insert: [
    { id: 'config-editor', name: 'cordis:editor' },
    { id: 'settings', name: 'cordis:settings' },
    { id: 'working-directory', name: 'cordis:working-directory' },
    { id: 'subagent', name: 'cordis:subagent' },
    { id: 'subagent-model-selection-settings', name: 'cordis:subagent-model-selection' },
  ] }]))
  writeFileSync(join(dir, 'cordis.yml'), '[]\n')
  const profile: ProfileContext = {
    name: 'test', startedBundles: ['test-bundle'], dir, patchPath: join(dir, 'cordis.patch.yml'),
    installAnchor: join(home, 'package.json'), cwd: home, home, overlays: [], telemetryDisabledEnv: undefined,
  }

  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  ctx.provide('profileContext', profile)
  await ctx.plugin(Loader)
  Object.assign(ctx.loader.builtins, {
    editor: ConfigEditor, settings: Settings, subagent: SubagentRuntime,
    'subagent-model-selection': SubagentModelSelection,
    // The subagent row's only extra inject; a directory stub is enough here.
    'working-directory': class extends Service {
      constructor(c: Context) { super(c, 'workingDirectory') }
    },
  })
  await mountRootInclude(ctx, join(dir, 'cordis.yml'), readProfilePatches('test', profile))
  await ctx.loader.await()

  const described = ctx.settings.describe().map(row => row.ns)
  expect(described).toContain('subagent')
  expect(described).toContain('subagent-model-selection-settings')

  // A form edit persists into the profile patch and stays live: the row is
  // never remounted, so the registered card face keeps its served namespaces.
  const revision = ctx.settings.describe().find(row => row.ns === 'subagent')!.revision
  await ctx.settings.mutate('subagent', [{ op: 'set', path: ['maxDepth'], value: 3 }], revision)
  expect(ctx.settings.describe().find(row => row.ns === 'subagent')!.value).toMatchObject({ maxDepth: 3 })
  const saved = parse(await import('node:fs/promises').then(fs => fs.readFile(profile.patchPath, 'utf8'))) as Array<Record<string, unknown>>
  expect(saved.find(row => row.id === 'subagent')).toMatchObject({ config: { maxDepth: 3 } })
})
