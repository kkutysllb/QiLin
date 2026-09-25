#!/usr/bin/env node
/**
 * Command-line entry for qilin.
 * @module @qilin/cli/bin
 */

/* v8 ignore file -- built-bin acceptance exercises this self-executing dispatch. */

import { getQilinRuntimeVersion, loadLayeredEnv, StartupError } from '@qilin/app-boot'
import { resolveQilinHome } from '@qilin/home-paths'
import { parseQilinArgs } from './args.ts'
import { reportStartupFailure } from './startup-diagnostics.ts'

/**
 * Run the public qilin command-line interface.
 * @returns a promise that settles when the selected command mode finishes.
 */
export async function runCli(): Promise<void> {
  const version = getQilinRuntimeVersion()
  const invocation = parseQilinArgs(process.argv.slice(2), version)

  switch (invocation.mode) {
    case 'profile': {
      const { runProfile } = await import('./profile-boot.ts')
      try {
        await runProfile({
          environment: loadLayeredEnv('qilin'),
          profile: invocation.profile,
          fromDefaultProfile: invocation.fromDefaultProfile,
          patchFiles: invocation.patches,
          args: invocation.args,
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
