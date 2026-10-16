// Web e2e scenario: the sidebar's panel sections in the assembled application.
// A product-visible change needs a real composition rather than a hand-built
// context, so this boots the shipped client plugins and drives the real DOM:
// the engine's own panels sit under the General section, every unassigned row
// would join Extensions, and a section header is a fold toggle.
//
// Zero model calls: the sidebar renders before any session exists.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

describe('web e2e: sidebar panel sections', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('groups the engine panels under General and folds them', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-sidebar-sections'))
    const general = page.getByRole('button', { name: 'General' })
    await expect.poll(async () => general.count(), { timeout: 10_000 }).toBe(1)

    // The engine registers its own panels, so the section is never empty.
    const navigation = page.getByRole('navigation', { name: 'Global panels' })
    await expect.poll(async () => (await navigation.getByRole('button').allTextContents()).includes('Plugins'))
      .toBe(true)

    const expanded = await general.getAttribute('aria-expanded')
    expect(expanded).toBe('true')
    await general.click()
    await expect.poll(async () => general.getAttribute('aria-expanded'), { timeout: 10_000 }).toBe('false')
    await expect.poll(async () => (await navigation.getByRole('button').allTextContents()).includes('Plugins'))
      .toBe(false)

    // Every remaining row is a plugin contribution: an Extensions section exists
    // only when one registered, and never empty.
    const extensions = page.getByRole('button', { name: 'Extensions' })
    if (await extensions.count() > 0) {
      const extensionsExpanded = await extensions.getAttribute('aria-expanded')
      expect(extensionsExpanded === 'true' || extensionsExpanded === 'false').toBe(true)
    }
    expect(tripwire.pageErrors).toEqual([])
  })
})
