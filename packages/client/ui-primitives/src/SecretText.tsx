/**
 * Masked credential presentation: the masked form by default, plus a control
 * that reveals this one value in interactive text.
 */
import { useState } from 'react'
import { MASK } from './credential-masks.ts'
import { EYE_OFF_PATH, EYE_PATH, SecretEyeGlyph } from './secret-eye.tsx'
import css from './SecretText.module.css'

const MASK_RUNS = new RegExp('(\\' + MASK + '+)', 'u')

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
          <SecretEyeGlyph path={revealed ? EYE_OFF_PATH : EYE_PATH} />
        </button>
      )}
    </span>
  )
}
