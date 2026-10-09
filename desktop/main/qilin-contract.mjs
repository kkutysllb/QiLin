// main/qilin-contract.mjs
/**
 * 上游 QiLin 契约适配层（原生桌面产品：Electron 壳 + 引擎宿主子进程）。
 *
 * 桌面端与 QiLin 的关系（2026-10-07 原生设计，取代 sidecar 套壳）：
 * 壳 spawn **宿主子进程**（Electron-as-Node），宿主以 `runProfile`
 * 程序化 boot 产品面引擎（`qilin` profile = base + web-app + web-brand，
 * cordis 同进程装配，不经 CLI 子进程），宿主 loopback 127.0.0.1:0 随机
 * 端口 + launch token；壳经 Node IPC 收 `ready{url, injections}`，用
 * 特权协议 `qilin-app://` 承载共享 Web client——静态资源壳直读 dist，
 * 动态请求壳认证反代到宿主，认证 cookie 只存在于主进程。
 *
 * 本文件是桌面壳对上游约定的唯一引用点；升级上游后若行为不符，只
 * 需要修改这里。契约依据（upstream 3.1.1，commit d9dc36d499…（历史锚 fdca446…→b2d1861…），锁定于
 * upstream/qilin.lock.json；接入缝逐条实测核对）：
 * - 程序化 boot：apps/cli `exports['./profile-boot']` → lib/profile-boot.js
 *   `runProfile({environment, profile, patchFiles, args}) → {ctx, shutdown}`
 *   （apps/cli/src/profile-boot.ts:254）；INSTALL_ANCHOR 自锚
 *   apps/cli/package.json。
 * - 产品面：PROFILE_TEMPLATES['qilin'] = base + web-app + web-brand
 *   （packages/boot/app-boot/src/profile.ts:246）。`--no-open`/`--port`
 *   由 web-app bundle 的 webStartup 服务从 cmdlineArgs 解析
 *   （packages/bundle/web-app/src/startup.ts）。
 * - 就绪：webServer.whenListened() 后 `connection.authenticatedUrl(
 *   http://127.0.0.1:<port>)`（token URL，首访 302 兑换 HMAC 签名
 *   cookie——cookie 名绑定 authority，packages/client/connection/src/
 *   browser-auth.ts）；`webServer.collectIndexInjections()` 收插件
 *   index 注入表（packages/host/webserver/src/index.ts）。
 * - 桌面启动门（上游契约，桥名/闸名必须一致）：client 找
 *   `window.qilinDesktopBoot.ready() → {injections, streamBaseUrl}`，
 *   等文档内 `__QILIN_BOOT_READY__` deferred，随后自设
 *   `__QILIN_TRANSPORT__ = {ownsHost:true, streamBaseUrl}`
 *   （apps/web/src/main.ts:5-36；packages/client/connection/src/client/
 *   index.ts:79-113）。
 * - 入口路径：`/workspace`（packages/client/connection/src/web-entry.ts
 *   WEB_ENTRY_PATH）；静态资源锚 `@qilin-agent/web-frontend/dist`
 *   （packages/bundle/web-app/src/index.ts:181）。
 * - Harness home：packages/util/home-paths `QILIN_HOME`，默认 `~/.qilin`，
 *   与 qilin CLI / 浏览器端共享同一份数据（会话、凭据、插件）。
 * - 进程收尾：runProfile 返回 `shutdown.shutdown(code)`（5s 强制，
 *   apps/cli/src/process-shutdown.ts）。
 *
 * @module main/qilin-contract
 */

import { homedir } from 'node:os'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, sep } from 'node:path'

/** 壳自有特权协议（dsh 参考实现为 dsh-app；本产品命名 qilin-app）。 */
export const SCHEME = 'qilin-app'

/** Web client 载体 hostname（协议三路由之一：qilin-app://app/*）。 */
export const APP_HOSTNAME = 'app'

/** Web client 载体 origin。 */
export const APP_ORIGIN = `${SCHEME}://${APP_HOSTNAME}`

/** 工作区入口路径（上游 WEB_ENTRY_PATH）。 */
export const APP_ENTRY_PATH = '/workspace'

/** shell 窗口的加载地址。 */
export const APP_ENTRY_URL = `${APP_ORIGIN}${APP_ENTRY_PATH}`

/** 壳 ↔ 宿主 IPC 小协议版本（结构演进时递增）。 */
export const HOST_PROTOCOL_VERSION = 1

/** 宿主就绪等待上限（毫秒）：首次冷启动要 pnpm 结算 + profile 初始化。 */
export const READY_TIMEOUT_MS = 120_000

/** 崩溃自动重启次数上限。 */
export const MAX_AUTO_RESTARTS = 3

/** 优雅退出宽限（毫秒）：shutdown 消息后未退则 SIGTERM，再宽限后 SIGKILL。 */
export const TERM_GRACE_MS = 5_000

/** shutdown 消息后的额外排水等待（毫秒），随后才 SIGTERM。 */
export const SHUTDOWN_DRAIN_MS = 10_000

/** 宿主日志环形缓冲容量（诊断信息展示尾部）。 */
export const LOG_RING_SIZE = 500

/** 品牌化运行树内宿主 boot 模块（相对 checkout/runtime 根）。 */
export const PROFILE_BOOT_ENTRY = join('apps', 'cli', 'lib', 'profile-boot.js')

/** 品牌化运行树内 app-boot lib（loadLayeredEnv 所在，相对 checkout/runtime 根）。 */
export const APP_BOOT_ENTRY = join('packages', 'boot', 'app-boot', 'lib', 'index.js')

/** 品牌化运行树内 Web client dist（相对 checkout/runtime 根）。 */
export const WEB_DIST_DIR = join('apps', 'web', 'dist')

/** 运行树内可执行 CLI bin（健存：dev 构建完整性检查用）。 */
export const UPSTREAM_BIN = join('apps', 'cli', 'lib', 'bin.js')

/**
 * QiLin Harness home（与 qilin CLI / 浏览器端共享同一份数据）。
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function qilinHome(env = process.env) {
  const override = env.QILIN_HOME
  if (typeof override === 'string' && override.trim() !== '') return override
  return join(homedir(), '.qilin')
}

/**
 * 提取 URL 的 origin（scheme + host + port），忽略路径与查询。
 *
 * @param {string} url - 任意 URL。
 * @returns {string | null} 无法解析时返回 null。
 */
export function urlOrigin(url) {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** 宿主稳定端口记忆文件（QILIN_HOME 内，产品私有命名空间）。 */
export const HOST_PORT_FILE = 'desktop-host-port.json'

/**
 * 读取记忆的宿主端口。账号会话 cookie 的名字绑定 authority（host:port，
 * packages/client/connection/src/browser-auth.ts）——端口稳定是登录跨启动
 * 存活的前提，所以宿主端口要"记忆优先、被占才换"。
 *
 * @param {string} [home] - QILIN_HOME（缺省 qilinHome()）。
 * @returns {number | null} 合法端口（1024-65535）；无记忆/损坏返回 null。
 */
export function readPersistedHostPort(home = qilinHome()) {
  try {
    const payload = JSON.parse(readFileSync(join(home, HOST_PORT_FILE), 'utf8'))
    const port = payload?.port
    if (Number.isInteger(port) && port >= 1024 && port <= 65_535) return port
  } catch {
    // 无记忆文件 / JSON 损坏：等价于无记忆
  }
  return null
}

/**
 * 记忆宿主端口（QILIN_HOME 内 0600 单字段 JSON；写失败不阻塞启动）。
 *
 * @param {number} port
 * @param {string} [home] - QILIN_HOME（缺省 qilinHome()）。
 */
export function persistHostPort(port, home = qilinHome()) {
  try {
    mkdirSync(home, { recursive: true })
    writeFileSync(join(home, HOST_PORT_FILE), `${JSON.stringify({ port })}\n`, { encoding: 'utf8', mode: 0o600 })
  } catch {
    // 只读 home 等异常场景：端口记忆退化为本次会话内有效
  }
}

/**
 * 宿主子进程的启动参数（Electron-as-Node 解释器 + `--expose-internals`
 * 供上游 HMR/loader 使用 node internal ESM loader；`--port` 由宿主
 * 透传给 runProfile——0 = 随机端口）。
 *
 * @param {string} hostEntry - host/main.mjs 的绝对路径。
 * @param {string} runtimeDir - 品牌化运行树（checkout/runtime）根。
 * @param {number} [port] - 宿主监听端口（0 = 随机）。
 * @returns {string[]} 解释器参数（不含解释器本身）。
 */
export function hostArgs(hostEntry, runtimeDir, port = 0) {
  return ['--expose-internals', hostEntry, runtimeDir, '--port', String(port)]
}

/**
 * 校验并归一化一条宿主 → 壳的 IPC 消息。
 *
 * @param {unknown} value - child 'message' 事件载荷。
 * @returns {object | null} 归一化消息；不合法返回 null（进日志，不进状态机）。
 */
export function isHostEvent(value) {
  if (typeof value !== 'object' || value === null) return null
  const { type } = value
  if (type === 'booting') return { type }
  if (type === 'ready') {
    const url = typeof value.url === 'string' ? value.url : ''
    if (!/^http:\/\/127\.0\.0\.1:\d+\//.test(url)) return null
    if (!Array.isArray(value.injections)) return null
    return { type, url, injections: value.injections }
  }
  if (type === 'fatal') {
    const message = typeof value.message === 'string' && value.message !== '' ? value.message : null
    if (message === null) return null
    return { type, message, diagnostic: typeof value.diagnostic === 'string' ? value.diagnostic : '' }
  }
  if (type === 'shutdown-complete') return { type }
  if (typeof value.requestId === 'number' && Number.isInteger(value.requestId) && value.requestId > 0) {
    if (type === 'quit-inspection') {
      return {
        type,
        requestId: value.requestId,
        activeTasks: value.activeTasks === true,
        scheduledTasks: value.scheduledTasks === true,
      }
    }
    if (type === 'update-tasks') {
      return { type, requestId: value.requestId, active: value.active === true }
    }
  }
  return null
}

/**
 * 导航白名单：只允许停留在壳自有协议（qilin-app://app）。
 * 外链、http(s)、file:// 一律拒绝——调用方转系统浏览器。
 *
 * @param {string} url - 将要导航到的地址。
 * @returns {boolean}
 */
export function isAllowedNavigation(url) {
  try {
    return new URL(url).protocol === `${SCHEME}:`
  } catch {
    return false
  }
}

/**
 * app 路径 → dist 内文档文件名（镜像上游 frontend-static 语义）。
 *
 * 返回 null = 非入口文档：先按静态资源解析，解析不到再走反代。
 * 入口应用文档（index.html）由壳直读并注入 boot 闸；公开文档
 * （landing/auth）按宿主同款映射直读（浏览器流中它们无需授权）。
 *
 * @param {string} pathname - URL 路径（已编码原样）。
 * @returns {string | null} dist 内文件名。
 */
export function appDocumentFile(pathname) {
  if (pathname === '/index.html' || pathname === APP_ENTRY_PATH) return 'index.html'
  if (pathname === '/') return 'landing.html'
  if (pathname === '/login' || pathname === '/setup') return 'auth.html'
  return null
}

/**
 * dist 内安全解析 URL 路径（防穿越、防空字节）。
 *
 * @param {string} distRoot - dist 绝对路径。
 * @param {string} pathname - URL 路径（原样编码）。
 * @returns {string | null} 绝对文件路径；越界/非法返回 null。
 */
export function resolveDistFile(distRoot, pathname) {
  let decoded
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const rel = decoded.replace(/^\/+/, '')
  if (rel === '') return null
  const abs = join(distRoot, rel)
  const rootWithSep = distRoot.endsWith(sep) ? distRoot : distRoot + sep
  if (!abs.startsWith(rootWithSep)) return null
  return abs
}

/**
 * 往 index.html 注入 boot 闸 deferred（client 的 qilinDesktopBoot.ready()
 * 落完注入表后 resolve；浏览器流由宿主 renderIndex 注入，壳流由此注入）。
 *
 * @param {string} html - dist/index.html 原文。
 * @returns {string}
 */
export function injectBootGate(html) {
  const gate = '<script>globalThis.__QILIN_BOOT_READY__ = Promise.withResolvers()</script>'
  const head = /<head[^>]*>/i.exec(html)
  if (head === null) return `${gate}${html}`
  const at = head.index + head[0].length
  return `${html.slice(0, at)}${gate}${html.slice(at)}`
}

/** 反代请求剥离的头：逐跳头 + 会把壳侧 origin/cookie 泄漏给宿主的头。 */
export const FORWARD_STRIP_HEADERS = new Set([
  'host',
  'origin',
  'cookie',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'content-length',
  'sec-fetch-site',
])

/**
 * 组装反代请求头：剥离 FORWARD_STRIP_HEADERS，附宿主会话 cookie。
 *
 * @param {Headers} requestHeaders - renderer 请求头。
 * @param {string} cookie - 壳托管的宿主会话 cookie（空串不附加）。
 * @returns {Record<string, string>}
 */
export function forwardHeaders(requestHeaders, cookie) {
  const out = {}
  for (const [key, value] of requestHeaders) {
    if (FORWARD_STRIP_HEADERS.has(key.toLowerCase())) continue
    out[key] = value
  }
  if (cookie !== '') out.cookie = cookie
  return out
}

/**
 * 从宿主响应提取会话 cookie（只取名=值对；属性留在主进程认知之外，
 * cookie 全程不进 renderer）。
 *
 * @param {{ headers: { getSetCookie?: () => string[], get: (name: string) => string | null } }} response
 * @returns {string} `name=value; name2=value2`；无会话头返回空串。
 */
export function extractAuthCookie(response) {
  const raw = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : []
  const pairs = raw
    .map((line) => line.split(';', 1)[0].trim())
    .filter((pair) => pair !== '')
  return pairs.join('; ')
}
