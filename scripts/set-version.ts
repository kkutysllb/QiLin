/**
 * Set the repository's release version across the manifest family the root
 * version governs, so a release never ships a tag whose interface still names
 * its predecessor.
 *
 * Usage: pnpm run version:set 3.0.6 | pnpm run version:set --check
 *
 * The family is the root manifest plus every `@qilin-agent/...` package under
 * `packages/<group>/<package>` and `apps/<app>` — the same set
 * `check-workspace-constraints` holds to the root version. Vendored packages
 * and the native addon family keep their own version lines and are outside
 * both the glob and the constraint.
 * @module set-version
 */

import { globSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../', import.meta.url))

/** One manifest the root version governs. */
export interface VersionedManifest {
  /** Absolute manifest path. */
  readonly path: string
  /** Package name, absent for the root manifest. */
  readonly name?: string | undefined
}

/**
 * Whether one manifest joins the version family: the root manifest, or a
 * `@qilin-agent/*` package (which is how every workspace package and the CLI name
 * themselves).
 * @param manifest - Manifest name, absent for the root.
 * @returns Whether the root version governs it.
 */
export function inVersionFamily(manifest: { readonly name?: string | undefined }): boolean {
  const name = manifest.name
  return name === undefined || name === '@qilin-agent/cli' || name.startsWith('@qilin-agent/')
}

/**
 * Replace one manifest's version field, preserving every other byte.
 * @param text - Manifest text.
 * @param version - Version to declare.
 * @returns Rewritten manifest text.
 * @throws When the manifest declares no `"version"` field.
 */
export function withVersion(text: string, version: string): string {
  // Anchored to the top-level field: repository manifests indent one level
  // with two spaces, so a nested dependency's version never matches.
  const pattern = /^( {2}"version":\s*)"[^"]*"/mu
  if (!pattern.test(text)) throw new Error('manifest declares no "version" field')
  return text.replace(pattern, `$1"${version}"`)
}

/** Absolute path of every manifest the version family covers. */
function familyPaths(): string[] {
  return [
    join(repoRoot, 'package.json'),
    ...globSync(['packages/*/*/package.json', 'apps/*/package.json'], { cwd: repoRoot })
      .filter(path => !path.includes('node_modules'))
      .map(path => join(repoRoot, path)),
  ]
}

/** Read one manifest's parsed name, or undefined when it declares none. */
function manifestName(path: string): string | undefined {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as { name?: unknown }
  return typeof parsed.name === 'string' ? parsed.name : undefined
}

/**
 * Manifests the version family covers, in filesystem order.
 * @returns Every covered manifest with its declared name.
 */
export function versionFamily(): VersionedManifest[] {
  return familyPaths()
    .map(path => ({ path, name: manifestName(path) }))
    .filter(manifest => inVersionFamily(manifest))
}

/** Current version of the root manifest. */
function rootVersion(): string {
  const parsed = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8')) as { version?: unknown }
  if (typeof parsed.version !== 'string') throw new Error('root package.json declares no version')
  return parsed.version
}

/**
 * Report every family manifest whose version differs from the root's.
 * @returns One repository-relative line per drifting manifest.
 */
export function versionDrift(): string[] {
  const expected = rootVersion()
  const drift: string[] = []
  for (const manifest of versionFamily()) {
    const parsed = JSON.parse(readFileSync(manifest.path, 'utf8')) as { version?: unknown }
    if (parsed.version !== expected) {
      drift.push(`${relative(repoRoot, manifest.path)}: ${String(parsed.version)} (root declares ${expected})`)
    }
  }
  return drift
}

/**
 * Rewrite every family manifest to one version.
 * @param version - Version to declare.
 * @returns Repository-relative paths that changed.
 */
export function setVersion(version: string): string[] {
  const changed: string[] = []
  for (const manifest of versionFamily()) {
    const text = readFileSync(manifest.path, 'utf8')
    const next = withVersion(text, version)
    if (next === text) continue
    writeFileSync(manifest.path, next)
    changed.push(relative(repoRoot, manifest.path))
  }
  return changed
}

const invokedDirectly = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (invokedDirectly) {
  const argument = process.argv[2]
  if (argument === '--check') {
    const drift = versionDrift()
    if (drift.length > 0) {
      console.error(`version drift against the root manifest:\n  ${drift.join('\n  ')}`)
      process.exitCode = 1
    } else {
      console.log(`set-version: ${String(versionFamily().length)} manifest(s) at ${rootVersion()}`)
    }
  } else if (argument === undefined || argument.startsWith('-')) {
    console.error('usage: pnpm run version:set <x.y.z> | pnpm run version:set --check')
    process.exitCode = 1
  } else {
    const changed = setVersion(argument)
    console.log(`set-version: ${String(changed.length)} manifest(s) set to ${argument}`)
  }
}
