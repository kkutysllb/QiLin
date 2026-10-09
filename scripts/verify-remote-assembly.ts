/**
 * Every workspace package that publishes a generated Remote face must be
 * mounted by a Client runtime: the shared `@qilin-agent/api-remotes` assembly
 * lists it, or a Client source mounts the contribution itself.
 *
 * A type-only import hides a missing mount. A Client that reads
 * `ctx.remote.<namespace>` after `import type {} from '<pkg>/remote'`
 * typechecks, builds, and passes every package gate while the namespace service
 * does not exist at runtime; the call throws at the first use, and a `catch`
 * around it can swallow the failure into a permanently dead feature.
 *
 * The assembly's `$mount` list is read from its own source, not copied here.
 * @module verify-remote-assembly
 */
import { globSync, readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

/** Exact export subpath a package publishes its generated Remote face under. */
export const REMOTE_FACE = './remote'

/** The assembly source that owns the shared `$mount` list. */
const ASSEMBLY_SOURCE = 'packages/api/remotes/src/client/index.ts'

/** The runtime call that mounts one Remote contribution. */
const MOUNT_CALL = '.remote.$mount('

/** The assembly's contribution array and the mount taking it. */
const CONTRIBUTION_ARRAY = /for \(const contribution of \[([\s\S]*?)\]\)\s*\{[\s\S]*?ctx\.remote\.\$mount\(contribution\)/

/** Every workspace package manifest. */
const MANIFEST_GLOB = 'packages/*/*/package.json'

/** Every workspace source module. */
const SOURCE_GLOB = 'packages/*/*/src/**/*.ts'

/** Fewest published Remote faces a clean result must have seen. */
const MINIMUM_FACES = 20

/** One package publishing a Remote face. */
export interface RemotePackage {
  /** Package name as published. */
  readonly name: string
  /** Repository-relative package directory. */
  readonly dir: string
}

/** Every package manifest that publishes a Remote face, by name. */
export function remotePackages(cwd: string = root): RemotePackage[] {
  const out: RemotePackage[] = []
  for (const manifest of globSync(MANIFEST_GLOB, { cwd })) {
    const pkg = JSON.parse(readFileSync(resolve(cwd, manifest), 'utf8')) as {
      name?: unknown
      exports?: Record<string, unknown>
    }
    if (typeof pkg.name !== 'string' || pkg.exports?.[REMOTE_FACE] === undefined) continue
    out.push({ name: pkg.name, dir: dirname(manifest) })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

/** What one assembly source imports and what it lists as mounted. */
export interface AssemblyMounts {
  /** Import identifier to package name, for every `<pkg>/remote` value import. */
  readonly imports: ReadonlyMap<string, string>
  /** Import identifiers listed in the contribution array. */
  readonly contributions: readonly string[]
}

/** Read the assembly's value imports and its contribution identifiers. */
export function readAssemblyMounts(source: string): AssemblyMounts {
  const imports = new Map<string, string>()
  for (const match of source.matchAll(/^import\s+(\w+)\s+from\s+'(@[^']+)\/remote'/gm)) {
    imports.set(match[1] as string, match[2] as string)
  }
  const arraySource = CONTRIBUTION_ARRAY.exec(source)?.[1]
  const contributions = arraySource === undefined
    ? []
    : [...arraySource.matchAll(/[A-Za-z_$][\w$]*/g)].map(match => match[0])
  return { imports, contributions }
}

/** Where the assembly's imports and its contribution list disagree. */
export function assemblyImportProblems(mounts: AssemblyMounts): string[] {
  const problems: string[] = []
  const listed = new Set(mounts.contributions)
  for (const identifier of mounts.contributions) {
    if (!mounts.imports.has(identifier)) {
      problems.push(`assembly lists ${identifier} but imports no /remote face as that name`)
    }
  }
  for (const [identifier, pkg] of mounts.imports) {
    if (!listed.has(identifier)) {
      problems.push(`assembly imports ${pkg}/remote as ${identifier} but never mounts it`)
    }
  }
  return problems.sort()
}

/** Package names mounted by a Client source outside the shared assembly. */
export function selfMountedPackages(files: readonly { path: string; source: string }[]): Set<string> {
  const out = new Set<string>()
  for (const file of files) {
    if (file.path === ASSEMBLY_SOURCE || !file.source.includes(MOUNT_CALL)) continue
    for (const match of file.source.matchAll(/from\s+'(@[^']+)\/remote'/g)) out.add(match[1] as string)
  }
  return out
}

/** Remote faces no Client runtime mounts. */
export function unmountedFaces(
  packages: readonly RemotePackage[],
  mounts: AssemblyMounts,
  selfMounted: ReadonlySet<string>,
): string[] {
  const mounted = new Set(mounts.imports.values())
  return packages
    .filter(pkg => !mounted.has(pkg.name) && !selfMounted.has(pkg.name))
    .map(pkg => pkg.name)
}

/** Whether one published Remote face reaches a Client runtime, and why not. */
export function verifyRemoteAssembly(cwd: string = root): string[] {
  const packages = remotePackages(cwd)
  const assembly = readAssemblyMounts(readFileSync(resolve(cwd, ASSEMBLY_SOURCE), 'utf8'))
  const files = globSync(SOURCE_GLOB, { cwd })
    .filter(path => path.endsWith('.ts'))
    .map(path => ({ path, source: readFileSync(resolve(cwd, path), 'utf8') }))
  const selfMounted = selfMountedPackages(files)
  const mounted = new Set(assembly.imports.values())
  const problems = [
    ...assemblyImportProblems(assembly),
    ...unmountedFaces(packages, assembly, selfMounted)
      .map(name => `${name} publishes ${REMOTE_FACE} but no Client runtime mounts it`),
  ]
  if (packages.length < MINIMUM_FACES || mounted.size < MINIMUM_FACES) {
    problems.push(`scanned ${packages.length} Remote faces and ${mounted.size} assembly mounts; expected at least ${MINIMUM_FACES} of each`)
  }
  return problems
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(basename(process.argv[1]))) {
  const problems = verifyRemoteAssembly()
  if (problems.length === 0) {
    console.log('verify-remote-assembly: every published Remote face reaches a Client mount')
  } else {
    console.error(`verify-remote-assembly: ${problems.length} problem(s)`)
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exitCode = 1
  }
}
