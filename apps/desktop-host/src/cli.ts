/** Public qilin commands using the immutable runtime carried by the Desktop installation. */

import { runCli } from '@qilin-agent/cli/bin'

/**
 * Run the ordinary CLI the Desktop installation carries.
 *
 * The upstream host hands this call Desktop's bundled package manager and the reserved-profile access
 * flag; this repository's CLI exposes neither yet, so the call is the plain entry point.
 * @returns Completion of the selected CLI command; profile plugins own their process lifetime.
 */
export async function runDesktopCli(): Promise<void> {
  await runCli()
}

if (import.meta.main) {
  if (process.platform === 'win32') {
    const { installWindowsCliSignals } = await import('./windows-cli-signals.ts')
    await installWindowsCliSignals()
  }
  await runDesktopCli()
}
