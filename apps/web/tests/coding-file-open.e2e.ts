/**
 * Delivered files opened from the chat reach the user in the coding
 * workbench's right column.
 *
 * The delivery cards come from `snapshots/web/present`'s recorded turn, opened
 * as history through `seedSession` (no model call): its `report.txt` delivery
 * is renamed to `report.md` in the fixture text so the card takes the
 * `kind: 'text'` document-preview open a rendered document does, while
 * `说明.txt` keeps the plain file open. Re-recording that scenario with
 * different file names fails this case's card lookup.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Browser, type Locator, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { launchWebScaffold, seedSession, watchConsole, type WebScaffold } from './scaffold.ts'
import { newEnglishPage, saveFailureShot, seedWorkbench } from './support.ts'

/** The delivery-card scenario this case reads: its presented files and its closing turn. */
const SNAPSHOT_DIR = fileURLToPath(new URL('../../../snapshots/web/present', import.meta.url))

describe('web e2e: coding workbench file open', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    await writeFile(join(scaffold.workspaceCwd, 'report.md'), '# DELIVERED_DOC\n')
    await writeFile(join(scaffold.workspaceCwd, '说明.txt'), 'DELIVERED_NOTE\n')
    // A completed recording, opened as history: the delivery cards and their
    // preview buttons exist without a model call. The recorded delivery is
    // renamed to a renderable document, so the card takes the same
    // `kind: 'text'` open a delivered Markdown file does.
    const fixture = (await readFile(join(SNAPSHOT_DIR, 'session.v3.jsonl'), 'utf8'))
      .split('report.txt').join('report.md')
    await seedSession(scaffold, fixture, 'coding-file-open', 'ptc')
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    tripwire = watchConsole(page)
    await seedWorkbench(page, 'coding')
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.locator('[role="treeitem"]').first().click()
    await page.locator('[role="treeitem"]').nth(1).click()
    await page.locator('[data-presented-files-row]').waitFor({ timeout: 30_000 })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  /** Collapse the column and wait for the frame to report it. */
  async function collapseColumn(frame: Locator): Promise<void> {
    if (await frame.getAttribute('data-rightbar-collapsed') === 'true') return
    await page.getByRole('button', { name: 'Collapse right sidebar', exact: true }).click()
    await expect.poll(() => frame.getAttribute('data-rightbar-collapsed'), { timeout: 5_000 }).toBe('true')
  }

  it('reveals the collapsed right column for a document preview and a file open', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-coding-file-open'))
    const frame = page.locator('[style*="grid-template-columns"]').first()
    const column = page.locator('[data-rightbar-col]')
    // The coding workbench's column is an overlay that starts collapsed, so
    // the opens below are the only thing that can put a file in sight.
    await collapseColumn(frame)
    await page.locator('[data-presented-files-row]')
      .getByRole('button', { name: 'Open report.md in sidebar', exact: true }).click()
    await expect.poll(() => frame.getAttribute('data-rightbar-collapsed'), { timeout: 10_000 }).toBe(null)
    // The document lands in the coding panel's own editor tab, not in a
    // native page: this body renders the column while the coding tag is on.
    const panel = column.locator('[data-qilin-panel]')
    await expect.poll(() => panel.innerText(), { timeout: 15_000 }).toContain('DELIVERED_DOC')
    await expect.poll(() => panel.innerText()).toContain('report.md')
    // A code file (no preview kind) takes the same route from the same card.
    await collapseColumn(frame)
    await page.locator('[data-presented-files-row]')
      .getByRole('button', { name: 'Open 说明.txt in sidebar', exact: true }).click()
    await expect.poll(() => frame.getAttribute('data-rightbar-collapsed'), { timeout: 10_000 }).toBe(null)
    await expect.poll(() => panel.innerText(), { timeout: 15_000 }).toContain('DELIVERED_NOTE')
    expect(tripwire.pageErrors).toEqual([])
  })
})
