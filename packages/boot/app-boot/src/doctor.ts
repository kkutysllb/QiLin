/**
 * Static compatibility report for one third-party plugin package.
 *
 * These checks answer the questions an operator or a plugin author asks before
 * blaming the loader: does the package find the Harness home through the
 * environment, does it install an engine package instead of declaring it, does
 * it import a legacy engine name it never declared, and can the client loader
 * map the module names it injects. The report is advisory — only a profile that
 * actually installed an upstream engine package is refused, by
 * `reconcileProfilePlugins`.
 * @module @qilin/app-boot/doctor
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { clientDeclarationOf, dshCompatModuleId } from '@qilin/dsh-compat'
import { installationProvides } from './profile.ts'

/** Which compatibility question a finding answers. */
export type PluginDoctorCheck = 'home' | 'engine-dependency' | 'engine-import' | 'client-inject'

/** How much a finding costs the plugin. */
export type PluginDoctorSeverity = 'fail' | 'warn'

/** One compatibility finding for a plugin package. */
export interface PluginDoctorFinding {
  /** The check that produced the finding. */
  readonly check: PluginDoctorCheck
  /** `fail` blocks activation through the profile; `warn` degrades the behavior. */
  readonly severity: PluginDoctorSeverity
  /** What was found, naming the manifest field or the source location. */
  readonly message: string
}

/** Static compatibility report for one plugin package. */
export interface PluginDoctorReport {
  /** Package name from its manifest. */
  readonly name: string
  /** Absolute package directory that was scanned. */
  readonly dir: string
  /** `unusable` when any check failed, `degraded` when any warned, otherwise `usable`. */
  readonly verdict: 'usable' | 'degraded' | 'unusable'
  /** Findings, grouped by check in declaration order. */
  readonly findings: readonly PluginDoctorFinding[]
}

/**
 * Source extensions the scans read. Anything else in a plugin package is data
 * (assets, patches, manifests) that cannot import a module or build a path.
 */
const SOURCE_EXTENSIONS = ['.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.cts', '.tsx'] as const

/** Directories inside a plugin package that never carry its own source. */
const EXCLUDED_DIRECTORIES = new Set(['node_modules', '.git', '.github'])

/** A source file larger than this is a generated bundle, which the scans skip. */
const MAX_SOURCE_BYTES = 4_000_000

/** How many source locations one finding names before it summarizes the rest. */
const MAX_LOCATIONS = 3

/**
 * Home paths a plugin builds itself instead of reading the pinned environment:
 * `homedir()` joined with `.dsh`, or a `.dsh` segment inside a path-building
 * call. Localized copy that merely mentions the DSH home does not match.
 */
const BUILT_HOME_PATTERNS: readonly RegExp[] = [
  /homedir\(\)[^\n]{0,60}['"]~?\/?\.dsh['"]/u,
  /(?:\bjoin|\bresolve)\([^\n]{0,120}['"]~?\/?\.dsh['"]/u,
]

/** Import and require forms whose specifier the engine-import check inspects. */
const IMPORT_PATTERN = /(?:from\s*|require\(\s*|import\(\s*)['"]([^'"]+)['"]/gu

/**
 * The variables a plugin reads to find the Harness home. A plugin that consults
 * one of them resolves into this home whatever it does next, so its `.dsh`
 * fallback is the portable spelling of the same idea rather than a hardcoded
 * path.
 */
const PINNED_HOME_PATTERN = /\bQILIN_HOME\b|\bDSH_HOME\b/u

/** One scan hit: the location to report and the running total for that pattern set. */
interface ScanHits {
  readonly locations: readonly string[]
  readonly total: number
}

/**
 * Read one scanned source file, or `undefined` when it is a generated bundle or
 * disappears during the scan.
 * @param path - absolute source file path.
 * @returns the file's text, or `undefined` to skip it.
 */
function readSource(path: string): string | undefined {
  try {
    if (statSync(path).size > MAX_SOURCE_BYTES) return undefined
    return readFileSync(path, 'utf8')
  } catch (_vanishedOrUnreadable) {
    // A package under inspection can change between the walk and the read; the
    // remaining files still describe it.
    /* v8 ignore next -- only a host filesystem race removes a file the walk just listed. */
    return undefined
  }
}

/**
 * List a package's own source files, in a stable order.
 * @param dir - absolute package directory.
 * @returns absolute source paths, sorted.
 */
function sourceFiles(dir: string): string[] {
  const files: string[] = []
  const pending = [dir]
  for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
    let entries
    try {
      entries = readdirSync(next, { withFileTypes: true })
    } catch (_vanishedOrUnreadable) {
      // A directory the walk just listed can vanish before it is read.
      /* v8 ignore next -- only a host filesystem race removes a scanned directory. */
      continue
    }
    for (const entry of entries) {
      const path = join(next, entry.name)
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRECTORIES.has(entry.name)) pending.push(path)
      } else if (entry.isFile() && SOURCE_EXTENSIONS.some(extension => entry.name.endsWith(extension))) {
        files.push(path)
      }
    }
  }
  return files.sort()
}

/**
 * Find the source locations matching any pattern, naming at most
 * {@link MAX_LOCATIONS} of them while counting every hit.
 * @param dir - absolute package directory the locations are reported against.
 * @param files - source files to scan.
 * @param patterns - patterns to test against each line.
 * @returns the named locations and the total hit count.
 */
function scanSources(dir: string, files: readonly string[], patterns: readonly RegExp[]): ScanHits {
  const locations: string[] = []
  let total = 0
  for (const file of files) {
    const source = readSource(file)
    if (source === undefined) continue
    for (const [index, line] of source.split('\n').entries()) {
      if (!patterns.some(pattern => pattern.test(line))) continue
      total += 1
      if (locations.length < MAX_LOCATIONS) locations.push(`${relative(dir, file)}:${String(index + 1)}`)
    }
  }
  return { locations, total }
}

/** Name the scanned locations, summarizing the ones beyond the reporting limit. */
function describeLocations(hits: ScanHits): string {
  const rest = hits.total - hits.locations.length
  return rest === 0 ? hits.locations.join(', ') : `${hits.locations.join(', ')}, +${String(rest)} more`
}

/** The line number of one match offset inside its source text. */
function lineOf(source: string, offset: number): number {
  return source.slice(0, offset).split('\n').length
}

/**
 * The engine package one specifier names, or `undefined` for everything else:
 * scoped DSH-era and QiLin packages, and the bare Cordis framework name.
 * @param specifier - an import specifier as written.
 * @returns the bare engine package name, or `undefined`.
 */
function engineNameOf(specifier: string): string | undefined {
  if (specifier.startsWith('@deepseek-ai/') || specifier.startsWith('@qilin/')) {
    const [scope, name] = specifier.split('/')
    return name === undefined || name === '' ? undefined : `${scope as string}/${name}`
  }
  return specifier === 'cordis' || specifier.startsWith('cordis-plugin-') ? specifier : undefined
}

/** Every name a package would install into the profile. */
function installedNames(manifest: Record<string, unknown>): string[] {
  return ['dependencies', 'optionalDependencies'].flatMap(
    field => Object.keys((manifest[field] ?? {}) as Record<string, string>),
  )
}

/** Every name the package declares it accepts from its consumer. */
function declaredNames(manifest: Record<string, unknown>): Set<string> {
  return new Set(['peerDependencies', 'dependencies', 'optionalDependencies'].flatMap(
    field => Object.keys((manifest[field] ?? {}) as Record<string, string>),
  ))
}

/**
 * Report the DSH-era home a package builds for itself. A package that reads the
 * pinned variable anywhere resolves into this home, so only one that never
 * consults it is building a home of its own.
 */
function homeFindings(dir: string, files: readonly string[]): PluginDoctorFinding[] {
  if (scanSources(dir, files, [PINNED_HOME_PATTERN]).total > 0) return []
  const hits = scanSources(dir, files, BUILT_HOME_PATTERNS)
  if (hits.total === 0) return []
  return [{
    check: 'home',
    severity: 'warn',
    message: `builds the DSH-era home itself (${describeLocations(hits)}) and never reads DSH_HOME or QILIN_HOME, `
      + 'so its data directories and any published preset land outside the Harness home this launcher reads',
  }]
}

/** Report engine packages the profile would install instead of letting the harness supply them. */
function engineDependencyFindings(
  manifest: Record<string, unknown>, installAnchor: string,
): PluginDoctorFinding[] {
  const findings: PluginDoctorFinding[] = []
  for (const name of installedNames(manifest)) {
    const canonical = dshCompatModuleId(name)
    if (canonical !== name) {
      findings.push({
        check: 'engine-dependency',
        severity: 'fail',
        message: `installs the upstream engine package '${name}' (QiLin provides it as '${canonical}'); `
          + 'the profile refuses such an install because the second engine copy resolves ahead of the compatibility layer',
      })
      continue
    }
    if (!installationProvides(name, installAnchor)) continue
    findings.push({
      check: 'engine-dependency',
      severity: 'warn',
      message: `installs '${name}', which this installation already provides; a second copy breaks shared service identity — `
        + 'declare it in peerDependencies instead',
    })
  }
  return findings
}

/** Report engine modules the package imports without declaring them. */
function engineImportFindings(
  dir: string, files: readonly string[], manifest: Record<string, unknown>,
): PluginDoctorFinding[] {
  const declared = declaredNames(manifest)
  const own = manifest.name
  const undeclared = new Map<string, string>()
  for (const file of files) {
    const source = readSource(file)
    if (source === undefined) continue
    for (const match of source.matchAll(IMPORT_PATTERN)) {
      const name = engineNameOf(match[1] as string)
      if (name === undefined || name === own || declared.has(name) || undeclared.has(name)) continue
      undeclared.set(name, `${relative(dir, file)}:${String(lineOf(source, match.index))}`)
    }
  }
  if (undeclared.size === 0) return []
  const named = [...undeclared].map(([name, location]) => `'${name}' (${location})`).join(', ')
  return [{
    check: 'engine-import',
    severity: 'warn',
    message: `imports ${named} without declaring it, and the launcher publishes a legacy engine name only for names a selected plugin declares; `
      + 'add each one to peerDependencies',
  }]
}

/** Report client module names the compatibility layer cannot map. */
function clientInjectFindings(manifest: Record<string, unknown>): PluginDoctorFinding[] {
  const declaration = clientDeclarationOf(manifest)
  if (declaration === undefined) return []
  const value = declaration.value
  if (typeof value !== 'object' || value === null) return []
  const inject = (value as { inject?: unknown }).inject
  if (inject === undefined) return []
  if (!Array.isArray(inject) || inject.some(name => typeof name !== 'string')) {
    return [{
      check: 'client-inject',
      severity: 'fail',
      message: `${declaration.key}.inject must be an array of module names`,
    }]
  }
  const unmapped = (inject as string[]).filter(name => dshCompatModuleId(name) === name && !name.startsWith('@qilin/'))
  if (unmapped.length === 0) return []
  return [{
    check: 'client-inject',
    severity: 'warn',
    message: `${declaration.key}.inject names ${unmapped.map(name => `'${name}'`).join(', ')}, which the compatibility layer does not map; `
      + 'each name must be a QiLin client module or another installed plugin\'s bundle',
  }]
}

/**
 * Inspect one plugin package against the DSH-era compatibility rules.
 * @param binName - diagnostic prefix on the thrown manifest error.
 * @param packageDir - absolute directory of the plugin package to inspect.
 * @param installAnchor - absolute package.json of the running installation, used to detect duplicated engine packages.
 * @returns the report, with findings in check order.
 * @throws when the directory holds no readable package manifest.
 */
export function doctorPluginPackage(
  binName: string, packageDir: string, installAnchor: string,
): PluginDoctorReport {
  let manifest: Record<string, unknown>
  try {
    manifest = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')) as Record<string, unknown>
  } catch (error) {
    throw new Error(`${binName}: cannot read the plugin manifest at ${join(packageDir, 'package.json')}: ${String(error)}`)
  }
  const files = sourceFiles(packageDir)
  const findings = [
    ...homeFindings(packageDir, files),
    ...engineDependencyFindings(manifest, installAnchor),
    ...engineImportFindings(packageDir, files, manifest),
    ...clientInjectFindings(manifest),
  ]
  const name = typeof manifest.name === 'string' ? manifest.name : packageDir
  return {
    name,
    dir: packageDir,
    verdict: findings.some(finding => finding.severity === 'fail')
      ? 'unusable'
      : findings.length > 0 ? 'degraded' : 'usable',
    findings,
  }
}
