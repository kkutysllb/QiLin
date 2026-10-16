/** Public qilin commands using the immutable runtime carried by the Desktop installation. */

import { delimiter, dirname, join, resolve } from 'node:path'
import { runCli, type RunCliOptions } from '@qilin-agent/cli/bin'
import { installOfficeEngineResolution, runtimeArchivePath } from './office-engine.ts'

/**
 * Options the Desktop installation hands the ordinary CLI.
 *
 * @param supportDir - Physical Desktop runtime directory containing the primary-runtime payload and Node launchers.
 * @returns the options that put the CLI on the bundled package manager with reserved-profile access.
 */
export function desktopCliOptions(supportDir: string): RunCliOptions {
  return {
    manageDesktopProfile: true,
    packageManager: {
      command: process.execPath,
      args: ['--expose-internals', join(supportDir, 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs')],
      env: {
        ELECTRON_RUN_AS_NODE: '1',
        QILIN_DESKTOP_NODE_EXECUTABLE: process.execPath,
        PATH: join(supportDir, 'bin') + delimiter + (process.env.PATH ?? ''),
      },
    },
  }
}

/**
 * Run the ordinary CLI with the Desktop's bundled package manager and reserved-profile plugin access.
 * @param runtimeDir - Prepared or ASAR-contained production QiLin package tree.
 * @param supportDir - Physical Desktop runtime directory containing the primary-runtime payload
 * and Node launchers; defaults to the runtime directory's sibling.
 * @returns Completion of the selected CLI command; profile plugins own their process lifetime.
 */
export async function runDesktopCli(runtimeDir: string, supportDir: string = join(dirname(runtimeArchivePath(runtimeDir) ?? runtimeDir), 'runtime')): Promise<void> {
  installOfficeEngineResolution(runtimeDir)
  await runCli(desktopCliOptions(supportDir))
}

if (import.meta.main) {
  if (process.platform === 'win32') {
    const { installWindowsCliSignals } = await import('./windows-cli-signals.ts')
    await installWindowsCliSignals()
  }
  const runtimeDir = resolve(import.meta.dirname, '../../../..')
  await runDesktopCli(runtimeDir)
}
