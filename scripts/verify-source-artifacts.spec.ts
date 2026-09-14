import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { findSourcePlaneArtifacts } from './verify-source-artifacts.ts'

const roots: string[] = []

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'qilin-source-artifacts-'))
  roots.push(root)
  for (const [relative, content] of Object.entries(files)) {
    const path = join(root, relative)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  return root
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('findSourcePlaneArtifacts', () => {
  it('rejects emitted JavaScript, maps, and declarations matching source files', () => {
    const root = fixture({
      'packages/core/demo/src/index.ts': 'export const value = 1\n',
      'packages/core/demo/src/index.js': 'export const value = 1\n',
      'packages/core/demo/src/index.d.ts': 'export declare const value: number\n',
      'packages/core/demo/src/index.js.map': '{}\n',
    })

    expect(findSourcePlaneArtifacts(root)).toEqual([
      'packages/core/demo/src/index.d.ts',
      'packages/core/demo/src/index.js',
      'packages/core/demo/src/index.js.map',
    ])
  })

  it('keeps ambient declarations that do not mirror a TypeScript source file', () => {
    const root = fixture({
      'packages/client/demo/src/css-modules.d.ts': "declare module '*.css' {}\n",
      'packages/client/demo/src/vite-env.d.ts': '/// <reference types="vite/client" />\n',
    })

    expect(findSourcePlaneArtifacts(root)).toEqual([])
  })

  it('ignores non-source build output', () => {
    const root = fixture({
      'packages/core/demo/src/nested/worker.mjs': 'export {}\n',
      'packages/core/demo/lib/types/src/index.js': 'export {}\n',
      'packages/core/demo/README.md': '# demo\n',
    })

    expect(findSourcePlaneArtifacts(root)).toEqual(['packages/core/demo/src/nested/worker.mjs'])
  })
})
