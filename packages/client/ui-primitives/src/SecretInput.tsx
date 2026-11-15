/**
 * Editable masked credential: a password input plus the same reveal control
 * the conversation's masked text uses. Every mount, and every different draft
 * at the same position, starts masked, so a pasted key never stays visible.
 */
import { useState } from 'react'
import clsx from 'clsx'
import type { InputHTMLAttributes } from 'react'
import { EYE_OFF_PATH, EYE_PATH, SecretEyeGlyph } from './secret-eye.tsx'
import css from './SecretInput.module.css'

/** Copy for the control that reveals one masked draft. */
export interface SecretInputLabels {
  /** Name while the draft stays masked. */
  readonly reveal: string
  /** Name while the draft is shown. */
  readonly hide: string
}

/** Props of one editable masked credential. */
export interface SecretInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'type' | 'className' | 'autoComplete'> {
  /** Unsaved draft; stored credentials are never read into this field. */
  readonly value: string
  /** Reveal-control copy. */
  readonly labels: SecretInputLabels
  /** Class for the native input, owned by the render site's own field style. */
  readonly inputClassName?: string | undefined
  /** Class for the positioning wrapper, owned by the render site. */
  readonly wrapperClassName?: string | undefined
}

/**
 * Render an editable masked credential.
 * @param props - the draft, the reveal copy, and native input attributes.
 * @returns the input with an optional reveal button.
 */
export function SecretInput({
  value, labels, inputClassName, wrapperClassName, onChange, ...rest
}: SecretInputProps) {
  const [revealedValue, setRevealedValue] = useState<string>()
  const revealed = value.length > 0 && revealedValue === value
  return (
    <span className={clsx(css.wrapper, wrapperClassName)}>
      <input
        {...rest}
        className={inputClassName}
        type={revealed ? 'text' : 'password'}
        autoComplete="new-password"
        value={value}
        onChange={(event) => {
          setRevealedValue(undefined)
          onChange?.(event)
        }}
      />
      {value.length === 0 ? null : (
        <button
          type="button"
          className={css.toggle}
          aria-label={revealed ? labels.hide : labels.reveal}
          aria-pressed={revealed}
          disabled={rest.disabled}
          onClick={() => { setRevealedValue(revealed ? undefined : value) }}
        >
          <SecretEyeGlyph path={revealed ? EYE_OFF_PATH : EYE_PATH} />
        </button>
      )}
    </span>
  )
}
