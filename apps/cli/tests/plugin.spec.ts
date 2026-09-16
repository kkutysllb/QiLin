/**
 * `qilin plugin` verbs: `list` and `doctor` read the profile without running
 * pnpm, and every other argument list still forwards to it.
 */

import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
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

/** Capture what a run wrote to stdout. */
function capture(run: () => number): { code: number; out: string; err: string } {
  let out = ''
  let err = ''
  vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    out += chunk.toString()
    return true
  })
  vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    err += chunk.toString()
    return true
  })
  return { code: run(), out, err }
}

describe('qilin plugin list', () => {
  it('prints the profile layers in activation order without running pnpm', () => {
    const dir = stageProfile('tui', {
      dependencies: { 'dsh-super-ppts': '1.2.1' },
      qilin: { profile: { bundles: ['@qilin/base', 'dsh-super-ppts', '@example/absent'] } },
    })
    file(join(dir, 'node_modules', 'dsh-super-ppts', 'package.json'), JSON.stringify({ name: 'dsh-super-ppts', version: '1.2.1' }))
    const { code, out } = capture(() => runPlugin('tui', ['list']))
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

  it('marks the shipped layers of a template profile', () => {
    stageProfile('web', { qilin: { profile: { bundles: ['@qilin/base', '@qilin/web-app'] } } })
    const { code, out } = capture(() => runPlugin('web', ['list']))
    expect(code).toBe(0)
    expect(out.match(/\(shipped\)/gu)).toHaveLength(2)
    expect(out).not.toContain('\tuser')
  })

  it('reports a profile that lists no layers', () => {
    stageProfile('tui', { qilin: { profile: { bundles: [] } } })
    const { code, out } = capture(() => runPlugin('tui', ['list']))
    expect(code).toBe(0)
    expect(out).toContain('profile tui lists no plugin layers')
    expect(spawnSync).not.toHaveBeenCalled()
  })
})

describe('qilin plugin doctor', () => {
  it('reports a directory target and fails the command only on a blocking finding', () => {
    stageProfile('tui', { qilin: { profile: { bundles: [] } } })
    const pluginDir = tmp()
    file(join(pluginDir, 'package.json'), JSON.stringify({ name: 'clean-plugin', version: '1.0.0' }))
    file(join(pluginDir, 'lib', 'index.js'), 'export const one = 1\n')
    const clean = capture(() => runPlugin('tui', ['doctor', pluginDir]))
    expect(clean.code).toBe(0)
    expect(clean.out).toContain('clean-plugin\tusable')
    expect(clean.out).toContain('no compatibility findings')

    file(join(pluginDir, 'package.json'), JSON.stringify({
      name: 'polluted-plugin',
      version: '1.0.0',
      dependencies: { '@deepseek-ai/dsh-session': '0.1.6' },
    }))
    const polluted = capture(() => runPlugin('tui', ['doctor', pluginDir]))
    expect(polluted.code).toBe(1)
    expect(polluted.out).toContain('polluted-plugin\tunusable')
    expect(polluted.out).toContain('fail\tengine-dependency')
    expect(spawnSync).not.toHaveBeenCalled()
  })

  it('resolves an installed package name through the profile and reports an unknown target', () => {
    const dir = stageProfile('tui', { qilin: { profile: { bundles: [] } } })
    file(join(dir, 'node_modules', 'installed-plugin', 'package.json'), JSON.stringify({ name: 'installed-plugin', version: '2.0.0' }))
    const installed = capture(() => runPlugin('tui', ['doctor', 'installed-plugin']))
    expect(installed.code).toBe(0)
    expect(installed.out).toContain('installed-plugin\tusable')

    const missing = capture(() => runPlugin('tui', ['doctor', 'no-such-plugin']))
    expect(missing.code).toBe(1)
    expect(missing.err).toContain('is neither a package directory nor an installed package in profile tui')
  })
})

describe('qilin plugin forwarding', () => {
  it('still forwards every other argument list to pnpm in the profile', () => {
    const dir = stageProfile('tui', { qilin: { profile: { bundles: [] } } })
    expect(runPlugin('tui', ['add', 'dsh-super-ppts'])).toBe(0)
    expect(vi.mocked(spawnSync)).toHaveBeenCalledWith('pnpm', ['add', 'dsh-super-ppts'], expect.objectContaining({ cwd: dir }))
  })
})
