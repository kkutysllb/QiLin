#!/usr/bin/env node
/**
 * Command-line entry for qilin.
 * @module @qilin-agent/cli/bin
 */

/* v8 ignore file -- built-bin acceptance exercises this self-executing dispatch. */

import { getQilinRuntimeVersion, loadLayeredEnv, StartupError } from '@qilin-agent/app-boot'
import { resolveQilinHome } from '@qilin-agent/home-paths'
import { parseQilinArgs } from './args.ts'
import type { RunProfileOptions } from './profile-boot.ts'
import { installSchedulerYield } from './scheduler-yield.ts'
import { reportStartupFailure } from './startup-diagnostics.ts'

// Installed at the entry, ahead of every mode module, so anything loaded into
// this process can read the global; see scheduler-yield.ts for the guarantee.
installSchedulerYield()

/** Installation-owned dependencies supplied by a packaged CLI launcher. */
export type RunCliOptions = Pick<RunProfileOptions, 'packageManager'> & {
  /** Permit plugin commands for the Desktop's installed profile; reserved for its installed carrier. */
  manageDesktopProfile?: boolean
}

/**
 * Run the public qilin command-line interface.
 * @returns a promise that settles when the selected command mode finishes.
 */
export async function runCli(options: RunCliOptions = {}): Promise<void> {
  const version = getQilinRuntimeVersion()
  const { manageDesktopProfile, ...profileOptions } = options
  const invocation = parseQilinArgs(process.argv.slice(2), version, manageDesktopProfile)

  switch (invocation.mode) {
    case 'profile': {
      // A profile that serves a browser address is a deployment: one public
      // address, one supervisor, one runtime per account. A process the
      // supervisor started carries the tenant marker and boots the application
      // itself, and the desktop shell boots through profile-boot instead of
      // here, so it keeps serving one account directly.
      const { ENTRY_PROFILES, isWebEntry, runWebEntry } = await import('./web-entry.ts')
      if (ENTRY_PROFILES.includes(invocation.profile) && isWebEntry()) {
        try {
          process.exitCode = await runWebEntry({
            args: invocation.args,
            profile: invocation.profile,
            patches: invocation.patches,
            fromDefaultProfile: invocation.fromDefaultProfile,
          })
        } catch (error) {
          // A flag the deployment cannot honour stops the process with the
          // reason, exactly as the served application's own usage errors do.
          process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
          process.exit(1)
        }
        break
      }
      const { runProfile } = await import('./profile-boot.ts')
      try {
        await runProfile({
          environment: loadLayeredEnv('qilin'),
          profile: invocation.profile,
          fromDefaultProfile: invocation.fromDefaultProfile,
          patchFiles: invocation.patches,
          args: invocation.args,
          ...profileOptions,
        })
      } catch (error) {
        if (!(error instanceof StartupError)) throw error
        await reportStartupFailure(error, { home: resolveQilinHome(), version, profile: invocation.profile })
        process.exit(1)
      }
      break
    }
    case 'plugin': {
      const { runPlugin } = await import('./plugin.ts')
      process.exit(await runPlugin(invocation.profile, invocation.args))
      break
    }
    case 'tenants': {
      const { runTenantsRoster } = await import('./tenants-roster.ts')
      process.exitCode = await runTenantsRoster(invocation.request)
      break
    }
    case 'dump-config': {
      const { runDumpConfig } = await import('./dump-config.ts')
      runDumpConfig(
        invocation.profile,
        invocation.defaultOnly,
        invocation.patches,
        invocation.fromDefaultProfile,
      )
      break
    }
    default:
      invocation satisfies never
      throw new Error(`qilin: unhandled invocation mode ${JSON.stringify(invocation)}`)
  }
}

if (import.meta.main) {
  await runCli()
}
