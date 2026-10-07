// desktop/host/main.mjs
/**
 * OpenKylin 引擎宿主入口（Electron-as-Node 子进程，2026-10-07 原生设计）。
 *
 * 职责：在品牌化运行树内程序化 boot QiLin 产品面引擎——
 * `runProfile({profile:'qilin', args:['--no-open','--port','0']})`（cordis
 * 同进程装配，不经 CLI 子进程），就绪后经 Node IPC 向壳回
 * `ready{url, injections}`；此后 renderer 的 API 流量走壳的
 * `qilin-app://` 认证反代，宿主只服务 127.0.0.1 随机端口。
 *
 * 对上游的依赖全部以运行树相对路径动态 import（`apps/cli/lib/
 * profile-boot.js` 的内部裸说明符自行解析到运行树 node_modules），
 * 本文件与产品仓库保持零 npm 依赖。
 *
 * IPC 小协议（与 desktop/main/host-process.mjs 成对，版本见
 * qilin-contract HOST_PROTOCOL_VERSION）：
 *   宿主 → 壳：booting / ready{url,injections} / fatal{message,diagnostic}
 *              / shutdown-complete / quit-inspection / update-tasks 应答
 *   壳 → 宿主：shutdown / quit-inspection / update-tasks（带 requestId）
 * quit-inspection / update-tasks 读取真实引擎面：运行中的 Agent 回合
 * （ctx.agents）、活跃后台任务（ctx.jobs）、武装中的定时提醒（ctx.schedule）。
 *
 * @module desktop/host/main
 */

import { inspect } from 'node:util'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP_BOOT_ENTRY, PROFILE_BOOT_ENTRY } from '../main/qilin-contract.mjs'

/** 诊断串：util.inspect 全量错误，64KiB 封顶（dsh 同款预算）。 */
function diagnosticOf(error) {
  const text = typeof error === 'string' ? error : inspect(error, {
    depth: 8,
    maxArrayLength: 200,
    breakLength: 120,
    maxStringLength: 2_000,
  })
  return text.slice(0, 65_536)
}

/** 解析壳传入的 `--port <n>`（0/缺位 = 随机端口；不透传其它 argv）。 */
function hostPortOf(argv) {
  const at = argv.indexOf('--port')
  const value = at >= 0 ? Number(argv[at + 1]) : 0
  return Number.isInteger(value) && value >= 0 && value <= 65_535 ? value : 0
}

function send(message) {
  // 致命错误同时直写 stderr：无 IPC 的直接运行/调试形态下诊断不丢失，
  // 有 IPC 时壳的日志环也会经 stderr 管道留底一份。
  if (message.type === 'fatal') {
    try { process.stderr.write(`qilin-host fatal: ${message.message}\n${message.diagnostic ?? ''}\n`) } catch {}
  }
  if (process.send === undefined) return
  try {
    process.send(message)
  } catch {
    // 壳已死亡：进程随之被 disconnect 路径收尾
  }
}

/** 优雅收尾：先报 shutdown-complete（经 flush 回调确保出站），再交给 shutdown 控制器。 */
async function gracefulExit(shutdown) {
  await new Promise((resolve) => {
    try {
      if (process.send === undefined || process.connected !== true) return resolve()
      process.send({ type: 'shutdown-complete' }, () => resolve())
      // flush 回调不保证触发（shutdown 可能先强杀）：超时兜底
      setTimeout(resolve, 500).unref()
    } catch {
      resolve()
    }
  })
  try {
    await (shutdown?.shutdown(0) ?? Promise.resolve())
  } catch {
    // 收尾失败也要退出：壳侧有 SIGTERM/SIGKILL 兜底
  }
  try {
    process.disconnect()
  } catch {}
  process.exit(0)
}

const runtimeDir = process.argv[2]
if (runtimeDir === undefined || runtimeDir === '') {
  send({ type: 'fatal', message: 'host: missing runtimeDir argument', diagnostic: 'usage: node main.mjs <runtimeDir> [--port <n>]' })
  process.exit(2)
}
const hostPort = hostPortOf(process.argv)

send({ type: 'booting' })

/** @type {import('@qilin/app-boot').ProcessShutdown | null} */
let shutdown = null
let stopping = false

/**
 * 真实任务检查（quit-inspection / update-tasks 的数据面）：
 * - Agent 回合：`ctx.agents.list()` 的 `status === 'running'`（AgentStatus
 *   = 'idle' | 'running'，packages/core/agent/src/runtime-types.ts:106）；
 * - 后台任务：`ctx.jobs.list()` 的 `running | stopping`（JobStatus，
 *   packages/jobs/jobs/src/view.ts:19）；
 * - 定时提醒：`ctx.schedule.catalog()` 的 `status === 'active'`
 *   （ScheduleCatalogEntry，packages/schedule/schedule/src/types.ts:213）。
 * 任一服务面缺失或读取异常按"无"处理（profile 裁剪不阻塞退出判定）。
 *
 * @param {object} ctx - runProfile 返回的 cordis context。
 * @returns {Promise<{ activeTasks: boolean, scheduledTasks: boolean }>}
 */
async function inspectTasks(ctx) {
  const result = { activeTasks: false, scheduledTasks: false }
  try {
    const agents = ctx.get('agents')
    if (Array.isArray(agents?.list?.()) && agents.list().some((agent) => agent?.status === 'running')) {
      result.activeTasks = true
    }
  } catch {}
  try {
    const jobs = ctx.get('jobs')
    if (Array.isArray(jobs?.list?.()) && jobs.list().some((job) => job?.status === 'running' || job?.status === 'stopping')) {
      result.activeTasks = true
    }
  } catch {}
  try {
    const catalog = await ctx.get('schedule')?.catalog?.()
    if (Array.isArray(catalog) && catalog.some((entry) => entry?.status === 'active')) {
      result.scheduledTasks = true
    }
  } catch {}
  return result
}

try {
  const booted = await import(pathToFileURL(join(runtimeDir, PROFILE_BOOT_ENTRY)).href)
  // 与上游 CLI 同款（apps/cli/src/bin.ts:47）：分层环境快照是 runProfile 的
  // 契约入参（裸 process.env 没有 .get，代理解析会炸）。
  const appBoot = await import(pathToFileURL(join(runtimeDir, APP_BOOT_ENTRY)).href)
  const profile = await booted.runProfile({
    environment: appBoot.loadLayeredEnv('qilin'),
    profile: 'qilin',
    patchFiles: [],
    // 壳记忆的稳定端口（cookie authority 绑定 host:port）；0 = 随机
    args: ['--no-open', '--port', String(hostPort)],
  })
  shutdown = profile.shutdown
  const ctx = profile.ctx

  // 就绪语义与上游 web-app 的 announceReady 一致：socket 绑定完成后
  // 才取 port/URL（listenOn: settle 下结算只启动 bind，直读会竞态）。
  const webServer = ctx.get('webServer')
  if (webServer === undefined) throw new Error('webServer service missing after boot')
  await webServer.whenListened()
  const connection = ctx.get('connection')
  if (connection === undefined) throw new Error('connection service missing after boot')
  const url = connection.authenticatedUrl(`http://127.0.0.1:${webServer.port}`)
  const injections = webServer.collectIndexInjections()
  send({ type: 'ready', url, injections })

  process.on('message', async (message) => {
    if (message === null || typeof message !== 'object') return
    if (message.type === 'shutdown') {
      if (stopping) return
      stopping = true
      void gracefulExit(shutdown)
      return
    }
    if (typeof message.requestId !== 'number') return
    if (message.type === 'quit-inspection') {
      const inspection = await inspectTasks(ctx)
      send({ type: 'quit-inspection', requestId: message.requestId, ...inspection })
    }
    if (message.type === 'update-tasks') {
      const inspection = await inspectTasks(ctx)
      send({ type: 'update-tasks', requestId: message.requestId, active: inspection.activeTasks })
    }
  })
  // 壳死亡（含 SIGKILL 后 IPC 通道断裂）：立即自我收尾，watchdog 兜底
  process.on('disconnect', () => {
    if (stopping) return
    stopping = true
    void gracefulExit(shutdown)
  })
} catch (error) {
  send({ type: 'fatal', message: error instanceof Error ? error.message : String(error), diagnostic: diagnosticOf(error) })
  process.exitCode = 1
}

process.on('uncaughtException', (error) => {
  send({ type: 'fatal', message: error instanceof Error ? error.message : String(error), diagnostic: diagnosticOf(error) })
  process.exit(1)
})
