/** The Desktop's own Harness home, kept apart from a Web deployment's shared home. */

/** Environment variable the Harness reads for its home directory. */
const HOME_ENV = 'QILIN_HOME'

/**
 * Point the Harness at this installation's data directory unless the environment already names one.
 *
 * A Web deployment shares `~/.qilin`; the Desktop owns its own directory under the operating
 * system's application-data location, so sessions, profiles, and plugin state never mix.
 * @param userData - Electron's userData directory for this application.
 * @param environment - environment to update in place; the Host and every child inherit it.
 */
export function adoptDesktopHome(userData: string, environment: NodeJS.ProcessEnv = process.env): void {
  if (environment[HOME_ENV] === undefined || environment[HOME_ENV] === '') environment[HOME_ENV] = userData
}
