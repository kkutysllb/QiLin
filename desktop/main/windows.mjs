// desktop/main/windows.mjs
/**
 * 窗口层：qilin-app://app 承载的主工作区窗口（shell）+ 中文品牌启动页 + 关于面板。
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
import { BrowserWindow, app, nativeImage, nativeTheme, shell } from 'electron'
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

/** 关于面板 HTML 的本地 URL（壳自绘，见 showAboutWindow）。 */
const ABOUT_URL = pathToFileURL(join(HERE, '../renderer/about.html')).href

/** 关于面板的麒麟印章图（品牌图标；dev 与打包态同路径，打包由 files 收进 asar）。 */
const ABOUT_SEAL = join(HERE, '../../branding/icons/qilin-512.png')

/** 按系统主题选窗口底色（共享主题 Token 的 paper 对），避免加载期白闪/黑闪。 */
export function splashBackgroundColor() {
  return nativeTheme.shouldUseDarkColors ? '#17191C' : '#F7F3EA'
}

/** @type {BrowserWindow | null} */
let splashWindow = null
/** @type {BrowserWindow | null} */
let shellWindow = null
/** @type {BrowserWindow | null} */
let aboutWindow = null

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
      // 顶拖拽条）里。两个实测结论（Electron 44，AXCloseButton 闭环校准）：
      // 1. **frame:false 下 trafficLightPosition 根本不生效**（配置 26/36
      //    按钮 AX 位置纹丝不动，停在 macOS 默认 center 16——"红绿灯偏高"
      //    的真因）；darwin 必须走 titleBarStyle:'hidden'（等价无边框观感
      //    + 红绿灯受控）。
      // 2. hidden 下 y ≈ 16px 按钮的 top-left：实测 y:26 → 中心 33（+7）。
      //    要中心落在 26 光学线（strip 开关/收起态控件 DOM 实测 cy=26）
      //    → 配 y:19。CDP 截图渲染不出原生按钮，对齐只能 AX 实测量。
      ...(process.platform === 'darwin'
        ? {
            titleBarStyle: 'hidden',
            trafficLightPosition: { x: 13, y: 19 },
          }
        : { frame: false }),
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
 * 显示「关于 QiLin Desktop」面板（壳自绘）。
 *
 * 不用 app.showAboutPanel：macOS 原生面板的图标取自 .app bundle，运行时改不了
 * （AboutPanelOptions.iconPath 仅 linux/win32）——dev 形态跑 Electron 二进制，
 * 原生面板只会显示 Electron 默认图标。自绘面板在两种形态下都显示麒麟印章：
 * 印章图由主进程读成 data URL，页面加载落定后经 window.okAboutPaint 注入。
 *
 * @returns {BrowserWindow} 面板窗口（重复调用聚焦既有窗口）
 */
export function showAboutWindow() {
  if (aboutWindow !== null && !aboutWindow.isDestroyed()) {
    aboutWindow.show()
    aboutWindow.focus()
    return aboutWindow
  }
  const win = new BrowserWindow({
    width: 380,
    height: 368,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    frame: false,
    // 圆角卡片：透明底 + 页面内自绘圆角/描边（不透明窗口的方角会露白）
    transparent: true,
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    title: '关于 QiLin Desktop',
    webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
  })
  aboutWindow = win
  win.once('ready-to-show', () => {
    win.show()
    win.focus()
  })
  // 焦点离开即收起（原生 About 面板同款手感）；窗口销毁后清引用
  win.on('blur', () => { win.close() })
  win.on('closed', () => { aboutWindow = null })
  /** 关于面板正文：印章 data URL + 版本 + 版权行。 */
  const payload = {
    icon: aboutSealDataUrl(),
    version: app.getVersion(),
    credits: '基于 QiLin 构建\nQiLin 商标及 Logo 归其权利人所有；本发行版由 OpenKylin 维护',
  }
  void win.loadURL(ABOUT_URL)
    .then(() => win.webContents.executeJavaScript(`window.okAboutPaint(${JSON.stringify(payload)})`))
    .catch((error) => {
      console.warn('[windows] about panel paint failed:', error)
    })
  return win
}

/**
 * 麒麟印章的 data URL（2x 供 Retina；读图失败返回空串——页面回落到朱砂底纹，
 * 印章缺失只降级观感，不阻塞面板）。
 *
 * @returns {string}
 */
function aboutSealDataUrl() {
  try {
    const image = nativeImage.createFromPath(ABOUT_SEAL).resize({ width: 184 })
    return image.isEmpty() ? '' : image.toDataURL()
  } catch (error) {
    console.warn('[windows] about seal load failed:', error)
    return ''
  }
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
