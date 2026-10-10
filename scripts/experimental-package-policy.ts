/** Experimental package identities, plugin record namespace, and publication policy. */

/** npm namespace for every experimental package in this fork. */
export const EXPERIMENTAL_PACKAGE_NAME_PREFIX = '@qilin-agent/experimental-'

/**
 * Identify an experimental npm package independently of its installed directory.
 * This fork renames every experimental capability to the experimental prefix, so the name alone decides:
 * no capability retains a non-prefixed npm name.
 * @param name - complete npm package name, without a version or subpath.
 * @returns Whether the name uses the experimental prefix.
 */
export function isExperimentalPackageName(name: string): boolean {
  return name.startsWith(EXPERIMENTAL_PACKAGE_NAME_PREFIX)
}

/**
 * Derive the package-owned plugin record namespace without changing persisted names.
 * @param name - complete experimental npm package name.
 * @returns Capability suffix, or undefined for a non-experimental name.
 */
export function experimentalPackageRecordNamespace(name: string): string | undefined {
  return isExperimentalPackageName(name) ? name.slice(EXPERIMENTAL_PACKAGE_NAME_PREFIX.length) : undefined
}

/** Experimental packages excluded from public releases and npm baselines. */
export const PRIVATE_EXPERIMENTAL_PACKAGE_DIRECTORIES: readonly string[] = []

/**
 * Whether an experimental package publishes under the default-public policy.
 * @param directory - repository-relative package directory.
 * @param privateDirectories - experimental directories excluded from publication.
 * @returns Whether the package publishes with the qilin family.
 */
export function isPublicExperimentalPackageDirectory(
  directory: string,
  privateDirectories: readonly string[] = PRIVATE_EXPERIMENTAL_PACKAGE_DIRECTORIES,
): boolean {
  return /^packages\/experimental\/[^/]+$/.test(directory)
    && !privateDirectories.includes(directory)
}
