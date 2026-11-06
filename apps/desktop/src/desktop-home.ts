/** The Desktop's own Harness home, kept apart from a Web deployment's shared home. */

import { resolveQilinDesktopHome } from '@qilin-agent/home-paths'

/** Environment variable the Harness reads for its home directory. */
const HOME_ENV = 'QILIN_HOME'

/**
 * Point the Harness at the Desktop's own home.
 *
 * A Web deployment shares `~/.qilin` and exports its QILIN_HOME into every child it starts, so
 * the desktop product does not defer to that value: it always names `~/.ktoon`, or the directory
 * QILIN_DESKTOP_HOME selects. Electron's userData directory keeps only the shell's own
 * preferences and Chromium state.
 * @param environment - environment to update in place; the Host and every child inherit it.
 */
export function adoptDesktopHome(environment: NodeJS.ProcessEnv = process.env): void {
  environment[HOME_ENV] = resolveQilinDesktopHome(undefined, environment)
}
