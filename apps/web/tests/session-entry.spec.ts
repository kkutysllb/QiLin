// @vitest-environment jsdom
/**
 * The pre-session entry path: how a landing page or sign-in document decides
 * where an unauthenticated visitor may go. The `?next=` validation is the
 * open-redirect fence both documents share, and the entry call to action is the
 * only way into the application from the public page.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readAccountStatus } from '../src/account-status.ts'
import { nextDestination } from '../src/next-destination.ts'
import { startEntryCta } from '../src/landing/landing.ts'

/** Answer one `/api/auth/status` read with the given facts. */
function respondWith(facts: unknown, ok = true): void {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(facts), { status: ok ? 200 : 503 })))
}

/** Put one entry link in the document, as both landing documents do. */
function entryLink(): HTMLAnchorElement {
  document.body.innerHTML = '<a id="cta" href="/workspace" data-entry-cta>进入控制台</a>'
  const link = document.getElementById('cta')
  if (!(link instanceof HTMLAnchorElement)) throw new Error('fixture: entry link missing')
  return link
}

/** Navigate the document to one path with an optional query string. */
function visit(path: string, search = ''): void {
  window.history.replaceState(null, '', `${path}${search}`)
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
  visit('/')
})

describe('nextDestination', () => {
  it('honours a same-site path and falls back to the application entry', () => {
    visit('/', '?next=%2Fworkspace%3Ftab%3Dfiles')
    expect(nextDestination()).toBe('/workspace?tab=files')
    visit('/', '?next=%2Fsessions%2Fabc')
    expect(nextDestination()).toBe('/sessions/abc')
  })

  it.each([
    ['nothing requested', ''],
    ['an empty value', '?next='],
    ['a relative path', '?next=workspace'],
    ['a protocol-relative path', '?next=%2F%2Fevil.example'],
    ['an absolute URL', '?next=https%3A%2F%2Fevil.example'],
    ['a backslash', '?next=%2F%5Cevil.example'],
    ['a folded character', '?next=%2Fwork%0Aspace'],
  ])('refuses %s', (_case, search) => {
    visit('/', search)
    expect(nextDestination()).toBe('/workspace')
  })
})

describe('startEntryCta', () => {
  it('sends a signed-in browser to the destination it asked for', async () => {
    const link = entryLink()
    visit('/', '?next=%2Fsessions%2Fabc')
    respondWith({ authenticated: true, needsSetup: false, registrationOpen: true })
    await startEntryCta()
    expect(link.getAttribute('href')).toBe('/sessions/abc')
  })

  it('sends an unauthenticated browser to the document that can admit it', async () => {
    const link = entryLink()
    respondWith({ authenticated: false, needsSetup: false, registrationOpen: true })
    await startEntryCta()
    expect(link.getAttribute('href')).toBe('/login?next=%2Fworkspace')
  })

  it('sends a first-run deployment to the initialization document', async () => {
    const link = entryLink()
    respondWith({ authenticated: false, needsSetup: true, registrationOpen: false })
    await startEntryCta()
    expect(link.getAttribute('href')).toBe('/setup?next=%2Fworkspace')
  })

  it('falls back to the sign-in document when the status read cannot answer', async () => {
    const link = entryLink()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    await startEntryCta()
    expect(link.getAttribute('href')).toBe('/login?next=%2Fworkspace')
  })

  it('leaves a page without entry links untouched', async () => {
    document.body.innerHTML = '<p>no call to action</p>'
    respondWith({ authenticated: false, needsSetup: true, registrationOpen: false })
    await expect(startEntryCta()).resolves.toBeUndefined()
  })
})

describe('readAccountStatus', () => {
  it('reads the three facts and refuses anything else', async () => {
    respondWith({ authenticated: true, needsSetup: false, registrationOpen: true })
    expect(await readAccountStatus()).toEqual({ authenticated: true, needsSetup: false, registrationOpen: true })

    respondWith({ authenticated: 'yes', needsSetup: false, registrationOpen: true })
    expect(await readAccountStatus()).toBeUndefined()

    respondWith(['not', 'an', 'object'])
    expect(await readAccountStatus()).toBeUndefined()

    respondWith({ authenticated: true, needsSetup: false, registrationOpen: true }, false)
    expect(await readAccountStatus()).toBeUndefined()
  })
})
