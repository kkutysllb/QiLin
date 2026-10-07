// desktop/main/menu.mjs
/**
 * macOS 应用菜单（中文品牌化）。
 *
 * 不设置时 Electron 挂默认英文菜单（About Electron / Reload / Toggle
 * Developer Tools…），与中文产品违和且 View 项会破坏 boot 闸状态。本
 * 菜单只做两件事：中文文案 + 按发布形态收紧——dev（未打包）保留重新
 * 加载与开发者工具，打包后去除；Edit 组保留（剪贴板快捷键依赖 role）。
 * Windows 的 frameless 窗口无菜单栏，无需设置。
 *
 * @module desktop/main/menu
 */

import { Menu, app } from 'electron'

/** 打包后收起 dev 专属项（重新加载 / 开发者工具）。 */
export function installAppMenu() {
  if (process.platform !== 'darwin') return
  app.setAboutPanelOptions({
    applicationName: 'QiLin Desktop',
    applicationVersion: app.getVersion(),
    credits: '基于 QiLin 构建\nQiLin 商标及 Logo 归其权利人所有；本发行版由 OpenKylin 维护',
  })
  const dev = app.isPackaged === false
  const template = [
    {
      label: 'QiLin Desktop',
      submenu: [
        { role: 'about', label: '关于 QiLin Desktop' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏 QiLin Desktop' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '全部显示' },
        { type: 'separator' },
        { role: 'quit', label: '退出 QiLin Desktop' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '拷贝' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '显示',
      submenu: [
        ...(dev
          ? [
              { role: 'reload', label: '重新加载' },
              { role: 'forceReload', label: '强制重新加载' },
              { role: 'toggleDevTools', label: '开发者工具' },
              { type: 'separator' },
            ]
          : []),
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '进入全屏' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { role: 'minimize', label: '最小化' },
        { role: 'zoom', label: '缩放' },
        { role: 'close', label: '关闭窗口' },
        { type: 'separator' },
        { role: 'front', label: '前置全部窗口' },
      ],
    },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(/** @type {import('electron').MenuItemConstructorOptions[]} */ (template)))
}
