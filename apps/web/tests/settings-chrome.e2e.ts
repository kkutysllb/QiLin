// Web e2e scenarios: the settings surface — the modal shell (trigger, nav,
// section switching, both close paths), the account menu's theme and language
// preferences (the real gesture — pick 深色 in the sidebar menu and the whole
// cascade runs: ThemeRuntime preference -> Host settings -> theme/change ->
// ui-layout's presenter -> body attribute -> alias token + browser theme-color
// metadata), the busy-state Enter preference (Host-backed), plus Permission as
// the persisted default for subsequently created sessions.
// Zero model calls: everything is pure client + persistence state on a blank
// frame, so there is no fixture and a stray stream would fail loud on the
// open llm seam.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Browser, Locator, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed, onTestFinished } from 'vitest'
import { join } from 'node:path'
import { SessionId } from '@qilin/session'
import {
  acknowledgeReloadConnectionLoss, assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, watchConsole, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { openSettings, ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./expected/settings-chrome', import.meta.url))
const DIALOG_EXPECTED = join(SNAPSHOT_DIR, 'dialog.expected.md')
const PLUGINS_EXPECTED = join(SNAPSHOT_DIR, 'plugins.expected.md')
const PLUGIN_INSTANCES_EXPECTED = join(SNAPSHOT_DIR, 'plugin-instances.expected.md')
// The English fallback surface: a browser naming no shipped language.
const DIALOG_EN_EXPECTED = join(SNAPSHOT_DIR, 'dialog-en.expected.md')
const PLUGIN_ROW_SELECTOR = '[data-plugin-scope="preset"] [data-plugin-entry="tool-subagent"]'
const MODE = webSnapshotMode()

describe('web e2e: settings modal and General preferences', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
    // Chinese browser: the shared page asserts the localized settings surface
    // the client derives from it (the English default has its own spec below).
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('opens the settings dialog, switches sections, and closes by every path', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-shell'))
    // The footer's account row is the only Settings entry point; its menu
    // carries the row that reveals the panel.
    const account = page.locator('[class*="footArea"] [aria-haspopup="menu"]')
    expect(await account.getAttribute('aria-expanded')).toBe('false')
    await account.click()
    await page.getByRole('menuitem', { name: '设置', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.waitFor({ timeout: 10_000 })
    // General is active by default; Permission and Font size are functional,
    // while the theme and language choices live in the account menu.
    expect(await dialog.getByRole('button', { name: '通用设置' }).getAttribute('aria-current')).toBe('true')
    await dialog.getByRole('button', { name: '工作区内修改' }).waitFor({ timeout: 10_000 })
    await expect.poll(() => dialog.getByText('字号大小', { exact: true }).count(), { timeout: 5_000 }).toBe(1)
    expect(await dialog.getByText('外观', { exact: true }).count()).toBe(0)
    expect(await dialog.getByText('语言', { exact: true }).count()).toBe(0)
    const openDocument = dialog.getByRole('button', { name: '打开配置文件' })
    await openDocument.waitFor({ timeout: 10_000 })
    let openRequests = 0
    await page.route('**/api/settings/openSettingsDocument', async (route) => {
      const envelope = route.request().postDataJSON() as {
        rpcId: string
        payload: { args: Record<string, never> }
      }
      expect(envelope.payload).toEqual({ args: {} })
      openRequests += 1
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          type: 'server-response',
          rpcId: envelope.rpcId,
          result: { ok: true, value: { opened: true } },
        }),
      })
    })
    await openDocument.click()
    await expect.poll(() => openRequests, { timeout: 5_000 }).toBe(1)
    await expect.poll(() => openDocument.isEnabled(), { timeout: 5_000 }).toBe(true)
    await page.unroute('**/api/settings/openSettingsDocument')
    // Golden of the freshly opened dialog (default zh, General active).
    const snapshot = await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(DIALOG_EXPECTED, snapshot, MODE)
    // Section switch: aria-current moves (the Models page itself has its own scenario file).
    await dialog.getByRole('button', { name: '模型' }).click()
    await expect.poll(() => dialog.getByRole('button', { name: '模型' }).getAttribute('aria-current'), { timeout: 5_000 }).toBe('true')
    expect(await dialog.getByRole('button', { name: '通用设置' }).getAttribute('aria-current')).toBeNull()
    // Plugins is a read-only projection of the same assembled Loader tree.
    // Capture one stable shipped row rather than the whole inventory so adding
    // an unrelated plugin does not rewrite this surface's golden.
    await dialog.getByRole('button', { name: '插件', exact: true }).click()
    await dialog.getByRole('heading', { name: '插件', exact: true }).waitFor({ timeout: 10_000 })
    await dialog.getByRole('tab', { name: '插件列表', exact: true }).click()
    // The preset group opens first with its display-only switcher; the global
    // plane starts collapsed and expands on demand.
    const presetSwitcher = dialog.getByRole('button', { name: '选择要查看的 Agent 预设' })
    await presetSwitcher.waitFor({ timeout: 10_000 })
    // The shipped default's zh display name comes from the zh dictionaries.
    expect(await presetSwitcher.textContent()).toBe('标准模式（默认）')
    await dialog.getByRole('button', { name: /^全局/ }).click()
    const pluginRow = dialog.locator(PLUGIN_ROW_SELECTOR)
    await pluginRow.waitFor({ timeout: 10_000 })
    const expectedPluginCount = [...scaffold.ctx.loader.entries()]
      .filter(entry => !entry.options.group)
      .length
    const pluginSearch = dialog.getByRole('searchbox', { name: '搜索插件' })
    expect(await pluginSearch.count()).toBe(1)
    // Every Loader entry appears exactly once in the global group — rows the
    // presets took over included, preset compositions excluded.
    expect(await dialog.locator('[data-plugin-scope="global"] [data-plugin-entry]').count())
      .toBe(expectedPluginCount)
    expect(await dialog.locator('[data-plugin-count]').getAttribute('data-plugin-count'))
      .toBe(String(expectedPluginCount))
    expect(await dialog.getByRole('button', { name: '插件', exact: true }).getAttribute('aria-current')).toBe('true')
    expect(await dialog.getByRole('tab', { name: '插件列表', exact: true }).getAttribute('aria-selected')).toBe('true')
    expect(await dialog.getByRole('button', { name: '模型' }).getAttribute('aria-current')).toBeNull()
    const pluginsSnapshot = await captureStableAria(
      page,
      PLUGIN_ROW_SELECTOR,
      scaffold.workspaceCwd,
    )
    await compareOrRefreshGolden(PLUGINS_EXPECTED, pluginsSnapshot, MODE)
    await pluginSearch.fill('tool-subagent')
    const instanceRows = [
      ['tool-subagent', '已启用'],
      ['tool-subagent-fork', '已启用'],
      ['tool-subagent-codex', '已停用'],
      ['tool-subagent-claude-code', '已停用'],
    ] as const
    for (const [entryId, status] of instanceRows) {
      const row = dialog.locator(`[data-plugin-scope="preset"] [data-plugin-entry="${entryId}"]`)
      const trigger = row.getByRole('button', { name: `tool-subagent, ${entryId}, ${status}`, exact: true })
      await trigger.waitFor({ timeout: 10_000 })
      expect(await trigger.getAttribute('aria-expanded')).toBe('false')
      const identity = row.locator('code')
      expect(await identity.textContent()).toBe(entryId)
      expect(await identity.getAttribute('title')).toBe(entryId)
    }
    const instancesSnapshot = await captureStableAria(
      page,
      '[data-plugin-scope="preset"] ul',
      scaffold.workspaceCwd,
    )
    await compareOrRefreshGolden(PLUGIN_INSTANCES_EXPECTED, instancesSnapshot, MODE)
    await dialog.getByRole('button', {
      name: 'tool-subagent, tool-subagent-claude-code, 已停用',
      exact: true,
    }).click()
    expect(await dialog.locator('[data-plugin-entry="tool-subagent-claude-code"] button')
      .getAttribute('aria-expanded')).toBe('true')
    await pluginSearch.fill('')
    // Close path 1: Escape.
    await page.keyboard.press('Escape')
    await expect.poll(() => page.getByRole('dialog', { name: '设置' }).count(), { timeout: 5_000 }).toBe(0)
    // Choosing a row closed the menu it was chosen from.
    expect(await account.getAttribute('aria-expanded')).toBe('false')
    // Close path 2: the header close button (focus lands there on open).
    await openSettings(page)
    await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '关闭' }).click()
    await expect.poll(() => page.getByRole('dialog', { name: '设置' }).count(), { timeout: 5_000 }).toBe(0)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  it('stores Permission as the default for future sessions without changing an existing session', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-permission'))
    const existing = scaffold.ctx.sessions.create(SessionId('settings-permission-before'))
    expect(existing.snapshotEvents().find(event => event.type === 'permission/preset')?.data)
      .toEqual({ preset: 'workspace-write' })

    const dialog = await openSettings(page)
    const selector = dialog.getByRole('button', { name: '工作区内修改' })
    await selector.waitFor({ timeout: 10_000 })
    await expect.poll(() => selector.isEnabled(), { timeout: 5_000 }).toBe(true)
    await selector.click()
    await page.getByRole('menuitem', { name: '仅可查看' }).click()
    await dialog.getByRole('button', { name: '仅可查看' }).waitFor({ timeout: 10_000 })

    const document = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(document).toContain('permission:')
    expect(document).toContain('defaultPreset: read-only')
    expect(existing.snapshotEvents().find(event => event.type === 'permission/preset')?.data)
      .toEqual({ preset: 'workspace-write' })

    const created = scaffold.ctx.sessions.create(SessionId('settings-permission-after'))
    expect(created.snapshotEvents().map(event => [event.type, event.data])).toEqual([
      ['permission/preset', { preset: 'read-only' }],
      ['sandbox/mode', { mode: 'read-only' }],
      ['approval/policy', { policy: 'ask' }],
    ])

    await dialog.getByRole('button', { name: '仅可查看' }).click()
    await page.getByRole('menuitem', { name: '完全权限' }).click()
    const confirmation = page.getByRole('dialog', { name: '确认启用完全权限？' })
    const enable = confirmation.getByRole('button', { name: '启用完全权限' })
    expect(await enable.isDisabled()).toBe(true)
    await confirmation.getByRole('checkbox').click()
    await enable.click()
    await dialog.getByRole('button', { name: '完全权限' }).waitFor({ timeout: 10_000 })
    const confirmedDocument = await readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8')
    expect(confirmedDocument).toContain('defaultPreset: danger-full-access')
    const confirmed = scaffold.ctx.sessions.create(SessionId('settings-permission-confirmed'))
    expect(confirmed.snapshotEvents().map(event => [event.type, event.data])).toEqual([
      ['permission/preset', { preset: 'danger-full-access' }],
      ['sandbox/mode', { mode: 'danger-full-access' }],
      ['approval/policy', { policy: 'never' }],
    ])
    await page.keyboard.press('Escape')
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)

  /** Pick one theme through the sidebar account menu (the settings rows moved there). */
  async function selectMenuTheme(name: string, preference: 'light' | 'dark' | 'system'): Promise<void> {
    await page.getByRole('button', { name: '账户' }).click()
    const parent = page.getByRole('menuitem', { name: '主题样式' })
    await parent.waitFor({ timeout: 10_000 })
    await parent.hover()
    await selectTheme(page.getByRole('menuitem', { name }), preference)
  }

  async function selectTheme(option: Locator, preference: 'light' | 'dark' | 'system'): Promise<void> {
    // Optimistic UI and a file value from an earlier gesture do not prove this write finished.
    const [response] = await Promise.all([
      page.waitForResponse((candidate) => {
        if (candidate.request().method() !== 'POST'
          || new URL(candidate.url()).pathname !== '/api/settings/mutate') return false
        const { payload: { args } } = candidate.request().postDataJSON() as {
          payload: { args: { ns: string; ops: { op: string; path: string[]; value?: unknown }[] } }
        }
        return args.ns === 'ui-theme' && args.ops.some(op => op.op === 'set'
          && op.path.length === 1 && op.path[0] === 'preference' && op.value === preference)
      }, { timeout: 5_000 }),
      option.click(),
    ])
    expect(response.ok()).toBe(true)
    expect(await response.json()).toMatchObject({
      result: { ok: true, value: { ns: 'ui-theme', value: { preference } } },
    })
  }

  it('uses the persisted dark preference while plugins are still loading', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-boot-theme'))
    await page.emulateMedia({ colorScheme: 'light' })
    await selectMenuTheme('深色', 'dark')
    await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 5_000 })
      .toMatch(/ui-theme:\n\s+preference: dark/)

    // Hold the real application batch so the shell-owned loading page remains observable.
    const pluginPattern = /\/plugins\/\?\?.+\/client\.js,.+\/client\.js&rev=[a-f\d]{12}$/
    let releaseBundles = (): void => {}
    const bundlesReleased = new Promise<void>((resolve) => { releaseBundles = resolve })
    await page.route(pluginPattern, async (route) => {
      await bundlesReleased
      await route.continue()
    })

    const warningStart = tripwire.warnings.length
    let reload: ReturnType<Page['reload']> | undefined
    try {
      reload = page.reload({ waitUntil: 'domcontentloaded' })
      const loading = page.getByText('Loading plugins…', { exact: true })
      await loading.waitFor({ timeout: 10_000 })
      const state = await loading.evaluate((element) => {
        const boot = element.parentElement?.parentElement
        if (boot === undefined || boot === null) throw new Error('loading hint is detached from the boot page')
        return {
          attr: document.body.hasAttribute('data-ds-dark-theme'),
          background: getComputedStyle(boot).backgroundColor,
          colorScheme: document.documentElement.style.colorScheme,
        }
      })
      expect(state).toEqual({
        attr: true,
        background: 'rgb(21, 21, 23)',
        colorScheme: 'dark',
      })
    } finally {
      releaseBundles()
      await reload
      await page.unroute(pluginPattern)
    }

    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await selectMenuTheme('跟随系统', 'system')
    await expect.poll(() => page.evaluate(() => document.body.hasAttribute('data-ds-dark-theme')), {
      timeout: 5_000,
    }).toBe(false)
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it('flips the theme through the account menu and persists across reload and a distinct port', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-appearance'))
    interface ThemeState {
      attr: boolean
      background: string
      /** Pre-migration localStorage key; the Host-backed world never writes it. */
      legacy: string | null
      themeColor: string | null
      themeColorCount: number
      token: string
    }
    const readState = async (target: Page = page): Promise<ThemeState> => await target.evaluate(() => {
      const metas = document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      const computed = getComputedStyle(document.body)
      return {
        attr: document.body.hasAttribute('data-ds-dark-theme'),
        background: computed.backgroundColor,
        legacy: localStorage.getItem('qilin.theme'),
        themeColor: metas[0]?.content ?? null,
        themeColorCount: metas.length,
        token: computed.getPropertyValue('--dsw-alias-bg-base').trim(),
      }
    })
    const expectThemeColorSynchronized = (state: ThemeState): void => {
      expect(state.themeColorCount).toBe(1)
      expect(state.background).not.toBe('rgba(0, 0, 0, 0)')
      expect(state.themeColor).toBe(state.background)
    }
    // Pin the OS scheme to light so the default `system` preference resolves
    // light and the dark flip below is unambiguously the gesture's doing.
    await page.emulateMedia({ colorScheme: 'light' })
    const light = await readState()
    expect(light.attr).toBe(false)
    expectThemeColorSynchronized(light)

    await selectMenuTheme('深色', 'dark')
    // The full cascade: Host-backed preference, body attribute, alias token
    // flip — all from one real user gesture in the account menu.
    const dark = await readState()
    expect(dark.attr).toBe(true)
    expect(dark.legacy).toBeNull()
    expect(dark.token).not.toBe(light.token)
    expectThemeColorSynchronized(dark)
    await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 5_000 })
      .toMatch(/ui-theme:\n\s+preference: dark/)

    // Reload: the preference survives the background Host read + presenter update.
    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await page.emulateMedia({ colorScheme: 'light' })
    await expect.poll(async () => (await readState()).attr, { timeout: 5_000 }).toBe(true)
    const reloaded = await readState()
    expect(reloaded.legacy).toBeNull()
    expectThemeColorSynchronized(reloaded)

    // A second live Host binds another ephemeral port but shares the same
    // user-settings home. Its fresh origin has no theme localStorage and still
    // converges to dark before the settings dialog opens.
    const second = await launchWebScaffold({ harnessHome: scaffold.harnessHome })
    const secondPage = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    const secondTripwire = watchConsole(secondPage)
    try {
      expect(second.baseUrl).not.toBe(scaffold.baseUrl)
      await secondPage.emulateMedia({ colorScheme: 'light' })
      await secondPage.goto(second.authenticatedUrl, { waitUntil: 'load' })
      await secondPage.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      await expect.poll(async () => (await readState(secondPage)).attr, { timeout: 5_000 }).toBe(true)
      const secondState = await readState(secondPage)
      expect(secondState.legacy).toBeNull()
      expectThemeColorSynchronized(secondState)
      expect(secondTripwire.pageErrors).toEqual([])
      expect(secondTripwire.warnings).toEqual([])
    } finally {
      await secondPage.close()
      await second.close()
    }

    // `system` follows the emulated OS scheme (dark stays dark, light clears).
    await selectMenuTheme('跟随系统', 'system')
    await expect.poll(async () => (await readState()).attr, { timeout: 5_000 }).toBe(false)
    expectThemeColorSynchronized(await readState())
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect.poll(async () => (await readState()).attr, { timeout: 5_000 }).toBe(true)
    expectThemeColorSynchronized(await readState())
    // Restore for the specs that follow: light preference beats the emulated
    // dark OS scheme, leaving the shared page in the light default.
    await selectMenuTheme('浅色', 'light')
    await expect.poll(async () => (await readState()).attr, { timeout: 5_000 }).toBe(false)
    expectThemeColorSynchronized(await readState())
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it('steps the content font size, applies it to body, and persists across reload', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-font-size'))
    onTestFinished(async () => {
      await page.keyboard.press('Escape')
      await page.getByRole('dialog', { name: '设置', exact: true }).waitFor({ state: 'hidden' })
    })
    const readFontSize = async (target: Page = page): Promise<string> => await target.evaluate(
      () => document.body.style.getPropertyValue('--qilin-content-font-size'),
    )
    // The secondary tier resolved by the real engine: a probe element's
    // font-size forces min/max/calc evaluation, which the CSS-text specs
    // cannot exercise. Setting −1 at ≤14, setting −2 above.
    const readSecondaryFontSize = async (): Promise<string> => await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.fontSize = 'var(--qilin-content-font-size-secondary, 13px)'
      document.body.appendChild(probe)
      const size = getComputedStyle(probe).fontSize
      probe.remove()
      return size
    })
    // The displayed value is optimistic; wait for the write before the next step.
    const stepFontSize = async (button: Locator, px: number): Promise<void> => {
      const [response] = await Promise.all([
        page.waitForResponse((reply) => {
          if (new URL(reply.url()).pathname !== '/api/settings/mutate' || reply.request().method() !== 'POST') return false
          const request = reply.request().postDataJSON() as { payload: { args: { ns: string } } }
          return request.payload.args.ns === 'ui-theme'
        }),
        button.click(),
      ])
      expect(await response.finished()).toBeNull()
      const envelope = await response.json() as { result: { ok: boolean } }
      expect(envelope.result.ok).toBe(true)
      await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 5_000 })
        .toMatch(new RegExp(`ui-theme:\n(?:\\s+\\w+: .*\n)*?\\s+fontSize: ${px}`))
      await page.getByRole('dialog', { name: '设置' }).getByText(String(px), { exact: true }).waitFor({ timeout: 5_000 })
      await expect.poll(readFontSize, { timeout: 5_000 }).toBe(`${px}px`)
    }
    expect(await readFontSize()).toBe('14px')
    expect(await readSecondaryFontSize()).toBe('13px')
    const dialog = await openSettings(page)
    // The stepper reveals its arrows on hover; the up arrow steps 14 → 15 → 16.
    await dialog.getByText('14', { exact: true }).hover()
    const increase = dialog.getByRole('button', { name: '增大字号' })
    await stepFontSize(increase, 15)
    // 15 is the piecewise boundary: the secondary tier holds at 13px (−2)
    // where the ≤14 branch would have given 14px (−1).
    await expect.poll(readSecondaryFontSize, { timeout: 5_000 }).toBe('13px')
    await stepFontSize(increase, 16)
    await expect.poll(readSecondaryFontSize, { timeout: 5_000 }).toBe('14px')
    await page.keyboard.press('Escape')

    // Reload: the boot script embeds the durable size and ThemeRuntime seeds
    // its initial snapshot from the boot-written body variable, so activation
    // never flashes the default while the settings read is in flight.
    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await expect.poll(readFontSize, { timeout: 5_000 }).toBe('16px')
    expect(await readSecondaryFontSize()).toBe('14px')

    // Restore the default for the specs that follow (and the dialog golden).
    const restored = await openSettings(page)
    await restored.getByText('16', { exact: true }).hover()
    const decrease = restored.getByRole('button', { name: '减小字号' })
    await stepFontSize(decrease, 15)
    await stepFontSize(decrease, 14)
    await page.keyboard.press('Escape')
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it('persists the completed-Turn transcript mode across reload', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-transcript-view'))
    const dialog = await openSettings(page)
    await dialog.getByText('对话显示', { exact: true }).waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: '紧凑', exact: true }).click()
    await page.getByRole('menuitem', { name: '标准', exact: true }).click()
    await dialog.getByRole('button', { name: '标准', exact: true }).waitFor({ timeout: 10_000 })
    await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 5_000 })
      .toMatch(/ui-chat:\n\s+transcriptView: normal/)
    await page.keyboard.press('Escape')

    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    const reloaded = await openSettings(page)
    await reloaded.getByRole('button', { name: '标准', exact: true }).waitFor({ timeout: 10_000 })

    await reloaded.getByRole('button', { name: '标准', exact: true }).click()
    await page.getByRole('menuitem', { name: '紧凑', exact: true }).click()
    await reloaded.getByRole('button', { name: '紧凑', exact: true }).waitFor({ timeout: 10_000 })
    await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 5_000 })
      .toMatch(/ui-chat:\n\s+transcriptView: compact/)
    await page.keyboard.press('Escape')
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it('persists the busy-state Enter behavior across reload and a distinct port', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-enter-behavior'))
    const dialog = await openSettings(page)
    await dialog.getByRole('button', { name: '排队发送' }).click()
    await page.getByRole('menuitem', { name: '插话发送' }).click()
    await dialog.getByRole('button', { name: '插话发送' }).waitFor({ timeout: 10_000 })
    expect(await page.evaluate(() => localStorage.getItem('qilin.conversation.busyEnter'))).toBeNull()
    await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 5_000 })
      .toMatch(/ui-conversation:\n\s+busyEnter: steer/)
    await page.keyboard.press('Escape')

    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    const reloaded = await openSettings(page)
    await reloaded.getByRole('button', { name: '插话发送' }).waitFor({ timeout: 10_000 })

    const second = await launchWebScaffold({ harnessHome: scaffold.harnessHome })
    const secondPage = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    const secondTripwire = watchConsole(secondPage)
    try {
      expect(second.baseUrl).not.toBe(scaffold.baseUrl)
      await secondPage.goto(second.authenticatedUrl, { waitUntil: 'load' })
      await secondPage.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      const secondDialog = await openSettings(secondPage)
      await secondDialog.getByRole('button', { name: '插话发送' }).waitFor({ timeout: 10_000 })
      expect(await secondPage.evaluate(() => localStorage.getItem('qilin.conversation.busyEnter'))).toBeNull()
      expect(secondTripwire.pageErrors).toEqual([])
      expect(secondTripwire.warnings).toEqual([])
    } finally {
      await secondPage.close()
      await second.close()
    }

    await reloaded.getByRole('button', { name: '插话发送' }).click()
    await page.getByRole('menuitem', { name: '排队发送' }).click()
    await reloaded.getByRole('button', { name: '排队发送' }).waitFor({ timeout: 10_000 })
    expect(await page.evaluate(() => localStorage.getItem('qilin.conversation.busyEnter'))).toBeNull()
    await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 5_000 })
      .toMatch(/ui-conversation:\n\s+busyEnter: queue/)
    await page.keyboard.press('Escape')
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it('persists the settings language across reload and a distinct port', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-settings-language'))
    // The document language follows the active locale in the assembled app, not
    // only on a directly-mounted plugin. This is a zh browser, so the served
    // markup's `en` must already have been replaced — asserting it here (rather
    // than only in an English scenario) is what makes the check discriminating.
    expect(await page.evaluate(() => document.documentElement.lang)).toBe('zh-CN')
    // The language submenu lists each locale in its own language.
    await page.getByRole('button', { name: '账户' }).click()
    const languageRow = page.getByRole('menuitem', { name: '语言' })
    await languageRow.waitFor({ timeout: 10_000 })
    await languageRow.hover()
    await page.getByRole('menuitem', { name: 'English' }).click()
    // The settings-owned copy re-registers localized: dialog title and nav.
    // (Only the settings namespaces are localized — the rest of the app's copy
    // is intentionally out of this preference's scope.)
    const enDialog = await openSettings(page, { menu: 'Settings', dialog: 'Settings' })
    // ...and the attribute follows that switch, in the assembled app.
    await expect.poll(() => page.evaluate(() => document.documentElement.lang), { timeout: 5_000 }).toBe('en')
    expect(await enDialog.getByRole('button', { name: 'General' }).getAttribute('aria-current')).toBe('true')
    await page.keyboard.press('Escape')
    expect(await page.evaluate(() => localStorage.getItem('qilin.locale'))).toBeNull()
    await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 5_000 })
      .toMatch(/locale:\n\s+preference: en/)
    // Reload keeps English; then restore zh so shared page state (and the
    // other specs' 设置-anchored selectors + goldens) see the default again.
    const warningStart = tripwire.warnings.length
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    acknowledgeReloadConnectionLoss(tripwire, warningStart)
    // The reloaded English page exposes the account menu's own English row.
    await page.locator('[class*="footArea"] [aria-haspopup="menu"]').waitFor({ timeout: 10_000 })

    // A Chinese browser on another port still receives the explicit English
    // preference from the shared Host settings document.
    const second = await launchWebScaffold({ harnessHome: scaffold.harnessHome })
    const secondPage = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    const secondTripwire = watchConsole(secondPage)
    try {
      expect(second.baseUrl).not.toBe(scaffold.baseUrl)
      await secondPage.goto(second.authenticatedUrl, { waitUntil: 'load' })
      await secondPage.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      // The stored preference reaches this fresh origin: its document language
      // is the explicit selection, not the zh browser's own.
      await expect.poll(() => secondPage.evaluate(() => document.documentElement.lang), { timeout: 10_000 })
        .toBe('en')
      expect(await secondPage.evaluate(() => localStorage.getItem('qilin.locale'))).toBeNull()
      expect(secondTripwire.pageErrors).toEqual([])
      expect(secondTripwire.warnings).toEqual([])
    } finally {
      await secondPage.close()
      await second.close()
    }

    await page.getByRole('button', { name: 'Account' }).click()
    const enLanguageRow = page.getByRole('menuitem', { name: 'Language' })
    await enLanguageRow.waitFor({ timeout: 10_000 })
    await enLanguageRow.hover()
    await page.getByRole('menuitem', { name: '中文' }).click()
    await expect.poll(() => page.evaluate(() => document.documentElement.lang), { timeout: 5_000 }).toBe('zh-CN')
    expect(await page.evaluate(() => localStorage.getItem('qilin.locale'))).toBeNull()
    await expect.poll(async () => readFile(join(scaffold.harnessHome, 'settings.yaml'), 'utf8'), { timeout: 5_000 })
      .toMatch(/locale:\n\s+preference: zh/)
    await page.keyboard.press('Escape')
    expect(tripwire.pageErrors).toEqual([])
  }, 90_000)

  it('opens an English browser in English without any stored preference', async () => {
    // A fresh Host home has no locale preference, so its surface follows the
    // browser. English is also FALLBACK_LOCALE, so this scenario alone cannot
    // distinguish detection from the default — the zh scenarios above supply
    // the discriminating half (a Chinese browser must NOT land on the default).
    const fresh = await launchWebScaffold({})
    const enPage = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: 'en-US' })
    const enTripwire = watchConsole(enPage)
    onTestFailed(() => saveFailureShot(enPage, 'web-e2e-settings-browser-language'))
    try {
      await enPage.goto(fresh.authenticatedUrl, { waitUntil: 'load' })
      await enPage.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      expect(await enPage.evaluate(() => localStorage.getItem('qilin.locale'))).toBeNull()
      const dialog = await openSettings(enPage, { menu: 'Settings', dialog: 'Settings' })
      await dialog.getByRole('button', { name: 'General', exact: true }).waitFor({ timeout: 10_000 })
      // The plugin list resolves shipped preset names through the en
      // dictionaries instead of echoing the preset files' Chinese metadata.
      await dialog.getByRole('button', { name: 'Plugins', exact: true }).click()
      await dialog.getByRole('tab', { name: 'Plugin list', exact: true }).click()
      const presetSwitcher = dialog.getByRole('button', { name: 'Choose the agent preset to inspect' })
      await presetSwitcher.waitFor({ timeout: 10_000 })
      expect(await presetSwitcher.textContent()).toBe('Standard mode (default)')
      // This page has no closing inventory spec to sweep its console, so the
      // scenario clears both tripwire channels itself.
      expect(enTripwire.pageErrors).toEqual([])
      expect(enTripwire.warnings).toEqual([])
    } finally {
      await enPage.close()
      await fresh.close()
    }
  }, 90_000)

  it('opens a browser asking for no shipped language in English', async () => {
    // The product default for "no usable signal": a French browser ships
    // neither zh nor en, so resolution falls to FALLBACK_LOCALE (en) rather
    // than to Chinese.
    const fresh = await launchWebScaffold({})
    const frPage = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: 'fr-FR' })
    const frTripwire = watchConsole(frPage)
    onTestFailed(() => saveFailureShot(frPage, 'web-e2e-settings-unshipped-language'))
    try {
      await frPage.goto(fresh.authenticatedUrl, { waitUntil: 'load' })
      await frPage.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      expect(await frPage.evaluate(() => localStorage.getItem('qilin.locale'))).toBeNull()
      const dialog = await openSettings(frPage, { menu: 'Settings', dialog: 'Settings' })
      // A locale-owned nav label proves the dictionaries resolved to en.
      await dialog.getByRole('button', { name: 'Agent presets' }).waitFor({ timeout: 10_000 })
      // The markup already ships `en`, so this alone cannot prove the sync ran
      // — the zh scenario above is the discriminating half. Asserted here too
      // so a future change that resolves en but writes the wrong tag is caught.
      expect(await frPage.evaluate(() => document.documentElement.lang)).toBe('en')
      // Golden of the English fallback dialog — the visible output this change
      // produces. The zh golden above covers the detected-locale surface, so
      // the pair pins both directions of the resolution.
      const snapshot = await captureStableAria(frPage, '[role="dialog"]', fresh.workspaceCwd)
      await compareOrRefreshGolden(DIALOG_EN_EXPECTED, snapshot, MODE)
      expect(frTripwire.pageErrors).toEqual([])
      expect(frTripwire.warnings).toEqual([])
    } finally {
      await frPage.close()
      await fresh.close()
    }
  }, 90_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    expect(tripwire.warnings).toEqual([])
    await assertFixtureInventory(SNAPSHOT_DIR, [
      'dialog-en.expected.md',
      'dialog.expected.md',
      'plugin-instances.expected.md',
      'plugins.expected.md',
    ])
  })
})
