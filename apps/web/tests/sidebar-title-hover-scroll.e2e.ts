// Web e2e scenario: hovering a sidebar session row marquees a title wider than
// its cell. The jsdom lane pins the frame walk, the fade hooks, and the resting
// state; the assembled browser is where the title really clips, really crawls
// to its own hovered extent (the trailing relative-time cell yields to the
// action strip while the pointer rests on the row, so the hovered cell is wider
// than the resting one), really fades both clipping edges, and really returns
// to its start when the pointer leaves.
//
// Zero model calls: seeding one renamed session and hovering its row touches no
// provider.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import type { Browser, Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, seedSession, watchConsole, type WebScaffold } from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SEED = fileURLToPath(new URL('../../../snapshots/web/seeded-history/session.v3.jsonl', import.meta.url))
/** Wider than the sidebar cell, under the 80-byte title limit, with a far-edge suffix the reveal must reach. */
const TITLE = 'Forked session clipped before its suffix (1)'

describe('web e2e: hovering a clipped session title marquees it to its far edge', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    const workspace = await scaffold.ctx.workspaceRegistry.create(scaffold.workspaceCwd)
    const id = await seedSession(scaffold, await readFile(SEED, 'utf8'), 'sidebar-title-hover-scroll')
    await workspace.attachSession(id)
    await scaffold.ctx.sessionController.rename({ sessionId: id, title: TITLE })
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

  it('marquees the clipped title under the pointer and restores its start after', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-sidebar-title-hover-scroll'))
    const row = page.getByRole('treeitem').filter({ has: page.getByText(TITLE, { exact: true }) })
    await row.waitFor({ timeout: 20_000 })
    const title = row.getByText(TITLE, { exact: true })

    // At rest the row clips its title with an ellipsis, holds its start, and
    // paints no fade.
    expect(await title.evaluate(el => el.scrollWidth - el.clientWidth)).toBeGreaterThan(0)
    expect(await title.evaluate(el => getComputedStyle(el).textOverflow)).toBe('ellipsis')
    expect(await title.evaluate(el => el.scrollLeft)).toBe(0)
    expect(await title.evaluate(el => el.hasAttribute('data-scrolled') || el.hasAttribute('data-clipped'))).toBe(false)
    expect(await title.evaluate(el => getComputedStyle(el).maskImage)).toBe('none')

    // The fade hooks follow the frames: the left one on any travel off the
    // start, the right one while text remains beyond the cell.
    await row.hover()
    await expect.poll(
      async () => title.evaluate(el => el.scrollLeft > 0
        && el.hasAttribute('data-scrolled') && el.hasAttribute('data-clipped')),
      { timeout: 5_000, interval: 20 },
    ).toBe(true)
    expect(await title.evaluate(el => getComputedStyle(el).textOverflow)).toBe('clip')
    expect(await title.evaluate(el => getComputedStyle(el).maskImage)).toContain('linear-gradient')

    // Poll against the live extent and the crawl's own end signal: the right
    // fade lifts on the frame the title reaches the far edge of the hovered
    // cell, so a half-pixel-short frame must not satisfy the wait.
    await expect.poll(
      async () => title.evaluate(el => !el.hasAttribute('data-clipped')
        && el.scrollLeft >= el.scrollWidth - el.clientWidth - 1),
      { timeout: 20_000, interval: 50 },
    ).toBe(true)
    // At the far edge the right fade lifts so the final character reads intact.
    expect(await title.evaluate(el => el.hasAttribute('data-clipped'))).toBe(false)
    expect(await title.evaluate(el => el.hasAttribute('data-scrolled'))).toBe(true)

    // Leaving returns in one step: a crawl back would still be travelling
    // inside this window, and it would carry the resting ellipsis with it.
    await page.mouse.move(0, 0)
    await expect.poll(
      async () => title.evaluate(el => el.scrollLeft),
      { timeout: 150, interval: 20 },
    ).toBe(0)
    expect(await title.evaluate(el => getComputedStyle(el).textOverflow)).toBe('ellipsis')
    expect(await title.evaluate(el => el.hasAttribute('data-scrolled') || el.hasAttribute('data-clipped'))).toBe(false)
    expect(await title.evaluate(el => getComputedStyle(el).maskImage)).toBe('none')

    // Reduced motion jumps to the far edge instead of crawling: the far edge is
    // in view immediately, so a short poll suffices.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await row.hover()
    await expect.poll(
      async () => title.evaluate(el => el.scrollLeft >= el.scrollWidth - el.clientWidth - 1
        && el.hasAttribute('data-scrolled')),
      { timeout: 1_000, interval: 20 },
    ).toBe(true)
    expect(await title.evaluate(el => el.hasAttribute('data-clipped'))).toBe(false)
    await page.mouse.move(0, 0)
    await page.emulateMedia({ reducedMotion: null })
    expect(tripwire.pageErrors).toEqual([])
  }, 60_000)
})
