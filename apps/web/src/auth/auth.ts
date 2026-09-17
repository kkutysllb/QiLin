/**
 * Behaviour for the pre-session authentication document served at `/login` and
 * `/setup`. Every visible string is declared in auth.html; this module reads
 * them from that document and owns only the request and redirect flow. The
 * theme toggle's behaviour comes from the shared pre-session module.
 */

import { readAccountStatus } from '../account-status.ts'
import { nextDestination } from '../next-destination.ts'
import { startPreSessionThemeToggle } from '../theme-preference.ts'

/** Server path creating the first administrator account. */
const SETUP_ENDPOINT = '/api/auth/setup'
/** Server path creating an account while self-registration is open. */
const REGISTER_ENDPOINT = '/api/auth/register'
/** Server path starting a session for an existing account. */
const LOGIN_ENDPOINT = '/api/auth/login'
/** Path of the setup document. */
const SETUP_PATH = '/setup'
/** Path of the sign-in document; every other path renders it. */
const LOGIN_PATH = '/login'
/** Shortest accepted password, matching the server's account policy. */
const PASSWORD_MINIMUM = 8
/** Element id of the copy table declared in auth.html. */
const MARKUP_ROOT_ID = 'auth-copy'

/** The three credential forms this one document can render. */
type AuthMode = 'login' | 'register' | 'setup'

/**
 * Look up one element this page's own markup declares.
 * @param id - element id from auth.html.
 * @returns the element; a missing id means the document and module disagree.
 */
function requiredElement(id: string): HTMLElement {
  const found = document.getElementById(id)
  if (found === null) throw new Error(`auth page: missing #${id}`)
  return found
}

const titleNode = requiredElement('auth-title') as HTMLHeadingElement
const subtitleNode = requiredElement('auth-subtitle') as HTMLParagraphElement
const formNode = requiredElement('auth-form') as HTMLFormElement
const identifierNode = requiredElement('auth-identifier') as HTMLInputElement
const identifierLabelNode = requiredElement('auth-identifier-label') as HTMLLabelElement
const emailFieldNode = requiredElement('auth-email-field') as HTMLDivElement
const emailNode = requiredElement('auth-email') as HTMLInputElement
const passwordNode = requiredElement('auth-password') as HTMLInputElement
const confirmFieldNode = requiredElement('auth-confirm-field') as HTMLDivElement
const confirmNode = requiredElement('auth-confirm') as HTMLInputElement
const errorNode = requiredElement('auth-error') as HTMLParagraphElement
const submitNode = requiredElement('auth-submit') as HTMLButtonElement
const toggleRowNode = requiredElement('auth-toggle-row') as HTMLParagraphElement
const toggleNode = requiredElement('auth-toggle') as HTMLButtonElement

/**
 * Read the copy table declared in auth.html.
 * @returns every `data-copy` entry keyed by its attribute value.
 */
function readCopyTable(): Map<string, string> {
  const markup = document.getElementById(MARKUP_ROOT_ID)
  const entries = new Map<string, string>()
  if (!(markup instanceof HTMLTemplateElement)) return entries
  for (const node of markup.content.querySelectorAll<HTMLElement>('[data-copy]')) {
    const key = node.dataset['copy']
    if (key === undefined) continue
    entries.set(key, node.textContent.trim())
  }
  return entries
}

const catalog = readCopyTable()

/**
 * Resolve one string declared in the page's copy table.
 * @param key - `data-copy` key declared in auth.html.
 * @returns the declared text; a missing entry means the document and module disagree.
 */
function copyText(key: string): string {
  const declared = catalog.get(key)
  if (declared === undefined || declared === '') throw new Error(`auth page: copy key ${key} is missing`)
  return declared
}

/** Mode this document currently renders. */
let mode: AuthMode = initialMode()
/** Whether the server offers self-registration; false keeps the toggle hidden. */
let registrationOffered = false

/**
 * Resolve the initial mode from the served path.
 * @returns `setup` for the setup document, `login` for every other path.
 */
function initialMode(): AuthMode {
  return location.pathname.replace(/\/+$/u, '') === SETUP_PATH ? 'setup' : 'login'
}

/**
 * Read one rejected response's failure line. The page's own copy wins for every
 * code it declares, so this Chinese surface never shows the server's English
 * diagnostic; an undeclared code falls back to the server's message.
 * @param response - response carrying `{ error: { code, message } }`.
 * @returns the failure line, or undefined when the body carries none.
 */
async function failureText(response: Response): Promise<string | undefined> {
  let payload: unknown
  try {
    payload = await response.json()
  } catch {
    // A body that is not JSON (proxy page, truncated response) carries no server
    // text; the caller substitutes the generic failure line.
    return undefined
  }
  if (typeof payload !== 'object' || payload === null) return undefined
  const failure = (payload as Record<string, unknown>)['error']
  if (typeof failure !== 'object' || failure === null) return undefined
  const code = (failure as Record<string, unknown>)['code']
  const declared = typeof code === 'string' ? catalog.get(`error.${code}`) : undefined
  if (declared !== undefined && declared !== '') return declared
  const detail = (failure as Record<string, unknown>)['message']
  return typeof detail === 'string' && detail !== '' ? detail : undefined
}

/**
 * Apply one mode's copy and field set to the document.
 * @param next - mode to render.
 */
function applyMode(next: AuthMode): void {
  mode = next
  document.documentElement.dataset['mode'] = next
  titleNode.textContent = copyText(`title.${next}`)
  subtitleNode.textContent = copyText(`subtitle.${next}`)
  submitNode.textContent = copyText(`submit.${next}`)
  toggleNode.textContent = copyText(next === 'login' ? 'toggle.toRegister' : 'toggle.toLogin')
  const creating = next !== 'login'
  // One identity field: the login name on the credential form, the account name
  // on the two creation forms.
  identifierLabelNode.textContent = copyText(creating ? 'label.username' : 'label.identifier')
  identifierNode.placeholder = copyText(creating ? 'placeholder.username' : 'placeholder.identifier')
  // The address belongs to the creation forms and is optional there. A disabled
  // control is exempt from constraint validation, so a hidden field never
  // blocks the form that does not use it.
  emailFieldNode.hidden = !creating
  emailNode.disabled = !creating
  emailNode.placeholder = copyText('placeholder.email')
  confirmFieldNode.hidden = !creating
  confirmNode.disabled = !creating
  passwordNode.autocomplete = creating ? 'new-password' : 'current-password'
  if (!creating) {
    emailNode.value = ''
    confirmNode.value = ''
  }
}

/** Show the registration toggle only where the server offers it. */
function applyToggle(): void {
  toggleRowNode.hidden = mode === 'setup' || !registrationOffered
}

/**
 * Toggle the in-flight state of the form.
 * @param busy - true while a request is in flight.
 */
function setBusy(busy: boolean): void {
  submitNode.disabled = busy
  submitNode.textContent = copyText(busy ? `busy.${mode}` : `submit.${mode}`)
}

/**
 * Show one failure line above the submit button.
 * @param text - copy-table text or a message the server answered with.
 */
function showError(text: string): void {
  errorNode.textContent = text
  errorNode.hidden = false
}

/** Drop the failure line and let the form look untouched again. */
function clearError(): void {
  errorNode.textContent = ''
  errorNode.hidden = true
}

/**
 * Resolve the POST endpoint for one mode.
 * @param current - mode whose form is being submitted.
 * @returns the API path accepting this mode's credentials.
 */
function endpointFor(current: AuthMode): string {
  if (current === 'setup') return SETUP_ENDPOINT
  return current === 'register' ? REGISTER_ENDPOINT : LOGIN_ENDPOINT
}

/**
 * Submit the rendered credential form.
 * @param event - the form's submit event.
 */
async function requestSession(event: SubmitEvent): Promise<void> {
  event.preventDefault()
  clearError()
  const identifier = identifierNode.value.trim()
  const password = passwordNode.value
  if (mode !== 'login') {
    if (password !== confirmNode.value) {
      showError(copyText('error.mismatch'))
      return
    }
    if (password.length < PASSWORD_MINIMUM) {
      showError(copyText('error.passwordLength'))
      return
    }
  }
  setBusy(true)
  try {
    const response = await fetch(endpointFor(mode), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(mode === 'login'
        ? { identifier, password }
        : { username: identifier, email: emailNode.value.trim(), password }),
    })
    if (!response.ok) {
      showError((await failureText(response)) ?? copyText('error.network'))
      return
    }
    // A successful answer already carried the session cookie.
    location.assign(nextDestination())
  } catch {
    // The request never reached the server (offline, DNS, aborted).
    showError(copyText('error.network'))
  } finally {
    setBusy(false)
  }
}

/** Switch between the login and register forms of the login document. */
function switchMode(): void {
  clearError()
  applyMode(mode === 'login' ? 'register' : 'login')
  applyToggle()
}

/**
 * Render the document, honour an authenticated visitor, then reveal the
 * registration toggle when the server offers it.
 */
async function start(): Promise<void> {
  applyMode(mode)
  applyToggle()
  formNode.addEventListener('submit', (event) => {
    void requestSession(event)
  })
  toggleNode.addEventListener('click', switchMode)
  const status = await readAccountStatus()
  if (status?.authenticated === true) {
    location.replace(nextDestination())
    return
  }
  // Both documents are public files, so the entry gate never sees them: this
  // page is where a first-run deployment and a set-up one are told apart, and a
  // visitor holding the wrong document is sent to the one that can serve them.
  if (status !== undefined && status.needsSetup !== (mode === 'setup')) {
    location.replace(status.needsSetup ? `${SETUP_PATH}${location.search}` : `${LOGIN_PATH}${location.search}`)
    return
  }
  registrationOffered = status?.registrationOpen === true
  applyToggle()
}

void start()
startPreSessionThemeToggle()

export {}
