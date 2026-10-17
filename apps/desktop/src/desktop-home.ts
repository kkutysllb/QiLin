/** The Desktop's own Harness home, kept apart from a Web deployment's shared home. */

import { resolveQilinDesktopHome } from '@qilin-agent/home-paths'

/** Environment variable the Harness reads for its home directory. */
const HOME_ENV = 'QILIN_HOME'

/**
 * Point the Harness at the Desktop's own home unless the environment already names one.
 *
 * A Web deployment shares `~/.qilin`; the Desktop owns `~/.qilin-desktop`, so sessions,
 * profiles, and plugin state never mix. Electron's userData directory keeps only the shell's
 * own preferences and Chromium state.
 * @param environment - environment to update in place; the Host and every child inherit it.
 */
export function adoptDesktopHome(environment: NodeJS.ProcessEnv = process.env): void {
  if (environment[HOME_ENV] === undefined || environment[HOME_ENV] === '') {
    environment[HOME_ENV] = resolveQilinDesktopHome(undefined, environment)
  }
}
