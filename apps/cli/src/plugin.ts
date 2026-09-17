/**
 * `qilin plugin [--profile <name>] <args...>` — profile plugin management.
 *
 * `list` and `doctor` are the launcher's own verbs and never mutate anything:
 * `list` prints the profile's bundle layers, and `doctor` reports one plugin
 * package's DSH-era compatibility. Every other argument list forwards to pnpm
 * in the profile directory: initialize the profile on first use, run
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
import { join, resolve } from 'node:path'
import {
  DEFAULT_PROFILE_BUNDLES,
  doctorPluginPackage,
  EngineNameCollisionError,
  initProfile,
  PROFILE_TEMPLATES,
  readProfileManifest,
  readProfilePluginRows,
  reconcileProfileBundles,
  resolveBundleDir,
  resolveProfileDir,
} from '@qilin/app-boot'
import { INSTALL_ANCHOR } from './profile-boot.ts'

const NAME = 'qilin'

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
    process.stdout.write(`${String(row.layer)}\t${row.name}@${row.version ?? 'not installed'}\t${row.source}${locked}\n`)
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
 * Run one `qilin plugin` invocation: report or list, or forward to pnpm and reconcile.
 * @param profile - the profile name.
 * @param args - the subcommand and its argument, or pnpm arguments with relative path specs anchored to the invoking directory.
 * @returns the process exit code, or 1 when a report or the reconcile refused the profile.
 */
export function runPlugin(profile: string, args: readonly string[]): number {
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
  if (!existsSync(join(dir, 'package.json'))) {
    const template = PROFILE_TEMPLATES[profile]
    initProfile(dir, template?.bundles ?? DEFAULT_PROFILE_BUNDLES)
    process.stderr.write(`${NAME}: initialized profile ${profile} at ${dir}\n`)
  }
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
