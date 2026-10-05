/** Entry-discovery coverage for the declared-entrypoint gate. */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import {
  declaredRuntimeEntries,
  missingDeclaredEntries,
  type DeclaredEntryPackage,
} from './verify-declared-entrypoints.ts'

const roots: string[] = []

/** Create one fixture package directory holding the given files. */
function fixtureManifest(manifest: unknown, files: readonly string[] = []): DeclaredEntryPackage {
  const dir = mkdtempSync(join(tmpdir(), 'declared-entrypoints-'))
  roots.push(dir)
  writeFileSync(join(dir, 'package.json'), JSON.stringify(manifest))
  for (const file of files) {
    mkdirSync(dirname(join(dir, file)), { recursive: true })
    writeFileSync(join(dir, file), '')
  }
  return { dir, manifest: manifest as DeclaredEntryPackage['manifest'] }
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
})

describe('declaredRuntimeEntries', () => {
  it('admits main, bin, and nested export conditions', () => {
    expect(declaredRuntimeEntries({
      main: 'lib/index.js',
      bin: { qilin: './lib/bin.js' },
      exports: {
        '.': { types: './lib/types/index.d.ts', default: './lib/index.js' },
        './startup': { default: './lib/startup.js' },
      },
    })).toEqual(['lib/bin.js', 'lib/index.js', 'lib/startup.js'])
  })

  it('admits a bare string export and a string bin', () => {
    expect(declaredRuntimeEntries({ main: 'lib/index.js', bin: './lib/run.js', exports: './lib/index.js' }))
      .toEqual(['lib/index.js', 'lib/run.js'])
  })

  it('excludes declarations, source subpaths, and non-JavaScript payloads', () => {
    expect(declaredRuntimeEntries({
      main: 'lib/index.js',
      exports: {
        '.': { types: './lib/types/index.d.ts', default: './lib/index.js' },
        './src/*': './src/*',
        './style.css': './lib/style.css',
        './schema.json': './lib/schema.json',
        './client': { default: './lib/client.js' },
      },
    })).toEqual(['lib/client.js', 'lib/index.js'])
  })

  it('reports nothing for a manifest that publishes no lib runtime entry', () => {
    expect(declaredRuntimeEntries({ main: 'index.js', exports: { '.': './index.js' } })).toEqual([])
  })
})

describe('missingDeclaredEntries', () => {
  it('reports only the entries the built tree lacks, named by package', () => {
    const present = fixtureManifest({ name: '@qilin/present', main: 'lib/index.js' }, ['lib/index.js'])
    const absent = fixtureManifest({ name: '@qilin/absent', main: 'lib/index.js', exports: { './startup': { default: './lib/startup.js' } } }, ['lib/index.js'])
    expect(missingDeclaredEntries([present, absent]).map(({ label, entry }) => ({ label, entry }))).toEqual([
      { label: '@qilin/absent', entry: 'lib/startup.js' },
    ])
  })

  it('passes a package whose declared entries all exist', () => {
    const complete = fixtureManifest({ name: '@qilin/complete', main: 'lib/index.js' }, ['lib/index.js'])
    expect(missingDeclaredEntries([complete])).toEqual([])
  })
})
