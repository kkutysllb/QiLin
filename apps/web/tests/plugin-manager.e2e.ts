// Web e2e scenario: the plugin manager tab of the Settings Plugins section over a
// managed scaffold profile: installed bundles, their rows, and bundle enablement. Zero
// model calls: everything is client state plus the profile files and the settings
// document, so there is no fixture and a stray stream would fail loud on the open llm seam.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { join } from 'node:path'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, openSettingsDialog, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./expected/plugin-manager', import.meta.url))
const MANAGER_EXPECTED = join(SNAPSHOT_DIR, 'manager.expected.md')
const LIVE_EXPECTED = join(SNAPSHOT_DIR, 'live-enabled.expected.md')
const FIXTURE_PLUGINS = fileURLToPath(new URL('./fixtures/plugins', import.meta.url))
const MODE = webSnapshotMode()

describe('web e2e: plugin manager', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      profile: { packages: [{ dir: join(FIXTURE_PLUGINS, 'fixture-bundle') }] },
    })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  /** Close any open settings dialog, so the sidebar and the main column are clickable. */
  async function closeSettings() {
    if (await page.getByRole('dialog', { name: '设置' }).count() > 0) {
      await page.keyboard.press('Escape')
      await expect.poll(() => page.getByRole('dialog', { name: '设置' }).count(), { timeout: 5_000 }).toBe(0)
    }
  }

  /** Reopen the Settings Plugins section's management tab and wait for its cards page. */
  async function openPluginsPanel() {
    if (await page.getByRole('dialog', { name: '设置' }).count() > 0) {
      await page.keyboard.press('Escape')
      await expect.poll(() => page.getByRole('dialog', { name: '设置' }).count(), { timeout: 5_000 }).toBe(0)
    }
    const dialog = await openSettingsDialog(page, '账户', '设置')
    await dialog.getByRole('button', { name: '内置插件', exact: true }).click()
    await dialog.getByRole('tab', { name: '插件管理', exact: true }).click()
    const panel = page.locator('[data-plugin-panel]')
    await panel.getByRole('heading', { name: '插件', exact: true }).waitFor({ timeout: 10_000 })
    return panel
  }

  /** One file under the harness home, or the empty string while it does not exist. */
  async function homeFile(...segments: string[]): Promise<string> {
    return readFile(join(scaffold.harnessHome, ...segments), 'utf8').catch(() => '')
  }

  it('lists the installed bundles with their switches and leaves the installation\'s own to Settings', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-plugin-manager-list'))
    const panel = await openPluginsPanel()

    await panel.getByText('bundle', { exact: true }).waitFor({ timeout: 20_000 })
    const toggle = panel.getByRole('switch', { name: '启用 bundle' })
    expect(await toggle.getAttribute('aria-checked')).toBe('false')
    // The profile's own group holds its one bundle; the installation's optional bundles open the Official
    // group, followed by the official plugins that registered their configuration, and its other bundles
    // stay off the page.
    expect(await panel.locator('[data-plugin-group="bundles"] [data-plugin-package]').count()).toBe(1)
    expect(await panel.locator('[data-plugin-group="official"] [data-plugin-package]').count()).toBe(2)
    expect(await panel.locator('[data-plugin-group="official"] [data-plugin-item]').count()).toBe(4)
    expect(await panel.getByText('Beta', { exact: true }).count()).toBe(2)
    // A bundle that is off still shows the rows its patch declares, without switches.
    await panel.getByRole('button', { name: '查看 bundle' }).click()
    await panel.locator('[data-plugin-row]', { hasText: 'fixture-row' }).waitFor({ timeout: 10_000 })
    expect(await panel.getByRole('switch', { name: '启用组件 fixture-row' }).count()).toBe(0)
    await panel.getByRole('button', { name: '卸载 bundle' }).waitFor({ timeout: 5_000 })
    await panel.getByRole('button', { name: '返回插件列表' }).click()
    await expect.poll(() => panel.getByRole('button', { name: '卸载 bundle' }).count(), { timeout: 5_000 }).toBe(0)

    const snapshot = await captureStableAria(page, '[data-plugin-panel]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(MANAGER_EXPECTED, snapshot, MODE)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('updates built-in names and descriptions when the UI language changes', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-plugin-manager-locale'))
    const panel = await openPluginsPanel()
    await panel.getByRole('button', { name: '查看 智能体团队', exact: true }).click()
    const packageName = panel.locator('[data-plugin-name]')
    expect(await packageName.textContent()).toBe('@qilin/experimental-agent-team-profile')
    expect(await panel.getByText('启用智能体团队协作与团队工具。').count()).toBe(1)
    try {
      // The dialog is modal, so the scenario leaves it, switches the language
      // from the account menu, and comes back; the tab remounts, so the bundle
      // page is re-opened instead of being expected to survive the detour.
      await page.keyboard.press('Escape')
      await expect.poll(() => page.getByRole('dialog', { name: '设置' }).count(), { timeout: 5_000 }).toBe(0)
      await page.getByRole('button', { name: '账户', exact: true }).click()
      await page.getByRole('menuitem', { name: '语言', exact: true }).click()
      await page.getByRole('menuitem', { name: 'English', exact: true }).click()
      const english = await openSettingsDialog(page, 'Account', 'Settings')
      await english.getByRole('button', { name: 'Built-in plugins', exact: true }).click()
      // The tab row belongs to the Plugins section; the page mounts inside the selected tab.
      await english.getByRole('tab', { name: 'Manage plugins', exact: true }).click()
      const englishPanel = page.locator('[data-plugin-panel]')
      await englishPanel.getByRole('heading', { name: 'Plugins', exact: true }).waitFor({ timeout: 10_000 })
      await englishPanel.getByRole('button', { name: 'View Agent Teams', exact: true }).click()
      expect(await packageName.textContent()).toBe('@qilin/experimental-agent-team-profile')
      expect(await englishPanel.getByText('Enable agent team collaboration and team tools.').count()).toBe(1)
      await englishPanel.getByRole('button', { name: 'Back to plugins', exact: true }).click()
      for (const title of ['Agent Teams', 'Agent Teams Web UI']) {
        await englishPanel.getByRole('button', { name: `View ${title}`, exact: true }).waitFor()
        expect(await englishPanel.getByRole('switch', { name: `Enable ${title}`, exact: true }).count()).toBe(1)
      }
      expect(await englishPanel.getByText('View team members, the task board, and teammate sessions in the browser.').count()).toBe(1)
      // The official configuration pages follow the language too, from their own dictionary.
      for (const title of ['Shell', 'Agent loop', 'Subagent', 'Web search']) {
        await englishPanel.getByRole('button', { name: `View ${title}`, exact: true }).waitFor()
      }
      // The same account menu switches the interface back to Chinese.
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Account', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Language', exact: true }).click()
      await page.getByRole('menuitem', { name: '中文', exact: true }).click()
      const zhPanel = await openPluginsPanel()
      await zhPanel.getByRole('button', { name: '查看 智能体团队', exact: true }).waitFor()
    } finally {
      await closeSettings()
    }
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('checks a spec before installing it and words what the check refused', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-plugin-manager-install'))
    const panel = await openPluginsPanel()
    await panel.getByRole('button', { name: '添加插件', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '添加插件' })
    await dialog.waitFor({ timeout: 10_000 })
    const field = dialog.getByRole('textbox', { name: '包名或地址' })
    const install = dialog.getByRole('button', { name: '安装', exact: true })
    expect(await install.isDisabled()).toBe(true)
    // A name the list already shows is refused without asking the Host.
    await field.fill('@fixture/bundle')
    await install.click()
    await dialog.getByRole('alert').waitFor({ timeout: 5_000 })
    expect(await dialog.getByRole('alert').textContent()).toBe('该插件已安装')
    // A path the Host cannot read as a package is refused with its reason, and the spec stays editable.
    await field.fill(join(scaffold.harnessHome, 'no-such-plugin'))
    await install.click()
    await expect.poll(() => dialog.getByRole('alert').textContent(), { timeout: 10_000 }).toBe('该路径不存在或不是有效的插件包')
    expect(await field.isDisabled()).toBe(false)
    // A name the registry would refuse never reaches it.
    await field.fill('Not A Package')
    await install.click()
    await expect.poll(() => dialog.getByRole('alert').textContent(), { timeout: 10_000 }).toContain('无法识别这个包名或地址')
    await dialog.getByRole('button', { name: '关闭' }).click()
    await expect.poll(() => page.getByRole('dialog', { name: '添加插件' }).count(), { timeout: 5_000 }).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('enables a bundle into the profile manifest, mounts its rows live, and switches one of them', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-plugin-manager-enable'))
    const panel = await openPluginsPanel()
    const toggle = panel.getByRole('switch', { name: '启用 bundle' })
    await toggle.waitFor({ timeout: 20_000 })
    const mounted = () => [...scaffold.ctx.loader.entries()].find(entry => entry.options.id === 'fixture-row')
    expect(mounted()?.fiber?.state).toBeUndefined()

    await toggle.click()

    const bundles = async () => (JSON.parse(await homeFile('profiles', 'scaffold', 'package.json')) as {
      qilin: { profile: { bundles: string[] } }
    }).qilin.profile.bundles
    await expect.poll(bundles, { timeout: 10_000 }).toEqual(['@qilin/base', '@qilin/web-app', '@fixture/bundle'])
    // A live profile: the row mounts once the whole tree recomposed, the switch is on, and nothing waits for a restart.
    await expect.poll(() => mounted()?.fiber?.state, { timeout: 20_000 }).toBe(2)
    await expect.poll(() => toggle.getAttribute('aria-checked'), { timeout: 10_000 }).toBe('true')
    expect(await panel.getByText(/下次启动生效/).count()).toBe(0)
    const snapshot = await captureStableAria(page, '[data-plugin-panel]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(LIVE_EXPECTED, snapshot, MODE)
    // The pack's page lists its rows as the Host runs them, each with a switch that writes the profile patch.
    await panel.getByRole('button', { name: '查看 bundle' }).click()
    const rowSwitch = panel.getByRole('switch', { name: '启用组件 fixture-row' })
    await rowSwitch.waitFor({ timeout: 10_000 })
    expect(await rowSwitch.getAttribute('aria-checked')).toBe('true')
    await rowSwitch.click()
    await expect.poll(async () => (await homeFile('profiles', 'scaffold', 'cordis.patch.yml')).includes('fixture-row'), { timeout: 10_000 }).toBe(true)
    await expect.poll(() => rowSwitch.getAttribute('aria-checked'), { timeout: 10_000 }).toBe('false')
    // A disabled entry keeps its disposed fiber; only an active one counts as mounted.
    await expect.poll(() => mounted()?.fiber?.state, { timeout: 20_000 }).not.toBe(2)
    await rowSwitch.click()
    await expect.poll(() => mounted()?.fiber?.state, { timeout: 20_000 }).toBe(2)
    await panel.getByRole('button', { name: '返回插件列表' }).click()

    await toggle.click()
    await expect.poll(() => mounted()?.fiber?.state, { timeout: 20_000 }).not.toBe(2)
    await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('false')
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    expect(tripwire.warnings).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, ['manager.expected.md', 'live-enabled.expected.md'])
  })
})


describe('web e2e: startup-applied plugin management', () => {
  it('saves a bundle selection that waits for the next start and keeps its rows read-only', async () => {
    const scaffold = await launchWebScaffold({
      profile: { hmr: false, packages: [{ dir: join(FIXTURE_PLUGINS, 'fixture-bundle') }] },
    })
    let browser: Browser | undefined
    try {
      browser = await chromium.launch()
      const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
      const tripwire = watchConsole(page)
      onTestFailed(() => saveFailureShot(page, 'web-e2e-plugin-manager-live'))
      await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      const dialog = await openSettingsDialog(page, '账户', '设置')
      await dialog.getByRole('button', { name: '内置插件', exact: true }).click()
      await dialog.getByRole('tab', { name: '插件管理', exact: true }).click()
      const panel = page.locator('[data-plugin-panel]')
      await panel.getByRole('heading', { name: '插件', exact: true }).waitFor({ timeout: 10_000 })
      const toggle = panel.getByRole('switch', { name: '启用 bundle' })
      await toggle.waitFor({ timeout: 20_000 })
      const mounted = () => [...scaffold.ctx.loader.entries()].find(entry => entry.options.id === 'fixture-row')
      const bundles = async () => {
        const text = await readFile(join(scaffold.harnessHome, 'profiles', 'scaffold', 'package.json'), 'utf8')
        return (JSON.parse(text) as { qilin: { profile: { bundles: string[] } } }).qilin.profile.bundles
      }
      expect(mounted()?.fiber?.state).toBeUndefined()
      await toggle.click()
      // The selection is saved and the switch turns on, but nothing mounts before the next start; a toast says so.
      await expect.poll(bundles).toEqual(['@qilin/base', '@qilin/web-app', '@fixture/bundle'])
      await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('true')
      await page.getByText('更改将在下次启动生效', { exact: true }).waitFor({ timeout: 10_000 })
      expect(mounted()?.fiber?.state).toBeUndefined()
      // The pack's page lists its rows from their declarations, with no live entry to switch.
      await panel.getByRole('button', { name: '查看 bundle' }).click()
      await panel.locator('[data-plugin-row]', { hasText: 'fixture-row' }).waitFor({ timeout: 10_000 })
      expect(await panel.getByRole('switch', { name: '启用组件 fixture-row' }).isDisabled()).toBe(true)
      await panel.getByRole('button', { name: '返回插件列表' }).click()

      await toggle.click()
      await expect.poll(bundles).toEqual(['@qilin/base', '@qilin/web-app'])
      await expect.poll(() => toggle.getAttribute('aria-checked')).toBe('false')
      expect(tripwire.pageErrors).toEqual([])
    } finally {
      await browser?.close()
      await scaffold.close()
    }
  }, 60_000)
})
