import { defineConfig } from 'tsdown'

/** Build the service and its path-loaded index parse Worker as separate bundles. */
export default defineConfig(({ env }) => env?.QILIN_BUILD_FACE === 'client' ? [] : [
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
    entry: ['lib/types/worker.js'],
    // The Worker starts without the parent's profile resolver, so it carries its whole JavaScript closure; the
    // CommonJS bundle runs from a copied path outside the package, where no `type` field describes the file.
    deps: { alwaysBundle: [/^@qilin-agent\//, /^semver(?:\/|$)/] },
    outDir: 'lib',
    format: ['cjs'],
    platform: 'node',
    target: 'es2024',
    fixedExtension: false,
    dts: false,
    clean: false,
  },
])
