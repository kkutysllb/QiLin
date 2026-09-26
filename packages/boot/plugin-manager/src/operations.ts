/** Shared profile package operations used by qilin plugin and the running manager. */
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, mkdtemp, open, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { execa } from 'execa'
import type { EntryOptions } from '@qilin/kylin-plugin-loader'
import { withFileLock, writeFileAtomic } from '@qilin/atomic-write'
import {
  composeEntries, DEFAULT_PROFILE_BUNDLES, evaluatePluginCompatibility, initProfile, loadOverlayPatches,
  pluginCompatibilityWarning, PROFILE_TEMPLATES, readProfileManifest, readProfileVersionExemptions,
  resolveBundleDir, resolveProfileDir, type ProfileManifest,
} from '@qilin/app-boot'
import { scrubbedParentEnv } from '@qilin/subprocess'
import { awaitTreeGone, leadsOwnGroup, treeAlive, type RunTree } from './run-tree.ts'
import { parseInstallSpec } from './install-spec.ts'
import { incompatiblePlugin } from './failure.ts'
import type { IncompatiblePlugin, PackageResult, Registry } from './types.ts'
export { setProfileVersionExemption, readProfileVersionExemptions } from '@qilin/app-boot'

/** Profile and invocation locations supplied by the launcher. */
export interface PackageOperationContext {
  profile: string
  /** Explicit directory for an application-owned profile; named CLI profiles resolve under home. */
  dir?: string
  installAnchor: string
  cwd: string
  home?: string
}

/** Output and cancellation policy for one pnpm operation. */
export interface PackageOperationOptions {
  /** The pnpm executable name or path; resolved through `PATH` like the `qilin plugin` command. Defaults to `pnpm`. */
  command?: string
  /** Prefix arguments for an application-owned executable. */
  args?: readonly string[]
  /** Application runtime environment, applied only to this package operation. */
  env?: Readonly<Record<string, string>>
  /** CLI inherits authentication and terminal descriptors; service scrubs secrets and captures output. */
  execution: 'cli' | 'service'
  signal?: AbortSignal
  outputBytes: number
  onOutput?: (text: string, stream: 'stdout' | 'stderr') => void
  activateNewBundles?: boolean
  lockWaitMs?: number
  /** Bound on the pre-install registry lookup, in milliseconds; without one a fixed bound applies. */
  lookupTimeoutMs?: number
}

/** Resolve relative package specs against the caller's directory.
 * @param argument One pnpm argument.
 * @param cwd Invocation directory, never the profile directory.
 * @returns Anchored argument.
 */
export function anchorPathSpec(argument: string, cwd: string): string {
  const match = /^(?<prefix>(?:file|link):)?(?<path>\.{1,2}(?:[/\\].*)?)$/.exec(argument)
  if (match?.groups?.path === undefined) return argument
  return `${match.groups.prefix ?? ''}${resolve(cwd, match.groups.path)}`
}

/** Read bundle metadata without loading its JavaScript.
 * @param name Installed dependency or installation-owned package name.
 * @param dir Profile directory.
 * @param anchor Installation manifest.
 * @returns Resolved metadata, or undefined for packages without bundle metadata.
 */
export function bundleManifest(name: string, dir: string, anchor: string): ProfileManifest | undefined {
  const packageDir = resolveBundleDir('qilin', name, anchor, dir)
  const manifest = readProfileManifest('qilin', packageDir)
  return manifest.qilin?.bundle?.patch === undefined ? undefined : manifest
}

/** Atomically save a profile manifest while retaining unrelated fields.
 * @param dir Profile directory.
 * @param manifest Updated document.
 */
export async function saveManifest(dir: string, manifest: ProfileManifest): Promise<void> {
  await writeFileAtomic(join(dir, 'package.json'), JSON.stringify(manifest, undefined, 2) + '\n', { mode: 0o600 })
}

/** Reconcile package removals and newly installed bundles without re-enabling retained dependencies. */
async function reconcile(before: ProfileManifest, dir: string, anchor: string, options: PackageOperationOptions): Promise<void> {
  const after = readProfileManifest('qilin', dir)
  const dependencies = Object.keys(after.dependencies ?? {})
  const beforeDeps = new Set(Object.keys(before.dependencies ?? {}))
  const previous = after.qilin?.profile?.bundles ?? []
  const bundles = previous.filter((name) => {
    if (!beforeDeps.has(name) && !dependencies.includes(name)) return true
    return dependencies.includes(name) && bundleManifest(name, dir, anchor) !== undefined
  })
  for (const name of dependencies) {
    if (beforeDeps.has(name)) continue
    const metadata = bundleManifest(name, dir, anchor)
    if (metadata?.qilin?.bundle === undefined) {
      options.onOutput?.(`qilin: warning: ${name} declares no qilin.bundle — installed as a plain dependency, not a profile layer\n`, 'stderr')
      continue
    }
    loadOverlayPatches('qilin', join(resolveBundleDir('qilin', name, anchor, dir), metadata.qilin.bundle.patch))
    if (!bundles.includes(name)) {
      bundles.push(name)
    }
  }
  if (JSON.stringify(previous) === JSON.stringify(bundles)) return
  after.qilin = { ...after.qilin, profile: { ...after.qilin?.profile, bundles } }
  await saveManifest(dir, after)
}

/** Install commands that take the packages to install as positionals. */
const INSTALL_COMMANDS = new Set(['add', 'install', 'i'])

/** Bound on a pre-install registry lookup when the caller names none. */
const LOOKUP_TIMEOUT_MS = 20_000

/** Package specs an install command names explicitly, in order. */
function namedSpecs(args: readonly string[]): string[] {
  const index = args.findIndex(argument => !argument.startsWith('-'))
  const command = index < 0 ? undefined : args[index]
  if (command === undefined || !INSTALL_COMMANDS.has(command)) return []
  return args.slice(index + 1).filter(argument => !argument.startsWith('-'))
}

/** The manifest a named spec would install, read without installing it.
 * A path spec is read from disk. A registry spec asks pnpm's own configuration for the version the
 * range selects and its peer requirements. A git or tarball spec needs the fetch itself, so the
 * check after installation is what judges it.
 * @param dir Profile directory the lookup runs in.
 * @param spec Anchored install spec.
 * @param options Pnpm executable, prefix arguments, the caller's bound and signal.
 * @param environment Environment of the caller's pnpm invocations.
 * @param flags Flags of the run itself, so the lookup asks the registry that run will use.
 * @returns The package manifest, or undefined when reading it would need the installation itself.
 */
async function namedSpecManifest(
  dir: string, spec: string, options: LookupOptions, environment: Readonly<Record<string, string | undefined>>,
  flags: readonly string[],
): Promise<object | undefined> {
  const parsed = parseInstallSpec(spec)
  if (parsed.kind === 'path') {
    const filename = join(parsed.path, 'package.json')
    return existsSync(filename) ? JSON.parse(readFileSync(filename, 'utf8')) as object : undefined
  }
  if (parsed.kind !== 'registry') return undefined
  const viewed = await execa(options.command ?? 'pnpm', [
    ...options.args ?? [], 'view', parsed.spec, 'name', 'version', 'peerDependencies', '--json',
    ...flags, '--config.fetch-retries=0',
  ], {
    cwd: dir, env: environment, extendEnv: false, reject: false, stdin: 'ignore',
    ...options.signal === undefined ? {} : { cancelSignal: options.signal },
    timeout: options.lookupTimeoutMs ?? LOOKUP_TIMEOUT_MS,
  })
  if (viewed.exitCode !== 0) return undefined
  const value: unknown = JSON.parse(viewed.stdout)
  return (Array.isArray(value) ? value.at(-1) : value) as object
}

/** The executable, environment, and bound one pre-install registry lookup needs. */
export type LookupOptions = Pick<
  PackageOperationOptions, 'execution' | 'command' | 'args' | 'env' | 'signal' | 'lookupTimeoutMs'
>

/** The packages one install command names that the running runtime version refuses. */
export interface RefusedInstallSpecs {
  /** One English diagnostic per refused package, for logs and the CLI's stderr. */
  warnings: string[]
  /** The refused packages, for a surface with its own grant mechanism or locale. */
  incompatible: IncompatiblePlugin[]
}

/**
 * Read the manifests an install command names and report the ones the running
 * runtime version refuses, without installing anything. A path spec is read
 * from disk and a registry spec through pnpm's own lookup; a git or tarball
 * spec needs the fetch itself, so only the check after installation judges it.
 * @param context Launcher-owned profile and resolution locations.
 * @param args Pnpm arguments, before relative path anchoring.
 * @param options Executable, environment, cancellation, and the lookup bound.
 * @returns One warning per refused package; empty when none is refused.
 */
export async function refusedInstallSpecs(
  context: PackageOperationContext, args: readonly string[], options: LookupOptions,
): Promise<RefusedInstallSpecs> {
  const dir = context.dir ?? resolveProfileDir(context.profile, context.home)
  const environment = { ...(options.execution === 'cli' ? process.env : scrubbedParentEnv()), ...options.env }
  const exemptions = readProfileVersionExemptions(dir)
  // The run's own registry flags, so the lookup asks the registry the installation will use.
  const registryFlags = args.filter(argument => argument.startsWith('--registry='))
  const warnings: string[] = []
  const incompatible: IncompatiblePlugin[] = []
  for (const raw of namedSpecs(args)) {
    // A spec whose manifest cannot be read or validated is left to the run itself and to the check
    // after installation, which reports what it could not validate.
    try {
      const manifest = await namedSpecManifest(dir, anchorPathSpec(raw, context.cwd), options, environment, registryFlags)
      if (manifest === undefined) continue
      const issue = evaluatePluginCompatibility(manifest, exemptions)
      if (issue !== undefined && !issue.exempted) {
        warnings.push(pluginCompatibilityWarning(issue))
        incompatible.push(incompatiblePlugin(issue))
      }
    } catch (error) { void error; continue }
  }
  return { warnings, incompatible }
}

/** Missing installed packages are repairable; their absence is part of the before/after comparison. */
function optionalFile(path: string): string | undefined {
  try { return readFileSync(path, 'utf8') } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

/** Where an operation records the pnpm run it started, for a successor when the operation's own process ends first. */
function runRecordPath(dir: string): string {
  return join(dir, '.plugin-manager', 'run.json')
}

/** Record a started run; a successor that takes over the profile lock from an exited process waits for it. */
async function recordRun(dir: string, tree: RunTree): Promise<void> {
  if (tree.pid === undefined) return
  await writeFileAtomic(runRecordPath(dir), `${JSON.stringify(tree)}\n`, { mode: 0o600, dirMode: 0o700 })
}

/**
 * Why this operation must not run: a record left by an operation whose process
 * ended mid-run names a run that is still writing the profile. The profile
 * lock is taken over once its holder exits, but its pnpm tree can outlive it.
 * A recorded run that stopped, within a bounded wait, has its record removed.
 * @param dir Profile directory.
 * @returns The diagnostic, or undefined when no recorded run is active.
 */
async function activeRecordedRun(dir: string): Promise<string | undefined> {
  const path = runRecordPath(dir)
  const text = optionalFile(path)
  if (text === undefined) return undefined
  let tree: RunTree | undefined
  try {
    const value: unknown = JSON.parse(text)
    const { pid, grouped } = (typeof value === 'object' && value !== null ? value : {}) as { pid?: unknown; grouped?: unknown }
    if (Number.isSafeInteger(pid) && (pid as number) > 0 && typeof grouped === 'boolean') tree = { pid: pid as number, grouped }
  } catch (error) {
    // Records are replaced atomically, so an unparsable one was written by something else and is reported below.
    void error
  }
  if (tree === undefined) {
    return `qilin: ${path} does not name a package run; delete it once no earlier package operation is still running in this profile\n`
  }
  await awaitTreeGone(tree)
  if (treeAlive(tree)) {
    return `qilin: process ${String(tree.pid)}, started by an earlier package operation whose own process ended, is still running in this profile; `
      + `wait for it or stop it, then retry. If process ${String(tree.pid)} is not that package run, delete ${path}.\n`
  }
  await rm(path, { force: true })
  return undefined
}

/** pnpm can install plugins through any direct-dependency field. */
function directDependencies(manifest: ProfileManifest): Record<string, string> {
  const extra = manifest as ProfileManifest & { devDependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }
  return { ...extra.devDependencies, ...manifest.dependencies, ...extra.optionalDependencies }
}

/** Inspect only plugin rows contributed by the changed bundle, not its dependency closure. */
function bundleComponentManifests(name: string, dir: string, anchor: string): ProfileManifest[] {
  const bundle = bundleManifest(name, dir, anchor)
  const patch = bundle?.qilin?.bundle?.patch
  if (patch === undefined) return []
  const packageDir = resolveBundleDir('qilin', name, anchor, dir)
  const patches = loadOverlayPatches('qilin', join(packageDir, patch))
  const names = new Set<string>()
  const visit = (rows: EntryOptions[]) => {
    for (const row of rows) {
      if (row.group && Array.isArray(row.config)) visit(row.config as EntryOptions[])
      if (typeof row.name !== 'string' || row.name.startsWith('.') || row.name.startsWith('/') || row.name.includes(':')) continue
      const parts = row.name.split('/')
      names.add(parts.slice(0, row.name.startsWith('@') ? 2 : 1).join('/'))
    }
  }
  visit(composeEntries([patches.filter(entry => entry.insert !== undefined)]))
  return [...names].flatMap((component) => {
    let directory: string
    try { directory = resolveBundleDir('qilin', component, anchor, dir) } catch (error) {
      // Resolution errors for uninstalled or dynamic rows remain subject to the startup loader's checks.
      void error
      return []
    }
    return [readProfileManifest('qilin', directory)]
  })
}

/** Execute pnpm inside a profile whose caller already holds the profile write lock.
 * Newly installed or updated direct dependencies are checked even when activation is disabled;
 * an untouched dependency never blocks an unrelated operation and stays denied at startup.
 * Compatibility denial restores the profile manifest and lockfile, but leaves downloaded modules on disk.
 * @param context Launcher-owned profile and resolution locations.
 * @param args Pnpm arguments, before relative path anchoring.
 * @param options Output, activation and cancellation policy.
 * @returns Exit status, whether the silence bound stopped the run, and the diagnostic path.
 * A compatibility denial returns exit code 1. Service output is bounded; CLI output uses inherited descriptors.
 */
export async function runProfilePnpm(
  context: PackageOperationContext, args: readonly string[], options: PackageOperationOptions,
): Promise<PackageResult> {
  const dir = context.dir ?? resolveProfileDir(context.profile, context.home)
  // Before any profile file is read: a recorded run that is still active may be rewriting them.
  const active = await activeRecordedRun(dir)
  const logRoot = join(dir, '.plugin-manager', 'logs')
  await mkdir(logRoot, { recursive: true, mode: 0o700 })
  const logDir = await mkdtemp(join(logRoot, 'operation-'))
  const logPath = join(logDir, 'pnpm.log')
  const log = await open(logPath, 'wx', 0o600)
  if (active !== undefined) {
    await log.write(active)
    await log.close()
    options.onOutput?.(active, 'stderr')
    const bytes = Buffer.from(active)
    return { exitCode: 1, output: bytes.subarray(Math.max(0, bytes.length - options.outputBytes)).toString('utf8'), truncated: bytes.length > options.outputBytes, logPath }
  }
  const before = readProfileManifest('qilin', dir)
  const savedFiles = ['package.json', 'pnpm-lock.yaml'].map(name => ({ path: join(dir, name), text: optionalFile(join(dir, name)) }))
  const beforeDependencies = directDependencies(before)
  const installedBefore = new Map(Object.keys(beforeDependencies).map(name => [name, optionalFile(join(dir, 'node_modules', name, 'package.json'))]))
  let output = Buffer.alloc(0)
  let truncated = false
  const append = (bytes: Buffer): void => {
    output = Buffer.concat([output, bytes])
    if (output.length > options.outputBytes) {
      truncated = true
      output = output.subarray(output.length - options.outputBytes)
    }
  }
  const environment = { ...(options.execution === 'cli' ? process.env : scrubbedParentEnv()), ...options.env }
  const restore = async (): Promise<void> => {
    for (const file of savedFiles) {
      if (file.text === undefined) await rm(file.path, { force: true })
      else await writeFileAtomic(file.path, file.text, { mode: 0o600 })
    }
  }
  /** Packages a compatibility check refused; callers render them for their own surface. */
  const incompatible: IncompatiblePlugin[] = []
  const rejected = async (warnings: readonly string[], restoration: string): Promise<PackageResult> => {
    const diagnostic = `\nqilin: installation rejected: ${warnings.join('\n')}\nqilin: ${restoration}.\n`
    await log.write(diagnostic)
    options.onOutput?.(diagnostic, 'stderr')
    append(Buffer.from(diagnostic))
    await log.close()
    return { exitCode: 1, output: output.toString('utf8'), truncated, logPath, incompatible }
  }
  // An install command names the packages it adds, so their manifests are read and checked before
  // pnpm runs: an incompatible version is never installed, and the one already in use keeps working.
  const refused = await refusedInstallSpecs(context, args, options)
  if (refused.warnings.length > 0) {
    incompatible.push(...refused.incompatible)
    return rejected(refused.warnings, 'nothing was installed')
  }
  const cancellation = new AbortController()
  // A service run captures output and is spawned as its own group leader, so the
  // tree its lifecycle scripts occupy is addressable; the CLI keeps the caller's
  // process group, so an interrupt still reaches it.
  const grouped = leadsOwnGroup(options.execution)
  const child = execa(options.command ?? 'pnpm', [...options.args ?? [], ...args.map(arg => anchorPathSpec(arg, context.cwd))], {
    cwd: dir, env: environment, extendEnv: false, reject: false,
    stdout: options.execution === 'cli' ? 'inherit' : 'pipe',
    stderr: options.execution === 'cli' ? 'inherit' : 'pipe',
    killDescendants: options.execution === 'service',
    buffer: false, stdin: options.execution === 'cli' ? 'inherit' : 'ignore', cancelSignal: options.signal === undefined
      ? cancellation.signal : AbortSignal.any([cancellation.signal, options.signal]),
  })
  let writes = Promise.resolve()
  const collect = async (stream: AsyncIterable<Buffer | string>, kind: 'stdout' | 'stderr') => {
    try {
      for await (const chunk of stream) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
        writes = writes.then(async () => { await log.write(bytes) })
        await writes
        options.onOutput?.(bytes.toString('utf8'), kind)
        append(bytes)
      }
    } catch (error) {
      cancellation.abort()
      throw error
    }
  }
  let exitCode: number
  try {
    await recordRun(dir, { pid: child.pid, grouped })
    const [completion, ...streams] = await Promise.allSettled([child,
      ...child.stdout === null ? [] : [collect(child.stdout, 'stdout')],
      ...child.stderr === null ? [] : [collect(child.stderr, 'stderr')],
    ])
    for (const stream of streams) if (stream.status === 'rejected') throw stream.reason
    if (completion.status === 'rejected') throw completion.reason
    const result = completion.value
    exitCode = result.exitCode ?? (result.code === 'ENOENT' ? 127 : 1)
    if (result.failed && output.length === 0) {
      const diagnostic = result.shortMessage ?? 'pnpm failed'
      await log.write(diagnostic)
      truncated = Buffer.byteLength(diagnostic) > options.outputBytes
      output = Buffer.from(diagnostic).subarray(0, options.outputBytes)
    }
    // A terminated run's exit status says nothing about what it wrote, so it never reconciles the selection.
    if (exitCode === 0) {
      const after = readProfileManifest('qilin', dir)
      const warnings: string[] = []
      for (const [name, spec] of Object.entries(directDependencies(after))) {
        const packageDir = join(dir, 'node_modules', name)
        const installed = optionalFile(join(packageDir, 'package.json'))
        if (installed === undefined) continue
        // A dependency this run did not touch never blocks an unrelated operation; profile startup denies it.
        const untouched = beforeDependencies[name] === spec && installedBefore.get(name) === installed
        const found: string[] = []
        const issues: IncompatiblePlugin[] = []
        try {
          const manifest = readProfileManifest('qilin', packageDir)
          for (const candidate of [manifest, ...bundleComponentManifests(name, dir, context.installAnchor)]) {
            const issue = evaluatePluginCompatibility(candidate, readProfileVersionExemptions(dir))
            if (issue !== undefined && !issue.exempted) {
              found.push(pluginCompatibilityWarning(issue))
              issues.push(incompatiblePlugin(issue))
            }
          }
        } catch (error) {
          found.push(`Cannot validate installed package ${name}: ${String(error)}`)
        }
        if (found.length === 0) continue
        if (!untouched) {
          warnings.push(...found)
          incompatible.push(...issues)
        }
        else {
          const notice = `\nqilin: warning: ${found.join('\n')}\nqilin: it stays installed but profile startup denies it until you grant an exemption for those exact versions.\n`
          await log.write(notice)
          options.onOutput?.(notice, 'stderr')
        }
      }
      if (warnings.length > 0) {
        // A bundle component's peers need installed contents, so this rejection lands after pnpm
        // replaced the tree: restore the files, then reinstall the restored lockfile so the version
        // that worked before this run keeps loading. A profile that had no lockfile is reinstalled
        // from its restored manifest without creating one, which removes what this run added.
        await restore()
        const hadLockfile = savedFiles.some(file => file.path.endsWith('pnpm-lock.yaml') && file.text !== undefined)
        const repair = ['install', hadLockfile ? '--frozen-lockfile' : '--config.lockfile=false']
        const repairing = execa(options.command ?? 'pnpm', [...options.args ?? [], ...repair], {
          cwd: dir, env: environment, extendEnv: false, reject: false, stdin: 'ignore',
        })
        await recordRun(dir, { pid: repairing.pid, grouped: false })
        const repaired = await repairing
        exitCode = 1
        const restoration = repaired.exitCode === 0
          ? 'restored package.json, pnpm-lock.yaml, and node_modules'
          : "restored package.json and pnpm-lock.yaml, but node_modules could not be reinstalled; run 'qilin plugin install'"
        const diagnostic = `\nqilin: installation rejected: ${warnings.join('\n')}\nqilin: ${restoration}.\n`
        await log.write(diagnostic)
        options.onOutput?.(diagnostic, 'stderr')
        append(Buffer.from(diagnostic))
      } else if (options.activateNewBundles !== false) {
        await reconcile(before, dir, context.installAnchor, options)
      }
    }
  } finally {
    // This process saw the run end, so no successor has to wait for it.
    await rm(runRecordPath(dir), { force: true })
    await log.close()
  }
  return {
    exitCode, output: output.toString('utf8'), truncated, logPath,
    ...incompatible.length > 0 ? { incompatible } : {},
  }
}

/** Initialize and run the qilin plugin command with the same write lock as the service.
 * @param context Launcher-owned locations.
 * @param args Pnpm arguments.
 * @param options Output and cancellation policy.
 * @returns Completed package-manager result.
 */
export async function runPluginCommand(
  context: PackageOperationContext, args: readonly string[], options: PackageOperationOptions,
): Promise<PackageResult> {
  const dir = context.dir ?? resolveProfileDir(context.profile, context.home)
  await mkdir(dir, { recursive: true })
  return withFileLock(join(dir, 'package.json'), async () => {
    if (!existsSync(join(dir, 'package.json'))) {
      const template = PROFILE_TEMPLATES[context.profile]
      initProfile(dir, template?.bundles ?? DEFAULT_PROFILE_BUNDLES)
      options.onOutput?.(`qilin: initialized profile ${context.profile} at ${dir}\n`, 'stderr')
    }
    return runProfilePnpm(context, args, options)
  }, options.lockWaitMs === undefined ? undefined : { waitMs: options.lockWaitMs })
}

/** What one registry lookup answered. */
export interface PackageViewResult {
  /** pnpm's exit code, null when it ended without one or never started. */
  exitCode: number | null
  stdout: string
  stderr: string
  /** The lookup ran past its bound and was killed. */
  timedOut: boolean
  /** The failure of starting pnpm at all, when that is what happened. */
  cause?: unknown
}

/** Bounds of one registry lookup. */
export interface PackageViewOptions {
  /** The pnpm executable name or path. Defaults to `pnpm`. */
  command?: string
  /** Prefix arguments for an application-owned executable. */
  args?: readonly string[]
  /** Application runtime environment, applied only to this package operation. */
  env?: Readonly<Record<string, string>>
  /** Ends the lookup early; the caller's signal, when it has one. */
  signal?: AbortSignal
  /** Bound on the lookup, in milliseconds. */
  timeoutMs: number
  /** The registry asked; null asks the one pnpm's own configuration names. */
  registry?: Registry
}

/**
 * Ask the registry what a spec names through `pnpm view`, run in the profile
 * directory so the registry, proxy, and authentication settings of an install apply.
 * @param dir Profile directory.
 * @param spec One registry spec: a package name with an optional range.
 * @param options Cancellation and the time bound.
 * @returns pnpm's exit, output, and how the lookup ended.
 */
export async function viewProfilePackage(dir: string, spec: string, options: PackageViewOptions): Promise<PackageViewResult> {
  const result = await execa(options.command ?? 'pnpm', [
    ...options.args ?? [], 'view', spec, 'name', 'version', 'description', 'qilin', '--json',
    ...registryArguments(options.registry ?? null), '--config.fetch-retries=0',
  ], {
    cwd: dir, env: { ...scrubbedParentEnv(), ...options.env }, extendEnv: false, reject: false, stdin: 'ignore',
    timeout: options.timeoutMs, ...options.signal === undefined ? {} : { cancelSignal: options.signal },
  })
  const cause = result.exitCode === undefined && !result.timedOut && !result.isCanceled
    ? Object.assign(new Error(result.shortMessage), { code: result.code })
    : undefined
  return {
    exitCode: result.exitCode ?? null, stdout: result.stdout, stderr: result.stderr, timedOut: result.timedOut,
    ...cause === undefined ? {} : { cause },
  }
}

/**
 * The argument that sends one pnpm command to a registry.
 * @param registry - the registry, or null for the one pnpm's own configuration names.
 * @returns `--registry=<url>` for a URL; nothing for null.
 */
export function registryArguments(registry: Registry): string[] {
  return registry === null ? [] : [`--registry=${registry}`]
}

/**
 * Read the registry pnpm's own configuration names in the profile: its `.npmrc` chain and workspace settings,
 * as `pnpm config get registry` resolves them.
 * @param dir - Profile directory.
 * @param options - The pnpm executable and the time bound.
 * @returns The registry URL as pnpm printed it, or null when pnpm did not answer with one.
 */
export async function readProfileRegistry(
  dir: string, options: { command?: string; args?: readonly string[]; env?: Readonly<Record<string, string>>; timeoutMs: number },
): Promise<string | null> {
  const result = await execa(options.command ?? 'pnpm', [...options.args ?? [], 'config', 'get', 'registry'], {
    cwd: dir, env: { ...scrubbedParentEnv(), ...options.env }, extendEnv: false, reject: false, stdin: 'ignore', timeout: options.timeoutMs,
  })
  // The registry is the last line: pnpm may print a notice before it.
  const answer = result.exitCode === 0 ? result.stdout.trim().replace(/^[\s\S]*\n/, '').trim() : ''
  return /^https?:\/\/\S+$/.test(answer) ? answer : null
}
