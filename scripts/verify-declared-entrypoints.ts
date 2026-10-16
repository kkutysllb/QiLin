/**
 * Post-build guard: every workspace package's declared entrypoint files must
 * exist. Reads `main`, `module`, `types`, `typings`, `bin`, and `exports`
 * from each workspace manifest and stats every declared path (glob patterns
 * are skipped — a pattern declares a family, not one file).
 *
 * Why this exists: the workspace tsdown build only emits `lib/*.js` for
 * packages a config covers. When the root config lost its default entry
 * (the invariants removal), every package without a package-local config
 * silently stopped producing `lib/index.js` — and on any tree holding
 * stale artifacts the gap was invisible: the old bundle kept running, so
 * "it builds here" coexisted with "a fresh clone cannot build at all"
 * (issue #9). This guard runs at the end of the repository build and turns
 * a missing artifact into a named, failing package instead.
 */

import { existsSync, globSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

/** One declared file the build did not produce. */
export interface MissingEntrypoint {
  /** The package (manifest `name`, falling back to its directory). */
  readonly pkg: string
  /** Where the manifest declared it, e.g. `bin.qilin` or `exports["."].require`. */
  readonly field: string
  /** The declared package-relative path. */
  readonly file: string
}

/** Manifest fields that name one entrypoint file each. */
const FILE_FIELDS = ['main', 'module', 'types', 'typings'] as const

/** Directory families of the workspace (mirrors pnpm-workspace.yaml). */
const WORKSPACE_GLOBS = [
  'vendor/*',
  'packages/*/*',
  'native/system',
  'native/system/packages/*',
  'apps/*',
  'benchmarks',
  'website',
  'python/sdk-runtime',
]

/** Every workspace package directory holding a manifest. */
export function workspacePackageDirs(repoRoot: string): string[] {
  const dirs: string[] = []
  for (const glob of WORKSPACE_GLOBS) {
    for (const entry of globSync(glob, { cwd: repoRoot, withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      // parentPath is absolute on current Node; resolve() also accepts a
      // relative one, and unlike join() it resets at the absolute prefix.
      const dir = resolve(repoRoot, entry.parentPath, entry.name)
      if (existsSync(join(dir, 'package.json'))) dirs.push(dir)
    }
  }
  return dirs.sort()
}

/** Collect declared entrypoint paths from one manifest value tree. */
function collect(
  value: unknown,
  field: string,
  out: Array<{ field: string; file: string }>,
): void {
  if (value === null || value === undefined) return
  if (typeof value === 'string') {
    // A pattern declares a family the resolver maps at require time; nothing
    // single to stat. The self-manifest export always exists.
    if (value.includes('*') || value === './package.json' || value === 'package.json') return
    out.push({ field, file: value })
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, field, out)
    return
  }
  if (typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      const label = /^[A-Za-z0-9_$-]+$/.test(key) ? `${field}.${key}` : `${field}[${JSON.stringify(key)}]`
      collect(child, label, out)
    }
  }
}

/**
 * The declared-but-missing entrypoints across the given package directories.
 * @param repoRoot - repository root (only used for naming packages in diagnostics).
 * @param packageDirs - package directories to check.
 * @returns one entry per declared file that does not exist.
 */
export function missingDeclaredEntrypointsIn(repoRoot: string, packageDirs: readonly string[]): MissingEntrypoint[] {
  const missing: MissingEntrypoint[] = []
  for (const dir of packageDirs) {
    const manifestPath = join(dir, 'package.json')
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>
    const declared: Array<{ field: string; file: string }> = []
    for (const field of FILE_FIELDS) collect(manifest[field], field, declared)
    collect(manifest.bin, 'bin', declared)
    collect(manifest.exports, 'exports', declared)
    for (const { field, file } of declared) {
      if (!existsSync(resolve(dir, file))) {
        const name = typeof manifest.name === 'string' ? manifest.name : dir.slice(repoRoot.length + 1)
        missing.push({ pkg: name, field, file })
      }
    }
  }
  return missing
}

/**
 * The declared-but-missing entrypoints across the whole workspace.
 * @param repoRoot - repository root.
 * @returns one entry per declared file that does not exist.
 */
export function missingDeclaredEntrypoints(repoRoot: string): MissingEntrypoint[] {
  return missingDeclaredEntrypointsIn(repoRoot, workspacePackageDirs(repoRoot))
}

function main(): void {
  const repoRoot = resolve(import.meta.dirname, '..')
  const missing = missingDeclaredEntrypoints(repoRoot)
  if (missing.length === 0) {
    console.log(`verify-declared-entrypoints: every declared entrypoint exists (${workspacePackageDirs(repoRoot).length} packages)`)
    return
  }
  console.error(`verify-declared-entrypoints: ${missing.length} violation(s):`)
  for (const { pkg, field, file } of missing) {
    console.error(`  ${pkg}: ${field} declares ${file} — not built (fresh-clone breakage; a stale local lib/ can mask this)`)
  }
  process.exitCode = 1
}

if (import.meta.main) main()
