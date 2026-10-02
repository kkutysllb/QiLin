/**
 * The floating "add selection to conversation" button the text viewer shows
 * over a selection: a viewport-anchored button portaled to `document.body`,
 * kept alive across the selection gesture and committed on click.
 *
 * Dismissal: the button must never outlive its viewer. The caller hides it on
 * scrolling, on a collapsed selection and on a content swap, and this hook
 * adds the global dismissal that covers everything else — any `mousedown`
 * outside the button, `Escape`, the document going hidden or the window
 * losing focus, and an `IntersectionObserver` on the viewer surface, which is
 * the only signal a tab switch (`display: none`) or a panel collapse
 * (translated off-screen) produces. The button's own `mousedown` is not an
 * outside click: the caller preventDefaults it so the selection survives
 * until the click commits.
 */
import { useEffect, useRef, useState, type RefObject } from 'react'

/** The anchored action: the draft text to insert, and where the button sits. */
export interface SelectionPopup {
  readonly insert: string
  readonly left: number
  readonly top: number
}

/** What the hook needs from its owner. */
export interface SelectionPopupOptions {
  /** Commit the payload into the conversation draft (button click). */
  onCommit: (insert: string) => void
  /**
   * The element that must stay on screen for the button to live. Called at
   * open time, when the caller's refs are bound.
   * @returns the viewer surface, or null when it is not mounted.
   */
  getSurface: () => HTMLElement | null
}

/** The hook's return: the current button state and the gestures that drive it. */
export interface SelectionPopupControls {
  /** The button to render, or null while none is shown. */
  readonly popup: SelectionPopup | null
  /** Attach to the portaled button so its own press is not an outside click. */
  readonly buttonRef: RefObject<HTMLButtonElement>
  /**
   * Anchor the button over a selection.
   * @param insert - the draft text this button would commit.
   * @param left - the selection centre, in viewport coordinates.
   * @param top - the selection top, in viewport coordinates.
   */
  show: (insert: string, left: number, top: number) => void
  /** Hide the button; safe to call when none is shown. */
  hide: () => void
  /** Commit the payload of the shown button, then hide. */
  commit: () => void
}

/** Viewport margin the button keeps from either side while being anchored. */
const EDGE = 80

/**
 * Own one selection button for a viewer surface.
 * @param options - the commit sink and the surface probe.
 * @returns the button state and its gestures.
 */
export function useSelectionPopup(options: SelectionPopupOptions): SelectionPopupControls {
  // The dismissal listeners live for the mount's lifetime, so they read the
  // latest callbacks through refs rather than through their own closures.
  const onCommitRef = useRef(options.onCommit)
  const getSurfaceRef = useRef(options.getSurface)
  onCommitRef.current = options.onCommit
  getSurfaceRef.current = options.getSurface

  const [popup, setPopup] = useState<SelectionPopup | null>(null)
  // Event-time mirror: a listener must see the button that is shown right
  // now, not the one its render closure captured.
  const popupRef = useRef<SelectionPopup | null>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const show = (insert: string, left: number, top: number): void => {
    const next: SelectionPopup = {
      insert,
      left: Math.min(Math.max(left, EDGE), window.innerWidth - EDGE),
      top,
    }
    popupRef.current = next
    setPopup(next)
  }

  const hide = (): void => {
    popupRef.current = null
    setPopup(null)
  }

  const commit = (): void => {
    const current = popupRef.current
    if (current === null) return
    onCommitRef.current(current.insert)
    hide()
  }

  useEffect(() => {
    const onMouseDown = (event: MouseEvent): void => {
      if (popupRef.current === null) return
      const button = buttonRef.current
      if (button !== null && button.contains(event.target as Node)) return
      hide()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      hide()
    }
    const onVisibilityChange = (): void => {
      if (document.hidden) hide()
    }
    document.addEventListener('mousedown', onMouseDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', hide)
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', hide)
      observerRef.current?.disconnect()
      observerRef.current = null
    }
  }, [])

  // Re-target the observer on every open: the caller's surface ref is only
  // trustworthy once its content has mounted.
  useEffect(() => {
    if (popup === null) return
    observerRef.current?.disconnect()
    observerRef.current = null
    if (typeof IntersectionObserver === 'undefined') return
    const surface = getSurfaceRef.current()
    if (surface === null) return
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) hide()
      }
    }, { threshold: 0 })
    observerRef.current = observer
    observer.observe(surface)
    // Only the shown/hidden flip must re-run this; an anchor move while the
    // button stays up keeps the same surface.
  }, [popup !== null])

  return { popup, buttonRef, show, hide, commit }
}
