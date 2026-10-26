/**
 * Build-output-guard behavior on real temporary workspaces: the pass's own
 * Typert artifacts are tolerated, while other `lib/` loads and unresolved
 * workspace imports stay rejected with the source a paths alias should map.
 */

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'
import { findBuildOutputLoads, findUnresolvedWorkspaceImports } from '../src/build-output-guard.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

/** One workspace with a provider package publishing Typert and types subpaths. */
function workspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'typert-guard-'))
  roots.push(root)
  const provider = join(root, 'packages', 'provider')
  const consumer = join(root, 'packages', 'consumer')
  mkdirSync(join(provider, 'src'), { recursive: true })
  mkdirSync(join(consumer, 'src'), { recursive: true })
  writeFileSync(join(provider, 'package.json'), `${JSON.stringify({
    name: '@fixture/provider',
    version: '0.0.0',
    type: 'module',
    exports: {
      './remote': { types: './lib/typert.remote-client.d.ts', default: './lib/typert.remote-client.js' },
      './types': { types: './lib/types/types.d.ts', default: './lib/types/types.js' },
    },
  }, null, 2)}\n`)
  writeFileSync(join(consumer, 'package.json'), `${JSON.stringify({ name: '@fixture/consumer', version: '0.0.0', type: 'module' }, null, 2)}\n`)
  // A junction keeps the workspace-package link the unresolved guard follows; junctions need no elevation.
  mkdirSync(join(consumer, 'node_modules', '@fixture'), { recursive: true })
  symlinkSync(provider, join(consumer, 'node_modules', '@fixture', 'provider'), process.platform === 'win32' ? 'junction' : 'dir')
  return root
}

function writeSources(root: string, typedSource: boolean, lib: boolean): void {
  const provider = join(root, 'packages', 'provider')
  writeFileSync(join(provider, 'src', 'index.ts'), 'export const provider = true\n')
  if (typedSource) writeFileSync(join(provider, 'src', 'types.ts'), 'export type ProviderTag = true\n')
  if (lib) {
    mkdirSync(join(provider, 'lib', 'types'), { recursive: true })
    writeFileSync(join(provider, 'lib', 'typert.remote-client.d.ts'), 'export declare const remote: true\n')
    writeFileSync(join(provider, 'lib', 'types', 'types.d.ts'), 'export type ProviderTag = true\n')
  }
}

function consumerProgram(root: string, imports: readonly string[]): { program: ts.Program; host: ts.CompilerHost } {
  const consumer = join(root, 'packages', 'consumer')
  writeFileSync(join(consumer, 'src', 'index.ts'), `${imports.map(specifier => `import '${specifier}'\n`).join('')}`)
  const options: ts.CompilerOptions = {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    target: ts.ScriptTarget.ES2022,
    noEmit: true,
    skipLibCheck: true,
  }
  const host = ts.createCompilerHost(options)
  const program = ts.createProgram({ rootNames: [join(consumer, 'src', 'index.ts')], options, host })
  return { program, host }
}

describe('build-output guard', () => {
  it('tolerates Typert artifact loads and artifact subpaths that resolve to nothing, and rejects other lib loads', () => {
    const root = workspace()
    writeSources(root, false, true)
    const { program, host } = consumerProgram(root, ['@fixture/provider/remote', '@fixture/provider/types'])

    const loads = findBuildOutputLoads(program, root, host)
    expect(loads.map(load => load.file.replaceAll('\\', '/'))).toEqual([
      expect.stringContaining('packages/provider/lib/types/types.d.ts'),
    ])
    expect(loads[0]?.importers.map(importer => importer.specifier)).toEqual(['@fixture/provider/types'])
    expect(loads[0]?.source).toBeUndefined()
  })

  it('names the workspace source a rejected lib load compiles from', () => {
    const root = workspace()
    writeSources(root, true, true)
    const { program, host } = consumerProgram(root, ['@fixture/provider/types'])

    const [load] = findBuildOutputLoads(program, root, host)
    expect(load?.source?.replaceAll('\\', '/')).toContain('packages/provider/src/types.ts')
  })

  it('skips unresolved imports of Typert artifact subpaths and reports the rest with a source suggestion', () => {
    const root = workspace()
    writeSources(root, true, false)
    const { program, host } = consumerProgram(root, ['@fixture/provider/remote', '@fixture/provider/types'])

    expect(findBuildOutputLoads(program, root, host)).toEqual([])
    const unresolved = findUnresolvedWorkspaceImports(program, root, host)
    expect(unresolved.map(entry => entry.specifier)).toEqual(['@fixture/provider/types'])
    expect(unresolved[0]?.source?.replaceAll('\\', '/')).toContain('packages/provider/src/types.ts')
  })
})
