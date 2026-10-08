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
  // 引擎 darwin 桌面分支的启闭标记（ui-primitives isDarwinDesktop 与全套
  // [data-platform='darwin'] CSS 读它）：折叠侧栏整列归零（无痕）、会话头
  // leading 座位补回开关/新会话、侧栏分区表头。纯 web 永不设置——这正是
  // 桌面形态与浏览器形态的分叉点。preload 执行极早（沙箱下
  // documentElement 可能为 null，2026-10-08 实测崩整个 preload 链），
  // 兜底挂 DOMContentLoaded——引擎在渲染期才读标记，必然晚于它。
  const markDarwin = () => { document.documentElement.dataset.platform = 'darwin' }
  if (document.documentElement !== null) markDarwin()
  else document.addEventListener('DOMContentLoaded', markDarwin, { once: true })

  // qilinDesktop 桥（上游桌面契约的另两张面孔；darwin 运行时的 shortcuts
  // 服务要求 keyboard + shortcuts 双面俱在，缺任一即 throw——见
  // keyboard-bridge.mjs 头注）。纯转发：偏好存储与 accelerator 仲裁都在
  // 主进程（file paths and accelerators never cross from Renderer）。
  const onMain = (channel, listener) => {
    const handler = (_event, payload) => listener(payload)
    ipcRenderer.on(channel, handler)
    return () => { ipcRenderer.removeListener(channel, handler) }
  }
  contextBridge.exposeInMainWorld('qilinDesktop', {
    shortcuts: {
      get: (definitions) => ipcRenderer.invoke('qilin:shortcuts:get', definitions),
      edit: (edit, revision) => ipcRenderer.invoke('qilin:shortcuts:edit', edit, revision),
      subscribe: (listener) => onMain('qilin:shortcuts:snapshot', listener),
      recording: (active) => ipcRenderer.invoke('qilin:shortcuts:recording', active),
    },
    keyboard: {
      subscribe: (listener) => onMain('qilin:keyboard:input', listener),
      closeWindow: (revision) => ipcRenderer.invoke('qilin:keyboard:close', revision),
    },
  })
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
