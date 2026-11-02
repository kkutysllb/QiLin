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

  it('renders no panel sections while the shipped composition contributes no panel', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-sidebar-sections'))
    // A section header (General/Extensions) exists only for a
    // `sidebar.panellist` contributor, and the shipped web composition mounts
    // none: the plugin manager became a settings section instead of a sidebar
    // panel (the plugin manager moved into Settings), and the schedule bundle
    // that owns the remaining panel
    // ships switched off (packages/bundle/web-app/README.md). The sidebar
    // therefore renders no panel navigation at all — this pins that state so a
    // contributor reappearing is noticed here rather than in a UI bug report.
    await expect.poll(
      () => page.getByRole('navigation', { name: 'Global panels' }).count(),
      { timeout: 10_000 },
    ).toBe(0)
    expect(await page.getByRole('button', { name: 'General' }).count()).toBe(0)
    // The region the shell does own still renders: an empty panel list leaves a
    // usable column, not a blank one.
    await expect.poll(
      () => page.getByText('Workspaces', { exact: true }).count(),
      { timeout: 10_000 },
    ).toBe(1)
    expect(tripwire.pageErrors).toEqual([])
  })
})
