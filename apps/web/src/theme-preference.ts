/**
 * Shared theme-toggle behaviour for the two pre-session documents (landing and
 * auth): both default to the dark 玄金 VI, both flip through the same root
 * attribute, and both persist one choice under one storage key. Every visible
 * string (aria labels, glyphs) stays in each page's own html; this module owns
 * state and persistence only.
 */

/** Storage key shared by the pre-session pages: one choice across landing and auth. */
const THEME_STORAGE_KEY = 'ql-theme'

/** Root attribute value selecting the light palette; absence means dark. */
const LIGHT_THEME_DATA = 'light'

/** The theme toggle control both documents declare. */
const THEME_TOGGLE = '[data-theme-toggle]'

/**
 * Flip one theme on: 'light' sets the root attribute, 'dark' removes it, and
 * both keep the UA color-scheme in step so native chrome matches the palette.
 * @param theme - the newly active theme.
 */
function applyTheme(theme: 'light' | 'dark'): void {
  const root = document.documentElement
  if (theme === LIGHT_THEME_DATA) {
    root.dataset.qlTheme = LIGHT_THEME_DATA
    root.style.colorScheme = LIGHT_THEME_DATA
  } else {
    delete root.dataset.qlTheme
    root.style.colorScheme = 'dark'
  }
}

/**
 * Wire the page's toggle: click flips light/dark, persists the choice under
 * the shared storage key, and restates the accessible label to the action the
 * button now offers. The pre-paint script in each html document has already
 * applied the stored choice before this runs.
 * @param button - the toggle control from the page's html.
 */
function wireThemeToggle(button: HTMLButtonElement): void {
  const readActive = (): 'light' | 'dark' =>
    document.documentElement.dataset.qlTheme === LIGHT_THEME_DATA ? 'light' : 'dark'
  const syncLabel = (): void => {
    const label = readActive() === 'light' ? button.dataset.labelToDark : button.dataset.labelToLight
    if (label !== undefined) button.setAttribute('aria-label', label)
  }
  button.addEventListener('click', () => {
    const next = readActive() === 'light' ? 'dark' : 'light'
    applyTheme(next)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next)
    } catch { /* storage unavailable: the flip stays session-only */ }
    syncLabel()
  })
  syncLabel()
}

/**
 * Wire the theme toggle on a pre-session document; a document without the
 * toggle stays untouched.
 */
export function startPreSessionThemeToggle(): void {
  const button = document.querySelector<HTMLButtonElement>(THEME_TOGGLE)
  if (button === null) return
  wireThemeToggle(button)
}
