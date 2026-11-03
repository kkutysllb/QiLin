/** Resolve build-owned Desktop paths without sharing mutable state across release targets. */

import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

const APP_ROOT = resolve(import.meta.dirname, '..')
const BUILD_ROOT = join(APP_ROOT, '.desktop-build')
const SUPPORTED_TARGETS = new Set(['mac-arm64', 'mac-x64', 'win-x64'])

/** Fixed product directory under the shared artifacts root; one flat level, versions stay in file names. */
export const DESKTOP_ARTIFACTS_PRODUCT = 'QiLin'

/**
 * Resolve the artifacts root every product repository shares, the only place this repository does it.
 * Final release artifacts live there so macOS never registers duplicate bundles from a checkout.
 * @param {NodeJS.ProcessEnv} env - Packaging environment; a relative override resolves against the current directory.
 * @returns {string} Absolute artifacts root: `KK_ARTIFACTS_ROOT` or `$HOME/kk_Projects/.artifacts`.
 */
export function resolveArtifactsRoot(env = process.env) {
  const override = (env.KK_ARTIFACTS_ROOT ?? '').trim()
  return override === '' ? join(homedir(), 'kk_Projects', '.artifacts') : resolve(override)
}

/**
 * Resolve the directory that receives this product's final release artifacts.
 * @param {NodeJS.ProcessEnv} env - Packaging environment.
 * @returns {string} Absolute product artifacts directory: `<root>/QiLin`.
 */
export function resolveDesktopArtifactsDirectory(env = process.env) {
  return join(resolveArtifactsRoot(env), DESKTOP_ARTIFACTS_PRODUCT)
}

/**
 * Resolve the fixed build target selected by a packaging environment.
 * @param {NodeJS.ProcessEnv} env - Packaging environment.
 * @param {NodeJS.Platform} hostPlatform - Build-host platform used when no target override exists.
 * @param {string} hostArch - Build-host architecture used when no target override exists.
 * @returns {'mac-arm64' | 'mac-x64' | 'win-x64'} Supported Desktop target name.
 */
export function resolveDesktopBuildTarget(
  env = process.env,
  hostPlatform = process.platform,
  hostArch = process.arch,
) {
  const platform = env.QILIN_DESKTOP_TARGET_PLATFORM ?? env.npm_config_platform ?? hostPlatform
  const arch = env.QILIN_DESKTOP_TARGET_ARCH ?? env.npm_config_arch
    ?? (platform === 'win32' || platform === 'win' ? 'x64' : hostArch)
  const os = platform === 'darwin' ? 'mac' : platform === 'win32' || platform === 'win' ? 'win' : platform
  const target = `${os}-${arch}`
  if (!SUPPORTED_TARGETS.has(target)) {
    throw new Error(`desktop build paths: unsupported target ${target}`)
  }
  return /** @type {'mac-arm64' | 'mac-x64' | 'win-x64'} */ (target)
}

function assertSupportedTarget(target) {
  if (!SUPPORTED_TARGETS.has(target)) {
    throw new Error(`desktop build paths: unsupported target ${String(target)}`)
  }
}

/**
 * Return the mutable preparation directories owned by one release target and the shared artifact directory.
 * Preparation stays inside the checkout; every packaging mode writes its final artifacts to one product
 * directory, where the mode shows up only as a file-name suffix instead of a deeper path.
 * @param {'mac-arm64' | 'mac-x64' | 'win-x64'} target - Supported Desktop target name.
 * @param {NodeJS.ProcessEnv} env - Packaging environment that names the artifacts root.
 * @returns {{ root: string, artifacts: string, unsignedArtifacts: string, unnotarizedArtifacts: string, runtime: string, packageSet: string, qilin: string, qilinPnpm: string, electron: string, packedQilin: string, packedVendor: string, packedLandlock: string, downloads: string }} Target paths plus the shared immutable download cache.
 */
export function desktopTargetBuildPaths(target, env = process.env) {
  assertSupportedTarget(target)
  const root = join(BUILD_ROOT, 'targets', target)
  const packed = join(root, 'packed')
  const artifacts = resolveDesktopArtifactsDirectory(env)
  return {
    root,
    artifacts,
    unsignedArtifacts: artifacts,
    unnotarizedArtifacts: artifacts,
    runtime: join(root, 'runtime'),
    packageSet: join(root, 'package-set'),
    qilin: join(root, 'qilin'),
    qilinPnpm: join(root, 'qilin-pnpm'),
    electron: join(root, 'electron'),
    packedQilin: join(packed, 'qilin'),
    packedVendor: join(packed, 'vendor'),
    packedLandlock: join(packed, 'landlock'),
    downloads: join(BUILD_ROOT, 'downloads'),
  }
}

/**
 * Return the platform and architecture of the payload one release target prepares.
 * Windows is prepared as x64 only, so this differs from the build host on an arm64 Windows machine.
 * @param {'mac-arm64' | 'mac-x64' | 'win-x64'} target - Supported Desktop target name.
 * @returns {{ platform: 'darwin' | 'win32', arch: 'arm64' | 'x64' }} Platform and architecture of the prepared payload.
 */
export function desktopTargetPlatform(target) {
  assertSupportedTarget(target)
  return {
    platform: /** @type {'darwin' | 'win32'} */ (target === 'win-x64' ? 'win32' : 'darwin'),
    arch: /** @type {'arm64' | 'x64'} */ (target === 'mac-arm64' ? 'arm64' : 'x64'),
  }
}

/**
 * Resolve the paths owned by the target selected in a packaging environment.
 * @param {NodeJS.ProcessEnv} env - Packaging environment.
 * @param {NodeJS.Platform} hostPlatform - Build-host platform used when no target override exists.
 * @param {string} hostArch - Build-host architecture used when no target override exists.
 * @returns {ReturnType<typeof desktopTargetBuildPaths>} Selected target paths.
 */
export function resolveDesktopTargetBuildPaths(
  env = process.env,
  hostPlatform = process.platform,
  hostArch = process.arch,
) {
  return desktopTargetBuildPaths(resolveDesktopBuildTarget(env, hostPlatform, hostArch), env)
}

/**
 * Resolve the primary-runtime directory an unpackaged development launch uses.
 * The build target fixes Windows to x64, so the shell cannot derive this directory from
 * the architecture of the process that launched it.
 * @param {NodeJS.ProcessEnv} env - Packaging environment.
 * @param {NodeJS.Platform} hostPlatform - Build-host platform used when no target override exists.
 * @param {string} hostArch - Build-host architecture used when no target override exists.
 * @returns {string} Primary-runtime directory prepared for the selected target.
 */
export function developmentRuntimeDirectory(
  env = process.env,
  hostPlatform = process.platform,
  hostArch = process.arch,
) {
  return join(resolveDesktopTargetBuildPaths(env, hostPlatform, hostArch).runtime, 'primary-runtime')
}

/**
 * Select the output directory and filename suffix for one packaging mode.
 * Every mode writes to the same product directory; the suffix keeps debugging artifacts distinguishable.
 * @param {{ artifacts: string, unsignedArtifacts: string, unnotarizedArtifacts: string }} paths Target artifact directories.
 * @param {{ unsigned: boolean, skipNotarization: boolean }} mode Validated packaging mode.
 * @returns {{ directory: string, suffix: string }} Matching artifact destination and filename marker.
 */
export function desktopArtifactOutput(paths, mode) {
  if (mode.unsigned) return { directory: paths.unsignedArtifacts, suffix: '-unsigned' }
  if (mode.skipNotarization) return { directory: paths.unnotarizedArtifacts, suffix: '-unnotarized' }
  return { directory: paths.artifacts, suffix: '' }
}
