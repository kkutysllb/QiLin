// scripts/build-desktop.mjs
/**
 * Orchestrate the upstream build inside the ephemeral checkout.
 *
 * stage=build：上游冻结安装 + 统一构建（canonical Web Client bundle），
 * 门禁 workflow 用它产出 dist 后做双端摘要比对。
 *
 * stage=package：3.1.x 起上游已移除 apps/desktop 与 `package:desktop:*`
 * 打包链——发布打包按 2026-10-07 原生设计由本仓自有管线承担（M4），
 * 在该管线落地前显式失败，不产出半成品。
 */
import { spawnSync } from 'node:child_process'
import { basename } from 'node:path'

/**
 * Build step plan. Steps run with the process CWD, which the release workflow
 * pins to the ephemeral upstream checkout (working-directory).
 * @param {{ target: string, pnpm?: string, stage?: 'build' | 'package' }} options
 * @returns {Array<{ cwd: string, command: string, args: string[] }>}
 */
export function planBuild({ target, pnpm = 'pnpm', stage = 'package' }) {
  if (target !== 'mac-arm64' && target !== 'mac-x64') {
    throw new Error(`build-desktop: unsupported target ${target}`)
  }
  if (stage !== 'build' && stage !== 'package') throw new Error(`build-desktop: unknown stage ${stage}`)
  const steps = [
    { cwd: '.', args: ['install', '--frozen-lockfile'] },
    { cwd: '.', args: ['run', 'build'] },
  ]
  if (stage === 'build') return steps.map(step => ({ cwd: step.cwd, command: pnpm, args: step.args }))
  // 上游 3.1.x 无 apps/desktop：目标打包（签名/公证/DMG）是 M4 自有管线的职责
  throw new Error(
    'build-desktop: release packaging requires the OpenKylin native desktop pipeline (M4) — '
    + 'upstream 3.1.x removed apps/desktop and package:desktop:*; '
    + 'see docs/superpowers/specs/2026-10-07-openkylin-desktop-native-design.md §6',
  )
}

const KNOWN_FLAGS = new Set(['--dry-run', '--stage'])

/**
 * Parse the CLI argv after the script entry: one optional target plus flags.
 * @param {string[]} args - Positional and flag arguments from process.argv.slice(2).
 * @returns {{ target: string, dryRun: boolean, stage: 'build' | 'package' }} Validated invocation.
 */
export function parseCliArgs(args) {
  for (const arg of args.filter(candidate => candidate.startsWith('--'))) {
    if (!KNOWN_FLAGS.has(arg.split('=')[0])) {
      throw new Error(`build-desktop: unknown flag ${arg}`)
    }
  }
  const positional = args.filter(arg => !arg.startsWith('--'))
  if (positional.length > 1) {
    throw new Error(`build-desktop: expected at most one target, got ${positional.join(', ')}`)
  }
  const stageEntry = args.find(arg => arg.startsWith('--stage='))
  const stage = stageEntry === undefined ? 'package' : stageEntry.slice('--stage='.length)
  return { target: positional[0] ?? 'mac-arm64', dryRun: args.includes('--dry-run'), stage }
}

if (process.argv[1] !== undefined && import.meta.url.endsWith(basename(process.argv[1]))) {
  const { target, dryRun, stage } = parseCliArgs(process.argv.slice(2))
  if (dryRun) {
    for (const step of planBuild({ target, stage })) console.log(`[${step.cwd}] ${step.command} ${step.args.join(' ')}`)
  } else {
    for (const step of planBuild({ target, stage })) {
      const result = spawnSync(step.command, step.args, { cwd: step.cwd === '.' ? process.cwd() : step.cwd, stdio: 'inherit' })
      if (result.error !== undefined) throw new Error(`build-desktop: ${step.args.join(' ')} failed to start`, { cause: result.error })
      if (result.status !== 0) throw new Error(`build-desktop: ${step.args.join(' ')} exited ${String(result.status ?? result.signal)}`)
    }
  }
}
