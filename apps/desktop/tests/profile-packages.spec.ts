import { execFileSync } from 'node:child_process'
import { lstatSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { createPluginProfile } from '../src/project-manager.ts'
import {
  linkDesktopHostPackages,
  readDesktopProfileState,
  recordDesktopRuntimeProfile,
  unlinkDesktopHostPackages,
  validateDesktopPluginGraph,
} from '../src/profile-packages.ts'
import { runtimeFixture, writePackage } from './runtime-fixture.ts'

const roots: string[] = []
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'desktop-profile-'))
  roots.push(root)
  const qilin = join(root, 'qilin')
  const runtime = runtimeFixture(qilin)
  const profile = join(root, 'profile')
  createPluginProfile(profile)
  linkDesktopHostPackages(profile, qilin, runtime)
  return { root, qilin, runtime, profile }
}
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })

it('loads one shared ESM instance from both host and external plugin while keeping ordinary dependencies private', () => {
  const { qilin, runtime, profile } = fixture()
  writePackage(join(qilin, 'node_modules'), 'ordinary', {}, 'export default "host"')
  writePackage(join(profile, 'node_modules'), 'ordinary', {}, 'export default "plugin"')
  const plugin = writePackage(join(profile, 'node_modules'), 'plugin', {
    peerDependencies: { '@qilin/kylin': '^1.0.0' }, dependencies: { ordinary: '1.0.0' },
  }, 'export { identity } from "@qilin/kylin"; export { default as ordinary } from "ordinary"')
  validateDesktopPluginGraph(profile, qilin, runtime, ['plugin'])
  const entry = join(qilin, 'check.mjs')
  writeFileSync(entry, `import {identity} from '@qilin/kylin'; import ordinary from 'ordinary'; import * as plugin from ${JSON.stringify(pathToFileURL(join(plugin, 'index.js')).href)}; console.log(JSON.stringify({same:identity===plugin.identity, host:ordinary, plugin:plugin.ordinary}))`)
  const output = execFileSync(process.execPath, [entry], { encoding: 'utf8', env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } })
  expect(JSON.parse(output)).toEqual({ same: true, host: 'host', plugin: 'plugin' })
})
it('runtime resolution retains and ignores an existing Link generation', () => {
  const { qilin, runtime, profile } = fixture()
  const links = readDesktopProfileState(profile)?.links
  expect(links?.length).toBeGreaterThan(0)

  recordDesktopRuntimeProfile(profile, runtime)
  expect(readDesktopProfileState(profile)?.links).toEqual(links)
  expect(lstatSync(join(profile, 'node_modules/@qilin/kylin')).isSymbolicLink()).toBe(true)
  expect(() => { validateDesktopPluginGraph(profile, qilin, runtime, [], 'runtime') }).not.toThrow()
})
it.each(['nested', 'alias'])('rejects a %s second copy of a host package', (placement) => {
  const { qilin, runtime, profile } = fixture()
  const plugin = writePackage(join(profile, 'node_modules'), 'plugin')
  if (placement === 'nested') writePackage(join(plugin, 'node_modules'), '@qilin/kylin')
  else writePackage(join(profile, 'node_modules'), 'alias', { name: '@qilin/kylin' })
  expect(() =>{  validateDesktopPluginGraph(profile, qilin, runtime, ['plugin']) }).toThrow(/duplicate or aliased/u)
})
it('rejects a host package declared as an ordinary dependency', () => {
  const { qilin, runtime, profile } = fixture()
  writePackage(join(profile, 'node_modules'), 'plugin', { dependencies: { '@qilin/kylin': '^1.0.0' } })
  expect(() =>{  validateDesktopPluginGraph(profile, qilin, runtime, ['plugin']) }).toThrow(/peer dependency/u)
})
it('rejects incompatible peers only when the plugin is enabled', () => {
  const { qilin, runtime, profile } = fixture()
  writePackage(join(profile, 'node_modules'), 'plugin', { peerDependencies: { '@qilin/kylin': '^2.0.0' } })
  expect(() =>{  validateDesktopPluginGraph(profile, qilin, runtime, ['plugin']) }).toThrow(/found 1.0.0/u)
  expect(() =>{  validateDesktopPluginGraph(profile, qilin, runtime, []) }).not.toThrow()
})
it('refuses to satisfy a plugin dependency from an ancestor CLI project', () => {
  const { root, qilin, runtime, profile } = fixture()
  writePackage(join(root, 'node_modules'), 'ambient')
  writePackage(join(profile, 'node_modules'), 'plugin', { dependencies: { ambient: '1.0.0' } })
  expect(() =>{  validateDesktopPluginGraph(profile, qilin, runtime, ['plugin']) }).toThrow(/outside its owned packages/u)
})
it('removes broken owned links without following them', () => {
  const { root, profile } = fixture()
  writePackage(join(profile, 'node_modules'), 'plugin')
  rmSync(join(root, 'qilin'), { recursive: true })
  expect(() =>{  unlinkDesktopHostPackages(profile) }).not.toThrow()
})
it('refuses to replace an unowned package at a managed name', () => {
  const { profile } = fixture()
  unlinkSync(join(profile, 'node_modules/@qilin/kylin'))
  writePackage(join(profile, 'node_modules'), '@qilin/kylin')
  expect(() =>{  unlinkDesktopHostPackages(profile) }).toThrow(/unowned package/u)
})
it('rejects private package links instead of following cycles or old transaction paths', () => {
  const { qilin, runtime, profile } = fixture()
  const plugin = writePackage(join(profile, 'node_modules'), 'plugin')
  symlinkSync(plugin, join(profile, 'node_modules/alias'), process.platform === 'win32' ? 'junction' : 'dir')
  expect(() =>{  validateDesktopPluginGraph(profile, qilin, runtime, ['plugin']) }).toThrow(/linked private package/u)
})
