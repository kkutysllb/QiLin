/**
 * The Remote-assembly gate: the assembly's own imports and `$mount` list decide,
 * a self-mounting Client source is credited, and a face nobody mounts fails.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  assemblyImportProblems,
  readAssemblyMounts,
  remotePackages,
  selfMountedPackages,
  unmountedFaces,
  verifyRemoteAssembly,
} from './verify-remote-assembly.ts'

/** A minimal assembly body exercising the mount call the gate anchors on. */
const ASSEMBLY = `
import alphaRemote from '@qilin-agent/alpha/remote'
import betaRemote from '@qilin-agent/beta/remote'
export async function apply(ctx) {
  for (const contribution of [
    alphaRemote,
  ]) {
    await ctx.remote.$mount(contribution)
  }
}
`

describe('assembly imports versus its contribution list', () => {
  it('reads every value import and the identifiers it actually mounts', () => {
    const mounts = readAssemblyMounts(ASSEMBLY)
    expect([...mounts.imports]).toEqual([
      ['alphaRemote', '@qilin-agent/alpha'],
      ['betaRemote', '@qilin-agent/beta'],
    ])
    expect(mounts.contributions).toEqual(['alphaRemote'])
  })

  it('rejects an import the contribution list drops', () => {
    expect(assemblyImportProblems(readAssemblyMounts(ASSEMBLY)))
      .toEqual(['assembly imports @qilin-agent/beta/remote as betaRemote but never mounts it'])
  })

  it('rejects a listed identifier with no matching import', () => {
    const source = ASSEMBLY.replace('    alphaRemote,', '    alphaRemote,\n    ghostRemote,')
    expect(assemblyImportProblems(readAssemblyMounts(source)))
      .toContain('assembly lists ghostRemote but imports no /remote face as that name')
  })
})

describe('self-mounting Client sources', () => {
  it('credits a package imported beside a real mount call', () => {
    const files = [{
      path: 'packages/experimental/client-ui-voice-input/src/client/mount.ts',
      source: "import type {} from '@qilin-agent/experimental-api-speech-to-text/remote'\nawait ctx.remote.$mount(contribution)",
    }]
    expect([...selfMountedPackages(files)]).toEqual(['@qilin-agent/experimental-api-speech-to-text'])
  })

  it('never credits the shared assembly itself', () => {
    const files = [{ path: 'packages/api/remotes/src/client/index.ts', source: ASSEMBLY }]
    expect([...selfMountedPackages(files)]).toEqual([])
  })

  it('ignores a source that only reads a namespace', () => {
    const files = [{
      path: 'packages/client/ui-agent-opens/src/client/index.ts',
      source: "import type {} from '@qilin-agent/sidebar-opens/remote'\nawait ctx.remote.sidebarOpens.watch(id, signal)",
    }]
    expect([...selfMountedPackages(files)]).toEqual([])
  })
})

describe('unmounted faces', () => {
  it('reports the face no runtime mounts', () => {
    const packages = [{ name: '@qilin-agent/alpha', dir: 'packages/api/alpha' }, { name: '@qilin-agent/gamma', dir: 'packages/host/gamma' }]
    const mounts = readAssemblyMounts("import alphaRemote from '@qilin-agent/alpha/remote'\nfor (const contribution of [\n alphaRemote,\n]) {\n await ctx.remote.$mount(contribution)\n}")
    expect(unmountedFaces(packages, mounts, new Set())).toEqual(['@qilin-agent/gamma'])
  })
})

describe('this repository', () => {
  it('mounts every published Remote face', () => {
    expect(verifyRemoteAssembly()).toEqual([])
  })

  it('rejects this repository once the assembly drops a face it mounts today', () => {
    const source = readFileSync(new URL('../packages/api/remotes/src/client/index.ts', import.meta.url), 'utf8')
    const dropped = source.replace('      sidebarOpensRemote,\n', '')
    expect(dropped).not.toBe(source)
    expect(assemblyImportProblems(readAssemblyMounts(dropped)))
      .toContain('assembly imports @qilin-agent/sidebar-opens/remote as sidebarOpensRemote but never mounts it')
  })

  it('scanned a non-empty roster', () => {
    expect(remotePackages().length).toBeGreaterThanOrEqual(20)
  })
})
