/**
 * Landing page behaviour: the hero headline cycles through the platform's
 * capability words, one word at a time, the header toggle flips the page
 * between the dark 玄金 default and its light-paper variant, and the entry
 * calls to action open the document this visitor can actually pass — the
 * application for a signed-in browser, otherwise the sign-in or first-run page.
 *
 * Every visible string stays in landing.html. The word list arrives through the
 * host element's data-words attribute, so this module owns timing and motion
 * only; the theme toggle's behaviour comes from the shared pre-session module.
 */

import { readAccountStatus } from '../account-status.ts'
import { nextDestination } from '../next-destination.ts'
import { startPreSessionThemeToggle } from '../theme-preference.ts'

/** Host element carrying the separated word list. */
const WORDS_HOST = '[data-words]'

/** Rendered word inside the host. */
const WORD_TARGET = '.word-rotate__word'

/** Entry animation re-applied on every word change. */
const WORD_ENTER_CLASS = 'word-rotate__word--enter'

/** Cadence of the rotation, matching the 2.0.x landing headline. */
const ROTATION_INTERVAL_MS = 2200

/** Preference that pins the headline to its first word instead of rotating. */
const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

/** Every link that leads into the application. */
const ENTRY_CTA = '[data-entry-cta]'

/** Document that establishes a session for an existing account. */
const LOGIN_PATH = '/login'

/** Document that creates the deployment's first account. */
const SETUP_PATH = '/setup'

/**
 * Read the pipe-separated word list; blank entries are dropped.
 * @param host - element holding the list in its data-words attribute.
 * @returns the words in document order.
 */
function readWords(host: HTMLElement): string[] {
  const list = host.dataset.words ?? ''
  return list.split('|').map(word => word.trim()).filter(word => word !== '')
}

/**
 * Rotate one word element through the list until the page unloads.
 * @param host - element holding the word list.
 * @param target - element whose text is replaced on every step.
 * @returns nothing; the rotation stops only when reduced motion starts.
 */
function rotateWords(host: HTMLElement, target: HTMLElement): void {
  const words = readWords(host)
  if (words.length < 2) return

  let cursor = 0
  let timer: number | undefined

  const show = (index: number, animate: boolean): void => {
    target.textContent = words[index] ?? ''
    if (!animate) return
    // Re-adding the class does not restart a finished CSS animation on its own;
    // reading offsetWidth between the writes forces the style flush that does.
    target.classList.remove(WORD_ENTER_CLASS)
    void target.offsetWidth
    target.classList.add(WORD_ENTER_CLASS)
  }

  const stop = (): void => {
    if (timer === undefined) return
    window.clearInterval(timer)
    timer = undefined
  }

  const start = (): void => {
    if (timer !== undefined) return
    timer = window.setInterval(() => {
      cursor = (cursor + 1) % words.length
      show(cursor, true)
    }, ROTATION_INTERVAL_MS)
  }

  const reducedMotion = window.matchMedia(REDUCED_MOTION_QUERY)
  const apply = (): void => {
    if (reducedMotion.matches) {
      stop()
      cursor = 0
      show(0, false)
      return
    }
    start()
  }

  reducedMotion.addEventListener('change', apply)
  apply()
}

/** Start the headline rotation; a page without the headline stays untouched. */
export function startLandingHeadline(): void {
  const host = document.querySelector<HTMLElement>(WORDS_HOST)
  const target = host?.querySelector<HTMLElement>(WORD_TARGET)
  if (host === null || target === null || target === undefined) return
  rotateWords(host, target)
}

/**
 * Point the entry calls to action at the document that can admit this visitor.
 * A signed-in browser goes straight to the destination it asked for; everyone
 * else reaches the sign-in document, or the first-run document when the
 * deployment still has no account, and returns here afterwards.
 */
export async function startEntryCta(): Promise<void> {
  const status = await readAccountStatus()
  const destination = nextDestination()
  const target = status?.authenticated === true
    ? destination
    : `${status?.needsSetup === true ? SETUP_PATH : LOGIN_PATH}?next=${encodeURIComponent(destination)}`
  for (const node of document.querySelectorAll<HTMLAnchorElement>(ENTRY_CTA)) {
    node.href = target
  }
}

startLandingHeadline()
void startEntryCta()
startPreSessionThemeToggle()
