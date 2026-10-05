import { defineConfig } from 'tsdown'

/**
 * Both entries import src/types.ts (the browser-safe subpath), so a
 * multi-entry build emits a shared chunk the package's exact `files`
 * whitelist omits; separate builds inline it.
 */
export default defineConfig([
  {
    entry: ['lib/types/index.js'],
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
  {
    outDir: 'lib',
    format: ['esm'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
])
