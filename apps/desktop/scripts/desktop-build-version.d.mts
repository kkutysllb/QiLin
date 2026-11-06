/** Environment variable that carries the build version through one packaging and upload run. */
export const DESKTOP_BUILD_VERSION_ENV: 'QILIN_DESKTOP_BUILD_VERSION'

/** Environment variable naming the product release version independently of the engine version. */
export const DESKTOP_PRODUCT_VERSION_ENV: 'QILIN_DESKTOP_PRODUCT_VERSION'

/**
 * Resolve the product release version, independent of the engine version.
 * @param env - Packaging or upload environment.
 * @param declaredVersion - Engine version the desktop package manifest declares.
 * @returns The normalized product version.
 */
export function resolveDesktopProductVersion(env: NodeJS.ProcessEnv, declaredVersion: string): string

/**
 * Validate a build version against the product version it extends.
 * @param buildVersion - Version this build publishes.
 * @param productVersion - Version the manifests declare.
 * @returns The version as semver normalizes it, which is what the artifacts will carry.
 */
export function validateDesktopBuildVersion(buildVersion: string, productVersion: string): string

/**
 * Resolve the version a build publishes.
 * @param env - Packaging or upload environment.
 * @param productVersion - Version the manifests declare.
 * @returns The build version when one is present, otherwise the product version.
 */
export function resolveDesktopBuildVersion(env: NodeJS.ProcessEnv, productVersion: string): string

/**
 * Everything a build version carries before its date, including the trailing separator.
 * @param productVersion - Version the manifests declare.
 * @returns The prefix shared by every build version of that product version.
 */
export function desktopBuildVersionPrefix(productVersion: string): string
