// Web e2e: a sent user message carries a Markdown blockquote whose first line
// names the message it quotes. The reader-facing contract has four parts —
// render the excerpt as one quote surface instead of literal markers, copy
// exactly the quoted characters, jump to the quoted row, and keep the source
// marker out of the excerpt. Zero model calls: the scenario boots the shipped
// Web composition over a seeded settled recording and exercises the real
// client bundles.
import { chromium, type Browser, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import { createAssistantMessage, createUserMessage } from '@qilin-agent/llm'
import { SESSION_FORMAT_VERSION, Session, SessionId } from '@qilin-agent/session'
import { launchWebScaffold, seedSession, watchConsole, type WebScaffold } from './scaffold.ts'
import { newEnglishPage, saveFailureShot } from './support.ts'

const SEED_ID = 'user-quote-web-e2e'
const QUOTED = '被引用的原始问题：这条消息随后会被引用。'
const SOURCE_HEAD = 'QUOTE_E2E_SOURCE'
const ANSWER = '已收到这两条消息。'
// Seeded events and browser time share a day independently of host timezones.
const QUOTE_TIME = Date.UTC(2026, 0, 15, 12)
// A Chat row key is '<kind length>:<kind><context id>'; the message Definition
// registers 'input-message' and keys a user message by its id.
const MESSAGE_KIND = 'input-message'
// Both seeded user messages are input-message rows; the quoted source comes
// first in the transcript, so the first matching row is the jump target.
const SOURCE_ROW = '[data-chat-node-key^="' + String(MESSAGE_KIND.length) + ':' + MESSAGE_KIND + '"]'

/** Build the settled two-turn recording: one quoted source, then one quoting message. */
function quoteFixture(): string {
  const session = Session.create(SessionId('user-quote-source'))
  session.append('turn/start', { turn: 1 })
  const source = session.append('user/message', createUserMessage({
    content: [{ type: 'text', text: SOURCE_HEAD + ' ' + QUOTED }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('step/start', { turn: 1, step: 1 })
  session.append('assistant/message', {
    stream: [],
    turn: 1,
    step: 1,
    message: createAssistantMessage({
      content: [{ type: 'text', text: ANSWER }],
      source: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    }),
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 1, step: 1 })
  session.append('turn/end', { turn: 1, reason: { kind: 'completed' } })
  session.append('turn/start', { turn: 2 })
  const sourceKey = String(MESSAGE_KIND.length) + ':' + MESSAGE_KIND + String(source.data.id)
  session.append('user/message', createUserMessage({
    content: [{
      type: 'text',
      text: [
        '请基于上一条继续：',
        '> [quoted](qilin-quote:' + sourceKey + ')',
        '> ' + QUOTED,
      ].join('\n'),
    }],
    source: { kind: 'user' },
  }), { surfaceOp: 'append' })
  session.append('step/start', { turn: 2, step: 1 })
  session.append('assistant/message', {
    stream: [],
    turn: 2,
    step: 1,
    message: createAssistantMessage({
      content: [{ type: 'text', text: ANSWER }],
      source: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
    }),
  }, { surfaceOp: 'append' })
  session.append('step/end', { turn: 2, step: 1 })
  session.append('turn/end', { turn: 2, reason: { kind: 'completed' } })
  return [
    JSON.stringify({
      type: 'session',
      version: SESSION_FORMAT_VERSION,
      id: '{{sessionId}}',
      createdAt: 0,
      cwd: '{{cwd}}',
      isSeeded: false,
      delegationDepth: 0,
    }),
    ...session.snapshotEvents().map(event => JSON.stringify({
      ...event,
      time: QUOTE_TIME + event.seq * 1_000,
    })),
    '',
  ].join('\n')
}

describe('web e2e: quoted excerpt in sent user text', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page
  let tripwire: ReturnType<typeof watchConsole>

  beforeAll(async () => {
    scaffold = await launchWebScaffold({})
    await seedSession(scaffold, quoteFixture(), SEED_ID, undefined, { createdAt: QUOTE_TIME })
    browser = await chromium.launch()
    page = await newEnglishPage(browser)
    await page.clock.setFixedTime(QUOTE_TIME + 60_000)
    tripwire = watchConsole(page)
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
    await page.waitForSelector('[class*="frame"]', { timeout: 30_000 })
    await page.getByText('Ungrouped', { exact: true }).waitFor({ timeout: 30_000 })
  }, 180_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('renders the excerpt, copies it, and jumps to the quoted row', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-user-quote'))
    // The seeded recording opens from the Session tree: the group row first,
    // then the session it contains.
    const groupRow = page.locator('[role="treeitem"]').first()
    await groupRow.waitFor({ timeout: 15_000 })
    await groupRow.click()
    const sessionRow = page.locator('[role="treeitem"]').nth(1)
    await sessionRow.waitFor({ timeout: 10_000 })
    await sessionRow.click()
    await page.getByText(SOURCE_HEAD, { exact: false }).first().waitFor({ timeout: 30_000 })
    // Both Turns render; the quote surface is the only one in the transcript.
    const quote = page.locator('[data-quote-preview]').first()
    await quote.waitFor({ timeout: 30_000 })
    const excerpt = quote.locator('[data-quote-preview-text]').first()
    expect(await excerpt.textContent()).toBe(QUOTED)
    // The source marker line is contract, not excerpt.
    expect(await page.locator('body').textContent()).not.toContain('qilin-quote:')
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
    await quote.locator('[data-quote-copy]').first().click()
    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(QUOTED)
    const sourceRow = page.locator(SOURCE_ROW).first()
    await sourceRow.waitFor({ timeout: 30_000 })
    await quote.locator('[data-quote-jump]').first().click()
    const box = await sourceRow.boundingBox()
    const viewport = page.viewportSize()
    expect(box).not.toBeNull()
    expect(viewport).not.toBeNull()
    // The jump centers the quoted row, so it must sit inside the viewport.
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height)
    expect(tripwire.pageErrors).toEqual([])
  }, 120_000)
})
