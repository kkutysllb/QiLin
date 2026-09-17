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
      ['@qilin/cli', packed('@qilin/cli', {
        dependencies: { '@qilin/base': '^1.0.0', external: '^2.0.0' },
        optionalDependencies: { '@qilin/desktop-host': '1.0.0', '@deepseek-ai/missing-platform': '1.0.0' },
      })],
      ['@qilin/desktop-host', packed('@qilin/desktop-host', {
        dependencies: { '@qilin/cli': '^1.0.0' },
      })],
      ['@qilin/base', packed('@qilin/base', {
        peerDependencies: { '@qilin/kylin': '^1.0.0' },
      })],
      ['@qilin/kylin', packed('@qilin/kylin')],
      ['@qilin/desktop-host', packed('@qilin/desktop-host')],
      ['@deepseek-ai/unused', packed('@deepseek-ai/unused')],
    ])
    expect(selectDesktopPackageClosure(available).map(entry => entry.manifest.name)).toEqual([
      '@qilin/kylin',
      '@deepseek-ai/platform-package',
      '@qilin/base',
      '@qilin/cli',
      '@qilin/desktop-host',
    ])
  })

  it.each([
    '@qilin/base', '@qilin/kylin', '@deepseek-ai/node-addon-system',
  ])('rejects required prepared package %s absent from the packed release inputs', (dependency) => {
    const available = new Map<string, PackedDesktopPackage>([
      ['@qilin/cli', packed('@qilin/cli', {
        dependencies: { [dependency]: '^1.0.0' },
      })],
      ['@qilin/desktop-host', packed('@qilin/desktop-host', {
        dependencies: { '@qilin/cli': '^1.0.0' },
      })],
    ])
    expect(() => selectDesktopPackageClosure(available)).toThrow(/unpacked package/u)
    expect(() => selectDesktopPackageClosure(new Map([
      ['@qilin/cli', packed('@qilin/cli')],
    ]))).toThrow(/omit @qilin\/desktop-host/u)
  })

  it('leaves independently published Office packages to npm resolution', () => {
    const available = new Map<string, PackedDesktopPackage>([
      ['@qilin/cli', packed('@qilin/cli', {
        dependencies: {
          '@deepseek-ai/libreoffice-kit': '0.0.1',
          '@deepseek-ai/libreoffice-kit-wasm': '0.0.1',
        },
      })],
      ['@qilin/desktop-host', packed('@qilin/desktop-host')],
    ])
    expect(selectDesktopPackageClosure(available).map(entry => entry.manifest.name)).toEqual([
      '@qilin/cli', '@qilin/cli',
    ])
  })

  it('requires the Desktop Host entry', () => {
    const files = [
      'package/lib/index.js',
    ]
    expect(() => {
      assertDesktopHostPackageFiles(files)
    }).not.toThrow()
    expect(() => {
      assertDesktopHostPackageFiles(files.slice(1))
    }).toThrow(/lib\/index\.js/u)
  })
})
