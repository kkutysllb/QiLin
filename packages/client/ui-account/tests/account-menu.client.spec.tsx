// @vitest-environment jsdom
/**
 * The account menu's rendered behaviour: the trigger and its label, the rows
 * one account-gate answer produces, both option submenus, and what a refused
 * sign-out does. Props are fed directly; `fetch` is the only global stub, and
 * it goes through the plugin's own read/sign-out wiring.
 */
import { useSyncExternalStore } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeTranslate } from '@qilin/client-test-runtime'
import { createSnapshotStore } from '@qilin/client-store'
import type { LocaleSnapshot } from '@qilin/client-locale/client'
import type { ThemeSnapshot } from '@qilin/client-ui-theme/client'
import { AccountMenu } from '../src/client/AccountMenu.tsx'
import type { AccountMenuProps } from '../src/client/AccountMenu.tsx'
import { createAccountMenuInjected } from '../src/client/injected.ts'
import { createAccountMenuStore } from '../src/client/store.ts'
import type { AccountMenuState } from '../src/client/store.ts'
import { zh } from '../src/client/locales.ts'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** The selectable locales this bench publishes, mirroring the shipped pair. */
const LOCALES = [
  { id: 'zh', label: '中文', fallback: 'en' },
  { id: 'en', label: 'English' },
]

/** One answer the stubbed `fetch` serves for `/api/auth/status`. */
interface Answer {
  /** JSON body; ignored when `reject` is set. */
  readonly body?: unknown
  /** HTTP status; defaults to 200. */
  readonly status?: number
  /** Reject the request the way an unreachable Host does. */
  readonly reject?: boolean
}

/** A signed-in browser behind an enabled account gate. */
const SIGNED_IN: Answer = {
  body: {
    enabled: true,
    needsSetup: false,
    registrationOpen: true,
    authenticated: true,
    user: { id: 'acct-1', email: 'ada@example.com', createdAt: 1_700_000_000_000 },
  },
}

/** A browser whose deployment runs without the account gate. */
const GATE_OFF: Answer = {
  body: { enabled: false, needsSetup: false, registrationOpen: false, authenticated: false, user: null },
}

/** An enabled gate on a browser that carries no session yet. */
const SIGNED_OUT: Answer = {
  body: { enabled: true, needsSetup: false, registrationOpen: true, authenticated: false, user: null },
}

/** A Host that cannot be reached at all. */
const UNREACHABLE: Answer = { reject: true }

/** A Host that answers the status read with a refusal. */
const REFUSED: Answer = { status: 503, body: { error: 'unavailable' } }

/** What one bench may vary. */
interface BenchOptions {
  /** The account status answer; defaults to {@link SIGNED_IN}. */
  readonly account?: Answer
  /** The sign-out answer; defaults to an accepted 204. */
  readonly signOut?: Answer
  /** Theme preference the theme source publishes. */
  readonly preference?: ThemeSnapshot['preference']
  /** Active locale the locale source publishes. */
  readonly active?: string
  /** Sidebar column state; false is the collapsed rail. */
  readonly wide?: boolean
  /** Whether the deployment mounts the settings panel; defaults to true. */
  readonly settingsPanel?: boolean
}

/**
 * Render the menu over a real store instance, the plugin's own read/sign-out
 * wiring, and service callbacks the spec records.
 * @param options - the account answer and the published preferences.
 * @returns the live store, requests, and the call spies.
 */
function bench(options: BenchOptions = {}) {
  const account = options.account ?? SIGNED_IN
  const requests: { readonly url: string; readonly init?: RequestInit }[] = []
  const fetchMock = vi.fn((input: unknown, init?: RequestInit): Promise<Response> => {
    const url = String(input)
    requests.push(init === undefined ? { url } : { url, init })
    if (url.endsWith('/logout')) {
      if (options.signOut?.reject === true) return Promise.reject(new TypeError('Failed to fetch'))
      return Promise.resolve(new Response(null, { status: options.signOut?.status ?? 204 }))
    }
    if (account.reject === true) return Promise.reject(new TypeError('Failed to fetch'))
    return Promise.resolve(new Response(JSON.stringify(account.body ?? {}), {
      status: account.status ?? 200,
      headers: { 'content-type': 'application/json' },
    }))
  })
  vi.stubGlobal('fetch', fetchMock)

  const instance = createAccountMenuStore().create()
  const settingsPanel = createSnapshotStore(options.settingsPanel ?? true)
  const setTheme = vi.fn()
  const setLocale = vi.fn()
  const openSettings = vi.fn()
  // jsdom refuses real navigation; the spec observes the call instead.
  const assign = vi.fn()
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { assign },
  })

  // The renderer binds each hook-compartment source to a use<Name> selector;
  // the spec binds the plugin's own face the same way.
  const { hooks, ...face } = createAccountMenuInjected({
    actions: instance.actions,
    openSettings,
    setTheme,
    setLocale,
    theme: {
      getSnapshot: (): ThemeSnapshot => ({
        preference: options.preference ?? 'system',
        fontSize: 14,
        active: { id: 'light', colorScheme: 'light', tokens: {} },
        themes: [],
        revision: 0,
      }),
      subscribe: () => () => {},
    },
    locale: {
      getSnapshot: (): LocaleSnapshot => ({
        active: options.active ?? 'zh',
        locales: LOCALES,
        revision: 0,
      }),
      subscribe: () => () => {},
    },
    settingsPanel,
  })

  // Method references lose their receiver, so each source is subscribed
  // through a wrapper (the renderer binds them the same way).
  const subscribeStore = (listener: () => void): (() => void) => instance.subscribe(listener)
  const subscribeTheme = (listener: () => void): (() => void) => hooks.theme.subscribe(listener)
  const subscribeLocale = (listener: () => void): (() => void) => hooks.locale.subscribe(listener)
  const subscribeSettingsPanel = (listener: () => void): (() => void) => hooks.settingsPanel.subscribe(listener)

  const props = {
    wide: options.wide ?? true,
    actions: instance.actions,
    ...face,
    useStore: <Selected,>(select: (state: AccountMenuState) => Selected): Selected =>
      useSyncExternalStore(subscribeStore, () => select(instance.getSnapshot())),
    useTheme: <Selected,>(select: (snapshot: ThemeSnapshot) => Selected): Selected =>
      useSyncExternalStore(subscribeTheme, () => select(hooks.theme.getSnapshot())),
    useLocale: <Selected,>(select: (snapshot: LocaleSnapshot) => Selected): Selected =>
      useSyncExternalStore(subscribeLocale, () => select(hooks.locale.getSnapshot())),
    useSettingsPanel: <Selected,>(select: (mounted: boolean) => Selected): Selected =>
      useSyncExternalStore(subscribeSettingsPanel, () => select(hooks.settingsPanel.getSnapshot())),
    t: makeTranslate(zh),
  } as unknown as AccountMenuProps

  render(<AccountMenu {...props} />)
  return { instance, requests, setTheme, setLocale, openSettings, assign, fetchMock }
}

/**
 * Let the mount's status answer land. A negative row assertion needs this:
 * `waitFor` returns on its first check, which would pass on the state the
 * menu renders before any answer arrives.
 */
async function settle(): Promise<void> {
  await act(async () => { await new Promise((resolve) => { setTimeout(resolve, 0) }) })
}

/** Click the trigger to reveal the menu. */
function openMenu(): void {
  fireEvent.click(screen.getByRole('button', { name: zh.label }))
}

/**
 * Reveal one row's submenu the way the pointer does.
 * @param name - accessible name of the parent row.
 */
function openSubmenu(name: string): void {
  const row = screen.getByRole('menuitem', { name })
  fireEvent.mouseEnter(row.parentElement as HTMLElement)
}

/** Every top-level row's label, in render order. */
function rowLabels(): (string | null)[] {
  return screen.getAllByRole('menuitem').map(item => item.textContent)
}

describe('AccountMenu', () => {
  it('offers the labeled account trigger and shows no menu until it is opened', () => {
    bench()
    const trigger = screen.getByRole('button', { name: zh.label })
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('menu')).toBeNull()

    openMenu()
    expect(screen.getByRole('menu')).toBeTruthy()
    expect(screen.getByRole('button', { name: zh.label }).getAttribute('aria-expanded')).toBe('true')
  })

  it('closes on Escape through the primitive', () => {
    bench()
    openMenu()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('names the signed-in account above the theme, language, and sign-out rows', async () => {
    const { requests } = bench()
    openMenu()
    // The address names both the trigger row and the menu's own heading.
    await waitFor(() => { expect(screen.getAllByText('ada@example.com')).toHaveLength(2) })
    expect(rowLabels()).toEqual([zh.settings, zh.appearance, zh.language, zh.signOut])
    // The status read is the mount's own; opening and closing re-read nothing.
    expect(requests.map(request => request.url)).toEqual(['/api/auth/status'])
  })

  it('marks the current theme and switches it from the appearance submenu', () => {
    const { setTheme, instance } = bench({ preference: 'dark' })
    openMenu()
    openSubmenu(zh.appearance)

    expect(rowLabels()).toContain(zh['appearance.light'])
    const dark = screen.getByRole('menuitem', { name: zh['appearance.dark'] })
    expect(dark.querySelector('[class*="check"]')).not.toBeNull()
    expect(screen.getByRole('menuitem', { name: zh['appearance.light'] }).querySelector('[class*="check"]')).toBeNull()

    fireEvent.click(dark)
    expect(setTheme).toHaveBeenCalledWith('dark')
    // The store is the menu's own open state: a choice closes it.
    expect(instance.getSnapshot().open).toBe(false)
  })

  it('marks the active locale and switches it from the language submenu', () => {
    const { setLocale } = bench({ active: 'en' })
    openMenu()
    openSubmenu(zh.language)

    const english = screen.getByRole('menuitem', { name: 'English' })
    expect(english.querySelector('[class*="check"]')).not.toBeNull()
    expect(screen.getByRole('menuitem', { name: '中文' }).querySelector('[class*="check"]')).toBeNull()

    fireEvent.click(screen.getByRole('menuitem', { name: '中文' }))
    expect(setLocale).toHaveBeenCalledWith('zh')
  })

  it('reveals the settings panel from its row', () => {
    const { openSettings } = bench()
    openMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: zh.settings }))
    expect(openSettings).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('ends the session through the Host and lands on the sign-in page', async () => {
    const { assign, requests } = bench()
    openMenu()
    await waitFor(() => { expect(screen.getByRole('menuitem', { name: zh.signOut })).toBeTruthy() })
    fireEvent.click(screen.getByRole('menuitem', { name: zh.signOut }))

    await waitFor(() => { expect(assign).toHaveBeenCalledWith('/login') })
    expect(requests.at(-1)).toEqual({ url: '/api/auth/logout', init: { method: 'POST' } })
  })

  it('keeps the menu open when the sign-out call is refused', async () => {
    const { assign, requests, instance } = bench({ signOut: { status: 500 } })
    openMenu()
    await waitFor(() => { expect(screen.getByRole('menuitem', { name: zh.signOut })).toBeTruthy() })
    fireEvent.click(screen.getByRole('menuitem', { name: zh.signOut }))

    await waitFor(() => {
      expect(requests.at(-1)).toEqual({ url: '/api/auth/logout', init: { method: 'POST' } })
    })
    expect(assign).not.toHaveBeenCalled()
    expect(instance.getSnapshot().open).toBe(true)
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('keeps the menu open when the sign-out call cannot reach the Host', async () => {
    const { assign, requests, instance } = bench({ signOut: { reject: true } })
    openMenu()
    await waitFor(() => { expect(screen.getByRole('menuitem', { name: zh.signOut })).toBeTruthy() })
    fireEvent.click(screen.getByRole('menuitem', { name: zh.signOut }))

    await waitFor(() => { expect(requests.at(-1)?.url).toBe('/api/auth/logout') })
    await settle()
    expect(assign).not.toHaveBeenCalled()
    expect(instance.getSnapshot().open).toBe(true)
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('renders no identity and no sign-out while the account gate is off', async () => {
    const { requests } = bench({ account: GATE_OFF })
    openMenu()
    await waitFor(() => { expect(requests).toHaveLength(1) })
    await settle()
    expect(rowLabels()).toEqual([zh.settings, zh.appearance, zh.language])
  })

  it('renders the same reduced menu when the status read fails', async () => {
    const { requests } = bench({ account: UNREACHABLE })
    openMenu()
    await waitFor(() => { expect(requests).toHaveLength(1) })
    await settle()
    expect(rowLabels()).toEqual([zh.settings, zh.appearance, zh.language])
  })

  it('renders the same reduced menu when the status read is refused', async () => {
    const { requests } = bench({ account: REFUSED })
    openMenu()
    await waitFor(() => { expect(requests).toHaveLength(1) })
    await settle()
    expect(rowLabels()).toEqual([zh.settings, zh.appearance, zh.language])
  })

  it('offers sign-out without an identity on an enabled gate with no session', async () => {
    const { instance } = bench({ account: SIGNED_OUT })
    openMenu()
    await waitFor(() => { expect(instance.getSnapshot().signOutAvailable).toBe(true) })
    expect(instance.getSnapshot().email).toBeNull()
    expect(rowLabels()).toEqual([zh.settings, zh.appearance, zh.language, zh.signOut])
  })

  it('opens the same menu from the collapsed rail', () => {
    bench({ wide: false })
    openMenu()
    expect(screen.getByRole('menuitem', { name: zh.settings })).toBeTruthy()
  })

  it('offers no Settings row where the deployment mounts no settings panel', async () => {
    const { requests } = bench({ settingsPanel: false })
    openMenu()
    await waitFor(() => { expect(requests).toHaveLength(1) })
    await settle()
    expect(rowLabels()).toEqual([zh.appearance, zh.language, zh.signOut])
  })

  it('names the signed-in account beside its avatar in the wide column', async () => {
    bench()
    const trigger = await screen.findByRole('button', { name: 'ada@example.com' })
    // The visible account name is the accessible name, so voice control can
    // address the row by what it reads.
    expect(trigger.getAttribute('aria-label')).toBeNull()
    expect(trigger.textContent).toBe('Aada@example.com')
    expect(trigger.querySelector('[aria-hidden="true"]')?.textContent).toBe('A')
  })

  it('falls back to the localized account label while no identity is known', () => {
    bench({ account: SIGNED_OUT })
    const trigger = screen.getByRole('button', { name: zh.label })
    expect(trigger.textContent).toBe(zh.label)
    expect(trigger.querySelector('[aria-hidden="true"] svg')).not.toBeNull()
  })

  it('hides the account name in the collapsed rail and names the button by its label', () => {
    bench({ account: SIGNED_OUT, wide: false })
    const trigger = screen.getByRole('button', { name: zh.label })
    expect(trigger.getAttribute('aria-label')).toBe(zh.label)
    expect(trigger.textContent).toBe('')
  })
})
