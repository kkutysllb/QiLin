// desktop/main/host-process.mjs
/**
 * 引擎宿主子进程管理器（原生桌面产品）。
 *
 * 职责：以 Electron-as-Node spawn `desktop/host/main.mjs`（stdio 第 4 项
 * 开 Node IPC）→ 校验 `ready{url, injections}` 消息 → 广播状态；崩溃自动
 * 重启（指数退避，上限见 MAX_AUTO_RESTARTS）；应用退出时发 shutdown
 * 消息并按"排水 → SIGTERM → 宽限 → SIGKILL"收尾，另有 detached watchdog
 * 兜底主进程被直杀的孤儿场景。
 *
 * 壳对宿主的请求（quit-inspection / update-tasks）走 requestId 关联的
 * 请求-响应，带截止时间；超时不杀进程，只拒绝本次请求。
 *
 * @module desktop/main/host-process
 */

import { spawn } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import {
  HOST_PROTOCOL_VERSION,
  LOG_RING_SIZE,
  MAX_AUTO_RESTARTS,
  READY_TIMEOUT_MS,
  SHUTDOWN_DRAIN_MS,
  TERM_GRACE_MS,
  hostArgs,
  isHostEvent,
} from './qilin-contract.mjs'

/** 产品仓库根（desktop/main 的上上级）；宿主入口在其 desktop/host 下。
 * 打包态结构不同：app 根下 app/host/main.mjs，且 asarUnpack 落在
 * app.asar.unpacked（ELECTRON_RUN_AS_NODE 是纯 Node fs，不识别 asar）。 */
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** 宿主入口绝对路径（dev = desktop/host；打包 = app.asar.unpacked/app/host）。 */
const HOST_ENTRY = REPO_ROOT.includes('app.asar')
  ? join(REPO_ROOT.replace('app.asar', 'app.asar.unpacked'), 'app', 'host', 'main.mjs')
  : join(REPO_ROOT, 'desktop', 'host', 'main.mjs')

/**
 * @typedef {'stopped' | 'starting' | 'ready' | 'restarting' | 'failed'} HostState
 *
 * @typedef {{ stream: 'stdout' | 'stderr' | 'ipc', line: string, at: number }} HostLogLine
 *
 * @typedef {{ state: HostState, url: string | null, error: string | null, restartsLeft: number, hostProtocol: number }} HostStatus
 */

/** 事件负载：状态快照与日志行。 */
export class HostProcess extends EventEmitter {
  /** @type {import('node:child_process').ChildProcess | null} */
  #child = null
  /** @type {HostState} */
  #state = 'stopped'
  /** @type {string | null} */
  #url = null
  /** @type {unknown[] | null} */
  #injections = null
  /** @type {string | null} */
  #error = null
  #restartsLeft = MAX_AUTO_RESTARTS
  /** @type {HostLogLine[]} */
  #logs = []
  #readyTimer = null
  #backoffTimer = null
  #stopping = false
  #sawShutdownComplete = false
  #requestSeq = 0
  /** @type {Map<number, { resolve: (value: object) => void, reject: (error: Error) => void, timer: NodeJS.Timeout }>} */
  #requests = new Map()
  /** @type {{ runtimeDir?: string, port?: number } | null} */
  #options = null

  /** 当前快照。@returns {HostStatus} */
  get status() {
    return {
      state: this.#state,
      url: this.#url,
      error: this.#error,
      restartsLeft: this.#restartsLeft,
      hostProtocol: HOST_PROTOCOL_VERSION,
    }
  }

  /** 就绪消息携带的插件 index 注入表（未就绪为 null）。@returns {unknown[] | null} */
  get injections() {
    return this.#injections
  }

  /** 日志尾部（最多 LOG_RING_SIZE 行）。@returns {HostLogLine[]} */
  get logTail() {
    return [...this.#logs]
  }

  /**
   * 启动宿主。已在运行时是幂等 no-op；starting 状态同步置位，并发调用安全。
   *
   * @param {{ runtimeDir: string, port?: number }} options - 品牌化运行树根
   *   与稳定监听端口（0/缺省 = 随机端口；重启沿用同一 options）。
   * @returns {HostStatus}
   */
  start(options) {
    if (this.#child !== null || this.#state === 'starting' || this.#state === 'restarting') {
      return this.status
    }
    this.#options = options
    this.#stopping = false
    // 先置 starting 再异步落 spawn 路径：双击/重试并发下第二次调用被状态闸拦下
    this.#setValues({ state: 'starting', error: null })
    this.#launch(options)
    return this.status
  }

  /** 重启：优雅停止后重新启动。@returns {HostStatus} */
  restart() {
    void this.stop().then(() => {
      this.#restartsLeft = MAX_AUTO_RESTARTS
      if (this.#options !== null) this.start(this.#options)
    })
    return { ...this.status, state: 'restarting' }
  }

  /**
   * 优雅停止：shutdown 消息 → 排水 → SIGTERM → 宽限 → SIGKILL；
   * resolve 于进程真正退出（或本就不在运行）。
   * @returns {Promise<void>}
   */
  async stop() {
    this.#stopping = true
    this.#clearTimers()
    const child = this.#child
    if (child === null || child.exitCode !== null || child.signalCode !== null) {
      this.#child = null
      this.#setValues({ state: 'stopped' })
      return
    }
    await new Promise((resolve) => {
      const done = () => {
        child.removeAllListeners('exit')
        for (const stage of [drainTimer, termTimer]) clearTimeout(stage)
        resolve()
      }
      // 阶段 1：shutdown 消息 + 排水（宿主自行 dispose 引擎）
      this.#send(child, { type: 'shutdown' })
      const drainTimer = setTimeout(() => {
        this.#appendLog('ipc', 'shutdown 排水超时，发送 SIGTERM')
        try { child.kill('SIGTERM') } catch {}
      }, SHUTDOWN_DRAIN_MS)
      // 阶段 2：SIGTERM 宽限后 SIGKILL
      const termTimer = setTimeout(() => {
        this.#appendLog('ipc', '优雅退出超时，发送 SIGKILL')
        try { child.kill('SIGKILL') } catch {}
      }, SHUTDOWN_DRAIN_MS + TERM_GRACE_MS)
      child.once('exit', done)
    })
    this.#child = null
    this.#setValues({ state: 'stopped' })
  }

  /**
   * 向宿主发一次请求-响应（quit-inspection / update-tasks）。
   * 截止超时只拒绝本次请求，不影响进程。
   *
   * @template {object} T
   * @param {'quit-inspection' | 'update-tasks'} type
   * @param {Record<string, unknown>} payload
   * @param {{ timeoutMs?: number }} [options]
   * @returns {Promise<T>}
   */
  request(type, payload = {}, options = {}) {
    const child = this.#child
    if (child === null || this.#state !== 'ready') {
      return Promise.reject(new Error(`host not ready (${this.#state})`))
    }
    const requestId = ++this.#requestSeq
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#requests.delete(requestId)
        reject(new Error(`host request ${type} timed out`))
      }, options.timeoutMs ?? 10_000)
      this.#requests.set(requestId, {
        resolve: (value) => {
          clearTimeout(timer)
          resolve(/** @type {T} */ (value))
        },
        reject: (error) => {
          clearTimeout(timer)
          reject(error)
        },
      })
      this.#send(child, { type, requestId, ...payload })
    })
  }

  /* ---------- 内部 ---------- */

  #launch(options) {
    const args = hostArgs(HOST_ENTRY, options.runtimeDir, options.port ?? 0)
    const child = spawn(process.execPath, args, {
      cwd: options.runtimeDir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    })
    this.#child = child
    this.#sawShutdownComplete = false
    this.#appendLog('ipc', `$ ${process.execPath} ${args.join(' ')} (ELECTRON_RUN_AS_NODE=1)`)
    this.#startWatchdog(child)

    child.stdout?.on('data', (chunk) => {
      for (const line of chunk.toString('utf8').split('\n')) {
        if (line !== '') this.#appendLog('stdout', line)
      }
    })
    child.stderr?.on('data', (chunk) => {
      for (const line of chunk.toString('utf8').split('\n')) {
        if (line !== '') this.#appendLog('stderr', line)
      }
    })
    child.on('message', (value) => {
      const event = isHostEvent(value)
      if (event === null) {
        this.#appendLog('ipc', `unrecognized host message: ${JSON.stringify(value).slice(0, 200)}`)
        return
      }
      this.#onHostEvent(event)
    })
    child.on('error', (error) => {
      this.#child = null
      this.#fail(`无法启动宿主进程：${String(error)}`)
    })
    child.on('exit', (code, signal) => {
      this.#rejectAllRequests(new Error('host exited'))
      this.#child = null
      this.#clearReadyTimer()
      if (this.#stopping) return
      if (this.#sawShutdownComplete && code === 0) {
        this.#setValues({ state: 'stopped' })
        return
      }
      // 意外退出：自动重启直到额度耗尽
      this.#appendLog('stderr', `宿主进程退出（code=${String(code)} signal=${String(signal)}）`)
      if (this.#restartsLeft > 0) {
        this.#scheduleRestart()
      } else {
        this.#fail(`宿主连续崩溃，已停止自动重启（最后退出 code=${String(code)}）`)
      }
    })

    this.#readyTimer = setTimeout(() => {
      if (this.#state === 'starting' || this.#state === 'restarting') {
        this.#fail(
          `等待宿主就绪超时（${String(READY_TIMEOUT_MS / 1000)}s）。详见下方日志；`
          + '上游首次冷启动较慢（profile 初始化与依赖结算），可重试。',
        )
        void this.stop()
      }
    }, READY_TIMEOUT_MS)
  }

  /** @param {{ type: string, url?: string, injections?: unknown[], message?: string, diagnostic?: string, requestId?: number, activeTasks?: boolean, scheduledTasks?: boolean, active?: boolean }} event */
  #onHostEvent(event) {
    if (event.requestId !== undefined) {
      const pending = this.#requests.get(event.requestId)
      if (pending !== undefined) {
        this.#requests.delete(event.requestId)
        const { type, requestId, ...body } = event
        pending.resolve(body)
      }
      return
    }
    if (event.type === 'ready') {
      this.#clearReadyTimer()
      this.#restartsLeft = MAX_AUTO_RESTARTS
      this.#setValues({ state: 'ready', url: /** @type {string} */ (event.url), error: null })
      this.#injections = /** @type {unknown[]} */ (event.injections)
      return
    }
    if (event.type === 'fatal') {
      this.#appendLog('ipc', `fatal: ${event.message}`)
      this.#fail(`${event.message}${event.diagnostic !== '' ? `\n${event.diagnostic.slice(0, 2_000)}` : ''}`)
      return
    }
    if (event.type === 'shutdown-complete') {
      this.#sawShutdownComplete = true
    }
  }

  /**
   * 孤儿兜底 watchdog（detached，父进程死后仍存活）。
   *
   * Electron 主进程被 SIGKILL/SIGTERM 直杀时不走 Node 层 handler；
   * watchdog 每秒探测主进程存活性，发现主进程死亡后对宿主执行
   * SIGTERM → 5s → SIGKILL 序列，然后自杀。
   *
   * @param {import('node:child_process').ChildProcess} child - 宿主进程。
   */
  #startWatchdog(child) {
    if (child.pid === undefined) return
    // 单引号内的进程文本独立于闭包，避免序列化主进程的其他状态。
    const script = [
      'const mainPid = Number(process.argv[1])',
      'const hostPid = Number(process.argv[2])',
      'const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }',
      'const tick = setInterval(() => {',
      '  if (alive(mainPid)) return',
      '  clearInterval(tick)',
      '  try { process.kill(hostPid, "SIGTERM") } catch {}',
      '  setTimeout(() => { try { process.kill(hostPid, "SIGKILL") } catch {} ; process.exit(0) }, 5000)',
      '}, 1000)',
    ].join('\n')
    const watchdog = spawn(process.execPath, ['-e', script, String(process.pid), String(child.pid)], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: 'ignore',
      detached: true,
    })
    watchdog.unref()
  }

  /** @param {import('node:child_process').ChildProcess} child @param {Record<string, unknown>} message */
  #send(child, message) {
    if (child.connected !== true || typeof child.send !== 'function') return
    try {
      child.send({ hostProtocol: HOST_PROTOCOL_VERSION, ...message })
    } catch (error) {
      this.#appendLog('ipc', `send failed: ${String(error)}`)
    }
  }

  #rejectAllRequests(error) {
    for (const pending of this.#requests.values()) pending.reject(error)
    this.#requests.clear()
  }

  #scheduleRestart() {
    const attempt = MAX_AUTO_RESTARTS - this.#restartsLeft + 1
    this.#restartsLeft -= 1
    const delay = Math.min(1_000 * 2 ** (attempt - 1), 8_000)
    this.#setValues({ state: 'restarting' })
    this.#appendLog('stderr', `将在 ${String(delay)}ms 后自动重启（剩余 ${String(this.#restartsLeft)} 次）`)
    this.#backoffTimer = setTimeout(() => {
      this.#backoffTimer = null
      if (this.#options !== null) this.start(this.#options)
    }, delay)
  }

  #fail(message) {
    this.#clearTimers()
    this.#setValues({ state: 'failed', error: message })
  }

  #setValues(patch) {
    if (patch.state !== undefined) this.#state = patch.state
    if (patch.url !== undefined) this.#url = patch.url
    if (patch.error !== undefined) this.#error = patch.error
    this.emit('state-changed', this.status)
  }

  /**
   * @param {'stdout' | 'stderr' | 'ipc'} stream
   * @param {string} line
   */
  #appendLog(stream, line) {
    /** @type {HostLogLine} */
    const entry = { stream, line, at: Date.now() }
    this.#logs.push(entry)
    if (this.#logs.length > LOG_RING_SIZE) this.#logs.splice(0, this.#logs.length - LOG_RING_SIZE)
    this.emit('log', entry)
  }

  #clearReadyTimer() {
    if (this.#readyTimer !== null) {
      clearTimeout(this.#readyTimer)
      this.#readyTimer = null
    }
  }

  #clearTimers() {
    this.#clearReadyTimer()
    if (this.#backoffTimer !== null) {
      clearTimeout(this.#backoffTimer)
      this.#backoffTimer = null
    }
  }
}

/** 进程级单例（主进程内共享）。 */
export const hostProcess = new HostProcess()
