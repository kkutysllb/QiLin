// main/protocol.mjs
/**
 * qilin-app:// 特权协议（原生桌面产品的 Web 承载层）。
 *
 * 三路由（dsh 参考实现同构）：
 *   1. `qilin-app://app` 的 SPA 入口（/、/index.html、/workspace）——
 *      壳直读 dist/index.html 并注入 `__QILIN_BOOT_READY__` 闸；
 *   2. 其余 dist 内静态文件（/assets/*、favicon 等）——壳直读；
 *   3. 其余 app 路径（/api/*、/plugins/*、/open-in-app/*、媒体路由）——
 *      认证反代到宿主 loopback：Origin 强制 qilin-app://app、剥离
 *      host/origin/cookie/逐跳头、附壳托管的会话 cookie、流式透传，
 *      set-cookie 不回 renderer（cookie 全程只存在于主进程）。
 *
 * 流式响应（Gateway WS mux /api/remote.mux）不走协议：client 的
 * streamBaseUrl 指向宿主 loopback origin，壳用 onBeforeSendHeaders 对
 * ws:// 与 wss:// 的 127.0.0.1/* 改写 Origin 并附认证 cookie。
 *
 * @module main/protocol
 */

import { createReadStream, existsSync, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { protocol, session } from 'electron'
import {
  APP_HOSTNAME,
  APP_ORIGIN,
  appDocumentFile,
  extractAuthCookie,
  forwardHeaders,
  injectBootGate,
  resolveDistFile,
  urlOrigin,
} from './qilin-contract.mjs'

/** 静态文件的 Content-Type（拓展名白名单，未命中按字节流）。 */
const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json'],
  ['.map', 'application/json'],
  ['.webmanifest', 'application/manifest+json'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.gif', 'image/gif'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.ttf', 'font/ttf'],
  ['.otf', 'font/otf'],
  ['.wasm', 'application/wasm'],
  ['.txt', 'text/plain; charset=utf-8'],
])

/**
 * @typedef {{ readyUrl: () => string | null, cookieHeader: () => string, absorbCookies: (setCookieLines: string[]) => void, reset: () => void }} RelayState
 * 壳托管的会话状态（只读视图 + 受控写入口）：cookie 罐里既有认证兑换的
 * 设备 cookie，也有反代响应捕获的账号会话 cookie（登录流）——全部只存在
 * 于主进程，renderer 的 document.cookie 恒为空。
 */

/** 中继调试日志（OPENKYLIN_RELAY_DEBUG=1 时启用；dev 排障用）。 */
export function relayDebug(...parts) {
  if (process.env.OPENKYLIN_RELAY_DEBUG !== '1') return
  console.log('[relay]', ...parts)
}

/** 从 set-cookie 行取名值对（属性不进罐：路径/域由宿主 origin 语义决定）。 */
function cookiePairOf(setCookieLine) {
  return setCookieLine.split(';', 1)[0].trim()
}

/**
 * 注册特权 scheme。必须在 app ready 之前调用（Electron 硬性时序）。
 */
export function registerAppScheme() {
  protocol.registerSchemesAsPrivileged([{
    scheme: 'qilin-app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      codeCache: true,
    },
  }])
}

/**
 * 挂载协议处理器（app ready 后、首次加载前调用一次）。
 *
 * @param {{ distRoot: string, state: RelayState }} options
 */
export function attachAppProtocol({ distRoot, state }) {
  protocol.handle('qilin-app', (request) => handleAppRequest(request, { distRoot, state }))
}

/**
 * 对 ws:// 与 wss:// 的 127.0.0.1/* 改写 Origin / 附会话 cookie（流式 mux 的认证载体）。
 * 门控：浏览器给 WS 握手自动带发起页 Origin——只有 Origin 已是
 * qilin-app://app（壳自有页面发起）才改写，防止本机其它进程/页面
 * 借道蹭走托管 cookie。
 */
export function attachWsRelay({ state }) {
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['ws://127.0.0.1/*', 'wss://127.0.0.1/*'] },
    (details, callback) => {
      const headers = { ...details.requestHeaders }
      const originHeader = Object.keys(headers).find((key) => key.toLowerCase() === 'origin')
      const fromAppPage = headers[originHeader] === APP_ORIGIN || details.referrer.startsWith('qilin-app://')
      const readyUrl = state.readyUrl()
      if (fromAppPage && readyUrl !== null) {
        headers[originHeader ?? 'Origin'] = urlOrigin(readyUrl) ?? headers[originHeader]
        const cookieHeader = state.cookieHeader()
        if (cookieHeader !== '') headers.Cookie = cookieHeader
      }
      callback({ requestHeaders: headers })
    },
  )
}

/**
 * 壳侧认证兑换：manual-redirect 访问宿主就绪 URL（含 launch token），
 * 从 303 的 set-cookie 取签名会话 cookie，交给调用方进 cookie 罐。
 *
 * @param {string} readyUrl - 宿主 ready 消息的 URL。
 * @returns {Promise<string>} 设备会话 cookie 的名值对；兑换失败返回空串。
 */
export async function authenticateWebHost(readyUrl) {
  const response = await fetch(readyUrl, { redirect: 'manual' })
  const cookie = extractAuthCookie(response)
  relayDebug('exchange', response.status, readyUrl, '→', cookie === '' ? '(empty)' : `${cookie.split('=')[0]}=<set>`)
  return cookie
}

/* ---------- 内部 ---------- */

/**
 * @param {Request} request
 * @param {{ distRoot: string, state: RelayState }} context
 * @returns {Promise<Response>}
 */
async function handleAppRequest(request, { distRoot, state }) {
  let url
  try {
    url = new URL(request.url)
  } catch {
    return new Response('bad request', { status: 400 })
  }
  if (url.hostname !== APP_HOSTNAME) {
    return new Response(`unknown host ${url.hostname}`, { status: 404 })
  }
  const method = request.method.toUpperCase()
  if (method !== 'GET' && method !== 'HEAD') {
    return forwardRequest(request, { state, pathname: url.pathname, search: url.search })
  }
  // 文档路由：入口应用文档（index.html，注入未决 boot 闸）与公开文档
  // （landing/auth，宿主语义 = 免授权直读）由壳直读 dist；其余先试
  // 静态资源，再走反代（/api、/plugins 等动态面）。
  const documentFile = appDocumentFile(url.pathname)
  if (documentFile !== null) {
    return serveDocument(distRoot, documentFile)
  }
  const file = resolveDistFile(distRoot, url.pathname)
  if (file !== null && existsSync(file) && statSync(file).isFile()) {
    return serveFile(file, method)
  }
  return forwardRequest(request, { state, pathname: url.pathname, search: url.search })
}

/**
 * 壳直读的 HTML 文档：index.html 注入未决 boot 闸（client 的
 * qilinDesktopBoot.ready() 落注入表后 resolve）；公开文档按原样字节。
 * 不缓存（dist 重 build 后立即生效）。
 */
async function serveDocument(distRoot, file) {
  const doc = resolveDistFile(distRoot, `/${file}`)
  if (doc === null || !existsSync(doc)) {
    return new Response(`web client dist missing at ${distRoot}`, { status: 500 })
  }
  const html = await new Response(Readable.toWeb(createReadStream(doc))).text()
  const body = file === 'index.html' ? injectBootGate(html) : html
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' },
  })
}

/** dist 静态文件（HEAD 只给头）。 */
function serveFile(file, method) {
  const type = MIME.get(file.slice(file.lastIndexOf('.')).toLowerCase()) ?? 'application/octet-stream'
  const headers = { 'content-type': type }
  if (method === 'HEAD') return new Response(null, { status: 200, headers })
  return new Response(Readable.toWeb(createReadStream(file)), { status: 200, headers })
}

/**
 * 认证反代：Origin 白名单 → 剥离壳侧头 → 附 cookie → 流式透传；
 * 响应剥离 set-cookie 与被 undici 解码过的压缩头。
 *
 * @param {Request} request
 * @param {{ state: RelayState, pathname: string, search: string }} target
 * @returns {Promise<Response>}
 */
async function forwardRequest(request, { state, pathname, search }) {
  const readyUrl = state.readyUrl()
  if (readyUrl === null) {
    return new Response('host not ready', { status: 503 })
  }
  const origin = request.headers.get('origin')
  if (origin !== null && origin !== APP_ORIGIN) {
    return new Response('forbidden origin', { status: 403 })
  }
  const target = new URL(readyUrl)
  target.pathname = pathname
  target.search = search
  const headers = forwardHeaders(request.headers, state.cookieHeader())
  relayDebug('forward', request.method, pathname, '→', target.origin, 'cookies:', headers.cookie !== undefined ? `${headers.cookie.split(';').length} 条` : '(none)')
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD'
  const init = /** @type {RequestInit & { duplex?: string }} */ ({
    method: request.method,
    headers,
    redirect: 'manual',
  })
  if (hasBody) {
    init.body = request.body
    init.duplex = 'half'
  }
  let upstream
  try {
    upstream = await fetch(target, init)
  } catch (error) {
    return new Response(`host unreachable: ${error instanceof Error ? error.message : String(error)}`, { status: 502 })
  }
  // 登录/会话流：捕获宿主下发的会话 cookie 进主进程罐（不透传 renderer）
  const setCookies = typeof upstream.headers.getSetCookie === 'function' ? upstream.headers.getSetCookie() : []
  if (setCookies.length > 0) {
    state.absorbCookies(setCookies)
    relayDebug('absorb', pathname, '→', setCookies.map((line) => `${cookiePairOf(line).split('=')[0]}=<set>`).join(', '))
  }
  const out = new Headers()
  for (const [key, value] of upstream.headers) {
    const lower = key.toLowerCase()
    if (lower === 'set-cookie' || lower === 'content-encoding' || lower === 'content-length'
      || lower === 'connection' || lower === 'keep-alive' || lower === 'transfer-encoding') {
      continue
    }
    out.set(key, value)
  }
  if (pathname.startsWith('/plugins/')) out.set('cache-control', 'no-store')
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out })
}
