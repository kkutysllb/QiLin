/** Static DSH-era compatibility report for one plugin package. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { doctorPluginPackage, type PluginDoctorFinding } from '../src/index.ts'

const tempRoots: string[] = []
afterAll(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qilin-doctor-'))
  tempRoots.push(dir)
  return dir
}

function file(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

/** Stage an installation whose dependency tree provides the given package names. */
function installation(names: readonly string[] = []): string {
  const root = tmp()
  const app = join(root, 'app')
  for (const name of names) {
    file(join(app, 'node_modules', name, 'package.json'), JSON.stringify({ name, version: '3.0.0' }))
  }
  file(join(app, 'package.json'), JSON.stringify({
    name: 'qilin-app',
    version: '3.0.0',
    dependencies: Object.fromEntries(names.map(name => [name, '3.0.0'])),
  }))
  return join(app, 'package.json')
}

/** Stage one plugin package from a manifest and a source map. */
function plugin(manifest: Record<string, unknown>, sources: Record<string, string> = {}): string {
  const dir = tmp()
  file(join(dir, 'package.json'), JSON.stringify({ name: 'fixture-plugin', version: '1.0.0', ...manifest }))
  for (const [name, text] of Object.entries(sources)) file(join(dir, name), text)
  return dir
}

/** The finding for one check, or undefined when the check reported nothing. */
function findingOf(findings: readonly PluginDoctorFinding[], check: PluginDoctorFinding['check']): PluginDoctorFinding | undefined {
  return findings.find(finding => finding.check === check)
}

describe('doctorPluginPackage', () => {
  it('reports a plugin that reads the pinned home and declares its engine peers', () => {
    const anchor = installation(['@qilin/session'])
    const dir = plugin({
      peerDependencies: { '@deepseek-ai/dsh-session': '*' },
      dsh: { client: { platform: 'web', inject: ['@deepseek-ai/dsh-client-locale'] } },
    }, {
      'lib/index.js': 'import { join } from \'node:path\'\nimport { homedir } from \'node:os\'\n'
        + 'const home = process.env.QILIN_HOME ?? process.env.DSH_HOME ?? join(homedir(), \'.dsh\')\n'
        + 'export const dir = join(home, \'fixture-plugin\')\n',
    })
    const report = doctorPluginPackage('doctor', dir, anchor)
    expect(report).toMatchObject({ name: 'fixture-plugin', dir, verdict: 'usable', findings: [] })
  })

  it('reports a plugin that builds the DSH-era home itself', () => {
    const anchor = installation()
    const dir = plugin({}, {
      'lib/index.js': 'import { homedir } from \'node:os\'\n'
        + 'const presets = resolve(homedir(), \'.dsh\', \'.agent-presets\')\n'
        + 'const docs = join(process.env.HOME, \'.dsh\')\n'
        + 'const more = resolve(\'.dsh\')\n'
        + 'const also = join(dir, \'.dsh\')\n',
    })
    const report = doctorPluginPackage('doctor', dir, anchor)
    expect(report.verdict).toBe('degraded')
    const home = findingOf(report.findings, 'home')
    expect(home?.severity).toBe('warn')
    expect(home?.message).toContain('lib/index.js:2, lib/index.js:3, lib/index.js:4, +1 more')
    expect(home?.message).toContain('DSH_HOME')
  })

  it('reports an upstream engine package installed as a dependency', () => {
    const anchor = installation()
    const dir = plugin({ dependencies: { '@deepseek-ai/dsh-session': '0.1.6' } })
    const report = doctorPluginPackage('doctor', dir, anchor)
    expect(report.verdict).toBe('unusable')
    const dependency = findingOf(report.findings, 'engine-dependency')
    expect(dependency?.severity).toBe('fail')
    expect(dependency?.message).toContain('\'@deepseek-ai/dsh-session\'')
    expect(dependency?.message).toContain('\'@qilin/session\'')
  })

  it('reports a dependency the installation already provides', () => {
    const anchor = installation(['@qilin/session'])
    const dir = plugin({ dependencies: { '@qilin/session': '3.0.0' }, optionalDependencies: { lodash: '^4' } })
    const report = doctorPluginPackage('doctor', dir, anchor)
    expect(report.verdict).toBe('degraded')
    // Exactly one finding: a third-party library the installation does not carry
    // is not one.
    expect(report.findings.map(finding => finding.message)).toEqual([
      expect.stringContaining('\'@qilin/session\''),
    ])
    const dependency = findingOf(report.findings, 'engine-dependency')
    expect(dependency?.severity).toBe('warn')
    expect(dependency?.message).not.toContain('lodash')
  })

  it('reports engine modules the plugin imports without declaring them', () => {
    const anchor = installation()
    const dir = plugin({ name: 'fixture-plugin', peerDependencies: { '@deepseek-ai/schemastery': '*' } }, {
      'lib/index.js': 'import { Context } from \'@deepseek-ai/dsh-session\'\n'
        + 'import { Schema } from \'@deepseek-ai/schemastery\'\n'
        + 'const loader = require(\'cordis-plugin-loader\')\n'
        + 'const side = import(\'@qilin/client-modules/client\')\n'
        + 'const malformed = require(\'@qilin/\')\n'
        + 'const self = require(\'fixture-plugin\')\n'
        + 'const builtin = require(\'node:path\')\n',
      'lib/zz-extra.js': 'import { Context } from \'@deepseek-ai/dsh-session\'\n',
    })
    const report = doctorPluginPackage('doctor', dir, anchor)
    expect(report.verdict).toBe('degraded')
    const imported = findingOf(report.findings, 'engine-import')
    expect(imported?.message).toContain('\'@deepseek-ai/dsh-session\' (lib/index.js:1)')
    expect(imported?.message).toContain('\'cordis-plugin-loader\' (lib/index.js:3)')
    expect(imported?.message).toContain('\'@qilin/client-modules\' (lib/index.js:4)')
    expect(imported?.message).toContain('peerDependencies')
    // Declared peers, the package's own name, and Node builtins are not findings.
    expect(imported?.message).not.toContain('schemastery')
    expect(imported?.message).not.toContain('fixture-plugin\' (')
    expect(imported?.message).not.toContain('node:path')
    // A second import of the same name reports only the first file's location.
    expect(imported?.message).not.toContain('zz-extra.js')
  })

  it('reports client inject names the compatibility layer cannot map, and fails a malformed declaration', () => {
    const anchor = installation()
    const unmapped = plugin({ dsh: { client: { platform: 'web', inject: ['@example/other-panel', '@deepseek-ai/dsh-client-locale'] } } })
    const report = doctorPluginPackage('doctor', unmapped, anchor)
    expect(report.verdict).toBe('degraded')
    const inject = findingOf(report.findings, 'client-inject')
    expect(inject?.severity).toBe('warn')
    expect(inject?.message).toContain('dsh.client.inject')
    expect(inject?.message).toContain('\'@example/other-panel\'')
    expect(inject?.message).not.toContain('dsh-client-locale')

    // A QiLin-native declaration wins the channel and its names are already mapped.
    const native = plugin({ qilin: { client: { platform: 'web', inject: ['@qilin/client-ui-slots'] } } })
    expect(doctorPluginPackage('doctor', native, anchor).findings).toEqual([])

    const malformed = plugin({ qilin: { client: { platform: 'web', inject: 'nope' } } })
    const failure = doctorPluginPackage('doctor', malformed, anchor)
    expect(failure.verdict).toBe('unusable')
    expect(findingOf(failure.findings, 'client-inject')?.message).toContain('qilin.client.inject must be an array')

    const notAnObject = plugin({ dsh: { client: 'nope' } })
    expect(doctorPluginPackage('doctor', notAnObject, anchor).findings).toEqual([])

    const withoutInject = plugin({ dsh: { client: { platform: 'web' } } })
    expect(doctorPluginPackage('doctor', withoutInject, anchor).findings).toEqual([])
  })

  it('skips dependency trees, unsupported extensions, and generated bundles', () => {
    const anchor = installation()
    const dir = plugin({}, { 'lib/index.js': 'const home = resolve(\'.dsh\')\n' })
    file(join(dir, 'lib', 'index.js.map'), 'resolve(".dsh")\n')
    file(join(dir, 'node_modules', 'nested', 'index.js'), 'const home = resolve(\'.dsh\')\n')
    file(join(dir, 'lib', 'bundle.js'), `const padding = '${'x'.repeat(10)}\nconst home = resolve('.dsh')\n`.padEnd(4_000_100, 'x'))
    const report = doctorPluginPackage('doctor', dir, anchor)
    const home = findingOf(report.findings, 'home')
    expect(home?.message).toContain('lib/index.js:1')
    expect(home?.message).not.toContain('bundle.js')
    expect(home?.message).not.toContain('nested')
  })

  it('reports a manifest that names no package with its directory', () => {
    const dir = plugin({ name: undefined })
    expect(doctorPluginPackage('doctor', dir, installation())).toMatchObject({ name: dir, verdict: 'usable' })
  })

  it('throws when the directory holds no readable manifest', () => {
    expect(() => doctorPluginPackage('doctor', tmp(), installation())).toThrow(/cannot read the plugin manifest/)
  })
})
