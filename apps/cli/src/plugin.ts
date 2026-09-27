/**
 * `qilin plugin [--profile <name>] <args...>` — profile plugin management.
 *
 * `list` and `doctor` are the launcher's own verbs and never mutate anything:
 * `list` prints the profile's bundle layers, and `doctor` reports one plugin
 * package's DSH-era compatibility. `version-exemptions`, `allow-version`, and
 * `revoke-version` read and write the profile's own `compatibility.json` under
 * its file lock and never become pnpm arguments. Every other argument list
 * forwards to pnpm in the profile directory: refuse the packages it names that
 * the running runtime version rejects, initialize the profile on first use, run
 * `pnpm <args...>`, then reconcile the `qilin.profile.bundles` layer list
 * against the installed state (a dependency resolving to a package that
 * declares `qilin.bundle` joins the layer stack; a removed or bundle-less
 * dependency leaves it). Reconciling by installed state, not by dependency
 * diff, means `update` activates a package that gained its `qilin.bundle`
 * declaration in a newer version. A profile that installed an upstream DSH-era
 * engine package is refused before any layer changes, with the removal command
 * in the diagnostic.
 * @module @qilin/cli/plugin
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import {
  DEFAULT_PROFILE_BUNDLES,
  doctorPluginPackage,
  EngineNameCollisionError,
  initProfile,
  PROFILE_TEMPLATES,
  readProfileCompatibility,
  readProfileManifest,
  readProfilePluginRows,
  reconcileProfileBundles,
  resolveBundleDir,
  resolveProfileDir,
  setProfileVersionExemption,
} from '@qilin/app-boot'
import { withFileLock } from '@qilin/atomic-write'
import { refusedInstallSpecs } from '@qilin/plugin-manager/operations'
import { INSTALL_ANCHOR } from './profile-boot.ts'

const NAME = 'qilin'

/** Bound on waiting for the profile write lock an exemption command shares with the manager. */
const LOCK_WAIT_MS = 120_000

/** Bound on the pre-install registry lookup that reads a named package's peers. */
const LOOKUP_TIMEOUT_MS = 120_000

/**
 * Print one profile's plugin layers in activation order.
 * @param profile - the profile name, used to recognize its shipped template layers.
 * @param dir - the profile directory.
 * @returns the process exit code.
 */
function listPlugins(profile: string, dir: string): number {
  const builtIn = [...PROFILE_TEMPLATES[profile]?.bundles ?? []]
  const rows = readProfilePluginRows(NAME, dir, INSTALL_ANCHOR, builtIn)
  if (rows.length === 0) {
    process.stdout.write(`${NAME}: profile ${profile} lists no plugin layers\n`)
    return 0
  }
  for (const row of rows) {
    const locked = row.removable ? '' : '  (shipped)'
    // A shipped layer the profile owns resolves from the profile once a newer
    // copy is installed there, which is what an in-place upgrade does.
    const upgradable = row.updatable && !row.removable ? '  (updatable)' : ''
    process.stdout.write(`${String(row.layer)}\t${row.name}@${row.version ?? 'not installed'}\t${row.source}${locked}${upgradable}\n`)
  }
  return 0
}

/**
 * Resolve one doctor target: an existing package directory, or a package name
 * installed in the profile.
 * @param profile - the profile name, named in the failure diagnostic.
 * @param profileDir - the profile directory.
 * @param target - the argument as written.
 * @returns the absolute package directory.
 * @throws when neither a directory nor an installed package matches.
 */
function resolveDoctorTarget(profile: string, profileDir: string, target: string): string {
  const directory = resolve(target)
  if (existsSync(join(directory, 'package.json'))) return directory
  try {
    return resolveBundleDir(NAME, target, INSTALL_ANCHOR, profileDir)
  } catch (_notInstalled) {
    throw new Error(
      `${NAME}: ${JSON.stringify(target)} is neither a package directory nor an installed package in profile ${profile}`,
    )
  }
}

/**
 * Report one plugin package's DSH-era compatibility.
 * @param profile - the profile name a package-name target resolves within.
 * @param profileDir - the profile directory.
 * @param target - the package name or directory from the command line.
 * @returns 1 when the report found a blocking problem, otherwise 0.
 */
function doctorPlugin(profile: string, profileDir: string, target: string): number {
  const report = doctorPluginPackage(NAME, resolveDoctorTarget(profile, profileDir, target), INSTALL_ANCHOR)
  process.stdout.write(`${report.name}\t${report.verdict}\t${report.dir}\n`)
  for (const finding of report.findings) {
    process.stdout.write(`  ${finding.severity}\t${finding.check}\t${finding.message}\n`)
  }
  if (report.findings.length === 0) {
    process.stdout.write('  no compatibility findings\n')
  }
  return report.verdict === 'unusable' ? 1 : 0
}

/** One parsed exemption command: the exact pair to act on, or a listing. */
interface ExemptionRequest {
  packageVersion: string
  runtimeVersion: string
}

/**
 * Parse and run the launcher's exact-version exemption commands.
 *
 * Only these three verbs are the launcher's; every other argument list stays
 * pnpm's. `--accept-risk` is the operator's acknowledgement that the waived
 * version may crash the application or corrupt data, and a grant may name only
 * the running runtime version, so an approval can never be pre-granted for a
 * future one. Revocation may name a historical runtime, because withdrawing an
 * approval after an upgrade must stay possible.
 * @param profile - the profile name whose compatibility file is read or written.
 * @param args - the subcommand and its arguments, verbatim from argv.
 * @returns the process exit code, or undefined when the arguments are pnpm's.
 */
async function exemptionCommand(profile: string, args: readonly string[]): Promise<number | undefined> {
  const [command, ...rest] = args
  if (command !== 'allow-version' && command !== 'revoke-version' && command !== 'version-exemptions') return undefined
  try {
    let packageVersion: string | undefined
    let runtimeVersion: string | undefined
    let acceptRisk = false
    const remaining = rest.values()
    for (const argument of remaining) {
      if (argument === '--accept-risk' && command === 'allow-version' && !acceptRisk) acceptRisk = true
      else if (argument === '--qilin-version' && runtimeVersion === undefined) runtimeVersion = remaining.next().value
      else if (argument.startsWith('--qilin-version=') && runtimeVersion === undefined) runtimeVersion = argument.slice('--qilin-version='.length)
      else if (!argument.startsWith('-') && packageVersion === undefined) packageVersion = argument
      else throw new Error(`unexpected argument ${JSON.stringify(argument)}`)
    }
    if (command === 'version-exemptions' && rest.length > 0) throw new Error(`usage: ${NAME} plugin version-exemptions`)
    let request: ExemptionRequest | undefined
    if (command !== 'version-exemptions') {
      if (packageVersion === undefined || runtimeVersion === undefined) {
        throw new Error(`usage: ${NAME} plugin ${command} <package@version> --qilin-version <exact>${command === 'allow-version' ? ' --accept-risk' : ''}`)
      }
      request = { packageVersion, runtimeVersion }
    }
    if (command === 'allow-version') {
      process.stderr.write(`${NAME}: warning: allowing incompatible plugin versions can break the application or corrupt data. Approval applies only to the exact package and ${NAME} versions.\n`)
    }
    const dir = resolveProfileDir(profile)
    // A missing profile is initialized so the compatibility file has a home; the
    // grant itself never touches the manifest or the bundle list.
    await mkdir(dir, { recursive: true })
    await withFileLock(join(dir, 'package.json'), async () => {
      if (!existsSync(join(dir, 'package.json'))) initProfile(dir, PROFILE_TEMPLATES[profile]?.bundles ?? DEFAULT_PROFILE_BUNDLES)
      if (request === undefined) {
        const { exemptions, warnings } = readProfileCompatibility(dir)
        for (const warning of warnings) process.stderr.write(`${NAME}: warning: ${warning}\n`)
        process.stdout.write(JSON.stringify(exemptions, undefined, 2) + '\n')
      } else {
        await setProfileVersionExemption(dir, request.packageVersion, request.runtimeVersion, command === 'allow-version', acceptRisk)
        process.stdout.write(`${NAME}: ${command === 'allow-version' ? 'allowed' : 'revoked'} ${request.packageVersion} for ${NAME} ${request.runtimeVersion}\n`)
      }
    }, { waitMs: LOCK_WAIT_MS })
    return 0
  } catch (error) {
    process.stderr.write(`${NAME}: ${String(error)}\n`)
    return 1
  }
}

/**
 * Rewrite relative filesystem specs against the user's invoking directory.
 * pnpm runs with cwd = the profile directory, so a bare `.` or `../plugin`
 * (or their `file:`/`link:` forms) would silently resolve inside the profile
 * — `add .` from a plugin checkout would self-link the profile. Absolute
 * specs, registry names, and every other pnpm argument pass through
 * untouched.
 * @param argument - one pnpm argument, verbatim from argv.
 * @param cwd - the directory `qilin` was invoked from.
 * @returns the argument with a relative path spec anchored to `cwd`.
 */
function anchorPathSpec(argument: string, cwd: string): string {
  const match = /^(?<prefix>(?:file|link):)?(?<path>\.{1,2}(?:[/\\].*)?)$/.exec(argument)
  if (match?.groups?.path === undefined) return argument
  // A bare path stays bare and a prefixed spec keeps its prefix: pnpm's
  // link-vs-copy semantics differ between `file:` and a plain directory
  // path, and the anchor must not change which one the user asked for.
  const prefix = match.groups.prefix ?? ''
  return `${prefix}${resolve(cwd, match.groups.path)}`
}

/**
 * Refuse an install command that names a package the running runtime version
 * rejects, before pnpm writes anything.
 *
 * The check reads the named manifests without installing them, so a rejected
 * package never lands on disk and the version already in use keeps working. The
 * post-install and startup checks still judge what a path or registry lookup
 * cannot: a git or tarball spec, and a bundle component whose peers need the
 * installed tree.
 * @param profile - the profile name the operation runs against.
 * @param dir - the profile directory.
 * @param args - pnpm arguments, before relative path anchoring.
 * @returns the process exit code when the command was refused, otherwise undefined.
 */
async function refuseIncompatibleInstall(profile: string, dir: string, args: readonly string[]): Promise<number | undefined> {
  const refused = await refusedInstallSpecs(
    { profile, dir, installAnchor: INSTALL_ANCHOR, cwd: process.cwd() },
    args,
    { execution: 'cli', lookupTimeoutMs: LOOKUP_TIMEOUT_MS },
  )
  if (refused.warnings.length === 0) return undefined
  process.stderr.write(`\n${NAME}: installation rejected: ${refused.warnings.join('\n')}\n${NAME}: nothing was installed.\n`)
  // The reason names the peers that rejected this runtime, and the remedy names
  // the exact pair, so the user can decide with the risk stated in front of them.
  for (const { name, version, runtimeVersion } of refused.incompatible) {
    process.stderr.write(`${NAME}: to accept the risk, run: ${NAME} plugin --profile ${profile} allow-version ${name}@${version} --qilin-version ${runtimeVersion} --accept-risk\n`)
  }
  return 1
}

/**
 * Run one `qilin plugin` invocation: report or list, grant or revoke one
 * exact-version exemption, or forward to pnpm and reconcile.
 * @param profile - the profile name.
 * @param args - the subcommand and its arguments, or pnpm arguments with relative path specs anchored to the invoking directory.
 * @returns the process exit code, or 1 when a report, an exemption, or the reconcile refused the profile.
 */
export async function runPlugin(profile: string, args: readonly string[]): Promise<number> {
  const dir = resolveProfileDir(profile)
  // The launcher's own verbs read the profile and never initialize it or run pnpm.
  if (args[0] === 'list') return listPlugins(profile, dir)
  if (args[0] === 'doctor') {
    try {
      return doctorPlugin(profile, dir, args[1] as string)
    } catch (error) {
      process.stderr.write(`${(error as Error).message}\n`)
      return 1
    }
  }
  const exemption = await exemptionCommand(profile, args)
  if (exemption !== undefined) return exemption
  const refused = await refuseIncompatibleInstall(profile, dir, args)
  if (refused !== undefined) return refused
  if (!existsSync(join(dir, 'package.json'))) {
    const template = PROFILE_TEMPLATES[profile]
    initProfile(dir, template?.bundles ?? DEFAULT_PROFILE_BUNDLES)
    process.stderr.write(`${NAME}: initialized profile ${profile} at ${dir}\n`)
  }
  // A profile whose compatibility file holds records the reader rejected keeps
  // loading (its accepted records still apply), and the operator is told what a
  // rewrite would discard.
  for (const warning of readProfileCompatibility(dir).warnings) process.stderr.write(`${NAME}: warning: ${warning}\n`)
  const before = readProfileManifest(NAME, dir)
  // Windows resolves pnpm through its .cmd shim, which spawn() refuses
  // without a shell since the CVE-2024-27980 hardening.
  const result = spawnSync('pnpm', args.map(argument => anchorPathSpec(argument, process.cwd())), {
    cwd: dir,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.error !== undefined) {
    const code = (result.error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') {
      process.stderr.write(`${NAME}: pnpm not found on PATH — install pnpm to manage profile plugins\n`)
      return 127
    }
    throw result.error
  }
  const exitCode = result.status ?? 1
  if (exitCode === 0) {
    try {
      reconcileProfileBundles(NAME, before, dir, INSTALL_ANCHOR)
    } catch (error) {
      // An engine-name collision carries its own operator-facing remedy, so the
      // command reports it rather than unwinding to the top-level handler.
      if (!(error instanceof EngineNameCollisionError)) throw error
      process.stderr.write(`${error.message}\n`)
      return 1
    }
  } else {
    // pnpm's own diagnostics name pnpm-workspace.yaml without saying WHICH
    // one; the profile owns it, and the commonest failure here is pnpm ≥10
    // blocking a git dependency's prepare (build) script until allowlisted.
    process.stderr.write(`${NAME}: pnpm failed in profile directory ${dir}\n`)
    if (args.some(argument => /^git\+|^github:|\.git(?:#|$)/.test(argument))) {
      process.stderr.write(
        `${NAME}: git-hosted plugins build on install via their prepare script, which pnpm blocks until allowed — `
        + `add the exact key pnpm printed above under allowBuilds in ${join(dir, 'pnpm-workspace.yaml')}, then re-run\n`,
      )
    }
  }
  return exitCode
}
