/** The link-projection remover must unlink only the profile's own fallback links. */

import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { realModuleFile, removeLinkProjections } from '../src/profile-resolution/legacy-links.ts'

const roots: string[] = []
function profileRoot(): string {
  const root = mkdtempSync(join(tmpdir(), 'qilin-legacy-links-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('link projection removal', () => {
  it('unlinks only the profile own projections and removes their directory', () => {
    const root = profileRoot()
    const profile = join(root, 'profile')
    const owned = join(profile, '.qilin-module-fallback', 'node_modules', 'bridge')
    const foreign = join(root, 'foreign', 'bridge')
    mkdirSync(owned, { recursive: true })
    mkdirSync(foreign, { recursive: true })
    mkdirSync(join(profile, 'node_modules', '@scope'), { recursive: true })
    writeFileSync(join(owned, 'package.json'), '{}\n')
    const linkType = process.platform === 'win32' ? 'junction' : 'dir'
    symlinkSync(owned, join(profile, 'node_modules', 'bridge'), linkType)
    symlinkSync(join(owned, '..', '..', 'node_modules'), join(profile, 'node_modules', '@scope', 'owned'), linkType)
    symlinkSync(foreign, join(profile, 'node_modules', 'foreign'), linkType)

    removeLinkProjections(profile)

    expect(existsSync(join(profile, '.qilin-module-fallback'))).toBe(false)
    expect(existsSync(join(profile, 'node_modules', 'bridge'))).toBe(false)
    expect(existsSync(join(profile, 'node_modules', '@scope', 'owned'))).toBe(false)
    expect(existsSync(join(profile, 'node_modules', 'foreign'))).toBe(true)
    expect(existsSync(join(foreign, 'package.json'))).toBe(false)
  })

  it('leaves a profile without the directory untouched', () => {
    const root = profileRoot()
    expect(() => removeLinkProjections(root)).not.toThrow()
  })
})

describe('module file resolution', () => {
  it('resolves a plain file through its real path', () => {
    const root = profileRoot()
    const file = join(root, 'entry.mjs')
    writeFileSync(file, '')
    expect(realModuleFile(file)).toBe(realpathSync(file))
  })

  it('resolves a symlinked file to the package it stands for', () => {
    const root = profileRoot()
    const realDir = join(root, 'real')
    mkdirSync(realDir, { recursive: true })
    const real = join(realDir, 'entry.mjs')
    writeFileSync(real, '')
    const link = join(root, 'entry.mjs')
    symlinkSync(real, link, 'file')
    expect(realModuleFile(link)).toBe(realpathSync(link))
  })
})
