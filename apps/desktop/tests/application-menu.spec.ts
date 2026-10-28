import { describe, expect, it, vi } from 'vitest'
import type { MenuItemConstructorOptions } from 'electron'
import {
  CAPTION_MENUS, PROJECT_HOME_URL, PROJECT_ISSUES_URL, applicationMenu, captionMenu, captionMenuLabels,
  type ApplicationMenuActions, type MenuPlatform,
} from '../src/application-menu.ts'
import { en, zh } from '../src/locale.ts'

const labels = (items: readonly MenuItemConstructorOptions[]): (string | undefined)[] =>
  items.map(item => item.role ?? (item.type === 'separator' ? 'separator' : item.label))

function actions(overrides: Partial<ApplicationMenuActions> = {}): ApplicationMenuActions {
  const editItems: MenuItemConstructorOptions[] = [{ label: 'Undo', click: vi.fn() }]
  return {
    platform: 'darwin',
    messages: en,
    applicationName: 'QiLin Desktop',
    development: false,
    showAbout: vi.fn(),
    checkUpdates: vi.fn(),
    manageCommand: vi.fn(),
    restart: vi.fn(),
    openExternal: vi.fn(),
    quit: vi.fn(),
    command: (id, label) => ({ label, id: 'command:' + String(id), click: vi.fn() }),
    editItems: () => editItems,
    ...overrides,
  }
}

describe('application menu', () => {
  it.each(['darwin', 'linux'] as const)('offers the standard bar menus on %s', (platform) => {
    const template = applicationMenu(actions({ platform }))
    expect(template.map(item => item.label ?? item.role)).toEqual([
      platform === 'darwin' ? 'QiLin Desktop' : en.application,
      en.fileMenu, en.edit, en.viewMenu, en.windowMenu, en.helpMenu,
    ])
  })

  it('returns no native menu on Windows, whose caption bar owns the menus', () => {
    expect(applicationMenu(actions({ platform: 'win32' }))).toEqual([])
  })

  it('keeps About, Settings, updates, and quit in the application menu', () => {
    const [application] = applicationMenu(actions())
    expect(labels(application!.submenu as MenuItemConstructorOptions[])).toEqual([
      'about', 'separator', en.settingsMenu, en.checkUpdatesMenu, en.cliCommandMenu, 'separator',
      'services', 'separator', 'hide', 'hideOthers', 'unhide', 'separator', 'quit',
    ])
  })

  it('moves Settings and Exit into the File menu outside macOS', () => {
    const [, file] = applicationMenu(actions({ platform: 'linux' }))
    expect(labels(file!.submenu as MenuItemConstructorOptions[])).toEqual([
      en.newSessionMenu, en.searchSessionsMenu, en.addWorkspaceMenu, 'separator',
      en.settingsMenu, 'separator', en.closeWindowMenu, 'separator', en.exitApplication,
    ])
  })

  it('adds the developer lane only when it is available', () => {
    const packaged = applicationMenu(actions())
    const development = applicationMenu(actions({ development: true }))
    const count = (template: ReturnType<typeof applicationMenu>): number =>
      template.flatMap(item => Array.isArray(item.submenu) ? item.submenu : []).length
    expect(count(development)).toBeGreaterThan(count(packaged))
    const [, , , view] = development
    expect(labels(view!.submenu as MenuItemConstructorOptions[])).toEqual([
      en.toggleLeftSidebarMenu, en.toggleRightSidebarMenu, 'separator',
      'resetZoom', 'zoomIn', 'zoomOut', 'separator', 'togglefullscreen', 'separator', 'reload', 'forceReload', 'toggleDevTools',
    ])
  })

  it('opens the project destinations from Help', () => {
    const openExternal = vi.fn()
    const [, , , , , help] = applicationMenu(actions({ openExternal }))
    const items = help!.submenu as MenuItemConstructorOptions[]
    expect(labels(items)).toEqual([en.projectHomeMenu, en.reportIssueMenu])
    ;(items[0]!.click as () => void)()
    ;(items[1]!.click as () => void)()
    expect(openExternal.mock.calls).toEqual([[PROJECT_HOME_URL], [PROJECT_ISSUES_URL]])
  })

  it('carries the renderer binding and disabled state onto command entries', () => {
    const command = (id: string, label: string): MenuItemConstructorOptions => ({
      id: 'command:' + String(id), label, accelerator: 'Command+N', enabled: false, click: vi.fn(),
    })
    const [, file] = applicationMenu(actions({ command }))
    expect((file!.submenu as MenuItemConstructorOptions[])[0]).toMatchObject({
      id: 'command:session.new', accelerator: 'Command+N', enabled: false,
    })
  })

  it.each(CAPTION_MENUS)('builds the Windows %s caption menu from the same definitions', (menu) => {
    const shared = actions({ platform: 'win32' })
    const items = captionMenu(shared, menu)
    expect(items.length).toBeGreaterThan(0)
    if (menu === 'edit') expect(items).toEqual(shared.editItems())
  })

  it('labels every caption menu in dictionary order', () => {
    expect(captionMenuLabels(en).map(menu => menu.label)).toEqual([en.fileMenu, en.edit, en.viewMenu, en.helpMenu])
    expect(captionMenuLabels(zh).map(menu => menu.id)).toEqual([...CAPTION_MENUS])
  })

  it.each<MenuPlatform>(['darwin', 'win32', 'linux'])('shows About through the product dialog outside the macOS role (%s)', (platform) => {
    const showAbout = vi.fn()
    const menu = platform === 'win32'
      ? captionMenu(actions({ platform, showAbout }), 'help')
      : applicationMenu(actions({ platform, showAbout }))[0]!.submenu as MenuItemConstructorOptions[]
    const about = menu.find(item => item.label === en.aboutMenu)
    expect(about).toBeDefined()
    if (about?.role === undefined) (about!.click as () => void)()
    expect(showAbout).toHaveBeenCalledTimes(platform === 'darwin' ? 0 : 1)
  })
})
