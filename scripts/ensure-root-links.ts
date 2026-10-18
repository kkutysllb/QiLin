/** Repair root package links a concurrent install left missing or dangling. */

import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, symlinkSync, unlinkSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { pathToFileURL } from 'node:url'

/** One relinked root package. */
export interface Relink {
  readonly name: string
  readonly version: string
}

/** Outcome of one repair pass. */
export interface RepairReport {
  /** Links recreated, with the version they now carry. */
  readonly relinked: readonly Relink[]
  /** Links that already resolved. */
  readonly healthy: number
  /** Dependencies skipped because an install owns them (workspace or file specs). */
  readonly skipped: readonly string[]
}

/** Encoded package name as pnpm uses it in `node_modules/.pnpm` directory names. */
function encoded(name: string): string {
  return name.replace('/', '+')
}

/** Numeric version ordering; a prerelease sorts below its release. */
function compareVersions(left: string, right: string): number {
  const core = (version: string): number[] => version.split('-')[0].split('.').map(part => Number(part) || 0)
  const a = core(left)
  const b = core(right)
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference !== 0) return difference
  }
  const leftPrerelease = left.includes('-')
  const rightPrerelease = right.includes('-')
  return leftPrerelease === rightPrerelease ? 0 : leftPrerelease ? -1 : 1
}

/** Whether a concrete version satisfies the simple ranges a manifest declares. */
function matchesSpec(version: string, spec: string): boolean {
  const trimmed = spec.trim()
  if (trimmed === '' || trimmed === '*' || trimmed === 'latest') return true
  if (trimmed.startsWith('^')) {
    const base = trimmed.slice(1)
    const major = Number(base.split('.')[0])
    return version.split('.')[0] === String(major) && compareVersions(version, base) >= 0
  }
  if (trimmed.startsWith('~')) {
    const base = trimmed.slice(1)
    const [major = '', minor = ''] = base.split('.')
    return version.startsWith(major + '.' + minor + '.') && compareVersions(version, base) >= 0
  }
  return version === trimmed
}

/** Locate one package's candidate installations under the pnpm store. */
function candidates(pnpmDir: string, name: string): { dir: string; version: string }[] {
  if (!existsSync(pnpmDir)) return []
  const prefix = encoded(name) + '@'
  const found: { dir: string; version: string }[] = []
  for (const entry of readdirSync(pnpmDir)) {
    if (!entry.startsWith(prefix)) continue
    const manifestPath = join(pnpmDir, entry, 'node_modules', name, 'package.json')
    if (!existsSync(manifestPath)) continue
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { version?: unknown }
      if (typeof manifest.version === 'string') found.push({ dir: join(pnpmDir, entry, 'node_modules', name), version: manifest.version })
    } catch { /* a half-written candidate is not a candidate */ }
  }
  return found
}

/** Whether the link exists and its target is present. */
function resolves(linkPath: string): boolean {
  try {
    return existsSync(realpathSync(linkPath))
  } catch {
    return false
  }
}

/**
 * Repair root dependency links under `node_modules`.
 *
 * A concurrent install can leave a root direct dependency missing or dangling while pnpm's fast path still reports the
 * install up to date; the build then fails resolving that package. For every root dependency whose spec is not owned by
 * an install (`link:`, `workspace:`, `file:`), this recreates the link from the matching `node_modules/.pnpm` entry,
 * preferring a version the spec allows.
 * @param root - repository root holding package.json and node_modules.
 * @param log - line sink for repairs.
 * @returns what was repaired, what already resolved, and what only an install owns.
 * @throws when a missing dependency has no candidate to relink, naming the dependency.
 */
export function repairRootLinks(root: string, log: (line: string) => void = (line) => { console.log(line) }): RepairReport {
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
    optionalDependencies?: Record<string, string>
  }
  const specs = new Map<string, string>()
  for (const section of [manifest.dependencies, manifest.devDependencies, manifest.optionalDependencies]) {
    for (const [name, spec] of Object.entries(section ?? {})) if (!specs.has(name)) specs.set(name, spec)
  }
  const pnpmDir = join(root, 'node_modules', '.pnpm')
  const relinked: Relink[] = []
  const skipped: string[] = []
  let healthy = 0
  for (const [name, spec] of [...specs].sort((left, right) => left[0].localeCompare(right[0]))) {
    if (/^(?:link|workspace|file):/u.test(spec)) {
      skipped.push(name)
      continue
    }
    const linkPath = join(root, 'node_modules', name)
    if (resolves(linkPath)) {
      healthy += 1
      continue
    }
    const found = candidates(pnpmDir, name)
    const allowed = found.filter(candidate => matchesSpec(candidate.version, spec))
    const chosen = (allowed.length > 0 ? allowed : found)
      .sort((left, right) => compareVersions(right.version, left.version))[0]
    if (chosen === undefined) {
      throw new Error(`repair: node_modules/${name} resolves nowhere and no node_modules/.pnpm entry serves ${spec}; run pnpm install`)
    }
    mkdirSync(dirname(linkPath), { recursive: true })
    try {
      if (lstatSync(linkPath).isSymbolicLink()) unlinkSync(linkPath)
    } catch { /* the link is absent, which is the state being repaired */ }
    symlinkSync(relative(dirname(linkPath), chosen.dir), linkPath, 'dir')
    log(`repair: relinked node_modules/${name} -> ${chosen.version}`)
    relinked.push({ name, version: chosen.version })
  }
  return { relinked, healthy, skipped }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(import.meta.dirname, '..')
  const report = repairRootLinks(root)
  console.log(`repair: ${report.relinked.length} relinked, ${report.healthy} healthy, ${report.skipped.length} install-owned`)
}
