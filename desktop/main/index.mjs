// desktop/main/index.mjs
/**
 * OpenKylin Desktop 主进程入口（原生桌面产品，2026-10-07 设计）。
 *
 * 启动流程：注册特权协议（ready 前） → 单实例锁 → app ready → 中文品牌
 * 启动页 → 挂协议处理器与 WS 头改写 → 启动引擎宿主子进程（Electron-as-
 * Node，程序化 boot 产品面）→ ready 后壳侧兑换认证 cookie（token 只进
 * 主进程）→ shell 窗口加载 qilin-app://app/workspace。退出时优雅关停
 * 宿主，绝不留孤儿进程。
 *
 * 运行树来源：`OPENKYLIN_QILIN_RUN`（dev 脚本传入品牌化 checkout），
 * 缺省回退到仓库内 `.tmp/dev/qilin-src`。
 *
 * @module desktop/main
 */

import { clipboard, ipcMain, app, shell, Tray, Menu, nativeImage } from 'electron'
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { WEB_DIST_DIR, persistHostPort, qilinHome, readPersistedHostPort, urlOrigin } from './qilin-contract.mjs'
import { hostProcess } from './host-process.mjs'
import { installAppMenu } from './menu.mjs'
import { attachQilinDesktopBridge } from './keyboard-bridge.mjs'
import { attachAppProtocol, attachWsRelay, authenticateWebHost, registerAppScheme, relayDebug } from './protocol.mjs'
import { ensureRuntimeTree, resolveRuntimeRoot } from './runtime-install.mjs'
import { CRASH_REPORT_KEEP, profileManifestPath, restoreShippedBundles } from './recovery.mjs'
import { initializeUpdater } from './updater.mjs'
import { createWorkspaceResolver } from './workspace.mjs'
import { closeSplash, focusShellWindow, getShellWindow, reportFatalToSplash, showShellWindow, showSplash } from './windows.mjs'

/** 产品仓库根（desktop/main 的上上级）。 */
const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url))

/** 品牌图标产物（scripts/gen-icons.mjs 生成）。 */
const ICONS_DIR = join(REPO_ROOT, 'branding', 'icons')

/** 品牌化 qilin 运行树：dev = 环境变量/标准落位；打包态由 runtime-install 解析（首启解压闭包）。 */
/** 当前运行树（launchHost 内 ensureRuntimeTree 后落值；诊断文本消费）。 */
let runtimeDirInUse = resolveRuntimeRoot({ isPackaged: app.isPackaged, userData: app.getPath('userData'), resourcesPath: process.resourcesPath })
/** 已挂 qilinDesktop 桥的窗口（一窗一桥；复用窗口不重挂）。 */
let bridgedWindow = null

// 特权 scheme 必须在 app ready 前注册（Electron 硬性时序）
registerAppScheme()

// 受限执行环境（CI 容器、嵌套沙箱）可把 userData 重定向到可写目录；
// 普通桌面环境下不设置，Electron 使用系统默认位置。
if (process.env.OPENKYLIN_USER_DATA !== undefined && process.env.OPENKYLIN_USER_DATA !== '') {
  app.setPath('userData', process.env.OPENKYLIN_USER_DATA)
}

/** 壳托管的会话 cookie 罐：设备 cookie（认证兑换）+ 账号会话 cookie
 * （登录流的反代响应捕获），全部只存在于主进程——renderer 的
 * document.cookie 恒为空。罐持久化到 userData（0600）并按宿主端口键控
 * （cookie 名绑定 authority，端口一致才回灌，见 M3.1）。 */
const relayState = {
  /** @type {Map<string, string>} */
  jar: new Map(),
  /** 宿主监听端口（launchHost 决策后落值；罐持久化的键）。 */
  port: null,
  /** @returns {string | null} 宿主就绪 URL（未就绪 null）。 */
  readyUrl: () => hostProcess.status.url,
  /** @returns {string} `name=value; name2=value2` 形态的 Cookie 头。 */
  cookieHeader: () => [...relayState.jar.entries()].map(([name, value]) => `${name}=${value}`).join('; '),
  /** @param {string[]} setCookieLines - 宿主响应的 set-cookie 行（全量）。 */
  absorbCookies: (setCookieLines) => {
    for (const line of setCookieLines) {
      const pair = line.split(';', 1)[0].trim()
      const at = pair.indexOf('=')
      if (at <= 0) continue
      relayState.jar.set(pair.slice(0, at), pair.slice(at + 1))
    }
    scheduleJarSave()
  },
  reset: () => {
    relayState.jar.clear()
    scheduleJarSave()
  },
}

/* ---------- 宿主稳定端口与 cookie 罐持久化（M3.1） ---------- */

/** cookie 罐持久化文件（userData 内 0600；OPENKYLIN_USER_DATA 可重定向）。 */
function jarFilePath() {
  return join(app.getPath('userData'), 'host-cookies.json')
}

/** 端口一致才回灌：cookie 名绑定 `127.0.0.1:<port>` authority，端口换了
 * 旧名字全部失配，回灌只是噪声。文件缺失/损坏按空罐起步。 */
function loadJar(port) {
  try {
    const payload = JSON.parse(readFileSync(jarFilePath(), 'utf8'))
    if (payload?.port !== port || payload?.cookies === null || typeof payload?.cookies !== 'object') return
    for (const [name, value] of Object.entries(payload.cookies)) {
      if (name !== '' && typeof value === 'string') relayState.jar.set(name, value)
    }
  } catch {
    // 无持久化文件（首次启动）或 JSON 损坏：空罐
  }
}

/** @type {NodeJS.Timeout | null} */
let jarSaveTimer = null

/** 罐落盘（500ms 去抖；0600，失败不阻塞会话）。 */
function scheduleJarSave() {
  if (jarSaveTimer !== null) return
  jarSaveTimer = setTimeout(() => {
    jarSaveTimer = null
    try {
      mkdirSync(app.getPath('userData'), { recursive: true })
      const payload = { port: relayState.port, cookies: Object.fromEntries(relayState.jar) }
      writeFileSync(jarFilePath(), JSON.stringify(payload), { encoding: 'utf8', mode: 0o600 })
    } catch {
      // userData 只读等异常：持久化退化为本次会话内有效
    }
  }, 500)
  jarSaveTimer.unref?.()
}

/** 探测 127.0.0.1 端口当前是否可绑定。 */
function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => server.close(() => resolve(true)))
    server.listen(port, '127.0.0.1')
  })
}

/** 向系统要一个当前空闲的 127.0.0.1 端口。 */
function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = /** @type {{ port: number }} */ (server.address())
      server.close(() => resolve(address.port))
    })
  })
}

/**
 * 宿主端口决策：记忆端口空闲 → 沿用（登录会话随之跨启动存活）；被占
 * （上次异常残留的监听等）→ 换新随机端口并重写记忆。
 */
async function pickHostPort() {
  const persisted = readPersistedHostPort()
  if (persisted !== null && await isPortFree(persisted)) return persisted
  const port = await findFreePort()
  persistHostPort(port)
  return port
}

/** 启动引擎宿主：运行树就位（打包态首启解压闭包）→ 端口决策 → 罐回灌 → spawn。 */
async function launchHost() {
  runtimeDirInUse = await ensureRuntimeTree({ isPackaged: app.isPackaged, userData: app.getPath('userData'), resourcesPath: process.resourcesPath })
  // 协议承载：distRoot 依赖运行树（打包态首启解压后才知道路径），挂载必须
  // 在 shell 窗口加载前完成——宿主 ready 早于窗口创建，此处时序安全
  attachAppProtocol({ distRoot: join(runtimeDirInUse, WEB_DIST_DIR), state: relayState })
  const port = await pickHostPort()
  relayState.port = port
  loadJar(port)
  hostProcess.start({ runtimeDir: runtimeDirInUse, port })
}

/** 组装诊断文本（状态快照 + 日志尾部），供启动页「复制诊断信息」。 */
function diagnosticsText() {
  const status = hostProcess.status
  const lines = [
    'OpenKylin Desktop 诊断信息',
    `时间：${new Date().toISOString()}`,
    `运行树：${runtimeDirInUse ?? '(未就绪)'}`,
    `QiLin home：${qilinHome()}`,
    `Electron：${process.versions.electron}  Node：${process.versions.node}`,
    `状态：${JSON.stringify(status)}`,
    `插件面 manifest：${profileManifestPath()}`,
    '',
    '--- 宿主日志尾部 ---',
    ...hostProcess.logTail.map((entry) => `[${entry.stream}] ${entry.line}`),
  ]
  return lines.join('\n')
}

/** 崩溃报告落盘：userData/crash-reports/host-<时间戳>.txt（0600，滚动保留
 * 最近 CRASH_REPORT_KEEP 份）。落盘失败静默返回 null——报告本身不允许
 * 二次致灾。
 *
 * @param {string} reason - 失败原因单行。
 * @param {string} diagnostics - 完整诊断文本（状态快照 + 宿主日志尾部）。
 * @returns {string | null} 报告文件绝对路径。
 */
function writeCrashReport(reason, diagnostics) {
  try {
    const dir = join(app.getPath('userData'), 'crash-reports')
    mkdirSync(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const file = join(dir, `host-${stamp}.txt`)
    writeFileSync(
      file,
      `OpenKylin Desktop 崩溃报告\n时间：${new Date().toISOString()}\n\n--- 原因 ---\n${reason}\n\n--- 诊断 ---\n${diagnostics}\n`,
      { encoding: 'utf8', mode: 0o600 },
    )
    const reports = readdirSync(dir).filter((name) => /^host-.*\.txt$/.test(name)).sort()
    for (const name of reports.slice(0, Math.max(0, reports.length - CRASH_REPORT_KEEP))) {
      try { rmSync(join(dir, name)) } catch {}
    }
    return file
  } catch {
    return null
  }
}

/* ---------- 启动页 IPC（白名单：重试 / 复制诊断） ---------- */

ipcMain.handle('splash:retry', () => {
  // 重试 = 完整重启流程（端口重新决策 + 罐回灌）。罐不清空：cookie 名
  // 绑定 authority，端口没换就仍然有效，端口换了名字自然失配。
  void hostProcess.stop().then(launchHost)
  return true
})

// 恢复入口：把插件面重置为出厂模板层（第三方插件不再装配，安装记录
// 保留）后重启引擎。无论是否真的移除了插件，都走同一重启流程。
ipcMain.handle('splash:recover-disable-plugins', () => {
  const recovery = restoreShippedBundles()
  if (recovery.error !== null) {
    reportFatalToSplash(`${recovery.error}\n\n可手工检查 profile manifest：${profileManifestPath()}`)
    return { ok: false, error: recovery.error }
  }
  void hostProcess.stop().then(launchHost)
  return { ok: true, removed: recovery.removed, backupPath: recovery.backupPath }
})
ipcMain.handle('splash:copy', () => {
  const text = diagnosticsText()
  clipboard.writeText(text)
  return text
})

/* ---------- 桌面 boot 门 IPC（上游契约桥：qilinDesktopBoot） ---------- */

ipcMain.handle('ok:desktop-boot', () => {
  const status = hostProcess.status
  if (status.state !== 'ready' || status.url === null || hostProcess.injections === null) {
    throw new Error('宿主未就绪，无法交付桌面 boot 数据')
  }
  return {
    injections: hostProcess.injections,
    streamBaseUrl: urlOrigin(status.url),
  }
})
ipcMain.handle('ok:desktop-boot-failed', (_event, message) => {
  reportFatalToSplash(`工作区启动失败：${String(message)}`)
  return true
})

/* ---------- 入口选择：登录态决定 landing 还是工作区 ---------- */

// 3.1.x 产品面启用账号门：/api 需要账号会话。未登录时进登录文档
// （/login = auth.html，自带登录面），登录成功后 client 进入 /workspace；
// 已登录直达。探针打公开的 /api/auth/status（宿主直连，附壳托管 cookie）。
async function entryPathFor(state) {
  const readyUrl = state.readyUrl()
  if (readyUrl === null) return '/login'
  try {
    const response = await fetch(new URL('/api/auth/status', readyUrl), {
      headers: { cookie: state.cookieHeader() },
    })
    const payload = await response.json()
    relayDebug('entry', 'authenticated =', payload?.authenticated)
    return payload?.authenticated === true ? '/workspace' : '/login'
  } catch {
    return '/login'
  }
}

/* ---------- 标题栏 IPC：工作区解析 + Finder 打开（白名单桥） ---------- */

// 解析"当前会话 → 本地目录"：读自家 QILIN_HOME 的会话投影缓存（明文
// JSON，含 cwd 与标题），按窗口标题/页面提示定位当前会话——零网络通路。
const workspaceResolver = createWorkspaceResolver(() => ({
  home: qilinHome(),
  getTitle: () => getShellWindow()?.webContents.getTitle() ?? '',
}))

ipcMain.handle('ok:workspace', (_event, hint) => workspaceResolver.workspace(hint))
ipcMain.handle('ok:workspace:reveal', async (_event, hint) => {
  const workspace = await workspaceResolver.workspace(hint)
  if (workspace === null) return { ok: false, reason: 'no-workspace' }
  const error = await shell.openPath(workspace.path)
  return error === '' ? { ok: true } : { ok: false, reason: error }
})

/* ---------- 单实例：第二次启动只聚焦现有窗口 ---------- */

/** 回到产品面：聚焦现有 shell（不重载，保留页面现场）；不在则按宿主状态重建。 */
function revealShell() {
  if (focusShellWindow()) return
  if (hostProcess.status.state === 'ready') showShellWindow()
  else showSplash()
}

/** 托盘菜单的引擎状态行——开菜单时现算，永远新鲜。 */
function trayEngineLine() {
  const status = hostProcess.status
  switch (status.state) {
    case 'ready': {
      let port = ''
      try { port = `:${new URL(status.url ?? '').port}` } catch {}
      return `引擎运行中${port}`
    }
    case 'starting': return '引擎启动中…'
    case 'restarting': return '引擎重启中…'
    case 'failed': return '引擎异常（详情见启动页）'
    default: return '引擎已停止'
  }
}

/**
 * 系统托盘（QL 模板图）。左键 = 聚焦工作区（既有语义，不重载）；右键 =
 * 菜单：打开 / 引擎状态 / 检查更新（打包态才有）/ 关于 / 退出。
 * 退出走 before-quit 的优雅关停序列（先停引擎再退，绝不留孤儿）。
 * @param {{ checkNow: (() => void) | null }} hooks
 */
function installTray({ checkNow }) {
  try {
    const tray = new Tray(join(ICONS_DIR, 'tray-Template.png'))
    tray.setToolTip('QiLin Desktop')
    tray.on('click', () => {
      revealShell()
      app.focus({ steal: true })
    })
    tray.on('right-click', () => {
      /** @type {Electron.MenuItemConstructorOptions[]} */
      const items = [
        { label: '打开 QiLin', click: () => { revealShell(); app.focus({ steal: true }) } },
        { type: 'separator' },
        { label: trayEngineLine(), enabled: false },
        { type: 'separator' },
        { label: '关于 QiLin Desktop', click: () => app.showAboutPanel() },
      ]
      if (checkNow !== null) {
        items.push({ type: 'separator' }, { label: '检查更新…', click: () => checkNow() })
      }
      items.push({ type: 'separator' }, { label: '退出 QiLin Desktop', click: () => app.quit() })
      tray.popUpContextMenu(Menu.buildFromTemplate(items))
    })
    return tray
  } catch (error) {
    console.warn('[openkylin] tray init failed:', error)
    return null
  }
}


const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    // 仅聚焦不重载：保留用户停留页面（同 activate 语义）
    revealShell()
  })

  app.whenReady().then(() => {
    // （回调体末尾配 .catch 兜底，见链尾）
    // 品牌面：Dock 图标（打包后由 .icns 提供，dev 期显式设置）+ 中文应用菜单
    // + 系统托盘（QL template 图；点击聚焦窗口，非保活——关窗即退不变）。
    // 图标缺失只降级观感，绝不阻塞启动链（whenReady 回调抛错会吞掉
    // splash/launchHost 全部后续——教训见打包态首启冒烟）
    try {
      app.dock?.setIcon(join(ICONS_DIR, 'qilin-512.png'))
    } catch (error) {
      console.warn('[openkylin] dock icon set failed:', error)
    }
    installAppMenu()
    // 自动更新（仅打包态挂载；安装前先停引擎，见 updater.mjs 时序纪律）；
    // checkNow 交给托盘菜单（dev 态未挂载 → 菜单不出该项）
    const updater = initializeUpdater({
      stopEngine: () => hostProcess.stop(),
      ready: () => app.isPackaged === true,
    })
    installTray({ checkNow: updater?.checkNow ?? null })

    // 启动即显示中文品牌启动页；宿主在后台准备
    showSplash()

    // WS 头改写：不依赖运行树路径，here 即挂（未就绪的宿主请求得 503）；
    // qilin-app 协议处理器在 launchHost 内运行树就位后挂载
    attachWsRelay({ state: relayState })

    hostProcess.on('state-changed', (status) => {
      if (status.state !== 'ready' || status.url === null) return
      // 就绪 → 壳侧兑换设备 cookie（token 不出主进程）→ 按登录态选入口 →
      // 进工作区。宿主重启（含崩溃自动重启）后 client 必须重新 boot：
      // showShellWindow 复用窗口时整页重载。
      void authenticateWebHost(status.url).then(async (deviceCookie) => {
        if (deviceCookie === '') {
          throw new Error('宿主认证兑换失败：未取得会话 cookie（token 交换无 set-cookie）')
        }
        relayState.absorbCookies([deviceCookie])
        // 3.1.x 产品面启用账号门：未登录时进登录文档（/login，自带登录
        // 面），已登录（含罐回灌的跨启动会话）直达工作区。先建 shell 窗口
        // 再关 splash——顺序反了会在 await 空窗期落进 window-all-closed
        // 而整壳退出。
        const entryPath = await entryPathFor(relayState)
        const shellWindow = showShellWindow(entryPath)
        closeSplash()
        // qilinDesktop 桥（darwin 运行时 keyboard/shortcuts 双面，缺任一
        // client-shortcuts 即 throw）：运行树就绪后挂载，一个窗口只挂一次
        //（宿主崩溃重启复用窗口，重复挂会双份 before-input-event 转发）
        if (bridgedWindow !== shellWindow) {
          bridgedWindow = shellWindow
          void attachQilinDesktopBridge(shellWindow, runtimeDirInUse).catch((error) => {
            console.error('[openkylin] keyboard bridge attach failed:', error)
          })
        }
      }).catch((error) => {
        reportFatalToSplash(`宿主认证失败：${error instanceof Error ? error.message : String(error)}`)
      })
    })
    hostProcess.on('state-changed', (status) => {
      if (status.state !== 'failed' || status.error === null) return
      // 崩溃报告先落盘再报错（附路径，用户可随诊断一起提交）
      const report = writeCrashReport(status.error, diagnosticsText())
      reportFatalToSplash(status.error + (report !== null ? `\n\n崩溃报告已写入：${report}` : ''))
    })

    void launchHost().catch((error) => {
      reportFatalToSplash(`启动失败：${error instanceof Error ? error.message : String(error)}`)
    })

    app.on('activate', () => {
      // macOS dock 图标点击/Cmd+Tab 切回：见 revealShell——保留页面现场
      revealShell()
    })
  }).catch((error) => {
    // whenReady 链兜底：单点异常不再静默吞掉 splash/launchHost 全链
    console.error('[openkylin] whenReady chain failed:', error)
  })

  /* ---------- 退出序列：优雅关停宿主，绝不留孤儿进程 ---------- */

  app.on('before-quit', (event) => {
    if (hostProcess.status.state === 'stopped' || hostProcess.status.state === 'failed') return
    event.preventDefault()
    void hostProcess.stop().then(() => {
      app.exit(0)
    })
  })

  app.on('window-all-closed', () => {
    // 启动页被用户关闭（尚未就绪）或工作区关闭：直接退出（含 macOS，
    // 首版不做托盘保活；退出序列会先优雅关停宿主）
    app.quit()
  })

  /* ---------- 终端信号兜底：dev 下 Ctrl+C 也不留孤儿进程 ---------- */

  const signalShutdown = (signal) => {
    process.removeAllListeners(signal)
    void hostProcess.stop().finally(() => app.exit(0))
  }
  process.on('SIGINT', () => signalShutdown('SIGINT'))
  process.on('SIGTERM', () => signalShutdown('SIGTERM'))

  /* ---------- 开发期主进程崩溃可读 ---------- */

  process.on('uncaughtException', (error) => {
    console.error('[openkylin] uncaught exception:', error)
  })
}
