import { homedir } from 'node:os'
import { join, resolve, sep } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  desktopTargetBuildPaths,
  desktopTargetPlatform,
  developmentRuntimeDirectory,
  resolveArtifactsRoot,
  resolveDesktopArtifactsDirectory,
  resolveDesktopBuildTarget,
} from '../scripts/desktop-build-paths.mjs'

describe('desktop build paths', () => {
  it('isolates every mutable preparation directory by complete target', () => {
    const arm64 = desktopTargetBuildPaths('mac-arm64', {})
    const x64 = desktopTargetBuildPaths('mac-x64', {})
    const windows = desktopTargetBuildPaths('win-x64', {})
    const mutableKeys = [
      'root',
      'runtime',
      'packageSet',
      'qilin',
      'qilinPnpm',
      'electron',
      'packedQilin',
      'packedVendor',
      'packedLandlock',
    ] as const

    for (const key of mutableKeys) {
      expect(new Set([arm64[key], x64[key], windows[key]]).size).toBe(3)
    }
    expect(arm64.runtime).toContain(join('targets', 'mac-arm64', 'runtime'))
    expect(x64.qilin).toContain(join('targets', 'mac-x64', 'qilin'))
    expect(windows.runtime).toContain(join('targets', 'win-x64', 'runtime'))
  })

  it('writes every packaging mode into the shared product artifacts directory', () => {
    const expected = join(homedir(), 'kk_Projects', '.artifacts', 'QiLin')
    for (const target of ['mac-arm64', 'mac-x64', 'win-x64'] as const) {
      const paths = desktopTargetBuildPaths(target, {})
      expect(paths.artifacts).toBe(expected)
      expect(paths.unsignedArtifacts).toBe(expected)
      expect(paths.unnotarizedArtifacts).toBe(expected)
    }
    expect(resolveDesktopArtifactsDirectory({})).toBe(expected)
  })

  it('overrides the artifacts root with KK_ARTIFACTS_ROOT', () => {
    expect(resolveArtifactsRoot({})).toBe(join(homedir(), 'kk_Projects', '.artifacts'))
    expect(resolveArtifactsRoot({ KK_ARTIFACTS_ROOT: '/tmp/artifacts-test' })).toBe(resolve('/tmp/artifacts-test'))
    expect(resolveDesktopArtifactsDirectory({ KK_ARTIFACTS_ROOT: '/tmp/artifacts-test' }))
      .toBe(join(resolve('/tmp/artifacts-test'), 'QiLin'))
    expect(desktopTargetBuildPaths('mac-arm64', { KK_ARTIFACTS_ROOT: '/tmp/artifacts-test' }).artifacts)
      .toBe(join(resolve('/tmp/artifacts-test'), 'QiLin'))
  })

  it('shares only the immutable upstream download cache', () => {
    const arm64 = desktopTargetBuildPaths('mac-arm64')
    const x64 = desktopTargetBuildPaths('mac-x64')
    expect(arm64.downloads).toBe(x64.downloads)
    expect(arm64.downloads).not.toContain(`${sep}targets${sep}`)
  })

  it('resolves the development primary runtime from the build target rather than the host architecture', () => {
    expect(developmentRuntimeDirectory({}, 'darwin', 'arm64'))
      .toContain(join('targets', 'mac-arm64', 'runtime', 'primary-runtime'))
    expect(developmentRuntimeDirectory({}, 'darwin', 'x64'))
      .toContain(join('targets', 'mac-x64', 'runtime', 'primary-runtime'))
    expect(developmentRuntimeDirectory({}, 'win32', 'arm64'))
      .toContain(join('targets', 'win-x64', 'runtime', 'primary-runtime'))
  })

  it('maps every target to the platform and architecture of the payload it prepares', () => {
    expect(desktopTargetPlatform('mac-arm64')).toEqual({ platform: 'darwin', arch: 'arm64' })
    expect(desktopTargetPlatform('mac-x64')).toEqual({ platform: 'darwin', arch: 'x64' })
    expect(desktopTargetPlatform('win-x64')).toEqual({ platform: 'win32', arch: 'x64' })
    expect(() => desktopTargetPlatform('linux-x64' as 'mac-x64')).toThrow(/unsupported target/u)
  })

  it('resolves environment overrides and rejects unsupported targets', () => {
    expect(resolveDesktopBuildTarget({
      QILIN_DESKTOP_TARGET_PLATFORM: 'darwin',
      QILIN_DESKTOP_TARGET_ARCH: 'x64',
    }, 'darwin', 'arm64')).toBe('mac-x64')
    expect(resolveDesktopBuildTarget({}, 'win32', 'x64')).toBe('win-x64')
    expect(() => resolveDesktopBuildTarget({}, 'linux', 'x64')).toThrow(/unsupported target/u)
    expect(() => desktopTargetBuildPaths('linux-x64' as 'mac-x64')).toThrow(/unsupported target/u)
  })
})
