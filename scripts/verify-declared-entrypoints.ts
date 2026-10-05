/**
 * Verify that every workspace package's declared `lib/` runtime entry exists
 * after the build.
 *
 * A manifest may declare a bundle that the build never emits: the Host face
 * derives one default entry per package from `tsdown.config.ts`, so a package
 * that neither declares its own `entry` nor falls under the root default is
 * published with a missing `main` while every source-plane gate stays green.
 * This gate reads the built tree and fails loud, naming each absent file.
 *
 * Run: `tsx scripts/verify-declared-entrypoints.ts` (after `pnpm run build`).
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = resolve(import.meta.dirname, '..')

/**
 * Lower bound on discovered packages. The Host workspace holds several hundred;
 * a narrower corpus means the globs stopped matching, not that the tree shrank.
 */
const MINIMUM_WORKSPACE_PACKAGES = 100

/** Directories the Host tsdown workspace builds, mirroring `tsdown.config.ts`. */
const workspaceGlobs = [
  { dir: 'vendor', depth: 1 },
  { dir: 'packages', depth: 2 },
  { dir: 'apps', depth: 1 },
] as const

/** One package manifest field subset used for entry discovery. */
export interface DeclaredEntryManifest {
  /** Package name, or undefined for a manifest without one. */
  readonly name?: string | undefined
  /** The package's `main` field. */
  readonly main?: unknown
  /** The package's `bin` field. */
  readonly bin?: unknown
  /** The package's `exports` map. */
  readonly exports?: unknown
}

/** One package directory with its manifest. */
export interface DeclaredEntryPackage {
  /** Absolute package directory. */
  readonly dir: string
  /** Parsed `package.json`. */
  readonly manifest: DeclaredEntryManifest
}

/** Collect `lib/` runtime entry paths a manifest publishes. */
function collectExportEntries(value: unknown, found: Set<string>): void {
  if (typeof value === 'string') {
    if (value.startsWith('./lib/') && value.endsWith('.js')) found.add(value)
    return
  }
  if (Array.isArray(value)) {
    for (const item of value) collectExportEntries(item, found)
    return
  }
  if (typeof value !== 'object' || value === null) return
  for (const [condition, target] of Object.entries(value)) {
    // `types` names a declaration file, which the Host program emits separately.
    if (condition === 'types') continue
    collectExportEntries(target, found)
  }
}

/**
 * List the `lib/` runtime files a manifest declares, in a stable order.
 * Declaration files, source subpaths, and non-`lib` payloads are ignored: the
 * gate covers what a consumer imports at runtime.
 * @param manifest - parsed `package.json` of one workspace package.
 * @returns repo-relative paths without the leading `./`.
 */
export function declaredRuntimeEntries(manifest: DeclaredEntryManifest): string[] {
  const found = new Set<string>()
  // `main` is written without a leading `./` and `bin` paths usually carry one.
  const asRelative = (path: string): string => `./${path.replace(/^\.\//, '')}`
  if (typeof manifest.main === 'string') collectExportEntries(asRelative(manifest.main), found)
  if (typeof manifest.bin === 'string') collectExportEntries(asRelative(manifest.bin), found)
  else if (typeof manifest.bin === 'object' && manifest.bin !== null) collectExportEntries(manifest.bin, found)
  collectExportEntries(manifest.exports, found)
  return [...found].map(path => path.replace(/^\.\//, '')).sort()
}

/**
 * Find declared entries missing from disk.
 * @param packages - workspace packages to inspect.
 * @returns one `{ label, entry, file }` record per absent entry, in package order.
 */
export function missingDeclaredEntries(
  packages: readonly DeclaredEntryPackage[],
): { label: string; entry: string; file: string }[] {
  const missing: { label: string; entry: string; file: string }[] = []
  for (const { dir, manifest } of packages) {
    const label = manifest.name ?? relative(root, dir)
    for (const entry of declaredRuntimeEntries(manifest)) {
      if (!existsSync(join(dir, entry))) missing.push({ label, entry, file: join(relative(root, dir), entry) })
    }
  }
  return missing
}

/** Whether a path is a directory, following symlinks (`packages/CLAUDE.md` is one). */
function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch (_missingPath) {
    return false
  }
}

/** Read every workspace package manifest under {@link workspaceGlobs}. */
function workspacePackages(): DeclaredEntryPackage[] {
  const packages: DeclaredEntryPackage[] = []
  for (const { dir, depth } of workspaceGlobs) {
    const base = join(root, dir)
    if (!existsSync(base)) continue
    for (const first of readdirSync(base, { withFileTypes: true })) {
      const firstPath = join(base, first.name)
      if (!isDirectory(firstPath)) continue
      const candidates = depth === 1
        ? [firstPath]
        : readdirSync(firstPath, { withFileTypes: true })
          .map(nested => join(firstPath, nested.name))
          .filter(isDirectory)
      for (const candidate of candidates) {
        const manifestPath = join(candidate, 'package.json')
        if (!existsSync(manifestPath)) continue
        packages.push({
          dir: candidate,
          manifest: JSON.parse(readFileSync(manifestPath, 'utf8')) as DeclaredEntryManifest,
        })
      }
    }
  }
  return packages
}

/** Report every declared `lib/` entry the built tree does not carry. */
export function main(): void {
  const packages = workspacePackages()
  if (packages.length < MINIMUM_WORKSPACE_PACKAGES) {
    console.error(`verify-declared-entrypoints: discovery narrowed to ${String(packages.length)} package(s); expected at least ${String(MINIMUM_WORKSPACE_PACKAGES)}.`)
    process.exit(1)
  }
  const missing = missingDeclaredEntries(packages)
  if (missing.length > 0) {
    console.error(`verify-declared-entrypoints: ${String(missing.length)} declared entr${missing.length === 1 ? 'y is' : 'ies are'} missing from the built tree:`)
    for (const { label, file } of missing) console.error(`  ${label}: ${file}`)
    console.error('A package without its own tsdown `entry` is bundled only through the root Host default; declare one or widen that default.')
    process.exit(1)
  }
  console.log(`verify-declared-entrypoints: ${String(packages.length)} packages declare only entries the built tree carries.`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()
