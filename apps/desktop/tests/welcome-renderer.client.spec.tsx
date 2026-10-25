// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { Welcome } from '../src/client/WelcomePage.tsx'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveDesktopLocale } from '../src/locale.ts'
import type { AccountView } from '../src/account-types.ts'
import type { WelcomeAuthResult, WelcomeSaveResult, WelcomeNotice } from '../src/welcome-api.ts'

const html = readFileSync(join(import.meta.dirname, '../renderer/welcome.html'), 'utf8')
afterEach(cleanup)

function mount(language = 'zh-CN', takeNotice = vi.fn<() => Promise<WelcomeNotice | undefined>>().mockResolvedValue(undefined)) {
  cleanup()
  const stopAccount = vi.fn()
  const api = {
    takeNotice,
    analytics: vi.fn(async (_event: string, _attributes: object) => {}),
    analyticsEnabled: async () => true,
    onAccountState: vi.fn((_listener: (state: AccountView) => void) => stopAccount),
    startSignIn: vi.fn(async (): Promise<AccountView> => ({ links: { usageUrl: 'http://localhost/usage', topUpUrl: 'http://localhost/top_up' }, status: 'signed-out', attempt: null })),
    cancelSignIn: vi.fn(async (): Promise<AccountView> => ({ links: { usageUrl: 'http://localhost/usage', topUpUrl: 'http://localhost/top_up' }, status: 'signed-out', attempt: null })),
    copySignInLink: vi.fn(async () => undefined),
    ...resolveDesktopLocale(language),
    saveApiKey: vi.fn<(value: string) => Promise<WelcomeSaveResult>>().mockResolvedValue({ ok: true }),
    skip: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    logIn: vi.fn<(username: string, password: string) => Promise<WelcomeAuthResult>>()
      .mockResolvedValue({ ok: false }),
    register: vi.fn<(username: string, email: string, password: string) => Promise<WelcomeAuthResult>>()
      .mockResolvedValue({ ok: false }),
  }
  const mounted = render(<Welcome api={api} />)
  const input = document.querySelector('input')!
  const button = (id: string) => document.querySelector<HTMLButtonElement>(id)!
  const enterKey = (value: string) => {
    fireEvent.change(input, { target: { value } })
  }
  const submit = () => fireEvent.submit(document.querySelector('form')!)
  const copy = () => {
    const heading = document.querySelector('main')!.getAttribute('aria-labelledby')!
    return [
      document.title, document.querySelector('img')!.alt, document.getElementById(heading)!.textContent,
      ...heading === 'welcome-heading' ? [document.querySelector('#welcome-description')!.textContent] : [],
      ...heading === 'key-title' ? [document.querySelector('#key-description')!.textContent, `${input.placeholder} [password]`] : [],
      ...[...document.querySelectorAll('button')].filter(item => item.closest('[hidden]') === null)
        .map(item => `${item.textContent || item.getAttribute('aria-label')}${item.disabled ? ' [disabled]' : ''}`),
      '',
    ].join('\n')
  }
  return { document, api, input, button, enterKey, submit, copy, unmount: mounted.unmount, stopAccount }
}

describe('desktop welcome presentation', () => {
  it.each(['zh-CN', 'en'])('renders the %s entry with the local sign-in action', async (language) => {
    const view = mount(language)
    expect(view.document.documentElement.lang).toBe(language)
    expect(view.document.querySelector('img')!.getAttribute('src')).toBe('assets/qilin-mark.svg')
    expect(view.button('#sign-in').textContent).not.toBe('')
    expect(view.document.querySelector('#api-key')).toBeNull()
    await expect(view.copy()).toMatchFileSnapshot(`./expected/welcome/${language}.expected.txt`)
  })

  it.each(['zh-CN', 'en'])('opens the local sign-in form from the entry: %s', async (language) => {
    const view = mount(language)
    fireEvent.click(view.button('#sign-in'))
    await vi.waitFor(() => { expect(view.document.querySelector<HTMLElement>('#login-form')!.hidden).toBe(false) })
    expect(view.document.querySelector<HTMLElement>('#login-name')).not.toBeNull()
    expect(view.document.querySelector<HTMLElement>('#login-password')!.getAttribute('type')).toBe('password')
    expect(view.button('#login-submit').disabled).toBe(true)
  })

  it('signs in with the typed account and enters the workspace', async () => {
    const view = mount('en')
    fireEvent.click(view.button('#sign-in'))
    fireEvent.change(view.document.querySelector('#login-name')!, { target: { value: ' ada ' } })
    fireEvent.change(view.document.querySelector('#login-password')!, { target: { value: 'secret-pass' } })
    view.api.logIn.mockResolvedValue({ ok: true })
    fireEvent.submit(view.document.querySelector('#login-form')!)
    await vi.waitFor(() => { expect(view.api.skip).toHaveBeenCalled() })
    expect(view.api.logIn).toHaveBeenCalledWith('ada', 'secret-pass')
  })

  it('reports a refused sign-in and keeps the form', async () => {
    const view = mount('en')
    fireEvent.click(view.button('#sign-in'))
    fireEvent.change(view.document.querySelector('#login-name')!, { target: { value: 'ada' } })
    fireEvent.change(view.document.querySelector('#login-password')!, { target: { value: 'wrong' } })
    view.api.logIn.mockResolvedValue({ ok: false, reason: 'invalid-credentials' })
    fireEvent.submit(view.document.querySelector('#login-form')!)
    await vi.waitFor(() => { expect(view.document.querySelector<HTMLElement>('#login-error')!.hidden).toBe(false) })
    expect(view.api.skip).not.toHaveBeenCalled()
  })

  it('registers from the sign-in form and enters the workspace', async () => {
    const view = mount('en')
    fireEvent.click(view.button('#sign-in'))
    fireEvent.click(view.button('#to-register'))
    expect(view.document.querySelector<HTMLElement>('#register-form')!.hidden).toBe(false)
    fireEvent.change(view.document.querySelector('#register-name')!, { target: { value: 'ada' } })
    fireEvent.change(view.document.querySelector('#register-email')!, { target: { value: 'ada@example.com' } })
    fireEvent.change(view.document.querySelector('#register-password')!, { target: { value: 'secret-pass' } })
    fireEvent.change(view.document.querySelector('#register-confirm')!, { target: { value: 'secret-pass' } })
    view.api.register.mockResolvedValue({ ok: true })
    fireEvent.submit(view.document.querySelector('#register-form')!)
    await vi.waitFor(() => { expect(view.api.skip).toHaveBeenCalled() })
    expect(view.api.register).toHaveBeenCalledWith('ada', 'ada@example.com', 'secret-pass')
  })

  it('reveals a password in plain text and hides it again', async () => {
    const view = mount('en')
    fireEvent.click(view.button('#sign-in'))
    fireEvent.click(view.button('#to-register'))
    const password = () => view.document.querySelector<HTMLInputElement>('#register-password')!
    const toggle = password().parentElement!.querySelector<HTMLButtonElement>('.password-toggle')!
    expect(password().getAttribute('type')).toBe('password')
    expect(toggle.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(toggle)
    expect(password().getAttribute('type')).toBe('text')
    expect(toggle.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(toggle)
    expect(password().getAttribute('type')).toBe('password')
  })

  it('refuses a mismatched confirmation without reaching the account store', async () => {
    const view = mount('en')
    fireEvent.click(view.button('#sign-in'))
    fireEvent.click(view.button('#to-register'))
    fireEvent.change(view.document.querySelector('#register-name')!, { target: { value: 'ada' } })
    fireEvent.change(view.document.querySelector('#register-password')!, { target: { value: 'secret-pass' } })
    fireEvent.change(view.document.querySelector('#register-confirm')!, { target: { value: 'secret-pass-typo' } })
    expect(view.button('#register-submit').disabled).toBe(false)
    fireEvent.submit(view.document.querySelector('#register-form')!)
    await vi.waitFor(() => { expect(view.document.querySelector<HTMLElement>('#register-error')!.hidden).toBe(false) })
    expect(view.document.querySelector('#register-error')!.textContent).toContain('do not match')
    expect(view.api.register).not.toHaveBeenCalled()
    expect(view.api.skip).not.toHaveBeenCalled()
  })

  it('keeps the register submit disabled until the confirmation is filled', () => {
    const view = mount('en')
    fireEvent.click(view.button('#sign-in'))
    fireEvent.click(view.button('#to-register'))
    fireEvent.change(view.document.querySelector('#register-name')!, { target: { value: 'ada' } })
    fireEvent.change(view.document.querySelector('#register-password')!, { target: { value: 'secret-pass' } })
    expect(view.button('#register-submit').disabled).toBe(true)
    fireEvent.change(view.document.querySelector('#register-confirm')!, { target: { value: 'secret-pass' } })
    expect(view.button('#register-submit').disabled).toBe(false)
    fireEvent.change(view.document.querySelector('#register-confirm')!, { target: { value: 'other' } })
    expect(view.button('#register-submit').disabled).toBe(false)
  })

  it('returns from registration to the sign-in form', () => {
    const view = mount('en')
    fireEvent.click(view.button('#sign-in'))
    fireEvent.click(view.button('#to-register'))
    fireEvent.click(view.button('#to-login'))
    expect(view.document.querySelector<HTMLElement>('#login-form')!.hidden).toBe(false)
  })

  // KSRW product branch: the welcome renderer is product-owned HTML (not the
  // engine React dictionary page), so the shell asserts the product surface and
  // the same offline/security posture instead of dictionary-only copy.
  it('ships the product-owned welcome shell with strict CSP', () => {
    expect(html).toContain('KSRW')
    expect(html).toContain('登录')
    expect(html).toContain('注册')
    expect(html).toContain('连接模型')
    expect(html).toContain('api-key')
    expect(html).toContain("default-src 'none'")
    expect(html).toContain("form-action 'none'")
    expect(html).not.toMatch(/https?:\/\//)
  })
})
