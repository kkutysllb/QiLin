/**
 * Require every generated Typert face to declare the packages it imports.
 *
 * The generator emits runtime imports the owning `src/` never mentions — schema
 * validation arrives as `import { z } from 'zod'`. A package that omits that
 * dependency still typechecks, builds, and satisfies the source-derived
 * dependency policy, then fails when the Loader imports its face: the face's
 * contributor throws, the whole contributor batch is withdrawn, and every
 * namespace mounted before it answers `SRC fallback is forbidden` for the rest
 * of the process.
 *
 * Faces are generated in memory, so this gate holds on a clean tree and reads no
 * `lib/` output.
 */
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { WorkspaceTypertGenerator } from '../packages/typert/generator/src/workspace.ts'

const root = resolve(import.meta.dirname, '..')

/** Runtime entry a package publishes for its generated Host face. */
const HOST_FACE_TARGET = 'lib/typert.host.js'

/** How many declared Host faces the generation must yield before a clean result means anything. */
const MINIMUM_FACES = 20

/** One generated face module, as the generator emitted it. */
export interface GeneratedFace {
  /** Package name owning the face. */
  package: string
  /** Repository-relative package directory. */
  packageRoot: string
  /** Emitted module source. */
  js: string
}

/** A static import of one generated face. */
export interface FaceImport {
  /** Package name owning the face. */
  package: string
  /** Imported package specifier. */
  specifier: string
  /** 1-based line of the import. */
  line: number
}

/** A face import whose package the owning manifest does not declare. */
export interface FaceDependencyViolation extends FaceImport {
  /** Repository-relative package directory owning the face. */
  packageRoot: string
  /** Manifest expected to declare the package. */
  manifestPath: string
}

/** A workspace package that publishes a generated Host face. */
interface FacePackage {
  /** Package name. */
  name: string
  /** Repository-relative package directory. */
  dir: string
  /** Repository-relative manifest path. */
  manifestPath: string
  /** Declared dependency sections, merged. */
  declared: ReadonlySet<string>
}

/**
 * Read a manifest's declared dependency sections.
 * @param manifest - parsed package manifest.
 * @returns package names declared in any dependency section.
 */
export function declaredPackages(manifest: Record<string, unknown>): Set<string> {
  const names = new Set<string>()
  for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    const value = manifest[section]
    if (value === null || typeof value !== 'object') continue
    for (const name of Object.keys(value)) names.add(name)
  }
  return names
}

/**
 * Whether a manifest publishes a generated Host face.
 * @param manifest - parsed package manifest.
 * @returns true when the `./typert` export resolves to the generated Host entry.
 */
export function declaresHostFace(manifest: Record<string, unknown>): boolean {
  return JSON.stringify(manifest['exports'] ?? null).includes(`./${HOST_FACE_TARGET}`)
}

/**
 * Collect the package specifiers one generated face imports at runtime.
 * @param js - emitted face module source.
 * @returns bare specifiers with their 1-based lines, in source order.
 */
export function collectFaceImports(js: string): Array<{ specifier: string; line: number }> {
  const imports: Array<{ specifier: string; line: number }> = []
  js.split('\n').forEach((text, index) => {
    const specifier = /^import\s[^\n]*?from\s*'([^']+)'/.exec(text)?.[1]
    if (specifier === undefined) return
    if (specifier.startsWith('.') || specifier.startsWith('node:')) return
    imports.push({ specifier, line: index + 1 })
  })
  return imports
}

/**
 * Reduce a bare specifier to the package name that owns it.
 * @param specifier - bare import specifier, possibly scoped and possibly deep.
 * @returns the package name, without subpath.
 */
export function owningPackage(specifier: string): string {
  const startsScoped = specifier.startsWith('@')
  const boundary = startsScoped
    ? specifier.indexOf('/', specifier.indexOf('/') + 1)
    : specifier.indexOf('/')
  return boundary === -1 ? specifier : specifier.slice(0, boundary)
}

/**
 * Compare generated face imports against the owning manifests.
 * @param faces - generated faces to inspect.
 * @param packages - manifest facts keyed by package name.
 * @returns one violation per undeclared import.
 */
export function findFaceDependencyViolations(
  faces: readonly GeneratedFace[],
  packages: ReadonlyMap<string, FacePackage>,
): FaceDependencyViolation[] {
  const violations: FaceDependencyViolation[] = []
  for (const face of faces) {
    const owner = packages.get(face.package)
    if (owner === undefined) throw new Error(`verify-typert-face-dependencies: generated face for unknown package ${face.package}`)
    for (const { specifier, line } of collectFaceImports(face.js)) {
      if (owner.declared.has(owningPackage(specifier))) continue
      violations.push({ package: face.package, specifier, line, packageRoot: face.packageRoot, manifestPath: owner.manifestPath })
    }
  }
  return violations
}

/**
 * Scan the repository's declared Host faces.
 * @returns the violations, and how many faces were generated.
 */
export function scanRepository(): { violations: FaceDependencyViolation[]; faces: number } {
  const packages = new Map<string, FacePackage>()
  for (const manifestPath of globSync('packages/*/*/package.json', { cwd: root }).sort()) {
    const manifest = JSON.parse(readFileSync(resolve(root, manifestPath), 'utf8')) as Record<string, unknown>
    if (!declaresHostFace(manifest)) continue
    const name = manifest['name']
    if (typeof name !== 'string') throw new Error(`${manifestPath}: a declared Host face needs a package name`)
    packages.set(name, {
      name,
      dir: manifestPath.replace(/\/package\.json$/, ''),
      manifestPath,
      declared: declaredPackages(manifest),
    })
  }
  if (packages.size === 0) {
    throw new Error('verify-typert-face-dependencies: no package declares a Host face; the manifest scan narrowed.')
  }
  const generated = new WorkspaceTypertGenerator(root).generate([...packages.keys()], ['host'])
  const faces: GeneratedFace[] = generated.map(artifact => ({
    package: artifact.package,
    packageRoot: artifact.packageRoot,
    js: artifact.js,
  }))
  if (faces.length < MINIMUM_FACES) {
    throw new Error(`verify-typert-face-dependencies: generated only ${String(faces.length)} Host face(s); the face discovery narrowed.`)
  }
  for (const pkg of packages.values()) {
    if (!faces.some(face => face.package === pkg.name)) {
      throw new Error(`${pkg.manifestPath}: declared a Host face the generator did not emit`)
    }
  }
  return { violations: findFaceDependencyViolations(faces, packages), faces: faces.length }
}

function main(): void {
  const { violations, faces } = scanRepository()
  if (violations.length === 0) {
    console.log(`verify-typert-face-dependencies: ${String(faces)} generated Host face(s) declare every package they import.`)
    return
  }
  console.error('verify-typert-face-dependencies: a generated Typert face imports a package its manifest does not declare.\n')
  for (const violation of violations) {
    console.error(`  ${violation.manifestPath}: ${violation.package} imports ${violation.specifier} at ${violation.packageRoot}/lib/typert.host.js:${String(violation.line)}`)
  }
  console.error('\nDeclare it in dependencies, as the sibling faces do; the Loader imports the face as')
  console.error('plain Node, so an undeclared package fails resolution and takes its batch down.')
  process.exit(1)
}

if (import.meta.filename === resolve(process.argv[1] ?? '')) main()
