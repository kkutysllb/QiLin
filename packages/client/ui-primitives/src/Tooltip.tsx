// Cloning the anchor preserves its layout context. Fixed positioning lets the
// bubble escape ancestor overflow clipping; the optional portal also escapes
// stacking contexts that would cap the bubble's z-index.

import { cloneElement, createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ShortcutKeys } from './ShortcutKeys.tsx'
import type { FocusEventHandler, MouseEventHandler, MutableRefObject, ReactElement, Ref } from 'react'
// Tooltips take the wide answer — any key returns to the keyboard. Focus rings read the
// narrower `data-input-modality` attribute the same module publishes.
import { pointerModality } from './input-modality.ts'
import css from './Tooltip.module.css'

/** Bubble placement relative to the anchor. */
export type TooltipSide = 'right' | 'bottom' | 'top'

/**
 * Suppression channel for enclosing tooltip and hover-card anchors: a visible
 * tooltip within an anchor withdraws the enclosing preview while its bubble is shown.
 */
export const TooltipSuppression = createContext<((suppressed: boolean) => void) | null>(null)

/** Props Tooltip injects into its anchor child; the child's own handlers are chained ahead of the tooltip's. */
interface AnchorProps {
  ref?: Ref<HTMLElement> | undefined
  onMouseEnter?: MouseEventHandler | undefined
  onMouseLeave?: MouseEventHandler | undefined
  onFocus?: FocusEventHandler | undefined
  onBlur?: FocusEventHandler | undefined
}

type TooltipLabel = string | (() => string)

/**
 * Attach a hover/focus tooltip to an anchor element.
 * @param props.label - bubble text, or a resolver evaluated only while the bubble is visible.
 * @param props.shortcutKeys - effective key labels rendered as platform-formatted keycaps after optional text.
 * @param props.side - placement relative to the anchor (default 'right').
 * @param props.delayMs - hover delay in milliseconds; keyboard focus remains immediate.
 * @param props.disabled - suppress the bubble while true; the anchor renders identically so
 * toggling never remounts it (which would cut its CSS transitions).
 * @param props.portal - render the bubble under document.body, so an ancestor's clipping or its
 * stacking context can neither clip the bubble nor paint over it.
 * @param props.maxWidth - bubble width cap in pixels, for labels long enough that the default
 * half-viewport cap would render a slab wider than the surface the anchor sits on.
 * @param props.children - a single anchor element; its own ref (callback or object) is forwarded alongside the tooltip's.
 * An anchor that accepts no ref still positions the bubble: a raise records the element the event ran on.
 * @returns the cloned anchor plus a fixed-position bubble while hovered/focused.
 */
export function Tooltip({ label, shortcutKeys, side = 'right', delayMs = 0, disabled = false, portal = false, maxWidth, children }: { label: TooltipLabel; shortcutKeys?: readonly string[] | undefined; side?: TooltipSide; delayMs?: number; disabled?: boolean; portal?: boolean; maxWidth?: number; children: ReactElement<AnchorProps> }) {
  const anchor = useRef<HTMLElement | null>(null)
  // React 18 keeps the element's ref outside props; forward it so wrapping an
  // anchor in Tooltip never silently severs the owner's ref.
  const childRef = (children as ReactElement<AnchorProps> & { ref?: Ref<HTMLElement> }).ref
  const mergedRef = useCallback((el: HTMLElement | null) => {
    anchor.current = el
    if (typeof childRef === 'function') childRef(el)
    else if (childRef != null) (childRef as MutableRefObject<HTMLElement | null>).current = el
  }, [childRef])
  // React 18 delivers a ref to forwardRef and DOM anchors only, so a plain
  // function-component anchor never reaches `mergedRef` at all. Every raising
  // event still names the node its cloned handler is mounted on, which is the
  // element that ref would have named; `show()` prefers the ref so a replaced
  // anchor stays current.
  const eventAnchor = useRef<Element | null>(null)
  const trackAnchor = (event: { readonly currentTarget: EventTarget & Element }) => { eventAnchor.current = event.currentTarget }
  // The anchor's edges rather than final coordinates: a vertical flip has to
  // re-derive the bubble's own top from the opposite edge.
  const [pos, setPos] = useState<{ x: number; top: number; bottom: number } | null>(null)
  // Where the bubble actually sits, which is the requested side until the
  // viewport refuses it.
  const [placement, setPlacement] = useState<TooltipSide>(side)
  const bubble = useRef<HTMLSpanElement | null>(null)
  const resolvedLabel = pos === null
    ? null
    : typeof label === 'function' ? label() : label
  const y = pos === null
    ? 0
    : placement === 'right'
      ? pos.top + (pos.bottom - pos.top) / 2
      : placement === 'top' ? pos.top - 8 : pos.bottom + 8
  const EDGE_MARGIN = 12
  // Viewport fit: fixed positioning knows nothing about edges, so a centered
  // bubble near the right edge would clip and a long label under an anchor low
  // on the page would run off the bottom. Horizontally the bubble slides back
  // inside; vertically it flips to the opposite side, which is the only move
  // that does not cover the anchor being read. Each measurement resets the base
  // position first, so a shorter label or a larger viewport releases a previous
  // adjustment without another render.
  useLayoutEffect(() => {
    if (pos === null) return
    const fit = () => {
      const el = bubble.current
      /* v8 ignore next -- pos is set only while the bubble is mounted. */
      if (el === null) return
      el.style.left = `${pos.x}px`
      const r = el.getBoundingClientRect()
      let dx = 0
      if (r.right > window.innerWidth - EDGE_MARGIN) dx = window.innerWidth - EDGE_MARGIN - r.right
      if (r.left + dx < EDGE_MARGIN) dx = EDGE_MARGIN - r.left
      el.style.left = `${pos.x + dx}px`
      if (side === 'right') return
      // Flip only into a side that genuinely fits, so an anchor with room on
      // neither side keeps the requested placement instead of oscillating.
      const fitsBelow = pos.bottom + 8 + r.height <= window.innerHeight - EDGE_MARGIN
      const fitsAbove = pos.top - 8 - r.height >= EDGE_MARGIN
      if (placement === 'bottom' && !fitsBelow && fitsAbove) setPlacement('top')
      if (placement === 'top' && !fitsAbove && fitsBelow) setPlacement('bottom')
    }
    fit()
    window.addEventListener('resize', fit)
    return () => { window.removeEventListener('resize', fit) }
  }, [placement, pos, resolvedLabel, side])
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Hover and focus are independent triggers: the bubble hides only after
  // BOTH clear (hovering away from a focused anchor must not drop it).
  const triggers = useRef({ hover: false, focus: false })

  // A nested tooltip's bubble owns the pointer position, so this tooltip
  // withdraws its own while a descendant shows one; the state below is set by
  // the descendants this tooltip wraps. Announcing on every visibility change
  // covers hide, disable, and unmount; show() also announces synchronously so
  // a nested pair shown in one commit never paints both bubbles.
  const suppressAncestors = useContext(TooltipSuppression)
  const [suppressed, setSuppressed] = useState(false)
  const announce = useCallback((active: boolean) => { suppressAncestors?.(active) }, [suppressAncestors])
  const visible = pos !== null && !disabled
  useEffect(() => {
    announce(visible)
    return () => { announce(false) }
  }, [announce, visible])

  // Disabling mid-hover (e.g. clicking a rail control expands the sidebar)
  // must drop an already-visible bubble: no mouseleave fires.
  const cancelShow = useCallback(() => {
    if (showTimer.current === null) return
    clearTimeout(showTimer.current)
    showTimer.current = null
  }, [])
  useEffect(() => {
    if (disabled) {
      cancelShow()
      triggers.current = { hover: false, focus: false }
      setPos(null)
    }
    return cancelShow
  }, [cancelShow, disabled])

  const show = () => {
    if (disabled) return
    const el = anchor.current ?? eventAnchor.current
    /* v8 ignore next -- show() only runs from a raising event, which recorded its anchor synchronously. */
    if (el === null) return
    const r = el.getBoundingClientRect()
    // Every show starts from the requested side; the fit pass flips it only
    // where this anchor's position demands it.
    setPlacement(side)
    setPos({ x: side === 'right' ? r.right + 10 : r.left + r.width / 2, top: r.top, bottom: r.bottom })
    announce(true)
  }
  const showAfterHoverDelay = () => {
    cancelShow()
    if (delayMs <= 0) {
      show()
      return
    }
    showTimer.current = setTimeout(() => {
      showTimer.current = null
      show()
    }, delayMs)
  }
  const withdraw = () => {
    setPos(null)
    announce(false)
  }
  const hide = () => {
    cancelShow()
    if (!triggers.current.hover && !triggers.current.focus) withdraw()
  }

  const bubbleNode = visible && !suppressed && (
    <span
      ref={bubble}
      className={css.bubble}
      data-side={placement}
      data-portal={portal || undefined}
      data-has-shortcut={shortcutKeys?.length ? true : undefined}
      style={{ left: pos.x, top: y, ...maxWidth === undefined ? {} : { maxWidth } }}
      role="tooltip"
      aria-label={shortcutKeys?.length ? [resolvedLabel, shortcutKeys.join(' ')].filter(Boolean).join(' ') : undefined}
    >
      {resolvedLabel && <span className={css.label}>{resolvedLabel}</span>}
      {shortcutKeys !== undefined && shortcutKeys.length > 0 && <ShortcutKeys keys={shortcutKeys} variant="tooltip" />}
    </span>
  )
  return (
    <TooltipSuppression.Provider value={setSuppressed}>
      {cloneElement(children, {
        ref: mergedRef,
        onMouseEnter: (e) => { children.props.onMouseEnter?.(e); trackAnchor(e); triggers.current.hover = true; showAfterHoverDelay() },
        onMouseLeave: (e) => { children.props.onMouseLeave?.(e); triggers.current.hover = false; cancelShow(); withdraw() },
        // Pointer focus is silent: after a mouse selection a closing menu refocuses
        // its trigger, and that programmatic return must not raise the bubble.
        onFocus: (e) => {
          children.props.onFocus?.(e)
          trackAnchor(e)
          if (pointerModality()) return
          triggers.current.focus = true
          cancelShow()
          show()
        },
        onBlur: (e) => { children.props.onBlur?.(e); triggers.current.focus = false; hide() },
      })}
      {portal ? createPortal(bubbleNode, document.body) : bubbleNode}
    </TooltipSuppression.Provider>
  )
}
