/** Legacy profile-link inspection shared by the disk materializer and runtime resolver. */

import { existsSync, lstatSync, readdirSync, readlinkSync, realpathSync, rmSync, unlinkSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'

/** Profile-private package links projected into its pnpm-managed node_modules. */
export const PROFILE_MODULE_FALLBACK_DIR = '.qilin-module-fallback'

/**
 * Return whether the process reads application modules from pkg's virtual filesystem.
 * @returns whether pkg owns the module filesystem.
 */
export function isPackagedExecutable(): boolean {
  return (process as NodeJS.Process & { pkg?: unknown }).pkg !== undefined
}

/**
 * Resolve a directory through the active carrier's filesystem implementation.
 * @param path - directory path to canonicalize.
 * @returns the canonical directory path.
 */
export function realModuleDirectory(path: string): string {
  return isPackagedExecutable() ? realpathSync(path) : realpathSync.native(path)
}

/**
 * Resolve a link target without following the final path component.
 * @param path - candidate path whose parent is canonicalized.
 * @returns the canonical candidate, or undefined when its parent is absent.
 */
export function canonicalLinkPath(path: string): string | undefined {
  try {
    return join(realModuleDirectory(dirname(path)), basename(path))
  } catch (error) {
    // A missing parent means the candidate cannot identify an existing owned link.
    /* v8 ignore next 2 -- a non-ENOENT realpath failure requires a host filesystem fault */
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    /* v8 ignore next -- see the host-filesystem exception above */
    throw error
  }
}

/**
 * Return whether a symlink or junction points at the same path as `target`.
 * @param link - symlink or junction to inspect.
 * @param target - expected target path.
 * @returns whether both paths identify the same entry.
 */
export function symlinkPointsTo(link: string, target: string): boolean {
  const actual = resolve(dirname(link), readlinkSync(link))
  const canonicalActual = canonicalLinkPath(actual)
  const canonicalTarget = canonicalLinkPath(resolve(target))
  return canonicalActual !== undefined && canonicalActual === canonicalTarget
}

/**
 * Return whether an observed profile package must not claim local precedence.
 * @param profileDir - profile directory containing the package projection.
 * @param packageName - bare package name to inspect.
 * @returns whether the entry is a managed fallback link or disappeared during inspection.
 */
export function isProfileModuleFallbackLink(profileDir: string, packageName: string): boolean {
  const link = join(profileDir, 'node_modules', packageName)
  const target = join(profileDir, PROFILE_MODULE_FALLBACK_DIR, 'node_modules', packageName)
  try {
    return lstatSync(link).isSymbolicLink() && symlinkPointsTo(link, target)
  } catch (error) {
    /* v8 ignore next 2 -- a vanished candidate cannot claim local precedence */
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return true
    /* v8 ignore next -- non-ENOENT lstat/readlink failures require a host filesystem fault */
    throw error
  }
}

/**
 * Remove the package projections a link-backend launch left in a profile.
 * Only symlinks under the profile's node_modules pointing inside the profile's
 * fallback directory are unlinked, then that directory is removed; pnpm-installed
 * packages and every other symlink stay. A profile without the directory is untouched.
 * @param dir - the profile directory.
 */
export function removeLinkProjections(dir: string): void {
  const owned = join(dir, PROFILE_MODULE_FALLBACK_DIR)
  if (!existsSync(owned)) return
  const ownedModules = canonicalLinkPath(join(owned, 'node_modules'))
  if (ownedModules !== undefined) {
    for (const link of profileLinkCandidates(join(dir, 'node_modules'))) {
      const target = canonicalLinkPath(resolve(dirname(link), readlinkSync(link)))
      if (target !== undefined && (target === ownedModules || target.startsWith(ownedModules + sep))) unlinkSync(link)
    }
  }
  rmSync(owned, { recursive: true, force: true })
}

/** Top-level and scoped entries under a node_modules directory that are symlinks or junctions. */
export function profileLinkCandidates(modules: string): string[] {
  const links: string[] = []
  if (!existsSync(modules)) return links
  for (const entry of readdirSync(modules, { withFileTypes: true })) {
    const path = join(modules, entry.name)
    if (entry.isSymbolicLink()) {
      links.push(path)
    } else if (entry.name.startsWith('@') && entry.isDirectory()) {
      for (const child of readdirSync(path, { withFileTypes: true })) {
        if (child.isSymbolicLink()) links.push(join(path, child.name))
      }
    }
  }
  return links
}
