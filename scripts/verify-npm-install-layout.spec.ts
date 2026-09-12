import { describe, expect, it } from 'vitest'
import type { NpmPackageLock, RegistryIndex } from './benchmark-npm-resolution.ts'
import {
  assertDualQilinInstallLayout,
  buildDualQilinRegistry,
} from './verify-npm-install-layout.ts'

function validLayout(): NpmPackageLock {
  return {
    lockfileVersion: 3,
    packages: {
      '': { dependencies: { '@qilin/cli': '0.2.0', 'qilin-previous': 'npm:@qilin/cli@0.1.0' } },
      'node_modules/@deepseek-ai/cordis': { version: '4.0.1' },
      'node_modules/@qilin/cli': {
        version: '0.2.0',
        dependencies: { '@qilin/child': '^0.2.0' },
        peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
      },
      'node_modules/@qilin/child': {
        version: '0.2.0',
        dependencies: { '@qilin/leaf': '^0.2.0' },
      },
      'node_modules/@qilin/leaf': { version: '0.2.0' },
      'node_modules/qilin-previous': {
        name: '@qilin/cli',
        version: '0.1.0',
        dependencies: { '@qilin/child': '^0.1.0' },
        peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
      },
      'node_modules/qilin-previous/node_modules/@qilin/child': {
        version: '0.1.0',
        dependencies: { '@qilin/leaf': '^0.1.0' },
      },
      'node_modules/qilin-previous/node_modules/@qilin/leaf': { version: '0.1.0' },
    },
  }
}

describe('npm install layout verifier', () => {
  it('creates two incompatible versions of every QILIN package', () => {
    const index: RegistryIndex = new Map([
      ['@qilin/cli', new Map([['0.1.1-rc.2', {
        name: '@qilin/cli',
        version: '0.1.1-rc.2',
        dependencies: { '@qilin/child': '^0.1.1-rc.2' },
        peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
      }]])],
      ['@qilin/child', new Map([['0.1.1-rc.2', {
        name: '@qilin/child',
        version: '0.1.1-rc.2',
      }]])],
      ['@deepseek-ai/cordis', new Map([['4.0.1', {
        name: '@deepseek-ai/cordis',
        version: '4.0.1',
      }]])],
    ])

    const dual = buildDualQilinRegistry(index, '0.1.1-rc.2')

    expect([...dual.get('@qilin/cli')?.keys() ?? []]).toEqual(['0.1.0', '0.2.0'])
    expect(dual.get('@qilin/cli')?.get('0.1.0')).toMatchObject({
      version: '0.1.0',
      dependencies: { '@qilin/child': '^0.1.0' },
      peerDependencies: { '@deepseek-ai/cordis': '^4.0.1' },
    })
    expect(dual.get('@qilin/cli')?.get('0.2.0')).toMatchObject({
      version: '0.2.0',
      dependencies: { '@qilin/child': '^0.2.0' },
    })
    expect(dual.get('@deepseek-ai/cordis')).toBe(index.get('@deepseek-ai/cordis'))
  })

  it('accepts isolated QILIN releases with one shared Cordis installation', () => {
    expect(assertDualQilinInstallLayout(validLayout())).toEqual({
      qilinPackagesPerVersion: 3,
      checkedQilinEdges: 4,
    })
  })

  it.each([
    ['react', 'node_modules/react'],
    ['react-dom', 'node_modules/react-dom'],
    ['react', 'node_modules/qilin-previous/node_modules/react'],
    ['react-dom', 'node_modules/qilin-previous/node_modules/react-dom'],
  ])('rejects browser runtime %s installed at %s in the QILIN-only consumer', (name, path) => {
    const layout = validLayout()
    const packages = { ...layout.packages, [path]: { version: '18.3.1' } }
    expect(() => assertDualQilinInstallLayout({ ...layout, packages })).toThrow(
      `${path}: ${name} is a browser build input`,
    )
  })

  it('rejects an internal edge that crosses release versions', () => {
    const layout = validLayout()
    const packages = { ...layout.packages }
    Reflect.deleteProperty(packages, 'node_modules/qilin-previous/node_modules/@qilin/leaf')

    expect(() => assertDualQilinInstallLayout({ ...layout, packages })).toThrow(
      'node_modules/qilin-previous/node_modules/@qilin/child: dependencies '
      + '@qilin/leaf resolves to node_modules/@qilin/leaf@0.2.0, expected 0.1.0',
    )
  })

  it('rejects a second Cordis installation', () => {
    const layout = validLayout()
    const packages = {
      ...layout.packages,
      'node_modules/qilin-previous/node_modules/@deepseek-ai/cordis': { version: '4.0.1' },
    }

    expect(() => assertDualQilinInstallLayout({ ...layout, packages })).toThrow(
      'expected one shared @deepseek-ai/cordis',
    )
  })
})
