// main/updater.mjs
/**
 * 自动更新（electron-updater，打包域依赖）——后台静默下载 + 确认安装。
 *
 * KStock 同款时序纪律（真金白银换来的）：
 * - 启动后台静默检查，发现新版本立即后台下载（用户无感知）；
 * - 下载完成弹系统通知；点击通知弹出确认安装；
 * - 确认安装：仅 downloaded 态才先停引擎进程树再 quitAndInstall
 *   （引擎未彻底退出时，替换文件会因占用失败/端口冲突）；
 * - 未就绪时一律只弹「更新尚未就绪」，绝不碰引擎。
 *
 * electron-updater 是打包域依赖（package 的 dependencies，进 asar）；
 * dev 态不安装本模块——动态 require，缺失即静默跳过。
 *
 * @module main/updater
 */

import { dialog, Notification } from 'electron'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)

/**
 * 挂载自动更新。dev 态（无 electron-updater）或未打包形态静默跳过。
 * @param {{ stopEngine: () => Promise<void>, ready: () => boolean }} hooks
 *   stopEngine：安装前引擎收尾（hostProcess.stop）；ready：发布形态判定。
 * @returns {{ checkNow: () => void } | null} 手动检查入口（菜单用）；未挂载 null。
 */
export function initializeUpdater(hooks) {
  if (hooks.ready() !== true) return null
  /** @type {any} */
  let autoUpdater
  try {
    autoUpdater = require_('electron-updater').autoUpdater
  } catch {
    console.warn('[updater] electron-updater 不可用（dev 态），跳过自动更新')
    return null
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true
  let downloaded = false

  autoUpdater.on('update-downloaded', () => {
    downloaded = true
    const notify = new Notification({
      title: 'QiLin Desktop',
      body: '新版本已就绪，退出时会自动安装；点击此处可立即更新。',
    })
    notify.on('click', () => { void installNow() })
    notify.show()
  })
  autoUpdater.on('error', (error) => {
    // 更新失败绝不打扰主流程：只留诊断日志
    console.warn('[updater] error:', error?.message ?? error)
  })

  async function installNow() {
    if (downloaded !== true) {
      await dialog.showMessageBox({ type: 'info', message: '更新尚未就绪', detail: '新版本仍在后台下载，完成时会通知你。' })
      return
    }
    // 先彻底停引擎（占用/端口冲突防护），再交安装器
    try { await hooks.stopEngine() } catch {}
    await autoUpdater.quitAndInstall()
  }

  function checkNow() {
    autoUpdater.checkForUpdates().catch((error) => {
      console.warn('[updater] check failed:', error?.message ?? error)
    })
  }
  checkNow()
  return { checkNow }
}
