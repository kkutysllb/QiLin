/**
 * Reject compiler output written into source directories.
 * Source files are resolved from src; emitted JavaScript, maps, and matching
 * declarations belong under package build output and can change test resolution.
 */
import { globSync } from 'node:fs'
import { basename, sep } from 'node:path'
import { parseArgs } from 'node:util'

const SOURCE_GLOBS = [
  'packages/*/*/src/**/*',
  'packages/*/src/**/*',
  'apps/*/src/**/*',
  'native/*/packages/*/src/**/*',
  'vendor/*/src/**/*',
]
const GENERATED_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.map'])

/**
 * Find generated compiler artifacts in repository source directories.
 * @param root - repository root to inspect.
 * @returns sorted repository-relative paths that violate the source/artifact split.
 */
export function findSourcePlaneArtifacts(root: string): string[] {
  // Directory entries the glob returns carry no generated extension and never
  // match a `.ts` sibling, so they pass through the filter unflagged.
  const sourceFiles = globSync(SOURCE_GLOBS, { cwd: root })
  const sourcePaths = new Set(sourceFiles.map(path => path.split(sep).join('/')))
  return sourceFiles
    .filter(path => isGeneratedArtifact(path, sourcePaths))
    .map(path => path.split(sep).join('/'))
    .sort()
}

function isGeneratedArtifact(path: string, sourcePaths: ReadonlySet<string>): boolean {
  const normalized = path.split(sep).join('/')
  const name = basename(normalized)
  const extension = extensionOf(name)
  if (GENERATED_EXTENSIONS.has(extension)) return true
  if (extension !== '.d.ts') return false
  const stem = name.slice(0, -'.d.ts'.length)
  const directory = normalized.slice(0, -name.length)
  return ['.ts', '.tsx', '.mts', '.cts'].some(sourceExtension =>
    sourcePaths.has(directory + stem + sourceExtension),
  )
}

function extensionOf(name: string): string {
  if (name.endsWith('.d.ts')) return '.d.ts'
  const index = name.lastIndexOf('.')
  return index === -1 ? '' : name.slice(index)
}

if (import.meta.main) {
  const { values } = parseArgs({ args: process.argv.slice(2), options: { root: { type: 'string' } } })
  const artifacts = findSourcePlaneArtifacts(values.root ?? process.cwd())
  if (artifacts.length > 0) {
    console.error('verify-source-artifacts: generated files found under source directories:')
    for (const artifact of artifacts) console.error(`  ${artifact}`)
    console.error('Run pnpm run clean and rebuild with the repository build commands before running source tests.')
    process.exitCode = 1
  } else {
    console.log('verify-source-artifacts: source directories contain no generated compiler artifacts.')
  }
}
