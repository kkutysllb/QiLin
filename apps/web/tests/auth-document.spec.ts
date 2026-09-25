// @vitest-environment jsdom
/**
 * The pre-session credential document: one served file renders the login,
 * register, and setup forms, and posts each to the credential route the
 * document resolves against its own mount.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextDestination } from '../src/next-destination.ts'

/** Every copy key `auth.ts` reads while rendering the login and register modes. */
const COPY: Readonly<Record<string, string>> = {
  'title.login': '登录控制台',
  'title.register': '注册账户',
  'subtitle.login': '登录副标题',
  'subtitle.register': '注册副标题',
  'submit.login': '登录',
  'submit.register': '注册',
  'busy.login': '登录中',
  'busy.register': '注册中',
  'toggle.toRegister': '注册新账户',
  'toggle.toLogin': '返回登录',
  'label.username': '用户名',
  'label.identifier': '用户名或邮箱',
  'placeholder.username': '用户名',
  'placeholder.identifier': '用户名或邮箱',
  'placeholder.email': '邮箱（可选）',
  'error.mismatch': '两次密码不一致',
  'error.passwordLength': '密码太短',
  'error.network': '无法连接服务器',
}

/** Field ids `auth.ts` requires before it renders a mode. */
const FIELDS = [
  'auth-title', 'auth-subtitle', 'auth-identifier', 'auth-identifier-label', 'auth-email-field',
  'auth-email', 'auth-password', 'auth-confirm-field', 'auth-confirm', 'auth-error',
  'auth-submit', 'auth-toggle-row', 'auth-toggle',
]

/** Build the document one served auth page declares. */
function servedDocument(): void {
  const copy = Object.entries(COPY).map(([key, text]) => `<span data-copy="${key}">${text}</span>`).join('')
  document.body.innerHTML = `
    <template id="auth-copy">${copy}</template>
    ${FIELDS.map(id => `<div id="${id}"></div>`).join('')}
    <form id="auth-form"></form>
  `
}

/** One recorded request the page made. */
interface Call { readonly url: unknown; readonly init: RequestInit | undefined }

/**
 * Load the document module over one stubbed credential surface.
 * @returns the recorded requests, newest last.
 */
async function loadDocument(): Promise<Call[]> {
  const calls: Call[] = []
  vi.stubGlobal('fetch', vi.fn((url: unknown, init?: RequestInit) => {
    calls.push({ url, init })
    if (String(url) === 'api/auth/status') {
      return Promise.resolve(new Response(JSON.stringify({
        authenticated: false, needsSetup: false, registrationOpen: true,
      }), { status: 200 }))
    }
    return Promise.resolve(new Response(JSON.stringify({ error: { code: 'auth/invalid', message: 'nope' } }), { status: 401 }))
  }))
  servedDocument()
  await import('../src/auth/auth.ts')
  await settle()
  return calls
}

/** Let the document module finish the promises it started. */
async function settle(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await new Promise((resolve) => { setTimeout(resolve, 0) })
}

/**
 * Fill the rendered form and submit it.
 * @param password - password field value.
 */
async function submit(password = 'secret-password'): Promise<void> {
  ;(document.getElementById('auth-identifier') as HTMLInputElement).value = 'someone'
  ;(document.getElementById('auth-password') as HTMLInputElement).value = password
  ;(document.getElementById('auth-confirm') as HTMLInputElement).value = password
  document.getElementById('auth-form')?.dispatchEvent(new SubmitEvent('submit', { cancelable: true }))
  await settle()
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
  document.body.innerHTML = ''
})

describe('the credential document', () => {
  it('posts the login form to the document-relative login route', async () => {
    const calls = await loadDocument()
    expect(String(calls[0]?.url)).toBe('api/auth/status')
    await submit()
    expect(String(calls[1]?.url)).toBe('api/auth/login')
    expect(calls[1]?.init).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ identifier: 'someone', password: 'secret-password' }),
    })
  })

  it('switches to the register form and posts to the register route', async () => {
    const calls = await loadDocument()
    document.getElementById('auth-toggle')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(document.getElementById('auth-title')?.textContent).toBe(COPY['title.register'])
    await submit()
    expect(String(calls[1]?.url)).toBe('api/auth/register')
    expect(calls[1]?.init).toMatchObject({
      body: JSON.stringify({ username: 'someone', email: '', password: 'secret-password' }),
    })
  })

  it('keeps the refused credential answer in the page and never navigates', async () => {
    await loadDocument()
    await submit()
    expect(document.getElementById('auth-error')?.textContent).toBe('nope')
    expect(document.getElementById('auth-submit')?.textContent).toBe(COPY['submit.login'])
  })
})

describe('nextDestination', () => {
  it('falls back to the application entry for an unqualified visit', () => {
    expect(nextDestination()).toBe('/workspace')
  })
})
