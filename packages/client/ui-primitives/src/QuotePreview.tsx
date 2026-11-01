/**
 * Compact presentation of one quoted excerpt inside sent text: a quote mark,
 * the width-capped excerpt, and the copy and jump controls the surrounding
 * surface enables. A clipped excerpt opens its full text on hover or keyboard
 * focus, so the excerpt in the flow stays one line.
 */
import { useLayoutEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { IconCheckOutlineRegular, IconCopyOutlineRegular, IconRightUpOutlineRegular } from './icons/index.tsx'
import { HoverCard } from './HoverCard.tsx'
import { useClipboardCopy } from './use-clipboard-copy.ts'
import css from './QuotePreview.module.css'

function QuoteMarkIcon({ className }: { readonly className?: string | undefined }) {
  return (
    <svg width={16} height={16} className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <g transform="translate(6.8 2.4)">
        <path d="M2.8125 0.583008L3.2002 1.16602C2.43912 1.6713 1.88491 2.41238 1.60547 3.25684H2.98926V6.70605H0V4.52148C1.96593e-05 2.70313 0.9109 1.00575 2.42578 0L2.8125 0.583008Z" fill="currentColor" />
        <path d="M7.50781 0.583008L7.89551 1.16602C7.13443 1.6713 6.58022 2.41238 6.30078 3.25684H7.68457V6.70605H4.69531V4.52148C4.69533 2.70313 5.60621 1.00575 7.12109 0L7.50781 0.583008Z" fill="currentColor" />
      </g>
    </svg>
  )
}

/** Localized names of the quote controls; a caller owns every string. */
export interface QuotePreviewLabels {
  /** Accessible name of the copy control. */
  readonly copy: string
  /** Accessible name after an accepted copy. */
  readonly copied: string
  /** Accessible name of the jump control. */
  readonly jump: string
}

/** Presentation inputs for one quoted excerpt. */
export interface QuotePreviewProps {
  /** Excerpt text as decoded from the message, without its source marker line. */
  readonly text: string
  /** Localized control names. */
  readonly labels: QuotePreviewLabels
  /** Reveal the quoted source; omission hides the jump control. */
  readonly onJump?: (() => void) | undefined
}

/**
 * Render one quoted excerpt with its copy and optional jump controls.
 * @param props - excerpt text, control names, and the reveal action.
 * @returns the quote surface, with the full text on hover while clipped.
 */
export function QuotePreview({ text, labels, onJump }: QuotePreviewProps): JSX.Element {
  const sourceRef = useRef<HTMLSpanElement | null>(null)
  const [truncated, setTruncated] = useState(false)
  const { copied, onCopy } = useClipboardCopy(text)
  useLayoutEffect(() => {
    const source = sourceRef.current
    /* v8 ignore next -- the ref is attached before layout effects run. */
    if (source === null) return
    const measure = (): void => {
      setTruncated(source.scrollWidth > source.clientWidth)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(source)
    return () => { observer.disconnect() }
  }, [text])
  const preview = (
    <span className={css.quote} data-quote-preview="">
      <span className={css.marker} aria-hidden>
        <QuoteMarkIcon className={css.quoteMark} />
      </span>
      <span ref={sourceRef} className={css.source} data-quote-preview-text="">{text}</span>
      <button
        type="button"
        className={css.action}
        aria-label={copied ? labels.copied : labels.copy}
        data-quote-copy=""
        onPointerDown={(event) => { event.preventDefault(); event.stopPropagation() }}
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); onCopy() }}
      >
        {copied ? <IconCheckOutlineRegular size={12} /> : <IconCopyOutlineRegular size={12} />}
      </button>
      {onJump !== undefined && (
        <button
          type="button"
          className={css.action}
          aria-label={labels.jump}
          data-quote-jump=""
          onClick={onJump}
        >
          <IconRightUpOutlineRegular size={12} />
        </button>
      )}
    </span>
  )
  return (
    <HoverCard
      inline
      openDelayMs={0}
      disabled={!truncated}
      anchor={preview}
      content={<span className={css.popoverText} data-quote-popover="" aria-hidden="true">{text}</span>}
    />
  )
}
