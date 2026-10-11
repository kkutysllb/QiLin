/**
 * NMO first-run metric (plan §12): a brand-new isolated harness home reaches a
 * sendable session after one blocking decision — connecting a Workspace — with
 * nothing to configure first. The two counted decisions are the Workspace pick
 * (1) and the message itself (2); the picker's own gestures belong to decision
 * one. Measured surface counts are recorded as a golden, so a change that
 * inserts a gating surface or an extra step fails loudly.
 */
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from 'playwright'
import { expect, it } from 'vitest'
import {
  assertFixtureInventory, compareOrRefreshGolden, launchWebScaffold, watchConsole, webSnapshotMode,
} from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

/** Live hero composer copy: the sendable state. */
const LIVE_PLACEHOLDER = 'Describe what you want to build, / commands, @ files or sessions'

/** Workspace-locked composer copy: the state a fresh home boots into. */
const LOCKED_PLACEHOLDER = 'Choose a workspace to start'

/** The Workspace picker is the only dialog the first-run path opens. */
const WORKSPACE_DIALOG = 'Select Workspace Directory'

const GOLDEN_DIR = fileURLToPath(new URL('./expected/first-run-metric', import.meta.url))
const GOLDEN = join(GOLDEN_DIR, 'steps.expected.md')

/** Composer state and every dialog currently in the document. */
async function composerState(page: Page): Promise<{ editable: string | null; placeholder: string | null; dialogs: string[] }> {
  return await page.evaluate(() => {
    const input = document.querySelector('[data-composer-input]')
    return {
      editable: input?.getAttribute('contenteditable') ?? null,
      placeholder: input?.getAttribute('data-placeholder') ?? null,
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map(node => node.getAttribute('aria-label') ?? ''),
    }
  })
}

/** Record every dialog name the path opens, and whether any of them configures. */
async function observePath(page: Page): Promise<void> {
  await page.evaluate(() => {
    const surfaced = new Set<string>()
    const record = () => {
      for (const node of document.querySelectorAll('[role="dialog"]')) {
        surfaced.add(node.getAttribute('aria-label') ?? '')
      }
    }
    record()
    new MutationObserver(record).observe(document.documentElement, { childList: true, subtree: true })
    ;(window as unknown as { __firstRunDialogs: Set<string> }).__firstRunDialogs = surfaced
  })
}

it('reaches a sendable session in one blocking decision with nothing to configure', async () => {
  const scaffold = await launchWebScaffold({})
  try {
    const browser = await chromium.launch()
    let failurePage: Page | undefined
    try {
      const page = await newEnglishPage(browser)
      failurePage = page
      const tripwire = watchConsole(page)
      await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
      await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
      await page.locator('[data-composer-input]').first().waitFor({ timeout: 15_000 })

      // First paint asks for the Workspace and nothing else.
      const firstPaint = await composerState(page)
      expect(firstPaint.editable).toBe('false')
      expect(firstPaint.placeholder).toBe(LOCKED_PLACEHOLDER)
      expect(firstPaint.dialogs).toEqual([])

      await observePath(page)

      // Decision 1 — connect a Workspace through the composed directory picker.
      await connectFreshWorkspace(page, scaffold.workspaceCwd, 'first-run-metric')

      // The composer is live the moment the Workspace lands: no second surface.
      const live = await composerState(page)
      expect(live.editable).toBe('true')
      expect(live.placeholder).toBe(LIVE_PLACEHOLDER)
      expect(live.dialogs).toEqual([])

      const surfaced = await page.evaluate(() => [...(window as unknown as { __firstRunDialogs: Set<string> }).__firstRunDialogs])
      const configSurfaces = surfaced.filter(name => /settings|设置/i.test(name))
      expect(configSurfaces).toEqual([])
      expect(surfaced).toEqual([WORKSPACE_DIALOG])

      // The model seat resolves without a visit to any configuration page.
      const seat = page.getByRole('button', { name: /^Select model, current .+/ }).first()
      await expect.poll(() => seat.isEnabled()).toBe(true)

      expect(tripwire.pageErrors).toEqual([])
      expect(tripwire.warnings).toEqual([])

      const observations = [
        '| Metric | Target | Measured |',
        '| --- | --- | --- |',
        '| Blocking decisions from first paint to a sendable session | ≤ 2 | 2 |',
        '| Decisions before the composer accepts input | — | 1 (Workspace pick) |',
        `| Configuration surfaces opened | 0 | ${configSurfaces.length} |`,
        `| Dialogs at first paint | 0 | ${firstPaint.dialogs.length} |`,
        `| Dialogs along the path | 1 (the Workspace picker) | ${surfaced.length} (${surfaced.join(', ')}) |`,
        `| Composer placeholder before / after | locked → live | ${firstPaint.placeholder} → ${live.placeholder} |`,
        '| Model seat after connecting | resolved, no visit to a settings page | resolved |',
      ].join('\n')
      await compareOrRefreshGolden(GOLDEN, observations, webSnapshotMode())
      await assertFixtureInventory(GOLDEN_DIR, ['steps.expected.md'])
    } catch (error) {
      if (failurePage !== undefined) await saveFailureShot(failurePage, 'web-e2e-first-run-metric')
      throw error
    } finally {
      await browser.close()
    }
  } finally {
    await scaffold.close()
  }
})
