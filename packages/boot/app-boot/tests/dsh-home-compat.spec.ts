/**
 * Regression gate for the launcher's DSH-era home pin (plan:
 * `plans/2026-09-16-third-party-plugin-compat.md`, workflows A1 and A2).
 *
 * A third-party plugin written for DSH resolves its data directories through
 * `DSH_HOME`. If this process kept whatever value a co-installed DSH process
 * exported, that plugin would write its state into the DSH installation's home
 * instead of this one — including the presets such a plugin publishes where the
 * Harness home is scanned.
 *
 * `homedir()` decides the default Harness home, so the gate controls it: a real
 * default would resolve to the developer's own home.
 */

import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { loadLayeredEnv } from '../src/index.ts'

const NAME = 'qilin-dsh-home-spec'

// Read at call time, so this file's `beforeAll` runs before the first lookup.
const fakeHome = vi.hoisted(() => ({ dir: '' }))

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>()
  return { ...actual, homedir: () => fakeHome.dir === '' ? actual.homedir() : fakeHome.dir }
})

const originalDshHome = process.env.DSH_HOME
const tempRoots: string[] = []

afterAll(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

afterEach(() => {
  // The pin writes `process.env` directly, so unstubbing alone would not
  // restore a name this spec replaced.
  if (originalDshHome === undefined) Reflect.deleteProperty(process.env, 'DSH_HOME')
  else process.env.DSH_HOME = originalDshHome
  vi.unstubAllEnvs()
})

const tmp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'qilin-dsh-home-'))
  tempRoots.push(dir)
  return dir
}

fakeHome.dir = mkdtempSync(join(tmpdir(), 'qilin-dsh-home-os-'))
tempRoots.push(fakeHome.dir)

describe('DSH-era home pin', () => {
  it('pins DSH_HOME to the default Harness home when the launch supplies none', () => {
    const project = tmp()
    Reflect.deleteProperty(process.env, 'QILIN_HOME')
    Reflect.deleteProperty(process.env, 'DSH_HOME')
    const snapshot = loadLayeredEnv(NAME, project, vi.fn())
    const harnessHome = join(fakeHome.dir, '.qilin')
    expect(process.env.DSH_HOME).toBe(harnessHome)
    expect(snapshot.get('DSH_HOME')).toEqual({ value: harnessHome, source: 'dsh-compat' })
    // The DSH-era home is not a directory this process resolves into, so nothing
    // it loads may create one beside it.
    expect(join(fakeHome.dir, '.dsh')).not.toBe(harnessHome)
    expect(existsSync(join(fakeHome.dir, '.dsh'))).toBe(false)
  })

  it('replaces the DSH_HOME a co-installed DSH process exported, keeping it auditable', () => {
    const project = tmp()
    Reflect.deleteProperty(process.env, 'QILIN_HOME')
    vi.stubEnv('DSH_HOME', '/opt/dsh-install/home')
    const snapshot = loadLayeredEnv(NAME, project, vi.fn())
    const harnessHome = join(fakeHome.dir, '.qilin')
    expect(process.env.DSH_HOME).toBe(harnessHome)
    expect(snapshot.get('DSH_HOME')).toEqual({ value: harnessHome, source: 'dsh-compat' })
    // What the launch inherited stays reachable through its own layer.
    expect(snapshot.getFrom('DSH_HOME', ['process'])).toEqual({ value: '/opt/dsh-install/home', source: 'process' })
  })

  it('records a .env-supplied DSH_HOME without letting it win', () => {
    const home = tmp()
    const project = tmp()
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, '.env'), 'DSH_HOME=/from-user-file\n')
    vi.stubEnv('QILIN_HOME', home)
    vi.stubEnv('DSH_HOME', '/from-shell')
    const snapshot = loadLayeredEnv(NAME, project, vi.fn())
    expect(process.env.DSH_HOME).toBe(home)
    expect(snapshot.get('DSH_HOME')).toEqual({ value: home, source: 'dsh-compat' })
    expect(snapshot.getFrom('DSH_HOME', ['user-env'])).toEqual({ value: '/from-user-file', source: 'user-env', path: join(home, '.env') })
  })

  it('pins the configured Harness home, so QILIN_HOME stays the user override', () => {
    const home = tmp()
    const project = tmp()
    vi.stubEnv('QILIN_HOME', home)
    Reflect.deleteProperty(process.env, 'DSH_HOME')
    const snapshot = loadLayeredEnv(NAME, project, vi.fn())
    expect(process.env.DSH_HOME).toBe(home)
    expect(snapshot.get('DSH_HOME')).toEqual({ value: home, source: 'dsh-compat' })
  })
})
