import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import clsx from 'clsx'
import { createPortal } from 'react-dom'
import { writeClipboard } from './clipboard.ts'
import { usePointerGrace } from './pointer-grace.ts'
import css from './HoverCard.module.css'

const INLINE_PREVIEW_WIDTH = 300
const ANCHOR_GAP = 8
const VIEWPORT_MARGIN = 8

/**
 * Render an anchor with a hover-triggered preview card.
 * @param props.anchor - the hover target (rendered in place inside a wrapper span).
 * @param props.content - card content; the pointer may rest on it, so it is
 * readable and selectable, but it carries no dismissal affordance of its own.
 * @param props.openDelayMs - hover dwell before the card shows (default 500).
 * @param props.inline - keep the anchor in prose; show a contained preview on hover or keyboard focus.
 * @param props.disabled - suppress opening; turning true closes an open card.
 * @param props.copyText - optional primary value copied by activation and
 * included in the card's accessible name.
 * @param props.copyLabel - localized accessible activation-label prefix.
 * @param props.copiedLabel - localized visible success label.
 * @returns anchor wrapper with the conditional portaled card.
 */
export function HoverCard({
  anchor, content, openDelayMs = 500, disabled = false,
  copyText, copyLabel, copiedLabel, inline = false,
}: {
  anchor: ReactNode
  /** Inline media preview using the shared menu material and keyboard focus. */
  inline?: boolean
  content: ReactNode
  openDelayMs?: number
  disabled?: boolean
} & ({ copyText?: string | undefined; copyLabel: string; copiedLabel: string } | {
  copyText?: undefined
  copyLabel?: string
  copiedLabel?: string
})) {
  const rootRef = useRef<HTMLSpanElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const copyHeightRef = useRef<number | null>(null)
  const copyEpochRef = useRef(0)
  const copyingRef = useRef(false)
  const mountedRef = useRef(true)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ left: number; top: number; width?: number; maxHeight?: number } | null>(null)
  const [copied, setCopied] = useState(false)

  const clearCopied = useCallback(() => {
    if (copyTimerRef.current !== null) {
      clearTimeout(copyTimerRef.current)
      copyTimerRef.current = null
    }
    copyHeightRef.current = null
    setCopied(false)
  }, [])

  const close = useCallback(() => {
    copyEpochRef.current += 1
    clearCopied()
    setOpen(false)
  }, [clearCopied])

  const { arm: armClose, cancel: cancelClose } = usePointerGrace(close)

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  // Owner disabling mid-hover (menu opened, drag started) closes immediately.
  useEffect(() => {
    if (!disabled) return
    clearTimer()
    cancelClose()
    close()
  }, [disabled, cancelClose, close])

  useEffect(() => {
    if (!open || !inline) return
    const dismiss = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      clearTimer()
      cancelClose()
      close()
    }
    window.addEventListener('keydown', dismiss, true)
    return () => { window.removeEventListener('keydown', dismiss, true) }
  }, [open, inline, cancelClose, close])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      copyEpochRef.current += 1
      clearTimer()
      if (copyTimerRef.current !== null) {
        clearTimeout(copyTimerRef.current)
        copyTimerRef.current = null
      }
    }
  }, [])

  // Fixed-position from the anchor rect before paint; track the anchor while
  // open (capture-phase scroll catches nested panes), as in Menu portal mode.
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const place = () => {
      const wrapper = rootRef.current
      /* v8 ignore next -- the ref is attached before the layout effect runs and the listeners die with it. */
      if (wrapper === null) return
      const r = wrapper.getBoundingClientRect()
      const h = cardRef.current?.offsetHeight ?? 0
      if (inline) {
        const height = Math.max(h, cardRef.current?.scrollHeight ?? 0)
        const width = Math.max(0, Math.min(INLINE_PREVIEW_WIDTH, window.innerWidth - VIEWPORT_MARGIN * 2))
        const belowTop = Math.max(VIEWPORT_MARGIN, r.bottom + ANCHOR_GAP)
        const above = Math.max(0, r.top - ANCHOR_GAP - VIEWPORT_MARGIN)
        const below = Math.max(0, window.innerHeight - belowTop - VIEWPORT_MARGIN)
        const onTop = height > below && above > below
        const maxHeight = onTop ? above : below
        setPos({
          left: Math.max(VIEWPORT_MARGIN, Math.min(r.left, window.innerWidth - width - VIEWPORT_MARGIN)),
          top: onTop ? r.top - ANCHOR_GAP - Math.min(height, maxHeight) : belowTop,
          width, maxHeight,
        })
        return
      }
      const top = r.top + h > window.innerHeight - VIEWPORT_MARGIN ? window.innerHeight - h - VIEWPORT_MARGIN : r.top
      setPos({ left: r.right + ANCHOR_GAP, top })
    }
    place()
    const observer = inline && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null
    for (const element of [cardRef.current, rootRef.current]) {
      if (element !== null) observer?.observe(element)
    }
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      observer?.disconnect()
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open, inline])

  // The first placement ran before the card mounted (height read 0): once the
  // card's real height is measurable, correct the bottom-edge clamp. The
  // correction converges — a clamped top satisfies the guard, so it runs once.
  useLayoutEffect(() => {
    if (!open || pos === null || inline) return
    /* v8 ignore next -- the card is mounted whenever pos is set, so the ref is attached here. */
    const h = cardRef.current?.offsetHeight ?? 0
    if (pos.top + h > window.innerHeight - VIEWPORT_MARGIN) {
      setPos({ left: pos.left, top: window.innerHeight - h - VIEWPORT_MARGIN })
    }
  }, [open, pos, inline])

  const copy = async (text: string): Promise<void> => {
    if (copied || copyingRef.current) return
    copyingRef.current = true
    const copyEpoch = copyEpochRef.current
    const accepted = await writeClipboard(text)
    copyingRef.current = false
    const card = cardRef.current
    if (!accepted || !mountedRef.current || copyEpoch !== copyEpochRef.current || card === null) return
    const height = card.offsetHeight
    copyHeightRef.current = height > 0 ? height : null
    setCopied(true)
    copyTimerRef.current = setTimeout(clearCopied, 1000)
  }

  const copyable = copyText !== undefined
  const card = open && pos !== null && (
    <div
      ref={cardRef}
      className={clsx(css.card, inline && css.media, copyable && css.copyable, copied && css.feedback)}
      style={{ ...pos, minHeight: copied && copyHeightRef.current !== null ? copyHeightRef.current : undefined }}
      role={copyable ? 'button' : undefined}
      tabIndex={copyable ? 0 : undefined}
      aria-label={copyable ? `${copyLabel}: ${copyText}` : undefined}
      onClick={copyable
        ? (e) => {
          const selection = window.getSelection()
          if (selection !== null && !selection.isCollapsed) {
            for (let i = 0; i < selection.rangeCount; i += 1) {
              if (selection.getRangeAt(i).intersectsNode(e.currentTarget)) return
            }
          }
          void copy(copyText)
        }
        : undefined}
      onKeyDown={copyable
        ? (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return
          e.preventDefault()
          void copy(copyText)
        }
        : undefined}
    >
      {copied ? <span className={css.copied} aria-hidden="true">{copiedLabel}</span> : content}
    </div>
  )

  return (
    <span
      ref={rootRef}
      className={clsx(css.root, inline && css.inline)}
      onFocus={inline ? (event) => {
        if (!disabled && event.target.matches(':focus-visible')) { cancelClose(); setOpen(true) }
      } : undefined}
      onBlur={inline ? (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) { clearTimer(); cancelClose(); close() }
      } : undefined}
      onPointerEnter={(event) => {
        if (disabled || (inline && event.pointerType === 'touch')) return
        // Coming back inside during the grace (the gap, or the card itself)
        // keeps the current card rather than restarting the dwell.
        cancelClose()
        if (open) return
        clearTimer()
        timerRef.current = setTimeout(() => { setOpen(true) }, openDelayMs)
      }}
      onPointerLeave={() => {
        clearTimer()
        // Leaving a closed card schedules a no-op close; only arm while
        // open, matching Menu's shape.
        if (open) armClose()
      }}
      // A press inside the anchor (row click, menu trigger) dismisses the
      // card immediately, without waiting for the owner to flip `disabled`.
      // Capture presses reach this handler from the card too — it is a React
      // child of the wrapper — but a press there starts a selection, so the
      // card must stay mounted under it (and the browser's click with it).
      onPointerDownCapture={(e) => {
        if (cardRef.current?.contains(e.target as Node)) return
        clearTimer()
        cancelClose()
        close()
      }}
    >
      {anchor}
      {open && copyable && <span className={css.status} role="status">{copied ? copiedLabel : ''}</span>}
      {card !== false && createPortal(card, document.body)}
    </span>
  )
}
