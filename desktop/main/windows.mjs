// desktop/main/windows.mjs
/**
 * 窗口层：qilin-app://app 承载的主工作区窗口（shell）+ 中文品牌启动页。
 *
 * shell 窗口加载壳自有特权协议的入口地址（qilin-app://app/workspace）：
 * 静态资源壳直读 dist、动态请求壳认证反代到宿主——renderer 可见面里
 * 只有 qilin-app://app，宿主 URL 与认证 cookie 都不出主进程。这就是
 * "桌面端与上游 web 端完全一致"的机制保证：同一份 Web client 构建
 * 物、同一套主题，桌面侧只有壳层（协议承载 + 自绘标题栏）。
 *
 * @module desktop/main/windows
 */

import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { BrowserWindow, nativeTheme, shell } from 'electron'
import { APP_ENTRY_PATH, APP_ORIGIN, isAllowedNavigation } from './qilin-contract.mjs'
import { hostProcess } from './host-process.mjs'

/** 本文件所在目录（desktop/main）——ESM 主进程没有 __dirname。 */
const HERE = import.meta.dirname

/** 桌面壳自有页面（启动页）的 preload 绝对路径。 */
const SPLASH_PRELOAD = join(HERE, '../preload/splash.mjs')

/** shell 窗口的标题栏 + 桌面 boot 桥 preload（CJS：沙箱 preload 不走 ESM）。 */
const SHELL_PRELOAD = join(HERE, '../preload/shell.cjs')

/** 启动页 HTML 的本地 URL。 */
const SPLASH_URL = pathToFileURL(join(HERE, '../renderer/splash.html')).href

/** 按系统主题选窗口底色（共享主题 Token 的 paper 对），避免加载期白闪/黑闪。 */
export function splashBackgroundColor() {
  return nativeTheme.shouldUseDarkColors ? '#17191C' : '#F7F3EA'
}

/** @type {BrowserWindow | null} */
let splashWindow = null
/** @type {BrowserWindow | null} */
let shellWindow = null

/**
 * 创建并显示中文品牌启动页。
 *
 * 订阅宿主状态变化并转发（renderer 经 preload 的 onState 渲染
 * starting/restarting/failed 态）；加载完成后立即补发当前快照。
 *
 * @returns {BrowserWindow}
 */
export function showSplash() {
  if (splashWindow !== null && !splashWindow.isDestroyed()) return splashWindow
  const win = new BrowserWindow({
    width: 560,
    height: 420,
    minWidth: 480,
    minHeight: 360,
    title: 'QiLin Desktop',
    resizable: false,
    show: false,
    autoHideMenuBar: true,
    frame: false,
    backgroundColor: splashBackgroundColor(),
    webPreferences: {
      preload: SPLASH_PRELOAD,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })
  splashWindow = win
  win.once('ready-to-show', () => win.show())
  // 状态转发：启动页渲染的是宿主状态机
  const forward = (status) => {
    if (!win.isDestroyed()) win.webContents.send('splash:state', status)
  }
  hostProcess.on('state-changed', forward)
  win.on('closed', () => {
    hostProcess.removeListener('state-changed', forward)
    splashWindow = null
  })
  void win.loadURL(SPLASH_URL).then(() => {
    // 补发当前快照：订阅先于渲染完成注册，首帧即见真实状态
    forward(hostProcess.status)
  })
  return win
}

/** 关闭启动页（进入 shell 或应用退出时）。 */
export function closeSplash() {
  if (splashWindow !== null && !splashWindow.isDestroyed()) splashWindow.close()
  splashWindow = null
}

/** 直接向启动页（必要时重建）推一条失败态（web-boot 致命错误入口）。 */
export function reportFatalToSplash(message) {
  const win = showSplash()
  win.webContents.send('splash:state', { state: 'failed', error: message })
}

/**
 * 创建（或复用）shell 窗口并加载 app 入口。
 *
 * @param {string} [entryPath] - 入口路径（'/workspace' 直达工作区；'/' 进
 *   landing 登录面——账号门未登录时的产品语义，镜像宿主 302 行为）。
 *   宿主每次就绪（含崩溃重启换端口后）都应调用：client 需要重新走
 *   boot 门拿新的 streamBaseUrl 与注入表，因此复用窗口时整页重载。
 */
export function showShellWindow(entryPath = APP_ENTRY_PATH) {
  if (shellWindow === null || shellWindow.isDestroyed()) {
    shellWindow = new BrowserWindow({
      width: 1440,
      height: 900,
      minWidth: 960,
      minHeight: 600,
      show: false,
      title: 'QiLin Desktop',
      backgroundColor: splashBackgroundColor(),
      // 无边框桌面：红绿灯叠在引擎 darwin 分支自绘的 topStrip（52px 侧栏
      // 顶拖拽条）里。trafficLightPosition 是第一枚按钮的位置（12px 高，
      // 中心 y = 52/2 = 26 → top-left y = 20；x=13 与 KCoder/KStock 同款）。
      // 顶带、标题、面板按钮全部引擎自持——壳不再注入任何标题栏（KStock
      // 同款形态；旧注入式标题栏随无痕化退役，见 desktop/main/titlebar.mjs）。
      frame: false,
      ...(process.platform === 'darwin'
        ? {
            trafficLightPosition: { x: 13, y: 20 },
          }
        : {}),
      // 沙箱载体：无 node、仅标题栏 + 桌面 boot 白名单桥、webSecurity 开启
      webPreferences: {
        preload: SHELL_PRELOAD,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    })
    // frameless 的 macOS 窗口默认不带红绿灯：显式召回，位置走
    // trafficLightPosition（老版本 Electron 无此 API 时跳过——红绿灯
    // 缺失只影响关停/缩放按钮，不阻塞窗口）。
    if (process.platform === 'darwin' && typeof shellWindow.setWindowButtonVisibility === 'function') {
      try {
        shellWindow.setWindowButtonVisibility(true)
      } catch (error) {
        console.warn('[windows] setWindowButtonVisibility failed:', error)
      }
    }
    // 顶带全部引擎自持（darwin 分支的 topStrip + 会话头 data-window-drag），
    // 不再注入壳标题栏
    shellWindow.once('ready-to-show', () => {
      shellWindow?.maximize()
      shellWindow?.show()
    })
    // 只允许停留在壳自有协议；外链交给系统浏览器
    shellWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:/i.test(url)) void shell.openExternal(url)
      return { action: 'deny' }
    })
    shellWindow.webContents.on('will-navigate', (event, url) => {
      if (!isAllowedNavigation(url)) {
        event.preventDefault()
        if (/^https?:/i.test(url)) void shell.openExternal(url)
      }
    })
    // qilin Web UI 无需任何浏览器特权
    shellWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => {
      callback(false)
    })
  }
  // cookie 由主进程托管（设备 + 账号），页面无需 token——按登录态加载入口
  void shellWindow.loadURL(`${APP_ORIGIN}${entryPath}`)
  return shellWindow
}

/** 供单实例/激活路径引用。 */
export function getShellWindow() {
  return shellWindow
}

/**
 * 聚焦已存在的 shell 窗口，**不重载页面**。
 *
 * dock 图标点击 / Cmd+Tab 切回 / 二次启动等"回到应用"场景专用：用户可能
 * 停留在设置页等任意位置，整页重载会丢现场（v0.1.0 用户实测反馈）。
 * 宿主就绪后的入口加载走 showShellWindow（boot 门要求整页重载，语义不同）。
 *
 * @returns {boolean} 是否存在可聚焦的 shell 窗口
 */
export function focusShellWindow() {
  if (shellWindow === null || shellWindow.isDestroyed()) return false
  if (shellWindow.isMinimized()) shellWindow.restore()
  shellWindow.show()
  shellWindow.focus()
  return true
}
