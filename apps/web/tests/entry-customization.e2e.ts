/** Default-loaded entry controls activate through the real Web profile and Loader. */
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

describe('default navigation entry customization', () => {
  let scaffold: WebScaffold | undefined
  let browser: Browser | undefined
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({
      extraOverlayPath: fileURLToPath(new URL('./pin-browse-picker.overlay.yml', import.meta.url)),
    })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  })

  afterAll(async () => {
    try { await browser?.close() } finally { await scaffold?.close() }
  })

  it('leaves the left navigation and Conversation View tabs free of More controls', async () => {
    onTestFailed(() => saveFailureShot(page, 'entry-customization'))
    const nav = page.getByRole('navigation', { name: 'Global panels' })
    await nav.getByRole('button', { name: 'Plugins', exact: true }).waitFor()
    // The right-sidebar guide owns the only More menu; the sidebar and the Conversation
    // View tabs draw none. The guide menu itself is covered by the package spec.
    expect(await nav.getByRole('button', { name: 'More', exact: true }).count()).toBe(0)
    expect(await page.getByRole('button', { name: 'More conversation views', exact: true }).count()).toBe(0)
    expect(await nav.getByRole('button', { name: 'Plugins', exact: true }).getAttribute('aria-current')).toBe('page')
    expect(tripwire.pageErrors).toEqual([])
    expect(tripwire.warnings).toEqual([])
  })
})
