/**
 * Compact presentation of one quoted excerpt: a quote mark, the width-capped
 * excerpt, and the copy and jump controls the surrounding surface enables. A
 * clipped excerpt opens its full text on hover or keyboard focus, so the
 * excerpt in the flow stays one line. An owner-supplied `summary` replaces the
 * exact text inline and in the popover, and `removal` makes the marker remove
 * the whole quote node.
 */
import { useLayoutEffect, useRef, useState } from 'react'
import type { JSX, MouseEvent as ReactMouseEvent } from 'react'
import { IconCheckOutlineRegular, IconCloseOutlineRegular, IconCopyOutlineRegular, IconRightUpOutlineRegular } from './icons/index.tsx'
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

/** Optional whole-quote removal control supplied by an editable owner. */
export interface QuotePreviewRemoval {
  /** Localized accessible name for the removal button. */
  readonly label: string
  /** Remove the complete owning quote node. */
  readonly onRemove: () => void
}

/** Owner-supplied readable form of a quote whose exact text is long structured content. */
export interface QuoteSummary {
  /** Short inline label shown before `body` in place of the exact text; assistive technology reads `title` and `detail` instead. */
  readonly label: string
  /** First popover line, such as a file path; also the label's accessible text. */
  readonly title: string
  /** Secondary popover line, such as a line range. */
  readonly detail?: string | undefined
  /** Main text, such as a user's comment, shown inline after `label` and in full in the popover. */
  readonly body: string
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
  /** Readable replacement for `text`: its label renders inline and its popover opens on every hover. */
  readonly summary?: QuoteSummary | undefined
  /** Composer-only removal action; omit for inert sent quotes. */
  readonly removal?: QuotePreviewRemoval | undefined
  /** Localized control names; required for the copy and jump controls of sent quotes. */
  readonly labels?: QuotePreviewLabels | undefined
  /** Reveal the quoted source; omission hides the jump control. */
  readonly onJump?: (() => void) | undefined
}

/**
 * Render one quoted excerpt with its copy and optional jump controls.
 * @param props - excerpt text, control names, and the reveal action.
 * @returns the quote surface, with the full text on hover while clipped.
 */
export function QuotePreview({ text, summary, removal, labels, onJump }: QuotePreviewProps): JSX.Element {
  const sourceRef = useRef<HTMLSpanElement | null>(null)
  const [truncated, setTruncated] = useState(false)
  const { copied, onCopy } = useClipboardCopy(summary === undefined ? text : '')
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
  const remove = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    removal?.onRemove()
  }
  const preview = (
    <span className={css.quote} data-quote-preview="" data-removable={removal === undefined ? undefined : ''}>
      {removal === undefined
        ? (
          <span className={css.marker} aria-hidden>
            <QuoteMarkIcon className={css.quoteMark} />
          </span>
        )
        : (
          <button
            type="button"
            className={css.remove}
            aria-label={removal.label}
            data-quote-remove=""
            onPointerDown={(event) => { event.preventDefault(); event.stopPropagation() }}
            onKeyDown={(event) => { event.stopPropagation() }}
            onClick={remove}
          >
            <QuoteMarkIcon className={css.quoteMark} />
            <IconCloseOutlineRegular size={12} className={css.closeMark} />
          </button>
        )}
      <span ref={sourceRef} className={css.source} data-quote-preview-text="">
        {summary === undefined ? text : (
          <>
            <span aria-hidden="true">{summary.label}</span>
            <span className={css.visuallyHidden}>{summary.detail === undefined ? summary.title : `${summary.title} ${summary.detail}`}</span>
            {' '}<span className={css.inlineBody}>{summary.body}</span>
          </>
        )}
      </span>
      {summary !== undefined || labels === undefined ? null : (
        <>
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
        </>
      )}
    </span>
  )
  return (
    <HoverCard
      inline
      openDelayMs={0}
      disabled={summary === undefined && !truncated}
      anchor={preview}
      content={summary === undefined
        ? <span className={css.popoverText} data-quote-popover="" aria-hidden="true">{text}</span>
        : (
          <span className={css.summary} data-quote-popover="" aria-hidden="true">
            <span className={css.summaryTitle}>{summary.title}</span>
            {summary.detail !== undefined && <span className={css.summaryDetail}>{summary.detail}</span>}
            <span className={css.summaryBody}>{summary.body}</span>
          </span>
        )}
    />
  )
}
