/** Desktop welcome presentation; account and credential operations stay in the preload. */
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Toast } from '@qilin-agent/client-ui-primitives/src/Toast.tsx'
import { StateDot } from '@qilin-agent/client-ui-primitives/src/StateDot.tsx'
import type { AccountView } from '../account-types.ts'
import type { WelcomeApi } from '../welcome-api.ts'

type Page = 'entry' | 'login' | 'register' | 'key' | 'account'

/**
 * Render the standalone welcome flow using shell-owned operations and localized copy.
 * Clearing the account attempt returns the sign-in status page to the initial choices.
 * @param props.api - isolated preload API; no account credentials reach the renderer.
 * @returns welcome pages with fixed bottom actions.
 */
export function Welcome({ api }: { api: WelcomeApi }) {
  const { messages: m } = api
  const [expiryNotice, setExpiryNotice] = useState(false)
  const [page, setPage] = useState<Page>('entry')
  const pageRef = useRef<Page>('entry')
  const visiblePage = useRef<Page>('entry')
  const [attempt, setAttempt] = useState<AccountView['attempt']>(null)
  const attemptRef = useRef<AccountView['attempt']>(null)
  const [starting, setStarting] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<{ status: 'idle' | 'busy' | 'copied' | 'failed' }>({ status: 'idle' })
  const copyState = copyFeedback.status
  const [draft, setDraft] = useState('')
  const [loginName, setLoginName] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [registerName, setRegisterName] = useState('')
  const [registerEmail, setRegisterEmail] = useState('')
  const [registerPassword, setRegisterPassword] = useState('')
  const [registerConfirm, setRegisterConfirm] = useState('')
  const [loginPasswordVisible, setLoginPasswordVisible] = useState(false)
  const [registerPasswordVisible, setRegisterPasswordVisible] = useState(false)
  const [registerConfirmVisible, setRegisterConfirmVisible] = useState(false)
  const [authError, setAuthError] = useState('')
  const [authBusy, setAuthBusy] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const mounted = useRef(true)
  const revision = useRef(0)
  const input = useRef<HTMLInputElement>(null)
  const keyButton = useRef<HTMLButtonElement>(null)
  const focusEntry = useRef(false)

  function navigate(next: Page) {
    pageRef.current = next
    setPage(next)
  }
  function showAccount(state: AccountView) {
    if (pageRef.current === 'key' || (state.attempt === null && pageRef.current === 'entry')) return
    attemptRef.current = state.attempt
    setAttempt(state.attempt)
    setStarting(false)
    setCopyFeedback({ status: 'idle' })
    navigate(state.attempt === null || state.attempt.phase === 'cancelled' ? 'entry' : 'account')
  }

  useEffect(() => {
    mounted.current = true
    document.documentElement.lang = api.id
    document.title = m.welcomeTitle
    const takeNotice = (): void => {
      void api.takeNotice().then((notice) => {
        if (mounted.current && notice === 'session-expired') setExpiryNotice(true)
      }).catch((_closedChannel: unknown) => {
        // A closed Welcome IPC channel must not interrupt the sign-in page.
      })
    }
    takeNotice()
    const stop = api.onAccountState((state) => {
      revision.current++
      takeNotice()
      showAccount(state)
    })
    return () => { mounted.current = false; stop() }
  }, [api, m.welcomeTitle])

  useEffect(() => {
    if (page === 'entry' && visiblePage.current !== 'entry') void api.analytics?.('auth_page_view', {})
    visiblePage.current = page
    if (page === 'key') input.current?.focus()
    else if (page === 'entry' && focusEntry.current) {
      focusEntry.current = false
      keyButton.current?.focus()
    }
  }, [page, api])

  useEffect(() => {
    if (copyState !== 'copied' && copyState !== 'failed') return
    const timer = setTimeout(() => { setCopyFeedback({ status: 'idle' }) }, 2000)
    return () => { clearTimeout(timer) }
  }, [copyFeedback])

  async function saveKey(event: FormEvent) {
    event.preventDefault()
    if (busyRef.current) return
    void api.analytics?.('api_key_save_click', {})
    const value = draft.trim()
    if (!/^[\x21-\x7e]+$/.test(value) || /^[A-Z][A-Z0-9_]*=[^=]/.test(value)
      || ((value.startsWith('"') || value.startsWith("'") || value.charCodeAt(0) === 96) && value.at(-1) === value[0])) {
      setError(value === '' ? m.welcomeKeyBlank : m.welcomeKeyInvalid)
      input.current?.focus()
      return
    }
    busyRef.current = true
    setBusy(true)
    setError('')
    try {
      const result = await api.saveApiKey(value)
      if (!mounted.current) return
      if (result.ok) setDraft('')
      else setError(m.welcomeKeyFailed)
    } catch {
      if (mounted.current) setError(m.welcomeKeyFailed)
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }
  async function skip() {
    if (busyRef.current) return
    busyRef.current = true
    setBusy(true)
    try {
      await api.skip()
      if (mounted.current) setDraft('')
    } catch {
      if (mounted.current) setError(m.welcomeContinueFailed)
    } finally {
      busyRef.current = false
      if (mounted.current) setBusy(false)
    }
  }
  async function cancel() {
    if (cancelling || attemptRef.current === null) return
    setCancelling(true)
    const current = ++revision.current
    try {
      const state = await api.cancelSignIn(attemptRef.current.id)
      if (mounted.current && revision.current === current) showAccount(state)
    } catch {
      // The current attempt remains visible so cancellation can be retried.
    } finally {
      if (mounted.current) setCancelling(false)
    }
  }
  async function copyLink() {
    const current = attemptRef.current
    if (current?.phase !== 'waiting-browser' || (copyState === 'busy' || copyState === 'copied')) return
    setCopyFeedback({ status: 'busy' })
    try {
      await api.copySignInLink(current.id)
      if (mounted.current && attemptRef.current === current) setCopyFeedback({ status: 'copied' })
    } catch {
      if (mounted.current && attemptRef.current === current) setCopyFeedback({ status: 'failed' })
    }
  }

  const phase = starting ? 'initializing' : attempt?.phase ?? 'failed'
  const waiting = phase === 'waiting-browser'
  const failed = phase === 'expired' || phase === 'failed'
  /** Submit the local account form, then enter the workspace on acceptance. */
  async function submitLocal(kind: 'login' | 'register'): Promise<void> {
    if (authBusy) return
    if (kind === 'register' && registerPassword !== registerConfirm) {
      setAuthError(m.welcomeRegisterPasswordMismatch)
      return
    }
    setAuthError('')
    setAuthBusy(true)
    try {
      const result = kind === 'login'
        ? await api.logIn(loginName.trim(), loginPassword)
        : await api.register(registerName.trim(), registerEmail.trim(), registerPassword)
      if (!result.ok) {
        // The Host names the refusal; a taken device account is the one a visitor can act on.
        if (mounted.current) setAuthError(result.reason === 'already-initialized' || result.reason === 'account-conflict'
          || result.reason === 'username-taken'
          ? m.welcomeAccountExists
          : kind === 'login' ? m.welcomeLoginFailed : m.welcomeRegisterFailed)
        return
      }
      await api.skip()
    } catch {
      // A closed Welcome channel must not leave the form spinning.
      if (mounted.current) setAuthError(m.welcomeLoginFailed)
    } finally {
      if (mounted.current) setAuthBusy(false)
    }
  }

  /**
   * Render one password input beside its plain-text toggle.
   * @param id - input id the submit button and tests address.
   * @param value - current field value.
   * @param visible - whether the value renders as plain text.
   * @param placeholder - localized field label.
   * @param autoComplete - credential-manager hint for this input.
   * @param onValue - receives each keystroke.
   * @param onToggle - flips the plain-text state.
   * @returns the input and its toggle button.
   */
  function passwordField(
    id: string, value: string, visible: boolean, placeholder: string, autoComplete: string,
    onValue: (next: string) => void, onToggle: () => void,
  ) {
    return (
      <div className="password-field">
        <input id={id} type={visible ? 'text' : 'password'} autoComplete={autoComplete} required placeholder={placeholder}
          value={value} disabled={authBusy} onChange={(event) => { onValue(event.target.value); setAuthError('') }} />
        <button type="button" className="password-toggle" aria-pressed={visible} aria-controls={id}
          aria-label={visible ? m.welcomePasswordHide : m.welcomePasswordShow} onClick={onToggle}>
          <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M8 3C4.5 3 1.7 5.4 1 8c.7 2.6 3.5 5 7 5s6.3-2.4 7-5c-.7-2.6-3.5-5-7-5Zm0 8.2A3.2 3.2 0 1 1 8 4.8a3.2 3.2 0 0 1 0 6.4Zm0-1.6a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z" fill="currentColor" />
            {!visible && <path d="m2.6 1.5-1.1 1.1 12 12 1.1-1.1-12-12Z" fill="currentColor" />}
          </svg>
        </button>
      </div>
    )
  }

  const title = phase === 'initializing' ? m.welcomeAuthStarting
    : waiting ? m.welcomeAuthWaiting : phase === 'expired' ? m.welcomeAuthExpired
      : phase === 'failed' ? m.welcomeAuthFailed : m.welcomeAuthExchanging
  const heading = page === 'entry' ? 'welcome-heading' : page === 'key' ? 'key-title' : 'auth-status'

  return <>
    {expiryNotice && <Toast text={m.welcomeSessionExpired} onDone={() => { setExpiryNotice(false) }} />}
    <div className="titlebar" aria-hidden="true" />
    <main className="welcome" aria-labelledby={heading}>
      <div className="brand">
        <img src="assets/ktoon-mark.svg" alt="" width="40" height="40" />
        <span className="brand-name">{m.welcomeBrand}</span>
      </div>
      <div id="tagline" className="tagline" hidden={page !== 'entry'}>
        <p className="welcome-kicker">{m.welcomeKicker}</p>
        <h1 id="welcome-heading"><span>{m.welcomeTaglineBefore}</span><em>{m.welcomeTaglineBrand}</em><span>{m.welcomeTaglineAfter}</span></h1>
        <p id="welcome-description">{m.welcomeDescription}</p>
        <p className="welcome-local">{m.welcomeLocalNote}</p>
      </div>
      <div className="auth-stack">
        <div className="auth-stack-kicker">{m.welcomeAccountKicker}</div>
        <form id="key-form" className="key-form" hidden={page !== 'key'} noValidate onSubmit={(event) => { void saveKey(event) }} aria-busy={busy}>
          <header className="key-heading"><h1 id="key-title">{m.welcomeKeyTitle}</h1><p id="key-description">{m.welcomeKeyDescription}</p></header>
          <div className="key-field">
            <label className="visually-hidden" htmlFor="key-input">{m.welcomeKeyPlaceholder}</label>
            <input ref={input} id="key-input" type="password" autoComplete="new-password" autoCapitalize="off" spellCheck={false} required
              aria-describedby="key-description key-error" aria-invalid={error !== ''} placeholder={m.welcomeKeyPlaceholder}
              value={draft} disabled={busy} onChange={(event) => { setDraft(event.target.value); setError('') }} />
            <p id="key-error" className="key-error" role="alert" hidden={error === ''}>{error}</p>
          </div>
        </form>
        <section id="auth-page" className={`key-heading ${waiting ? 'auth-waiting' : phase === 'expired' ? 'auth-expired' : ''}`}
          hidden={page !== 'account'} aria-live="polite">
          <h1 id="auth-status">{title}</h1>
          <p id="auth-description" hidden={!waiting && phase !== 'expired'}>{waiting ? m.welcomeAuthWaitingDescription : m.welcomeAuthExpiredDescription}</p>
          <button id="auth-copy" className="copy-link" type="button" hidden={!waiting} disabled={!waiting || (copyState === 'busy' || copyState === 'copied')} onClick={() => { void copyLink() }}>
            {copyState === 'copied' ? m.welcomeAuthCopied : copyState === 'failed' ? m.welcomeAuthCopyFailed : m.welcomeAuthCopyLink}
          </button>
        </section>
        <div id="auth-actions" className="actions" hidden={page !== 'account'}>
          <button id="auth-loading" className="primary" type="button" hidden={failed} disabled aria-label={m.welcomeAuthExchanging}>
            <StateDot state="ongoing" size={16} className="welcome-loading" />
          </button>
          <button id="auth-retry" className="primary" type="button" hidden={!failed} onClick={() => { void api.analytics?.('auth_page_click', { button_name: 'sign_in' }); setAuthError(''); navigate('login') }}>{m.welcomeAuthRetry}</button>
          <button id="auth-api-key" className="secondary" type="button" hidden={!failed} onClick={() => { void api.analytics?.('auth_page_click', { button_name: 'api-key' }); navigate('key') }}>{m.welcomeApiKey}</button>
          <button id="auth-cancel" className="secondary" type="button" hidden={failed}
            disabled={cancelling || phase === 'committing' || phase === 'succeeded' || (phase === 'initializing' && !attempt?.id)}
            onClick={() => { void cancel() }}>{m.welcomeAuthCancel}</button>
        </div>
        <div id="entry-actions" className="actions" hidden={page !== 'entry'}>
          <button id="sign-in" className="primary" type="button" onClick={() => { void api.analytics?.('auth_page_click', { button_name: 'sign_in' }); setAuthError(''); navigate('login') }}>{m.welcomeSignIn}</button>
          <button id="entry-register" className="secondary" type="button" onClick={() => { setAuthError(''); navigate('register') }}>{m.welcomeEntryRegister}</button>
        </div>
        <form id="login-form" className="key-form" hidden={page !== 'login'} noValidate onSubmit={(event) => { event.preventDefault(); void submitLocal('login') }} aria-busy={authBusy}>
          <header className="key-heading"><h1 id="login-title">{m.welcomeLoginTitle}</h1><p id="login-description">{m.welcomeLoginDescription}</p></header>
          <div className="key-field">
            <label className="visually-hidden" htmlFor="login-name">{m.welcomeLoginName}</label>
            <input id="login-name" type="text" autoComplete="username" autoCapitalize="off" spellCheck={false} required placeholder={m.welcomeLoginName}
              value={loginName} disabled={authBusy} onChange={(event) => { setLoginName(event.target.value); setAuthError('') }} />
            <label className="visually-hidden" htmlFor="login-password">{m.welcomeLoginPassword}</label>
            {passwordField('login-password', loginPassword, loginPasswordVisible, m.welcomeLoginPassword, 'current-password',
              setLoginPassword, () => { setLoginPasswordVisible(!loginPasswordVisible) })}
            <p id="login-error" className="key-error" role="alert" hidden={authError === ''}>{authError}</p>
          </div>
        </form>
        <form id="register-form" className="key-form" hidden={page !== 'register'} noValidate onSubmit={(event) => { event.preventDefault(); void submitLocal('register') }} aria-busy={authBusy}>
          <header className="key-heading"><h1 id="register-title">{m.welcomeRegisterTitle}</h1><p id="register-description">{m.welcomeRegisterDescription}</p></header>
          <div className="key-field">
            <label className="visually-hidden" htmlFor="register-name">{m.welcomeRegisterName}</label>
            <input id="register-name" type="text" autoComplete="username" autoCapitalize="off" spellCheck={false} required placeholder={m.welcomeRegisterName}
              value={registerName} disabled={authBusy} onChange={(event) => { setRegisterName(event.target.value); setAuthError('') }} />
            <label className="visually-hidden" htmlFor="register-email">{m.welcomeRegisterEmail}</label>
            <input id="register-email" type="email" autoComplete="email" autoCapitalize="off" spellCheck={false} placeholder={m.welcomeRegisterEmail}
              value={registerEmail} disabled={authBusy} onChange={(event) => { setRegisterEmail(event.target.value); setAuthError('') }} />
            <label className="visually-hidden" htmlFor="register-password">{m.welcomeRegisterPassword}</label>
            {passwordField('register-password', registerPassword, registerPasswordVisible, m.welcomeRegisterPassword, 'new-password',
              setRegisterPassword, () => { setRegisterPasswordVisible(!registerPasswordVisible) })}
            <label className="visually-hidden" htmlFor="register-confirm">{m.welcomeRegisterPasswordConfirm}</label>
            {passwordField('register-confirm', registerConfirm, registerConfirmVisible, m.welcomeRegisterPasswordConfirm, 'new-password',
              setRegisterConfirm, () => { setRegisterConfirmVisible(!registerConfirmVisible) })}
            <p id="register-error" className="key-error" role="alert" hidden={authError === ''}>{authError}</p>
          </div>
        </form>
        <div id="login-actions" className="actions" hidden={page !== 'login'}>
          <button id="login-submit" className="primary" type="submit" form="login-form" disabled={authBusy || loginName.trim() === '' || loginPassword === ''}>{m.welcomeLoginSubmit}</button>
          <button id="to-register" className="secondary" type="button" disabled={authBusy} onClick={() => { setAuthError(''); navigate('register') }}>{m.welcomeLoginToRegister}</button>
        </div>
        <div id="register-actions" className="actions" hidden={page !== 'register'}>
          <button id="register-submit" className="primary" type="submit" form="register-form" disabled={authBusy || registerName.trim() === '' || registerPassword === '' || registerConfirm === ''}>{m.welcomeRegisterSubmit}</button>
          <button id="to-login" className="secondary" type="button" disabled={authBusy} onClick={() => { setAuthError(''); navigate('login') }}>{m.welcomeRegisterToLogin}</button>
        </div>
        <div id="key-actions" className="actions" hidden={page !== 'key'}>
          <button id="save-key" className="primary" type="submit" form="key-form" disabled={busy || draft.trim() === ''}>{m.welcomeKeySave}</button>
          <button id="skip-key" className="secondary" type="button" disabled={busy} onClick={() => { void skip() }}>{m.welcomeKeyLater}</button>
          <button id="back-to-login" className="back" type="button" disabled={busy} onClick={() => {
            if (busyRef.current) return
            setDraft(''); setError(''); focusEntry.current = true; navigate('entry')
          }}>{m.welcomeKeyBack}</button>
        </div>
      </div>
    </main>
  </>
}
