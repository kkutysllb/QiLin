/** The built-in methodology bundle mounts the shipped skills pack and its optional-skills settings surface. */
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface SkillsPlugin {
  readonly name: string
  readonly inject: readonly string[]
  apply(ctx: unknown): () => void
}

const require = createRequire(import.meta.url)
const skills = require('dsh-skills-bundle') as SkillsPlugin
const manifest = JSON.parse(readFileSync(require.resolve('dsh-skills-bundle/package.json'), 'utf8')) as {
  name: string
  exports?: Record<string, unknown>
  qilin?: { client?: { bundle?: string; platform?: string } }
}
const catalog = JSON.parse(readFileSync(join(dirname(require.resolve('dsh-skills-bundle/package.json')), 'skills/manifest.json'), 'utf8')) as {
  skills: unknown[]
  optional: unknown[]
}

let home: string
const previousHomes: Record<string, string | undefined> = {}
const HOME_KEYS = ['KCODER_HOME', 'DSH_HOME', 'QILIN_HOME'] as const

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'qilin-skills-bundle-'))
  for (const key of HOME_KEYS) {
    previousHomes[key] = process.env[key]
    process.env[key] = home
  }
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const key of HOME_KEYS) {
    const previous = previousHomes[key]
    if (previous === undefined) Reflect.deleteProperty(process.env, key)
    else process.env[key] = previous
  }
  rmSync(home, { recursive: true, force: true })
})

describe('skills-bundle', () => {
  it('mounts the host pack with 31 core skills and the fenced catalog route', () => {
    const disposers: Array<() => void> = []
    const register = vi.fn(() => { const dispose = (): void => {}; disposers.push(dispose); return dispose })
    const route = vi.fn(() => () => {})
    const ctx = {
      skills: { register },
      webServer: { register: route },
    }
    const dispose = skills.apply(ctx)
    expect(skills.name).toBe('kcoder-skills')
    expect(skills.inject).toEqual(['skills', 'webServer'])
    expect(register).toHaveBeenCalledTimes(catalog.skills.length)
    expect(register).toHaveBeenCalledTimes(31)
    expect(route).toHaveBeenCalledWith(expect.objectContaining({ kind: 'prefix', path: '/kcoder-skills/api' }))
    expect(catalog.optional).toHaveLength(40)
    dispose()
    expect(disposers).toHaveLength(31)
  })

  it('declares the browser half that owns the Optional Skills settings section', () => {
    expect(manifest.qilin?.client?.bundle).toBe('./client.js')
    expect(manifest.qilin?.client?.platform).toBe('web')
    const client = require.resolve('dsh-skills-bundle/client')
    expect(existsSync(client)).toBe(true)
    const source = readFileSync(client, 'utf8')
    expect(source).toContain('id: "dsh-skills-bundle"')
    expect(source).toContain('kcoder-optional-skills')
    expect(source).toContain('/kcoder-skills/api')
  })
})
