/** Eye glyphs shared by the masked-credential renderer and the secret input. */
import css from './secret-eye.module.css'

/** Open-eye outline: the value is masked and can be revealed. */
export const EYE_PATH = 'M1.5 8C2.9 5.25 5.25 3.5 8 3.5C10.75 3.5 13.1 5.25 14.5 8C13.1 10.75 10.75 12.5 8 12.5C5.25 12.5 2.9 10.75 1.5 8Z'
  + 'M10 8C10 9.1 9.1 10 8 10C6.9 10 6 9.1 6 8C6 6.9 6.9 6 8 6C9.1 6 10 6.9 10 8Z'
/** The struck-through glyph drops the pupil so it stays distinct at text size. */
export const EYE_OFF_PATH = 'M1.5 8C2.9 5.25 5.25 3.5 8 3.5C10.75 3.5 13.1 5.25 14.5 8C13.1 10.75 10.75 12.5 8 12.5C5.25 12.5 2.9 10.75 1.5 8Z'
  + 'M2.5 2.5L13.5 13.5'

/**
 * Draw one eye glyph in the current text color.
 * @param props.path - the outline to draw.
 * @returns the glyph.
 */
export function SecretEyeGlyph({ path }: { readonly path: string }) {
  return (
    <svg className={css.icon} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.3} strokeLinecap="round" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}
