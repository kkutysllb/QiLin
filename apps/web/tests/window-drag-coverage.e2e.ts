// Browser coverage for the macOS window drag surface: which chrome rows drag,
// which pixels stay content, and that no control is swallowed by the band.
//
// The lane boots the real composition in Chromium and marks the document root
// darwin — the one platform where these rules exist (ui-web base.css scopes
// every app-region rule to it). CDP-injected clicks cannot decide this class:
// the swallow happens in Electron's native window, so the claims here are
// geometry claims decided by the shared composition model
// (@qilin-agent/client-web window-drag/regions.ts).
//
// Probes are anchored to stable data hooks and derived from live rects, so a
// layout change moves them rather than invalidating them. The ui-theme app-region
// gate holds the other half of the claim: it pins each row's mark, its sheet, and
// its authored height, and refuses a `data-window-drag` mark anywhere else.
//
// QiLin composition notes versus upstream's lane: the plugin manager is a
// Settings tab, not a main-panel entry page, so there is no entry/detail chrome
// row to walk — its head-row marks are composition contract, pinned by the
// ui-theme gate, and inert inside the portalled settings modal (asserted by the
// modal test below); and the collapsed sidebar's reopen controls live in the
// Conversation header's leading seat, which the collapsed-state test probes.
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initialShortcutConfig } from '@qilin-agent/client-shortcuts/protocol'
import {
  INTERACTIVE_SELECTOR, RECALL_MARK, isDraggableAt, type RegionRect,
} from '@qilin-agent/client-web/src/window-drag/regions.ts'
import { launchWebScaffold, watchConsole, type WebScaffold } from './scaffold.ts'
import { connectFreshWorkspace, newEnglishPage, saveFailureShot } from './support.ts'

/** One collected box: its app-region value, whether it is interactive, and where it is. */
interface CollectedRegion extends RegionRect {
  /** Whether the element itself matches the interactive selector. */
  readonly interactive: boolean
  /** Sample points at which the browser's hit test reaches this element or its content. */
  readonly hits: readonly (readonly [number, number])[]
}

/** A point the coverage table claims something about. */
interface CoverageProbe {
  /** Row the probe speaks for, for the failure message. */
  readonly row: string
  /** What the point is, for the failure message. */
  readonly what: string
  /** Resolves the point from the live rects captured for the state under test. */
  readonly at: () => readonly [number, number]
  /** Whether the window would drag there. */
  readonly drag: boolean
}

/** A viewport rect. */
interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

const EMPTY: Rect = { x: 0, y: 0, width: 0, height: 0 }

/** Read one hook's viewport rect, or a zero rect while it is not rendered. */
async function rectOf(page: Page, selector: string): Promise<Rect> {
  const locator = page.locator(selector).first()
  if (await locator.count() === 0) return EMPTY
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  })
}

/**
 * Collect every visible app-region box in DOM order.
 * @param page - the page under test.
 * @returns the boxes, in document order, with the interactive flag of each element.
 */
async function collectedRegions(page: Page, selector: string): Promise<CollectedRegion[]> {
  return page.evaluate((interactiveSelector) => {
    const collected: {
      x: number
      y: number
      width: number
      height: number
      draggable: boolean
      interactive: boolean
      hits: [number, number][]
    }[] = []
    for (const element of Array.from(document.querySelectorAll('*'))) {
      const style = getComputedStyle(element)
      const region = style.getPropertyValue('-webkit-app-region')
      if (region !== 'drag' && region !== 'no-drag') continue
      if (style.visibility === 'hidden' || style.display === 'none') continue
      const rect = element.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) continue
      const interactive = element.matches(interactiveSelector)
      const insetX = Math.min(2, rect.width / 4)
      const insetY = Math.min(2, rect.height / 4)
      const samples: [number, number][] = [
        [rect.x + rect.width / 2, rect.y + rect.height / 2],
        [rect.x + insetX, rect.y + insetY],
        [rect.x + rect.width - insetX, rect.y + insetY],
        [rect.x + insetX, rect.y + rect.height - insetY],
        [rect.x + rect.width - insetX, rect.y + rect.height - insetY],
      ]
      const hits = interactive
        ? samples.filter(([x, y]) => {
          const top = document.elementFromPoint(x, y)
          // A pane's programmatic focus target also contains its window-drag strip.
          // The strip owns those pixels; controls inside it still need their own subtraction.
          const strip = top?.closest('[data-dockkit-strip][data-window-drag]')
          if (element.matches('[data-dockkit-pane][tabindex="-1"]')
            && strip != null && element.contains(strip)) return false
          return top !== null && (top === element || element.contains(top))
        })
        : []
      collected.push({
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        draggable: region === 'drag',
        interactive,
        hits,
      })
    }
    return collected
  }, selector)
}

/**
 * Interactive boxes whose press cannot reach the page, as printable descriptions.
 * A sample counts only where the browser's own hit test reaches the control: a
 * box clipped away by its column (the collapsed sidebar's hidden controls sit at
 * negative x) is not hittable anywhere it overlaps a drag row, and a press there
 * belongs to whatever is painted.
 * @param regions - collected boxes in DOM order.
 * @returns one description per interactive box with a hittable sample inside the drag surface.
 */
function swallowedBoxes(regions: readonly CollectedRegion[]): string[] {
  return regions
    .filter(region => region.interactive)
    .filter(region => region.hits.some(([x, y]) => isDraggableAt(regions, x, y)))
    .map(region => `${Math.round(region.x)},${Math.round(region.y)} ${Math.round(region.width)}x${Math.round(region.height)}`)
}

/**
 * Settle when the shell first pulses the drag recall mark, or false when 15s pass
 * without one. Start it before the gesture under test and await it after.
 * @param page - the page under test.
 * @returns the pending observation of the first pulse.
 */
function firstRecallPulse(page: Page): Promise<boolean> {
  return page.evaluate((mark: string) => new Promise<boolean>((resolve) => {
    const observer = new MutationObserver((records) => {
      const pulsed = records.some(record => record.attributeName === mark
        && (record.target as Element).hasAttribute(mark))
      if (!pulsed) return
      observer.disconnect()
      resolve(true)
    })
    observer.observe(document.body, { attributes: true, attributeFilter: [mark] })
    setTimeout(() => {
      observer.disconnect()
      resolve(false)
    }, 15_000)
  }), RECALL_MARK)
}

/**
 * Wait until nothing under the page is animating, so a probe measures the settled
 * layout instead of a frame of a column slide.
 * @param page - the page under test.
 */
async function settled(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => document.getAnimations()
    .every(animation => animation.playState === 'finished' || animation.playState === 'idle')),
  { timeout: 20_000 }).toBe(true)
}

describe('web e2e: macOS window drag coverage', () => {
  let scaffold: WebScaffold
  let browser: Browser

  beforeAll(async () => {
    // A manageable profile: the settings dialog's plugin tab draws its card list
    // only when the deployment runs a profile it can manage; the drag lane does
    // not depend on it, but the modal test opens the same shell the product uses.
    scaffold = await launchWebScaffold()
    browser = await chromium.launch()
  }, 180_000)

  afterAll(async () => {
    try { await browser?.close() }
    finally { await scaffold?.close() }
  })

  /**
   * Open a darwin-marked page in the shipped composition.
   * @returns the page and its console tripwire.
   */
  async function darwinPage(): Promise<{ page: Page; tripwire: ReturnType<typeof watchConsole> }> {
    const page = await newEnglishPage(browser)
    await page.addInitScript(({ value, snapshot }) => {
      // The Desktop platform marker requires the preload's keyboard and preference capabilities.
      Object.assign(window, { qilinDesktop: { protocolVersion: 1,
        keyboard: { subscribe: () => () => {}, closeWindow: async () => {} },
        shortcuts: { get: async () => ({ ...snapshot, status: 'ready' }),
          subscribe: () => () => {}, recording: async () => {},
          edit: async () => ({ status: 'not-ready', snapshot }) },
      } })
      const mark = (): void => { document.documentElement.setAttribute('data-platform', value) }
      if (document.documentElement === null) document.addEventListener('DOMContentLoaded', mark, { once: true })
      else mark()
    }, { value: 'darwin', snapshot: initialShortcutConfig() })
    const tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    return { page, tripwire }
  }

  it('leaves no interactive box inside the drag surface, and keeps the panel strip row draggable', async () => {
    const { page, tripwire } = await darwinPage()
    try {
      await connectFreshWorkspace(page, scaffold.workspaceCwd)
      const agent = scaffold.ctx.agents.list()[0]
      if (agent === undefined) throw new Error('connected workspace did not create an Agent')
      agent.session.append('turn/start', { turn: 1 })
      const pulsing = firstRecallPulse(page)
      await page.locator('[data-sidebar-right-expand]').click()
      await page.locator('[data-sidebar-right-panel][data-sidebar-right-open]').waitFor({ timeout: 15_000 })
      // The panel slides in from the frame's right edge; probing before the slide
      // settles measures the hidden position, where no row reaches.
      await expect.poll(async () => page.locator('[data-sidebar-right-panel]').evaluate((element) => {
        const rect = element.getBoundingClientRect()
        return Math.round(innerWidth - rect.right) === 0
          && element.getAnimations({ subtree: true })
            .every(animation => animation.playState === 'finished' || animation.playState === 'idle')
      }), { timeout: 15_000 }).toBe(true)

      // The shell's watcher, not the panel, is what keeps the native drag rects in
      // step with the slide: it must have pulsed while the panel moved and must be
      // settled now — a mark left set would subtract the whole surface.
      expect(await pulsing, 'the shell pulses the drag recall mark while the panel slides').toBe(true)
      // The watcher clears the mark on the frame after the geometry settles.
      await expect.poll(
        () => page.evaluate((mark: string) => document.body.hasAttribute(mark), RECALL_MARK),
        { timeout: 5_000 },
      ).toBe(false)

      const regions = await collectedRegions(page, INTERACTIVE_SELECTOR)
      const strip = await rectOf(page, '[data-dockkit-strip]')
      const panel = await rectOf(page, '[data-sidebar-right-panel]')
      const tabs = await rectOf(page, '[data-conversation-tabs]')
      const header = await rectOf(page, '[data-slot="conversation.session.header"] > header')
      // The drag mark lives on the persistent outer header, which also hosts the
      // leading seat above the Session's own title row.
      const dragHeader = await rectOf(page, 'header[data-window-drag]')
      // The sidebar column drags through its own rows (ui-sidebar), so its
      // coverage is the rows' geometry rather than a frame band's height.
      const toggle = await rectOf(page, 'button[aria-label="Collapse sidebar"]')
      const leading = await rectOf(page, '[data-conversation-header-leading]')

      const probes: CoverageProbe[] = [
        {
          row: 'right sidebar panel strip',
          what: 'the strip row top inset, above the controls',
          at: () => [strip.x + strip.width / 2, strip.y + 4],
          drag: true,
        },
        {
          row: 'right sidebar panel strip',
          what: 'the run below the strip row, over the pane body',
          at: () => [panel.x + panel.width / 2, strip.y + strip.height + 4],
          drag: false,
        },
        {
          row: 'conversation header',
          what: 'the blank run right of the view tabs, on the tab strip row',
          at: () => [tabs.x + tabs.width + 8, tabs.y + tabs.height / 2],
          drag: true,
        },
        {
          row: 'conversation header',
          what: 'the title row blank run',
          at: () => [header.x + header.width / 2, header.y + 4],
          drag: true,
        },
        {
          row: 'conversation header',
          what: 'the transcript run below the header block',
          at: () => [dragHeader.x + dragHeader.width / 2, dragHeader.y + dragHeader.height + 4],
          drag: false,
        },
      ]
      if (toggle.width > 0) {
        probes.push(
          {
            row: 'sidebar top strip',
            what: 'the blank run left of the collapse toggle',
            at: () => [toggle.x - 40, toggle.y + toggle.height / 2],
            drag: true,
          },
          {
            row: 'sidebar column',
            what: 'the content run below the chrome rows',
            at: () => [toggle.x - 40, toggle.y + toggle.height + 70],
            drag: false,
          },
        )
      }
      // The header's leading seat hosts the sidebar reopen controls while the
      // column is collapsed; with the column open the seat is empty and hidden.
      if (leading.width > 0) {
        probes.push({
          row: 'conversation header leading seat',
          what: 'the cluster of header controls',
          at: () => [leading.x + 4, leading.y + leading.height / 2],
          drag: false,
        })
      }

      for (const probe of probes) {
        const [x, y] = probe.at()
        const expected = `${probe.row}: ${probe.what} at ${Math.round(x)},${Math.round(y)}`
        expect(isDraggableAt(regions, x, y), expected).toBe(probe.drag)
      }

      // The invariant that has no gap budget: a press inside any control box must
      // reach the page instead of dragging the window.
      expect(swallowedBoxes(regions), 'interactive boxes inside the drag surface').toEqual([])

      expect(tripwire.pageErrors).toEqual([])
    } catch (error) {
      await saveFailureShot(page, 'window-drag-coverage')
      throw error
    } finally {
      await page.close()
    }
  }, 180_000)

  it('keeps the Conversation header draggable over the collapsed column, and its controls out of it', async () => {
    const { page, tripwire } = await darwinPage()
    try {
      await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
      await page.locator('[data-conversation-header-leading]').waitFor({ state: 'visible', timeout: 15_000 })
      await settled(page)
      const regions = await collectedRegions(page, INTERACTIVE_SELECTOR)
      const header = await rectOf(page, '[data-slot="conversation.session.header"] > header')
      const seat = await rectOf(page, '[data-conversation-header-leading]')

      // With the column hidden the centre starts at the frame's left edge, where
      // the Conversation header owns the run.
      expect(
        isDraggableAt(regions, header.x + 40, header.y + 4),
        'the Conversation header over the frame’s left edge',
      ).toBe(true)
      expect(
        isDraggableAt(regions, seat.x + 4, seat.y + seat.height / 2),
        'the seat holding the reopen controls',
      ).toBe(false)

      expect(swallowedBoxes(regions), 'interactive boxes inside the drag surface').toEqual([])
      expect(tripwire.pageErrors).toEqual([])
    } catch (error) {
      await saveFailureShot(page, 'window-drag-coverage-collapsed')
      throw error
    } finally {
      await page.close()
    }
  }, 120_000)

  it('keeps a covering overlay out of the drag surface', async () => {
    const { page, tripwire } = await darwinPage()
    try {
      await page.getByRole('button', { name: 'Account', exact: true }).click()
      await page.getByRole('menuitem', { name: 'Settings', exact: true }).click()
      const dialog = page.getByRole('dialog').first()
      await dialog.waitFor({ timeout: 15_000 })
      await settled(page)
      const layer = await dialog.evaluate((element) => {
        const overlay = element.parentElement
        const rect = overlay?.getBoundingClientRect()
        return {
          parentIsBody: overlay?.parentElement === document.body,
          coversWindow: rect !== undefined && rect.top <= 0 && rect.bottom >= innerHeight,
        }
      })
      // A covering surface inside #root precedes the columns' chrome, so a drag
      // row declared later would override its subtraction; beside the root,
      // ui-web base.css's body rule subtracts it instead.
      expect(layer.parentIsBody, 'the settings overlay portals beside #root').toBe(true)
      expect(layer.coversWindow, 'the settings overlay covers the window').toBe(true)

      // Nothing in the window drags while the overlay covers it: the body rule
      // subtracts the overlay's whole box, and the dialog inside it is one of the
      // interactive surfaces the selector subtracts.
      const regions = await collectedRegions(page, INTERACTIVE_SELECTOR)
      const header = await rectOf(page, '[data-slot="conversation.session.header"] > header')
      expect(
        isDraggableAt(regions, header.x + header.width / 2, header.y + 4),
        'the Conversation header run under the covering overlay',
      ).toBe(false)

      expect(swallowedBoxes(regions), 'interactive boxes inside the drag surface').toEqual([])
      expect(tripwire.pageErrors).toEqual([])
    } catch (error) {
      await saveFailureShot(page, 'window-drag-coverage-overlay')
      throw error
    } finally {
      await page.close()
    }
  }, 120_000)
})
