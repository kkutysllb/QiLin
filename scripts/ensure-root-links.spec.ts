/** Root link repair: what a concurrent install leaves behind, and what the build heals. */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { repairRootLinks } from './ensure-root-links.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** A repository root with a manifest and one pnpm store entry per `name@version`. */
function root(manifest: Record<string, unknown>, installed: [string, string][]): string {
  const dir = mkdtempSync(join(tmpdir(), 'qilin-root-links-'))
  roots.push(dir)
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  for (const [name, version] of installed) {
    const pkgDir = join(dir, 'node_modules', '.pnpm', name.replace('/', '+') + '@' + version, 'node_modules', name)
    mkdirSync(pkgDir, { recursive: true })
    writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name, version }))
  }
  return dir
}

describe('repairRootLinks', () => {
  it('relinks a root dependency whose link a concurrent install removed', () => {
    const dir = root({ dependencies: { '@scope/pkg': '^1.0.0' } }, [['@scope/pkg', '1.2.0']])
    const report = repairRootLinks(dir, () => {})
    expect(report.relinked).toEqual([{ name: '@scope/pkg', version: '1.2.0' }])
    expect(report.healthy).toBe(0)
    expect(readFileSync(join(dir, 'node_modules', '@scope', 'pkg', 'package.json'), 'utf8')).toContain('1.2.0')
  })

  it('replaces a dangling link and keeps every healthy one', () => {
    const dir = root({ dependencies: { plain: '~2.0.0' } }, [['plain', '2.0.1']])
    mkdirSync(join(dir, 'node_modules'), { recursive: true })
    symlinkSync('../.pnpm/gone/node_modules/plain', join(dir, 'node_modules', 'plain'), 'dir')
    expect(repairRootLinks(dir, () => {}).relinked).toEqual([{ name: 'plain', version: '2.0.1' }])
    const again = repairRootLinks(dir, () => {})
    expect(again.relinked).toEqual([])
    expect(again.healthy).toBe(1)
  })

  it('prefers a version the declared range allows', () => {
    const dir = root({ dependencies: { plain: '^2.0.0' } }, [['plain', '1.9.0'], ['plain', '2.1.0']])
    expect(repairRootLinks(dir, () => {}).relinked).toEqual([{ name: 'plain', version: '2.1.0' }])
  })

  it('leaves install-owned specs to the package manager', () => {
    const dir = root({ dependencies: { local: 'link:../local', workspace: 'workspace:*' } }, [])
    const report = repairRootLinks(dir, () => {})
    expect(report.skipped).toEqual(['local', 'workspace'])
    expect(report.relinked).toEqual([])
  })

  it('fails loudly when no candidate can serve the dependency', () => {
    const dir = root({ dependencies: { absent: '^1.0.0' } }, [])
    expect(() => repairRootLinks(dir, () => {})).toThrow(/node_modules\/absent resolves nowhere/u)
  })
})
