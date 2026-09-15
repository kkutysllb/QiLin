// Web e2e scenario: the User plugins tab in Plugins settings. The shipped
// layers must report their resolution channel — a profile-owned bundle is
// upgradeable in place while every shipped layer stays unremovable — and the
// header check-for-updates action reads differently from a row's update action.
// Zero model calls: the tab renders the Host's profile projection.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { join } from 'node:path'
import { openSettings, REPO_ROOT, saveFailureShot, ZH_BROWSER_LOCALE } from './support.ts'

describe('web e2e: user plugins settings tab', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    // The profile installs one shipped bundle the profile owns (the sidebar is
    // the shipped in-place-upgrade channel), on top of the two engine layers.
    scaffold = await launchWebScaffold({
      extraInstallAnchors: [
        join(REPO_ROOT, 'vendor/coding-sidebar/package.json'),
        join(REPO_ROOT, 'vendor/file-review-kcoder/package.json'),
      ],
    })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1280, height: 900 }, locale: ZH_BROWSER_LOCALE })
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  /** Open Settings > Plugins > User plugins. */
  async function openUserPlugins() {
    const dialog = await openSettings(page)
    await dialog.getByRole('button', { name: '插件', exact: true }).click()
    await dialog.getByRole('tab', { name: '用户插件', exact: true }).click()
    await expect.poll(
      () => dialog.getByRole('tab', { name: '用户插件', exact: true }).getAttribute('aria-selected'),
      { timeout: 10_000 },
    ).toBe('true')
    return dialog
  }

  /**
   * The row for one installed layer. A listing that fails before the Host Remote
   * namespace settles renders the tab's retryable alert, so retry is the
   * documented recovery this waits on.
   */
  async function settledRow(dialog: ReturnType<Page['locator']>, name: string) {
    const row = dialog.locator('[class*="row"]', { hasText: name })
    for (let attempt = 0; attempt < 15; attempt += 1) {
      if (await row.count() > 0) return row
      const retry = dialog.getByRole('button', { name: '重试', exact: true })
      if (await retry.count() > 0) await retry.click()
      await page.waitForTimeout(1_000)
    }
    throw new Error('plugin listing never settled for ' + name + ' — dialog text: ' + (await dialog.innerText()))
  }
  it('keeps a profile-owned shipped layer updatable and unremovable', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-user-plugins'))
    const dialog = await openUserPlugins()
    const row = await settledRow(dialog, '@qilin/coding-sidebar')

    // Shipped layers say so, and the installed version resolves instead of
    // reporting the unknown-version fallback.
    const meta = await row.locator('[class*="meta"]').first().innerText()
    expect(meta).toContain('内置')

    // The profile owns this bundle's resolution, so it upgrades in place…
    await expect.poll(() => row.getByRole('button', { name: '更新', exact: true }).isDisabled()).toBe(false)
    // …and is still never removable through Settings.
    expect(await row.getByRole('button', { name: '卸载', exact: true }).isDisabled()).toBe(true)
    expect(tripwire.pageErrors).toEqual([])
  })

  it('ships the file-review plugin upgradable in place and unremovable', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-user-plugins'))
    const dialog = await openUserPlugins()
    const row = await settledRow(dialog, 'dsh-file-review-kcoder')
    expect(await row.locator('[class*="meta"]').first().innerText()).toContain('内置')
    await expect.poll(() => row.getByRole('button', { name: '更新', exact: true }).isDisabled()).toBe(false)
    expect(await row.getByRole('button', { name: '卸载', exact: true }).isDisabled()).toBe(true)
  })

  it('refuses both actions on a layer that moves with the installation', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-user-plugins'))
    const dialog = await openUserPlugins()
    const row = await settledRow(dialog, '@qilin/base')
    expect(await row.getByRole('button', { name: '更新', exact: true }).isDisabled()).toBe(true)
    expect(await row.getByRole('button', { name: '卸载', exact: true }).isDisabled()).toBe(true)
  })

  it('labels the header check action apart from a row update action', async () => {
    const dialog = await openUserPlugins()
    const row = await settledRow(dialog, '@qilin/coding-sidebar')
    expect(await dialog.getByRole('button', { name: '检查更新', exact: true }).count()).toBe(1)
    // The rows use the plain action label, so the two reads cannot be confused.
    expect(await row.getByRole('button', { name: '更新', exact: true }).count()).toBe(1)
  })
})
