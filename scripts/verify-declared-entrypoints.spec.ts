import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { missingDeclaredEntrypointsIn, workspacePackageDirs } from './verify-declared-entrypoints.ts'

/** One fixture package: manifest fields + optionally-present artifacts. */
function fixture(
  root: string,
  name: string,
  manifest: Record<string, unknown>,
  files: readonly string[],
): string {
  const dir = join(root, name)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, ...manifest }))
  for (const file of files) {
    mkdirSync(join(dir, file, '..'), { recursive: true })
    writeFileSync(join(dir, file), '')
  }
  return dir
}

function scan(manifest: Record<string, unknown>, files: readonly string[]): string[] {
  const root = mkdtempSync(join(tmpdir(), 'qilin-entrypoints-'))
  try {
    const dir = fixture(root, 'pkg', manifest, files)
    return missingDeclaredEntrypointsIn(root, [dir]).map(v => `${v.field} ${v.file}`)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

describe('declared entrypoint guard', () => {
  it('accepts a package whose declared files all exist', () => {
    expect(scan(
      { main: 'lib/index.js', exports: { '.': { require: './lib/index.js' } } },
      ['lib/index.js'],
    )).toEqual([])
  })

  it('names a package whose main is missing', () => {
    expect(scan({ main: 'lib/index.js' }, [])).toEqual(['main lib/index.js'])
  })

  it('checks every bin map entry and names the key', () => {
    const violations = scan(
      { bin: { qilin: 'lib/bin.js', other: 'lib/other.js' } },
      ['lib/bin.js'],
    )
    expect(violations).toEqual(['bin.other lib/other.js'])
  })

  it('walks nested exports and skips glob patterns and the self manifest', () => {
    const violations = scan(
      {
        exports: {
          '.': './lib/index.js',
          './package.json': './package.json',
          './*': './lib/*.js',
          './sub': { import: './lib/sub.js', types: './lib/types/sub.d.ts' },
        },
      },
      [],
    )
    expect(violations).toEqual([
      'exports["."] ./lib/index.js',
      'exports["./sub"].import ./lib/sub.js',
      'exports["./sub"].types ./lib/types/sub.d.ts',
    ])
  })

  it('accepts a package with no entrypoint declarations at all', () => {
    expect(scan({}, [])).toEqual([])
  })

  it('accepts a missing file under a skipped wildcard family', () => {
    expect(scan({ exports: { './*': './lib/*.js' } }, [])).toEqual([])
  })

  it('enumerates only manifest-bearing directories of the real workspace', () => {
    const dirs = workspacePackageDirs(join(import.meta.dirname, '..'))
    expect(dirs.length).toBeGreaterThan(100)
    expect(dirs).toContain(join(import.meta.dirname, '..', 'vendor', 'cordis'))
    // Website owns a manifest; the repo-root itself is not a workspace member.
    expect(dirs.some(d => d.endsWith('website'))).toBe(true)
  })
})
