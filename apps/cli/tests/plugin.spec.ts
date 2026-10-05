/**
 * `qilin plugin` verbs: `list`, `doctor`, and the exact-version exemption
 * commands read or write the profile without running pnpm, and every other
 * argument list still forwards to it.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { getQilinRuntimeVersion, PROFILE_TEMPLATES, readProfileVersionExemptions } from '@qilin/app-boot'
import { runPlugin } from '../src/plugin.ts'

vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawnSync: vi.fn(() => ({ status: 0 })),
}))

const roots: string[] = []

afterEach(() => {
  vi.unstubAllEnvs()
  vi.mocked(spawnSync).mockClear()
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function tmp(): string {
  const dir = mkdtempSync(join(tmpdir(), 'qilin-cli-plugin-'))
  roots.push(dir)
  return dir
}

function file(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, text)
}

/**
 * Stage a QiLin home holding one profile whose manifest declares `bundles`, and
 * return the profile directory.
 */
function stageProfile(profile: string, manifest: Record<string, unknown>): string {
  const home = tmp()
  const dir = join(home, 'profiles', profile)
  file(join(dir, 'package.json'), JSON.stringify({ name: `qilin-profile-${profile}`, private: true, ...manifest }))
  vi.stubEnv('QILIN_HOME', home)
  return dir
}

/**
 * Stage a QiLin home whose named profile does not exist yet, and return the
 * directory the exemption commands would initialize.
 */
function stageMissingProfile(profile: string): string {
  const home = tmp()
  vi.stubEnv('QILIN_HOME', home)
  return join(home, 'profiles', profile)
}

/**
 * Run one invocation while capturing what it wrote.
 * @param run - the invocation to await.
 * @returns its exit code, both captured streams, and the order they were written in.
 */
async function capture(run: () => Promise<number>): Promise<{
  code: number
  out: string
  err: string
  writes: readonly ('stdout' | 'stderr')[]
}> {
  let out = ''
  let err = ''
  const writes: ('stdout' | 'stderr')[] = []
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    out += chunk.toString()
    writes.push('stdout')
    return true
  })
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    err += chunk.toString()
    writes.push('stderr')
    return true
  })
  return { code: await run(), out, err, writes }
}

describe('qilin plugin list', () => {
  it('prints the profile layers in activation order without running pnpm', async () => {
    const dir = stageProfile('tui', {
      dependencies: { 'dsh-super-ppts': '1.2.1' },
      qilin: { profile: { bundles: ['@qilin/base', 'dsh-super-ppts', '@example/absent'] } },
    })
    file(join(dir, 'node_modules', 'dsh-super-ppts', 'package.json'), JSON.stringify({ name: 'dsh-super-ppts', version: '1.2.1' }))
    const { code, out } = await capture(() => runPlugin('tui', ['list']))
    expect(code).toBe(0)
    const lines = out.trim().split('\n')
    // `tui` ships no template, so every declared layer is a user layer, and a
    // layer that resolves from the installation reports that version.
    expect(lines[0]).toMatch(/^0\t@qilin\/base@\d/u)
    expect(lines[1]).toBe('1\tdsh-super-ppts@1.2.1\tuser')
    expect(lines[2]).toBe('2\t@example/absent@not installed\tuser')
    expect(out).not.toContain('(shipped)')
    expect(spawnSync).not.toHaveBeenCalled()
  })

  it('marks the shipped layers of a template profile', async () => {
    stageProfile('web', { qilin: { profile: { bundles: ['@qilin/base', '@qilin/web-app'] } } })
    const { code, out } = await capture(() => runPlugin('web', ['list']))
    expect(code).toBe(0)
    expect(out.match(/\(shipped\)/gu)).toHaveLength(2)
    expect(out).not.toContain('\tuser')
    // Neither shipped layer takes an in-place upgrade: both move with the installation.
    expect(out).not.toContain('(updatable)')
  })

  it('reports the retired animations layer as a plain user layer', async () => {
    // `list` reads the manifest without normalizing it, so a profile still
    // carrying the once-seeded layer shows it as an owner layer: not shipped,
    // no in-place upgrade marker of its own.
    const dir = stageProfile('web', {
      qilin: { profile: { bundles: ['@qilin/base', '@qilin/web-app', 'dsh-animations'] } },
    })
    file(join(dir, 'node_modules', 'dsh-animations', 'package.json'), JSON.stringify({ name: 'dsh-animations', version: '1.2.3' }))
    const { code, out } = await capture(() => runPlugin('web', ['list']))
    expect(code).toBe(0)
    expect(out).toContain('2\tdsh-animations@1.2.3\tuser')
    expect(out.match(/\(shipped\)/gu)).toHaveLength(2)
    expect(out).not.toContain('(updatable)')
  })

  it('reports a profile that lists no layers', async () => {
    stageProfile('tui', { qilin: { profile: { bundles: [] } } })
    const { code, out } = await capture(() => runPlugin('tui', ['list']))
    expect(code).toBe(0)
    expect(out).toContain('profile tui lists no plugin layers')
    expect(spawnSync).not.toHaveBeenCalled()
  })
})

describe('qilin plugin doctor', () => {
  it('reports a directory target and fails the command only on a blocking finding', async () => {
    stageProfile('tui', { qilin: { profile: { bundles: [] } } })
    const pluginDir = tmp()
    file(join(pluginDir, 'package.json'), JSON.stringify({ name: 'clean-plugin', version: '1.0.0' }))
    file(join(pluginDir, 'lib', 'index.js'), 'export const one = 1\n')
    const clean = await capture(() => runPlugin('tui', ['doctor', pluginDir]))
    expect(clean.code).toBe(0)
    expect(clean.out).toContain('clean-plugin\tusable')
    expect(clean.out).toContain('no compatibility findings')

    file(join(pluginDir, 'package.json'), JSON.stringify({
      name: 'polluted-plugin',
      version: '1.0.0',
      dependencies: { '@deepseek-ai/dsh-session': '0.1.6' },
    }))
    const polluted = await capture(() => runPlugin('tui', ['doctor', pluginDir]))
    expect(polluted.code).toBe(1)
    expect(polluted.out).toContain('polluted-plugin\tunusable')
    expect(polluted.out).toContain('fail\tengine-dependency')
    expect(spawnSync).not.toHaveBeenCalled()
  })

  it('resolves an installed package name through the profile and reports an unknown target', async () => {
    const dir = stageProfile('tui', { qilin: { profile: { bundles: [] } } })
    file(join(dir, 'node_modules', 'installed-plugin', 'package.json'), JSON.stringify({ name: 'installed-plugin', version: '2.0.0' }))
    const installed = await capture(() => runPlugin('tui', ['doctor', 'installed-plugin']))
    expect(installed.code).toBe(0)
    expect(installed.out).toContain('installed-plugin\tusable')

    const missing = await capture(() => runPlugin('tui', ['doctor', 'no-such-plugin']))
    expect(missing.code).toBe(1)
    expect(missing.err).toContain('is neither a package directory nor an installed package in profile tui')
  })
})

describe('qilin plugin version exemptions', () => {
  it('requires explicit acknowledgement, grants only the exact pair, lists and revokes it without pnpm', async () => {
    const dir = stageMissingProfile('test')
    const runtime = getQilinRuntimeVersion()
    const granted = await capture(() => runPlugin('test', ['allow-version', '@example/plugin@1.2.3', '--qilin-version', runtime, '--accept-risk']))
    expect(granted.code).toBe(0)
    expect(granted.err).toBe('qilin: warning: allowing incompatible plugin versions can break the application or corrupt data. Approval applies only to the exact package and qilin versions.\n')
    // The risk statement reaches the operator before the confirmation does.
    expect(granted.writes.indexOf('stderr')).toBeLessThan(granted.writes.indexOf('stdout'))
    expect(readProfileVersionExemptions(dir)).toEqual({ '@example/plugin@1.2.3': [runtime] })
    expect(JSON.parse(readFileSync(join(dir, 'compatibility.json'), 'utf8'))).toEqual({ '@example/plugin@1.2.3': [runtime] })
    // The grant is profile metadata of its own: no bundle joins the layer list.
    const listed = await capture(() => runPlugin('test', ['version-exemptions']))
    expect(listed.code).toBe(0)
    expect(listed.out).toBe(JSON.stringify({ '@example/plugin@1.2.3': [runtime] }, undefined, 2) + '\n')
    const revoked = await capture(() => runPlugin('test', ['revoke-version', '@example/plugin@1.2.3', `--qilin-version=${runtime}`]))
    expect(revoked.code).toBe(0)
    expect(readProfileVersionExemptions(dir)).toEqual({})
    expect(spawnSync).not.toHaveBeenCalled()
  })

  it.each([
    ['allow-version', 'plugin@1.2.3', '--qilin-version', 'CURRENT'],
    ['allow-version', 'plugin@1.2.3', '--accept-risk'],
    ['allow-version', 'plugin@^1.2.3', '--qilin-version', 'CURRENT', '--accept-risk'],
    ['allow-version', 'plugin@1.2.3', '--qilin-version', '999.0.0', '--accept-risk'],
    ['allow-version', 'plugin@1.2.3', '--qilin-version', 'CURRENT', '--accept-risk=false'],
    ['allow-version', 'plugin@1.2.3', '--qilin-version', 'CURRENT', '--accept-risk', '--accept-risk'],
    ['revoke-version', 'plugin@1.2.3'],
    ['version-exemptions', 'extra'],
  ])('rejects malformed or unacknowledged exemption command %j', async (...arguments_) => {
    const dir = stageMissingProfile('test')
    const args = arguments_.map(value => value === 'CURRENT' ? getQilinRuntimeVersion() : value)
    const { code, err } = await capture(() => runPlugin('test', args))
    expect(code).toBe(1)
    expect(err).not.toBe('')
    expect(existsSync(join(dir, 'compatibility.json'))).toBe(false)
    expect(spawnSync).not.toHaveBeenCalled()
  })

  it('lists an exemption file the reader rejected without discarding it', async () => {
    const dir = stageMissingProfile('test')
    file(join(dir, 'compatibility.json'), JSON.stringify({ 'not-a-version': ['1.0.0'] }))
    const { code, out, err } = await capture(() => runPlugin('test', ['version-exemptions']))
    expect(code).toBe(0)
    expect(out).toBe('{}\n')
    expect(err).toContain('is not an exact package-name@version key')
    expect(JSON.parse(readFileSync(join(dir, 'compatibility.json'), 'utf8'))).toEqual({ 'not-a-version': ['1.0.0'] })
  })

  it('uses shipped profile defaults when listing a missing profile', async () => {
    const dir = stageMissingProfile('web')
    const { code, out } = await capture(() => runPlugin('web', ['version-exemptions']))
    expect(code).toBe(0)
    expect(out).toBe('{}\n')
    expect(JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')))
      .toMatchObject({ qilin: { profile: { bundles: [...PROFILE_TEMPLATES.web?.bundles ?? []] } } })
    expect(spawnSync).not.toHaveBeenCalled()
  })
})

describe('qilin plugin forwarding', () => {
  it('refuses a named package the running runtime version rejects without installing it', async () => {
    const dir = stageProfile('tui', { qilin: { profile: { bundles: [] } } })
    const pluginDir = tmp()
    file(join(pluginDir, 'package.json'), JSON.stringify({
      name: 'incompatible-plugin',
      version: '1.0.0',
      peerDependencies: { '@qilin/session': '999.0.0' },
    }))
    const { code, err } = await capture(() => runPlugin('tui', ['add', pluginDir]))
    expect(code).toBe(1)
    expect(err).toContain('crashes or data loss')
    expect(err).toContain('nothing was installed')
    expect(err).toContain(`allow-version incompatible-plugin@1.0.0 --qilin-version ${getQilinRuntimeVersion()} --accept-risk`)
    expect(spawnSync).not.toHaveBeenCalled()
    expect(existsSync(join(dir, 'compatibility.json'))).toBe(false)
  })

  it('still forwards every other argument list to pnpm in the profile', async () => {
    const dir = stageProfile('tui', { qilin: { profile: { bundles: [] } } })
    const pluginDir = tmp()
    file(join(pluginDir, 'package.json'), JSON.stringify({ name: 'clean-plugin', version: '1.0.0' }))
    const { code } = await capture(() => runPlugin('tui', ['add', pluginDir]))
    expect(code).toBe(0)
    expect(vi.mocked(spawnSync)).toHaveBeenCalledWith('pnpm', ['add', pluginDir], expect.objectContaining({ cwd: dir }))
  })
})
