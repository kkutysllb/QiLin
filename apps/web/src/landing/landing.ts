/**
 * Landing page behaviour: the hero headline cycles through the platform's
 * capability words, sections fade in as they enter the viewport, the header
 * picks up a surface once the page scrolls, command cards copy their code to
 * the clipboard, the header toggle flips the page between the dark 玄金
 * default and its light-paper variant, and the entry calls to action open the
 * document this visitor can actually pass — the application for a signed-in
 * browser, otherwise the sign-in or first-run page.
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

/** Sections faded in on scroll, one reveal state each. */
const REVEAL_TARGET = '[data-reveal]'

/** Attribute naming a section as visible, so the transition runs once. */
const REVEAL_VISIBLE = 'data-reveal-visible'

/** Header element that gains a surface after the page leaves the top. */
const HEADER_TARGET = '[data-header]'

/** Buttons that copy a command card's code to the clipboard. */
const CLIPBOARD_BUTTON = '[data-copy]'

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
 * Fade sections in the first time each enters the viewport. Reduced motion
 * keeps every section at rest, and an observer-less browser shows everything.
 */
export function startRevealOnScroll(): void {
  const sections = document.querySelectorAll<HTMLElement>(REVEAL_TARGET)
  if (sections.length === 0) return
  if (window.matchMedia(REDUCED_MOTION_QUERY).matches || typeof IntersectionObserver !== 'function') {
    for (const section of sections) section.setAttribute(REVEAL_VISIBLE, '')
    return
  }
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      entry.target.setAttribute(REVEAL_VISIBLE, '')
      observer.unobserve(entry.target)
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
  for (const section of sections) observer.observe(section)
}

/**
 * Give the fixed header a surface once the page scrolls below the top, so the
 * hero screenshot and titles pass under a legible bar.
 */
export function startHeaderSurface(): void {
  const header = document.querySelector<HTMLElement>(HEADER_TARGET)
  if (header === null) return
  const apply = (): void => {
    if (window.scrollY > 8) header.setAttribute('data-header-scrolled', '')
    else header.removeAttribute('data-header-scrolled')
  }
  window.addEventListener('scroll', apply, { passive: true })
  apply()
}

/** Flash state a copy button carries until the clipboard write settles back. */
const COPIED_FLASH_MS = 1600

/**
 * Copy each command card's code on click and confirm with a temporary 已复制
 * label. A clipboard rejection leaves the button unchanged; the code stays
 * selectable either way.
 */
export function startCopyButtons(): void {
  for (const button of document.querySelectorAll<HTMLButtonElement>(CLIPBOARD_BUTTON)) {
    button.addEventListener('click', () => {
      const code = button.dataset.copy ?? ''
      void navigator.clipboard.writeText(code).then(() => {
        if (button.getAttribute('data-copied') !== null) return
        const original = button.textContent
        button.setAttribute('data-copied', '')
        button.textContent = '已复制'
        window.setTimeout(() => {
          button.removeAttribute('data-copied')
          button.textContent = original
        }, COPIED_FLASH_MS)
      }).catch(() => { /* clipboard unavailable: the code remains selectable */ })
    })
  }
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
startRevealOnScroll()
startHeaderSurface()
startCopyButtons()
void startEntryCta()
startPreSessionThemeToggle()
