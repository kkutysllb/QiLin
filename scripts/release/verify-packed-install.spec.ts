/** Platform-binary selection for the packed-install consumer's native boot binding. */

import { describe, expect, it } from 'vitest'
import { nativeEntryPlatformPackage } from './verify-packed-install.ts'

const manifest = {
  name: 'node-addon-require-builtin',
  optionalDependencies: {
    'node-addon-require-builtin-darwin-arm64': '0.1.6',
    'node-addon-require-builtin-linux-x64-gnu': '0.1.6',
  },
}

describe('nativeEntryPlatformPackage', () => {
  it('names the declared platform package for a glibc linux suffix', () => {
    expect(nativeEntryPlatformPackage(manifest, 'linux-x64-gnu'))
      .toEqual({ packageName: 'node-addon-require-builtin-linux-x64-gnu', version: '0.1.6' })
  })

  it('names the declared platform package for a darwin suffix without a libc part', () => {
    expect(nativeEntryPlatformPackage(manifest, 'darwin-arm64'))
      .toEqual({ packageName: 'node-addon-require-builtin-darwin-arm64', version: '0.1.6' })
  })

  it('rejects a suffix the entry publishes no binary package for', () => {
    expect(() => nativeEntryPlatformPackage(manifest, 'linux-riscv64-gnu'))
      .toThrow('declares no platform package node-addon-require-builtin-linux-riscv64-gnu')
  })
})
