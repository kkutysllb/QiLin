// Web e2e scenario: the collapsed rail's search command in the real event
// order. A collapsed sidebar draws only the shell's toggle, New session, and
// the panel list — the workspace region renders no rail icon of its own
// (fix(client-ui-workspace): 折叠侧栏不再渲染区域图标按钮) — so the rail's
// search entry is the session.search command. That request reaches
// WorkspaceBrowser while it is still rail-wide: it arms the expand, the shell
// flips the column wide, and the input takes focus only after the slide, so
// the gesture never focuses a mid-animation layout.
//
// Zero model calls: collapsing the sidebar and expanding the search are pure
// client layout gestures; the scenario needs no session content at all.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

/** WorkspaceBrowser's rail-search focus delay (EXPAND_SLIDE_MS) plus flush headroom. */
const FOCUS_SETTLE_MS = 600

describe('web e2e: the rail search command expands the collapsed sidebar', () => {
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

  it('expands the search and lands focus in the input from one rail command', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-rail-search-expand'))
    // The wide chrome names the command its own binding; the rail keeps the
    // same registration, so the chord carries across the collapse.
    const wideSearch = page.getByRole('button', { name: 'Search sessions' })
    const chord = await wideSearch.getAttribute('aria-keyshortcuts')
    if (chord === null) throw new Error('the search control published no shortcut binding')
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    // The wide chrome stays mounted through the collapse crossfade and unmounts
    // at settle; the rail itself draws no search control.
    await expect.poll(async () => wideSearch.count(), { timeout: 10_000 }).toBe(0)

    await page.keyboard.press(chord)

    // The command expands the column and the remounted search button reports
    // the expanded state; focus lands once the slide has finished.
    await expect.poll(async () => wideSearch.getAttribute('aria-expanded'), { timeout: 10_000 }).toBe('true')
    const input = page.getByPlaceholder('Search sessions...')
    await expect.poll(
      async () => input.evaluate(el => document.activeElement === el),
      { timeout: FOCUS_SETTLE_MS + 10_000 },
    ).toBe(true)

    // A genuine outside click on an empty query still dismisses the search.
    await page.getByRole('button', { name: 'New session' }).first().click()
    await expect.poll(async () => wideSearch.getAttribute('aria-expanded'), { timeout: 10_000 }).toBe('false')
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)
})
