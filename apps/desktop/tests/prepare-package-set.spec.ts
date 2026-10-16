import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertDesktopHostPackageFiles,
  selectDesktopPackageClosure,
  type PackedDesktopPackage,
} from '../scripts/prepare-package-set.ts'

function packed(name: string, manifest: Record<string, unknown> = {}): PackedDesktopPackage {
  return { tarball: `${name}.tgz`, manifest: { name, version: '1.0.0', ...manifest } }
}

describe('desktop package-set selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not select a packaging target when imported as a library', async () => {
    vi.stubEnv('QILIN_DESKTOP_TARGET_PLATFORM', 'linux')
    vi.stubEnv('QILIN_DESKTOP_TARGET_ARCH', 'x64')
    vi.resetModules()
    await expect(import('../scripts/prepare-package-set.ts')).resolves.toHaveProperty('prepareDesktopPackageSet')
  })

  it('includes only the available internal production closure', () => {
    const available = new Map<string, PackedDesktopPackage>([
      ['@qilin-agent/cli', packed('@qilin-agent/cli', {
        dependencies: { '@qilin-agent/base': '^1.0.0', external: '^2.0.0' },
        optionalDependencies: { '@deepseek-ai/platform-package': '1.0.0', '@deepseek-ai/missing-platform': '1.0.0' },
      })],
      ['@qilin-agent/desktop-host', packed('@qilin-agent/desktop-host', {
        dependencies: { '@qilin-agent/cli': '^1.0.0' },
      })],
      ['@qilin-agent/base', packed('@qilin-agent/base', {
        peerDependencies: { '@qilin-agent/kylin': '^1.0.0' },
      })],
      ['@qilin-agent/kylin', packed('@qilin-agent/kylin')],
      ['@deepseek-ai/platform-package', packed('@deepseek-ai/platform-package')],
      ['@deepseek-ai/unused', packed('@deepseek-ai/unused')],
    ])
    expect(selectDesktopPackageClosure(available).map(entry => entry.manifest.name)).toEqual([
      '@qilin-agent/kylin',
      '@qilin-agent/cli',
      '@qilin-agent/base',
      '@qilin-agent/desktop-host',
      '@deepseek-ai/platform-package',
    ])
  })

  it.each([
    '@qilin-agent/base', '@qilin-agent/kylin', '@qilin-agent/node-addon-system-workspace',
  ])('rejects required prepared package %s absent from the packed release inputs', (dependency) => {
    const available = new Map<string, PackedDesktopPackage>([
      ['@qilin-agent/cli', packed('@qilin-agent/cli', {
        dependencies: { [dependency]: '^1.0.0' },
      })],
      ['@qilin-agent/desktop-host', packed('@qilin-agent/desktop-host', {
        dependencies: { '@qilin-agent/cli': '^1.0.0' },
      })],
    ])
    expect(() => selectDesktopPackageClosure(available)).toThrow(/unpacked package/u)
    expect(() => selectDesktopPackageClosure(new Map([
      ['@qilin-agent/cli', packed('@qilin-agent/cli')],
    ]))).toThrow(/omit @deepseek-ai\/dsh-desktop-host/u)
  })

  it('leaves independently published Office packages to npm resolution', () => {
    const available = new Map<string, PackedDesktopPackage>([
      ['@qilin-agent/cli', packed('@qilin-agent/cli', {
        dependencies: {
          '@qilin-agent/libreoffice-kit': '0.0.1',
          '@qilin-agent/libreoffice-kit-wasm': '0.0.1',
        },
      })],
      ['@qilin-agent/desktop-host', packed('@qilin-agent/desktop-host')],
    ])
    expect(selectDesktopPackageClosure(available).map(entry => entry.manifest.name)).toEqual([
      '@qilin-agent/cli', '@qilin-agent/desktop-host',
    ])
  })

  it('requires both Desktop Host and public CLI entries', () => {
    const files = [
      'package/lib/index.js',
      'package/lib/cli.js',
    ]
    expect(() => {
      assertDesktopHostPackageFiles(files)
    }).not.toThrow()
    expect(() => {
      assertDesktopHostPackageFiles(files.slice(1))
    }).toThrow(/lib\/index\.js/u)
    expect(() => { assertDesktopHostPackageFiles(files.slice(0, 1)) }).toThrow(/lib\/cli\.js/u)
  })
})
