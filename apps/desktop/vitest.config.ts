/**
 * Desktop test lane.
 *
 * Runs the desktop suite with the repository's tsconfig path aliases, minus the
 * suites that need Windows or macOS packaging toolchains, signing and
 * notarization credentials, publication credentials, an icon render toolchain,
 * or a linked development workspace. Those run in the environment that owns them,
 * and the suites able to decide for themselves keep their own skip guards.
 */
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['../../tsconfig.base.json'] })],
  test: {
    include: ['tests/**/*.spec.ts', 'tests/**/*.spec.tsx'],
    exclude: [
      '**/node_modules/**',
      '**/lib/**',
      'tests/macos-*.spec.ts',
      'tests/windows-*.spec.ts',
      'tests/installed-update-*.spec.ts',
      'tests/installer-packaging.spec.ts',
      'tests/packaged-runtime-verification.spec.ts',
      'tests/development-project.spec.ts',
      'tests/desktop-publication-*.spec.ts',
      'tests/upload-*.spec.ts',
      'tests/cos-operation.spec.ts',
      'tests/tray-icon.spec.ts',
      'tests/prepare-*.spec.ts',
      'tests/runtime-preparation.spec.ts',
      'tests/core-package-set.spec.ts',
      'tests/shell-file-selection.spec.ts',
      'tests/desktop-package-environment.spec.ts',
      'tests/desktop-build-paths.spec.ts',
      'tests/main-startup.spec.ts',
    ],
    environment: 'node',
    testTimeout: 30_000,
  },
})
