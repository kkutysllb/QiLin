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

// Web Scheduler API 兼容层：`scheduler.yield()` 由 Chromium 129+ / Node 25+
// 提供，而当前长期支持的宿主解释器（Node 24.x、Electron 内置 node）都没有
// 这个全局。dsh 0.2.1-alpha.1 移植的协作式让路路径（session 列表与
// session-persistence-jsonl 的分片 yield）只要数据量越过 work slice 就会
// 以 ReferenceError 炸掉整个 RPC 网关（gateway/internal: scheduler is not
// defined），且只在真实历史数据量下复现。按"让出主循环一次后继续"的语义
// 用 setImmediate 补齐；宿主自带 scheduler 时不覆盖。
{
  const host = globalThis as { scheduler?: unknown }
  if (host.scheduler === undefined) {
    Object.defineProperty(globalThis, 'scheduler', {
      value: {
        yield: (): Promise<void> => new Promise(resolve => setImmediate(resolve)),
      },
      writable: true,
      configurable: true,
    })
  }
}

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
