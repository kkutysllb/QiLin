// desktop/preload/shell.cjs
/**
 * shell 窗口 preload 桥（最小白名单）。
 *
 * 两块桥面：
 * 1. `qilinDesktopBoot`——上游桌面启动门契约（apps/web/src/main.ts 找的
 *    就是这个名字，不得更名）：ready() 返回宿主的 index 注入表与
 *    streamBaseUrl，client 自行落注入表并 resolve __QILIN_BOOT_READY__ 闸；
 *    failed() 把 web-boot 致命错误上报主进程（启动页失败态）。
 * 2. `okShell`——自绘标题栏的只读动作：解析当前工作区、Finder 打开。
 *
 * 沙箱窗口的 preload 必须是 CommonJS（Electron 的 sandbox preload 不走
 * ESM），且除 `electron` 外无任何 require 能力——这正好限定桥面。
 * 桥面按 origin 门控：只有 qilin-app://app 页面拿得到 boot 桥。
 *
 * @module desktop/preload/shell
 */
const { contextBridge, ipcRenderer } = require('electron')

if (location.protocol === 'qilin-app:' && location.hostname === 'app') {
  contextBridge.exposeInMainWorld('qilinDesktopBoot', {
    /** 上游桌面启动门：{injections, streamBaseUrl}（宿主就绪后可用）。 */
    ready: () => ipcRenderer.invoke('ok:desktop-boot'),
    /** web-boot 致命错误上报（主进程转启动页失败态）。 */
    failed: (message) => ipcRenderer.invoke('ok:desktop-boot-failed', String(message)),
  })
}

contextBridge.exposeInMainWorld('okShell', {
  /** 当前会话工作区：{ name, path } | null。hint 可带页面读到的 sessionId。 */
  workspace: (hint) => ipcRenderer.invoke('ok:workspace', hint),
  /** 在系统文件管理器中打开当前工作区目录。 */
  revealWorkspace: (hint) => ipcRenderer.invoke('ok:workspace:reveal', hint),
})
