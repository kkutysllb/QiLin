/** Focus presentation for automatic entry and restoration, plus device input shape. */
const releases = new WeakMap<HTMLElement, () => void>()
const navigationKeys = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End'])

/**
 * Focus an automatic destination without a focus outline until keyboard navigation or blur.
 * The theme suppresses outlines while data-dsh-automatic-focus is present; borders and shadows remain intact.
 * Tab and directional navigation restore normal focus styling.
 * @param element - control or container receiving automatic focus.
 * @param options - browser focus options, including scroll preservation.
 */
export function focusWithoutRing(element: HTMLElement, options?: FocusOptions): void {
  releases.get(element)?.()
  const release = (): void => {
    element.removeAttribute('data-dsh-automatic-focus')
    element.removeEventListener('blur', release)
    element.removeEventListener('keydown', navigate, true)
    releases.delete(element)
  }
  const navigate = (event: KeyboardEvent): void => {
    if (!event.isComposing && !event.ctrlKey && !event.altKey && !event.metaKey && navigationKeys.has(event.key)) release()
  }
  releases.set(element, release)
  element.setAttribute('data-dsh-automatic-focus', '')
  element.addEventListener('blur', release)
  element.addEventListener('keydown', navigate, true)
  element.focus(options)
  if (!element.matches(':focus')) release()
}
/** Cached answer for mobile-device detection: one browser viewport has one answer. */
let mobileDevice: boolean | undefined

/**
 * Whether this browser runs on a touch-first mobile device.
 *
 * The answer is cached, so a caller must not expect it to follow a viewport
 * resize. It drives input-shape choices only; layout reacts to container width.
 * @returns `true` on a mobile browser, `false` on a desktop one.
 */
export function isMobileDevice(): boolean {
  if (mobileDevice !== undefined) return mobileDevice
  const { userAgent, platform, maxTouchPoints } = navigator
  mobileDevice = /Android|iPhone|iPad|iPod/i.test(userAgent)
    || (platform === 'MacIntel' && maxTouchPoints > 1)
  return mobileDevice
}
