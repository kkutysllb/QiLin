// Web e2e: the Schedule capability's browser half in the assembled app.
//
// The three rows that make durable scheduled tasks work ship together — the
// Host service, the time context the model resolves "tomorrow at nine" with,
// and this page — so this scenario is the only lane that observes them
// composed: `@qilin/client-ui-schedule` renders its sidebar row and its task
// catalog only when the two Host rows above it activated. Zero model calls:
// the page renders from one Host catalog read.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

describe('web e2e: schedule panel', () => {
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
    // The frame paints only after every client entry activates, so a Host row
    // left disabled stalls here instead of passing.
    await page.waitForSelector('[class*="frame"]', { timeout: 60_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('lists the task row in the sidebar and opens the task catalog', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-schedule-panel'))
    const row = page.getByRole('button', { name: 'Automation tasks', exact: true })
    await row.waitFor({ timeout: 30_000 })
    await row.click()
    await page.getByRole('heading', { name: 'Automation tasks', exact: true }).first().waitFor({ timeout: 30_000 })
    await expect.poll(async () => row.getAttribute('aria-current'), { timeout: 10_000 }).toBe('page')
    await page.getByPlaceholder('Search automation tasks').waitFor({ timeout: 30_000 })
    expect(await page.getByText('No tasks yet. Tasks created in your sessions appear here.').isVisible()).toBe(true)
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)
})
