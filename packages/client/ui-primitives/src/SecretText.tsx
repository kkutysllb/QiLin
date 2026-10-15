/**
 * Masked credential presentation: the masked form by default, plus a control
 * that reveals this one value in interactive text.
 */
import { useState } from 'react'
import { MASK } from './credential-masks.ts'
import css from './SecretText.module.css'

const EYE_CONTOUR = 'M1.5 8C2.9 5.25 5.25 3.5 8 3.5C10.75 3.5 13.1 5.25 14.5 8C13.1 10.75 10.75 12.5 8 12.5C5.25 12.5 2.9 10.75 1.5 8Z'
const EYE_PATH = EYE_CONTOUR + 'M10 8C10 9.1 9.1 10 8 10C6.9 10 6 9.1 6 8C6 6.9 6.9 6 8 6C9.1 6 10 6.9 10 8Z'
/** The struck-through glyph drops the pupil so it stays distinct at text size. */
const EYE_OFF_PATH = EYE_CONTOUR + 'M2.5 2.5L13.5 13.5'
const MASK_RUNS = new RegExp('(\\' + MASK + '+)', 'u')

/**
 * One eye glyph, drawn in the current text color.
 * @param props - the outline to draw.
 * @returns the glyph.
 */
function EyeGlyph({ path }: { readonly path: string }) {
  return (
    <svg className={css.icon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

/**
 * Split a masked form into kept text and mask runs. A mask run keeps its
 * characters for copying and assistive technology but draws centered tiles,
 * because a font's own asterisk sits near the cap height.
 * @param props - the masked form.
 * @returns the inline parts covering it.
 */
function MaskedText({ masked }: { readonly masked: string }) {
  let offset = 0
  return masked.split(MASK_RUNS).map((part) => {
    const key = offset
    offset += part.length
    if (part === '') return null
    return part.startsWith(MASK)
      ? <span key={key} className={css.mask}>{part}</span>
      : <span key={key}>{part}</span>
  })
}

/** Copy for the control that reveals one masked credential. */
export interface SecretTextLabels {
  /** Name while the value stays masked. */
  readonly reveal: string
  /** Name while the value is shown. */
  readonly hide: string
}

/** Props of one masked credential. */
export interface SecretTextProps {
  /** Display form of the range; line breaks stay in place. */
  readonly masked: string
  /** Original spelling, revealed on demand, and the identity that re-masks a different value. */
  readonly raw: string
  /** Reveal-control copy; absent in text that offers no reveal control. */
  readonly labels?: SecretTextLabels | undefined
}

/**
 * Draw one credential masked. Interactive text adds a control that reveals or
 * hides this value; every mount, and every different original value at the same
 * position, starts masked.
 * @param props - the masked form, the original spelling, and optional control copy.
 * @returns the masked run, with the reveal control when copy is supplied.
 */
export function SecretText({ masked, raw, labels }: SecretTextProps) {
  const [revealedRaw, setRevealedRaw] = useState<string>()
  const revealed = labels !== undefined && revealedRaw === raw
  return (
    <span className={css.secret} data-secret="">
      <span>{revealed ? raw : <MaskedText masked={masked} />}</span>
      {labels !== undefined && (
        <button
          type="button"
          className={css.toggle}
          aria-pressed={revealed}
          aria-label={revealed ? labels.hide : labels.reveal}
          onClick={() => { setRevealedRaw(revealed ? undefined : raw) }}
        >
          <EyeGlyph path={revealed ? EYE_OFF_PATH : EYE_PATH} />
        </button>
      )}
    </span>
  )
}
