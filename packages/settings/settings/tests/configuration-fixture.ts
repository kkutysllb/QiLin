/** Real profile patches, Loader updates, and consumers of live Config references. */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { tmpdir } from 'node:os'
import { onTestFinished } from 'vitest'
import { Context } from '@qilin-agent/kylin'
import z from '@qilin-agent/schemastery'
import Loader from '@qilin-agent/kylin-plugin-loader'
import Timer from '@qilin-agent/kylin-plugin-timer'
import { initProfile, mountRootInclude, readProfilePatches, type ProfileContext } from '@qilin-agent/app-boot'
import Hmr from '@qilin-agent/hmr'
import DefaultModel from '@qilin-agent/agent-default-model'
import ConfigEditor from '../../config-editor/src/index.ts'
import Settings from '../src/index.ts'

export async function configurationFixture(options: { schema?: z; apply?: (ctx: Context, config: unknown) => void; hmr?: boolean } = {}) {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'settings-config-')))
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
    { id: 'default-model', name: 'cordis:model', config: { provider: 'test', model: 'original' } },
    { id: 'first', name: 'cordis:probe', config: { ordinary: 'fixed', token: 'private' } },
    { id: 'second', name: 'cordis:probe', config: { ordinary: 'second' } },
  ] }]))
  writeFileSync(join(dir, 'cordis.yml'), '[]\n')
  const profile: ProfileContext = {
    name: 'test', startedBundles: ['test-bundle'], dir, patchPath: join(dir, 'cordis.patch.yml'),
    installAnchor: join(home, 'package.json'), cwd: home, home, overlays: [], telemetryDisabledEnv: undefined,
  }
  const Probe = {
    Config: options.schema ?? z.object({ ordinary: z.string().required(), count: z.number().min(1).default(2).volatile(), token: z.string().role('secret').volatile(), list: z.array(z.object({ name: z.string().required(), token: z.string().role('secret') })).volatile() }),
    apply: options.apply ?? (() => {}),
  }
  const start = async (): Promise<Context> => {
    const ctx = new Context()
    ctx.baseUrl = pathToFileURL(home).href + '/'
    ctx.provide('profileContext', profile)
    ctx.provide('appReady', { onReady: (listener: () => void) => { listener(); return () => {} } })
    await ctx.plugin(Loader)
    Object.assign(ctx.loader.builtins, {
      editor: ConfigEditor, settings: Settings, model: DefaultModel, probe: Probe,
    })
    await mountRootInclude(ctx, join(dir, 'cordis.yml'), readProfilePatches('test', profile))
    await ctx.loader.await()
    onTestFinished(async () => { await ctx.fiber.dispose() })
    if (options.hmr !== false) {
      await ctx.plugin(Timer)
      const hmr = ctx.plugin(Hmr, { root: [], ignored: [], debounce: 0 })
      await hmr.await()
      await ctx.hmr.runExclusive(async () => {})
    }
    return ctx
  }
  return { ctx: await start(), profile, home, start }
}
