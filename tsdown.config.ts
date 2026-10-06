import { defineConfig } from 'tsdown'
import { typertPlugin } from './packages/typert/generator/lib/types/tsdown-plugin.js'

function isBuildFaceClient(value: unknown): boolean {
  if (value === undefined || value === 'host') return false
  if (value === 'client') return true
  throw new Error(`tsdown: --env.QILIN_BUILD_FACE must be host or client, received ${String(value)}`)
}

/**
 * The ordinary workspace build consumes JavaScript emitted by the Host
 * TypeScript project and runs Typert. The Client pass selects packages that
 * declare a browser bundle and lets their package-local configs emit both
 * their Node loader entry and browser artifact.
 *
 * The host entry glob is load-bearing for every package WITHOUT a
 * package-local config: without it such a package emits no `lib/index.js`
 * at all, and the gap only shows on a fresh clone (a tree with stale
 * artifacts keeps running old bundles — the failure mode issue #9 logged).
 * `scripts/verify-declared-entrypoints.ts` fails the build when a declared
 * artifact is still missing, so this line cannot quietly disappear again.
 */
export default defineConfig(({ env }) => {
  const client = isBuildFaceClient(env?.QILIN_BUILD_FACE)
  return {
    workspace: ['vendor/*', 'packages/*/*', 'apps/cli'],
    entry: client ? '' : ['lib/types/{index,startup}.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
    plugins: client ? [] : [typertPlugin({ mode: 'workspace', faces: ['host'] })],
  }
})
