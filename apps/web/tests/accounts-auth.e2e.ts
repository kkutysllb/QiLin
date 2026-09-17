// Web e2e scenario: the local account surface end to end. The site root serves
// the landing page, the first-run document initializes the account, the
// application document stays behind the session gate, and /api answers only an
// authenticated browser. Zero model calls: the scenario never reaches a session,
// so a stray stream fails loud with NO_ADAPTER.
import { fileURLToPath } from 'node:url'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { launchWebScaffold, type WebScaffold } from './scaffold.ts'

const OVERLAY = fileURLToPath(new URL('./accounts-auth.overlay.yml', import.meta.url))
const USERNAME = 'first'
const EMAIL = 'first@example.com'
const PASSWORD = 'password-1'
/** The application's own phase marker: the conversation shell renders it once the app mounts. */
const APP_MOUNTED = '[data-phase]'

describe('web e2e: local accounts gate the application', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ extraOverlayPath: OVERLAY })
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  })

  afterAll(async () => {
    await page?.close()
    await browser?.close()
    await scaffold?.close()
  })

  it('walks the landing page, first-run setup, sign-in, and the session gate', { timeout: 180_000 }, async () => {
    // The site root is the public landing page; no session is needed and the
    // application document is not served there.
    await page.goto(`${scaffold.baseUrl}/`, { waitUntil: 'load' })
    const landing = await page.textContent('body')
    expect(landing).toContain('探索平台')
    expect(await page.locator(APP_MOUNTED).count()).toBe(0)

    // The console entry hands an unauthenticated visitor the public page, not a
    // credential form, and remembers the document they asked for.
    await page.goto(`${scaffold.baseUrl}/workspace`, { waitUntil: 'load' })
    expect(new URL(page.url()).pathname).toBe('/')
    expect(new URL(page.url()).searchParams.get('next')).toBe('/workspace')

    // The landing entry call to action opens the document this deployment can
    // serve: with no account yet, the first-run form, which takes a username and
    // an optional address.
    await page.click('[data-entry-cta]')
    await page.waitForURL('**/setup**', { timeout: 30_000 })
    expect(await page.textContent('body')).toContain('初始化管理员')
    await page.getByLabel('用户名', { exact: true }).fill(USERNAME)
    await page.getByLabel('邮箱（可选）').fill(EMAIL)
    await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
    await page.getByLabel('确认密码').fill(PASSWORD)
    await page.getByRole('button', { name: '创建管理员账户' }).click()
    await page.waitForURL('**/workspace', { timeout: 60_000 })
    await page.waitForSelector(APP_MOUNTED, { timeout: 60_000 })

    // The session survives a reload of the gated entry.
    await page.reload({ waitUntil: 'load' })
    await page.waitForSelector(APP_MOUNTED, { timeout: 60_000 })

    // A browser without the session cookie lands on the public page again, and
    // the entry call to action now opens sign-in because an account exists.
    const context = page.context()
    await context.clearCookies()
    await page.goto(`${scaffold.baseUrl}/workspace`, { waitUntil: 'load' })
    expect(new URL(page.url()).pathname).toBe('/')
    await page.click('[data-entry-cta]')
    await page.waitForURL('**/login**', { timeout: 30_000 })
    expect(await page.textContent('body')).toContain('登录控制台')

    // The gate rejects the unauthenticated API before any handler runs.
    expect(await page.evaluate(async () => (await fetch('/api/auth/status')).status)).toBe(200)
    expect(await page.evaluate(async () => (await fetch('/api/anything')).status)).toBe(401)

    // Both pre-session documents are public files the entry gate never sees, so
    // the page itself sends a visitor holding the wrong one to the right one.
    await page.goto(`${scaffold.baseUrl}/setup?next=%2Fworkspace`, { waitUntil: 'load' })
    // The swap waits for the status read, so it lands after the document load.
    await page.waitForURL('**/login?next=%2Fworkspace', { timeout: 30_000 })

    // The address the account carries signs in through the same single field.
    await page.getByLabel('用户名或邮箱').fill(EMAIL)
    await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.waitForURL('**/workspace', { timeout: 60_000 })
    await page.waitForSelector(APP_MOUNTED, { timeout: 60_000 })

    // A wrong password is refused with the page's own copy, not the server text.
    await context.clearCookies()
    await page.goto(`${scaffold.baseUrl}/login`, { waitUntil: 'load' })
    await page.getByLabel('用户名或邮箱').fill(USERNAME)
    await page.getByLabel('密码', { exact: true }).fill('password-9')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.getByText('用户名或密码不正确').waitFor({ timeout: 30_000 })

    // Signing out clears the cookie and re-arms the gate, which sends the next
    // unauthenticated visit back to the public page.
    await page.getByLabel('用户名或邮箱').fill(USERNAME)
    await page.getByLabel('密码', { exact: true }).fill(PASSWORD)
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.waitForURL('**/workspace', { timeout: 60_000 })
    await page.evaluate(async () => { await fetch('/api/auth/logout', { method: 'POST' }) })
    await page.goto(`${scaffold.baseUrl}/workspace`, { waitUntil: 'load' })
    expect(new URL(page.url()).pathname).toBe('/')
  })
})
