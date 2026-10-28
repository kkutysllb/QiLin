/** Standard desktop menu model: one definition drives the native menu bar and the Windows caption bar. */

import type { MenuItemConstructorOptions } from 'electron'
import type { ShortcutCommandId } from '@qilin-agent/client-shortcuts/protocol'
import type { DesktopMessages } from './locale.ts'

/** Project home the Help menu opens. */
export const PROJECT_HOME_URL = 'https://github.com/kkutysllb/QiLin'
/** Issue tracker the Help menu opens. */
export const PROJECT_ISSUES_URL = 'https://github.com/kkutysllb/QiLin/issues'

/** Caption-bar menus drawn inside the Windows title bar, in bar order. */
export const CAPTION_MENUS = ['file', 'edit', 'view', 'help'] as const

/** One caption-bar menu identity. */
export type CaptionMenu = (typeof CAPTION_MENUS)[number]

/** Operating systems whose menu layout differs. */
export type MenuPlatform = 'darwin' | 'win32' | 'linux'

/** Main-process actions and renderer bindings one menu definition needs. */
export interface ApplicationMenuActions {
  /** Operating system presenting the menu. */
  readonly platform: MenuPlatform
  /** Selected Desktop dictionary; every label comes from it. */
  readonly messages: DesktopMessages
  /** Application name macOS shows on the first menu. */
  readonly applicationName: string
  /** Whether developer entries are available. */
  readonly development: boolean
  /** Show the product's About dialog. */
  readonly showAbout: () => void
  /** Check for updates now. */
  readonly checkUpdates: () => void
  /** Open the qilin command manager. */
  readonly manageCommand: () => void
  /** Restart the application and its Host. */
  readonly restart: () => void
  /** Open one https destination in the default browser. */
  readonly openExternal: (url: string) => void
  /** Request quit through the same confirmation as the window control. */
  readonly quit: () => void
  /** One renderer-owned command entry carrying its current binding. */
  readonly command: (id: ShortcutCommandId, label: string) => MenuItemConstructorOptions
  /** Windows editing entries, whose history the editor owns. */
  readonly editItems: () => MenuItemConstructorOptions[]
}

const command = (actions: ApplicationMenuActions, id: string, label: string): MenuItemConstructorOptions =>
  actions.command(id as ShortcutCommandId, label)

/** The application menu shared by macOS and Linux; macOS also owns About and quit roles. */
function applicationMenuItems(actions: ApplicationMenuActions): MenuItemConstructorOptions[] {
  const { messages, platform, development } = actions
  return [
    platform === 'darwin'
      ? { role: 'about', label: messages.aboutMenu }
      : { label: messages.aboutMenu, click: actions.showAbout },
    { type: 'separator' },
    command(actions, 'settings.open', messages.settingsMenu),
    { label: messages.checkUpdatesMenu, click: actions.checkUpdates },
    ...platform === 'darwin' || platform === 'win32'
      ? [{ label: messages.cliCommandMenu, click: actions.manageCommand }]
      : [],
    ...development ? [
      { type: 'separator' as const },
      { label: messages.reloadPageMenu, role: 'reload' as const },
      { label: messages.restartAppHostMenu, click: actions.restart },
    ] : [],
    { type: 'separator' },
    ...platform === 'darwin' ? [
      { role: 'hide' as const, label: messages.hideApplication },
      { role: 'hideOthers' as const, label: messages.hideOtherApplications },
      { role: 'unhide' as const, label: messages.showAllApplications },
      { type: 'separator' as const },
      { role: 'quit' as const, label: messages.quitApplication },
    ] : [
      { label: messages.exitApplication, click: actions.quit },
    ],
  ]
}

/** File menu: session and workspace entry points, then window and application lifecycle. */
function fileMenuItems(actions: ApplicationMenuActions): MenuItemConstructorOptions[] {
  const { messages, platform } = actions
  return [
    command(actions, 'session.new', messages.newSessionMenu),
    command(actions, 'session.search', messages.searchSessionsMenu),
    command(actions, 'workspace.add', messages.addWorkspaceMenu),
    { type: 'separator' },
    ...platform === 'darwin' ? [] : [
      command(actions, 'settings.open', messages.settingsMenu),
      ...actions.development ? [
        { label: messages.restartAppHostMenu, click: actions.restart },
      ] : [],
      { type: 'separator' as const },
    ],
    command(actions, 'page.close', messages.closeWindowMenu),
    ...platform === 'darwin' ? [] : [
      { type: 'separator' as const },
      { label: messages.exitApplication, click: actions.quit },
    ],
  ]
}

/** View menu: pane visibility, page zoom, and the developer lane. */
function viewMenuItems(actions: ApplicationMenuActions): MenuItemConstructorOptions[] {
  const { messages, development } = actions
  return [
    command(actions, 'sidebar.left.toggle', messages.toggleLeftSidebarMenu),
    command(actions, 'sidebar.right.toggle', messages.toggleRightSidebarMenu),
    { type: 'separator' },
    { role: 'resetZoom', label: messages.resetZoomMenu },
    { role: 'zoomIn', label: messages.zoomInMenu },
    { role: 'zoomOut', label: messages.zoomOutMenu },
    { type: 'separator' },
    { role: 'togglefullscreen', label: messages.toggleFullScreenMenu },
    ...development ? [
      { type: 'separator' as const },
      { role: 'reload' as const, label: messages.reloadPageMenu },
      { role: 'forceReload' as const, label: messages.forceReloadMenu },
      { role: 'toggleDevTools' as const, label: messages.toggleDevToolsMenu },
    ] : [],
  ]
}

/** Help menu: project destinations, then the update and About entries outside macOS. */
function helpMenuItems(actions: ApplicationMenuActions): MenuItemConstructorOptions[] {
  const { messages, platform } = actions
  return [
    { label: messages.projectHomeMenu, click: () => { actions.openExternal(PROJECT_HOME_URL) } },
    { label: messages.reportIssueMenu, click: () => { actions.openExternal(PROJECT_ISSUES_URL) } },
    ...platform === 'darwin' ? [] : [
      { type: 'separator' as const },
      { label: messages.checkUpdatesMenu, click: actions.checkUpdates },
      { label: messages.aboutMenu, click: actions.showAbout },
    ],
  ]
}

/** Edit menu: native roles, or the editor-owned keys the Windows caption bar needs. */
function editMenu(actions: ApplicationMenuActions): MenuItemConstructorOptions {
  return actions.platform === 'win32'
    ? { label: actions.messages.edit, submenu: actions.editItems() }
    : { role: 'editMenu' }
}

/**
 * The complete native menu template for this platform.
 * @param actions - menu labels, renderer commands, and main-process callbacks.
 * @returns menus for the native menu bar; Windows returns none because its caption bar owns them.
 */
export function applicationMenu(actions: ApplicationMenuActions): MenuItemConstructorOptions[] {
  if (actions.platform === 'win32') return []
  return [
    {
      label: actions.platform === 'darwin' ? actions.applicationName : actions.messages.application,
      submenu: applicationMenuItems(actions),
    },
    { label: actions.messages.fileMenu, submenu: fileMenuItems(actions) },
    editMenu(actions),
    { label: actions.messages.viewMenu, submenu: viewMenuItems(actions) },
    { role: 'windowMenu' },
    { label: actions.messages.helpMenu, submenu: helpMenuItems(actions) },
  ]
}

/**
 * One Windows caption-bar menu, anchored by the shell's own title-bar buttons.
 * @param actions - menu labels, renderer commands, and main-process callbacks.
 * @param menu - caption menu identity.
 * @returns that menu's entries.
 */
export function captionMenu(actions: ApplicationMenuActions, menu: CaptionMenu): MenuItemConstructorOptions[] {
  switch (menu) {
    case 'file': return fileMenuItems(actions)
    case 'edit': return actions.editItems()
    case 'view': return viewMenuItems(actions)
    case 'help': return helpMenuItems(actions)
  }
}

/**
 * Caption-bar button labels for the Windows title bar.
 * @param messages - selected Desktop dictionary.
 * @returns each menu identity with its bar label, in bar order.
 */
export function captionMenuLabels(messages: DesktopMessages): { readonly id: CaptionMenu; readonly label: string }[] {
  return [
    { id: 'file', label: messages.fileMenu },
    { id: 'edit', label: messages.edit },
    { id: 'view', label: messages.viewMenu },
    { id: 'help', label: messages.helpMenu },
  ]
}
